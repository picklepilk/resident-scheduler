// Pure grouping/labeling for the Schedule tab's review panel (P2 of the chief-review-loop plan).
// This module never calls validateAll() itself — it only partitions/labels the SAME root `issues`
// array ResidentScheduler.jsx's own `issues` memo already computed once (see CLAUDE.md "Counts
// come from the root issues memo, never a new validateAll call"). Kept lib-legal (lib/* may never
// import ResidentScheduler.jsx) by taking `exportBlockingRuleIds` as a parameter instead of
// importing EXPORT_BLOCKING_RULE_IDS — same trick lib/scheduleGrouping.js uses for CATEGORIES/
// BLOCK_TYPES_EM/isEmResident. rulePolicy.js IS a lib module too (pure, no ResidentScheduler.jsx
// import), so importing its plain-language labels directly is lib-legal, unlike importing anything
// off ResidentScheduler.jsx itself.
import { RULE_POLICY } from './rulePolicy.js';

// Plain-language names for the validateAll issue `rule` ids that would otherwise show up as a bare
// programmer id somewhere in the panel (e.g. a future group-by-rule header). Most validateAll
// issues already carry a fully-formed human `message` and no `rule` id at all — this map only
// covers the rules that DO stamp one: every RULE_POLICY id (see rulePolicy.js — 2026-09-26 severity
// policy), plus the two rules deliberately outside that tiered table (postNightRest, underTarget;
// see validateAll's own comments on why they're soft/untiered). Anything absent or unknown falls
// through to the issue's own `message` in labelForIssue below, never a raw id — same posture as
// UNDER_TARGET_BLOCK_LABELS' own fallback.
export const ISSUE_RULE_LABELS = {
  ...Object.fromEntries(Object.entries(RULE_POLICY).map(([id, entry]) => [id, entry.label])),
  postNightRest: 'Rest after a night shift',
  underTarget: 'Under shift target',
};

// Regexes used to strip the "specific" parts of a validateAll message (dates, run lengths, counts)
// so two issues that are the same KIND of warning about different residents/runs collapse to one
// group. Order matters: parentheticals (which usually hold a date range like "(Wed 1/5–Fri 1/7)")
// are stripped whole before the day/date and number passes run on what's left, so a date inside
// parens can't leave a stray "#DATE#" fragment sitting next to loose punctuation. Declared BEFORE
// normalizeIssueMessage/GROUP_MESSAGE_LABELS below on purpose — see CLAUDE.md's TDZ-hazard note: a
// module-level const initializer (GROUP_MESSAGE_LABELS calls normalizeIssueMessage synchronously
// while building its keys) that reaches a `const` declared later in the file throws at load, even
// though normalizeIssueMessage itself is a fully-hoisted function declaration.
const PARENTHETICAL_RE = /\([^()]*\)/g;
// formatDisplayDate's own shape: "Wed 1/5" — a day-of-week abbreviation plus M/D.
const DOW_DATE_RE = /\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}\/\d{1,2}\b/g;
const NUMBER_RE = /\d+(?:\.\d+)?/g;

// Collapses a validateAll message to a template key: strip parentheticals, then any remaining
// day+date tokens, then any remaining bare numbers, then normalize whitespace. Two issues that are
// the same KIND of warning about different residents/runs/dates normalize to the same template —
// e.g. every "Isolated night stint of N (Wed 1/5–Fri 1/7) — aim for 5-6 in a row" message, whatever
// N and the dates are, becomes "Isolated night stint of # #DATE#–#DATE# — aim for #-# in a row".
export function normalizeIssueMessage(message) {
  if (!message) return '';
  return String(message)
    .replace(PARENTHETICAL_RE, ' ')
    .replace(DOW_DATE_RE, '#DATE#')
    .replace(NUMBER_RE, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

// Plain-language group labels for the handful of common validateAll MESSAGE shapes that carry no
// `rule` id at all (so groupIssuesByKind below falls back to normalizeIssueMessage for their key).
// Keyed by the NORMALIZED template, not the raw message. Built from the exact literal message
// shapes validateAll pushes (via normalizeIssueMessage itself) rather than a hand-copied template
// string, so this can't silently drift out of sync with a wording change over there. Anything not
// listed here falls through to the normalized template itself (see labelForIssueGroup) — same
// "never a bare/robotic string" posture as ISSUE_RULE_LABELS, and, just as importantly, "never a
// specific date or per-item count" — a collapsed group row speaks for every item in it, so its
// label can't carry ONE item's own date/numbers (a real bug: the raw-first-message fallback this
// replaced could render "Below minimum staffing: 0/1 on Trauma Day (Tue 7/7) · 16", which reads
// like all 16 happened on Tue 7/7).
export const GROUP_MESSAGE_LABELS = {
  [normalizeIssueMessage('Isolated night stint of 3 (Wed 1/5–Fri 1/7) — aim for 5-6 in a row')]: 'Isolated night stints',
  [normalizeIssueMessage('No full weekend (Sat+Sun) off this block')]: 'No full weekend off',
  [normalizeIssueMessage('2 separate night stints this block — acceptable only if necessary, prefer clustering into one run')]: 'Multiple night stints',
  [normalizeIssueMessage('3 separate night stints this block — nights should cluster into a single run')]: 'Night stints not clustered',
};

// Coverage-miss/coverage-max messages (validateAll's block-level "one issue per date+shift" scan)
// carry no `rule` id, so without special handling they'd fall through to the generic normalized
// template ("Below minimum staffing: # on Trauma Day") for EVERY shift, which drops the "TRAUMA-D
// vs TRAUMA-N vs POD-D" distinction (the message's *human* shift LABEL, e.g. "Trauma Day", is left
// untouched by normalizeIssueMessage, but the group should read as "Trauma Day below minimum", not
// paste the sentence fragment verbatim). Recognized purely by message prefix — a plain string check
// keeps this lib-legal (no import of validateAll's rule vocabulary needed) — and grouped/labeled by
// `issue.shiftId` (already on every one of these pushes) so residents-facing groups stay one row
// per actual shift, matching every other group's granularity.
const COVERAGE_MIN_PREFIX = 'Below minimum staffing:';
const COVERAGE_MAX_PREFIX = 'Above maximum staffing:';
function coverageDirection(message) {
  if (typeof message !== 'string') return null;
  if (message.startsWith(COVERAGE_MIN_PREFIX)) return 'min';
  if (message.startsWith(COVERAGE_MAX_PREFIX)) return 'max';
  return null;
}

// Same problem, same fix, for the two SENIOR-COMPOSITION soft-warn messages validateAll pushes with
// no `rule` id at all (2b-1 EM-count composition and 2b-2 PGY gating — see their push sites'
// comments): without this, groupKeyForIssue/labelForIssueGroup fall all the way through to
// normalizeIssueMessage's generic template, which strips every PGY number down to "#" — a chief
// would read the group title as literally "EM PGY-# on FLEX Day though an EM PGY-# already
// covered…", a robotic, unreadable leak of the numeral-stripping the fallback exists to hide.
// Recognized by a fixed substring near the end of each message (never changes per shift/date/PGY)
// so this stays lib-legal — no import of validateAll's rule vocabulary needed — and grouped/labeled
// by `issue.shiftId`, same one-row-per-actual-shift granularity as the coverage-miss/max groups.
const EM_COUNT_COMPOSITION_MARKER = 'chief-directed EM-count composition';
const PGY_GATING_MARKER = 'chief-directed PGY gating';
function seniorCompositionKind(message) {
  if (typeof message !== 'string') return null;
  if (message.includes(EM_COUNT_COMPOSITION_MARKER)) return 'emCount';
  if (message.includes(PGY_GATING_MARKER)) return 'pgyGate';
  return null;
}

// The single place anything renders "what rule is this" text for a validateAll issue. Prefers the
// rule label when the id is known, otherwise the issue's own message (already plain language for
// every validateAll push site), and only as a last resort the raw rule id or a generic fallback —
// so a bare, unmapped programmer id is never actually the thing shown to the chief. `underTarget`
// issues additionally get their shifts-worked/target numbers appended (e.g. "Under shift target —
// 18 of 20") — the bare rule label alone dropped exactly the numbers a chief needs to act on it.
const UNDER_TARGET_COUNTS_RE = /Under target: (\d+)\/(\d+)/;
export function labelForIssue(issue) {
  if (!issue) return '';
  if (issue.rule === 'underTarget') {
    const m = UNDER_TARGET_COUNTS_RE.exec(issue.message || '');
    if (m) return `${ISSUE_RULE_LABELS.underTarget} — ${m[1]} of ${m[2]}`;
  }
  if (issue.rule && ISSUE_RULE_LABELS[issue.rule]) return ISSUE_RULE_LABELS[issue.rule];
  return issue.message || issue.rule || 'Issue';
}

// Where a review-panel row jumps to when clicked. Two kinds:
//   {type:'cell', residentId, dateStr} — a specific date is known (either the issue's own dateStr,
//     e.g. a rest violation, or its anchorDate, a run-anchored issue like an isolated night stint —
//     see validateAll's own comment on why that's a separate field rather than reusing dateStr).
//   {type:'row', residentId} — the issue names a resident but no single date (e.g. "Under target",
//     "No full weekend off"; several of these are block-wide totals with no one cell to select) —
//     still actionable, just at row granularity instead of cell granularity.
// Returns null only when there's no resident to jump to at all (block-wide issues like a coverage
// gap, which name a shiftId/date but not a person).
export function issueJumpTarget(issue) {
  if (!issue || !issue.residentId) return null;
  const dateStr = issue.dateStr ?? issue.anchorDate ?? null;
  return dateStr
    ? { type: 'cell', residentId: issue.residentId, dateStr }
    : { type: 'row', residentId: issue.residentId };
}

// An issue row can only jump anywhere when it names a resident (see issueJumpTarget) — a handful of
// issue kinds (coverage gaps, "two residents on one shift") name only a shiftId/date and have no
// person to jump to at all.
export function isJumpableIssue(issue) {
  return !!issueJumpTarget(issue);
}

// Stable React key for an issue row/group member — several validateAll issues share the same array
// index across re-renders once grouping/filtering reorders them, so `key={i}` was letting React
// reuse the wrong DOM node's local state (e.g. an expanded group) across an unrelated issue. Every
// validateAll push site sets at least a message, so this is never empty for a real issue.
export function issueKey(issue) {
  if (!issue) return '';
  return [issue.rule || '', issue.residentId || '', issue.dateStr || '', issue.message || ''].join('|');
}

// Partitions the root issues list into the panel's three groups:
//   mustFix        — level==='error', always shown, never collapsed.
//   blockingWarns  — level!=='error' AND flagged export-blocking (EXPORT_BLOCKING_RULE_IDS).
//   otherWarns     — every other warning.
//   orderedWarns   — blockingWarns then otherWarns, the single "Should look at" render order.
// `exportBlockingRuleIds` defaults to an empty Set so a caller that doesn't care about the
// blocking/other split (e.g. a quick unit test) doesn't have to construct one.
export function groupPanelIssues(issues, exportBlockingRuleIds = new Set()) {
  const list = Array.isArray(issues) ? issues : [];
  const mustFix = list.filter(i => i.level === 'error');
  const warns = list.filter(i => i.level !== 'error');
  const blockingWarns = warns.filter(i => exportBlockingRuleIds.has(i.rule));
  const otherWarns = warns.filter(i => !exportBlockingRuleIds.has(i.rule));
  return { mustFix, warns, blockingWarns, otherWarns, orderedWarns: [...blockingWarns, ...otherWarns] };
}

// The single place a validateAll issue is turned into a group KEY (shared by groupIssuesByKind's
// grouping pass and, indirectly, by labelForIssueGroup's coverage-message branch below). Precedence:
// an explicit `rule` id first (most specific — two issues with the same rule are the same kind by
// construction), then a coverage-miss/max message keyed by its shiftId (see coverageDirection —
// this is what makes "Trauma Day below minimum" its own group, separate from "POD Day below
// minimum", instead of every shift collapsing into one generic "Below minimum staffing" template),
// then the senior-composition EM-count/PGY-gating messages keyed by shiftId the same way (see
// seniorCompositionKind), then the normalized message template for everything else.
export function groupKeyForIssue(issue) {
  if (!issue) return '';
  if (issue.rule) return issue.rule;
  const dir = coverageDirection(issue.message);
  if (dir && issue.shiftId) return `coverage:${dir}:${issue.shiftId}`;
  const kind = seniorCompositionKind(issue.message);
  if (kind && issue.shiftId) return `${kind}:${issue.shiftId}`;
  return normalizeIssueMessage(issue.message);
}

// The label shown on a collapsed group row. A label here represents EVERY item in the group, so it
// must never carry any ONE item's own specifics (a date, a run length, a staffing count) — those
// belong on the individual IssueRow once expanded. Precedence: an explicit plain-language map first
// (ISSUE_RULE_LABELS for a rule-keyed group, GROUP_MESSAGE_LABELS for a message-template-keyed one),
// then a bespoke "{shift label} below minimum/above maximum" for a coverage-miss/max group (built
// from `shiftLabelsById`, e.g. {POD-D: 'POD Day'} — passed in as a param, never imported, to stay
// lib-legal; falls back to the bare shiftId if the caller doesn't supply one), then an equivalent
// bespoke label for the senior-composition EM-count/PGY-gating groups (same shiftLabelsById, same
// fallback — this is the fix for the "EM PGY-#" leak: without it these fell through to the
// normalized-template fallback below, which reads as a raw, numeral-stripped fragment), and only as
// a last resort the normalized message template itself (never the group's raw first-item message,
// which is what used to leak a date/count — see GROUP_MESSAGE_LABELS' own comment).
export function labelForIssueGroup(key, items, shiftLabelsById = {}) {
  if (GROUP_MESSAGE_LABELS[key]) return GROUP_MESSAGE_LABELS[key];
  const first = items && items[0];
  const dir = coverageDirection(first?.message);
  if (dir && first?.shiftId) {
    const shiftLabel = shiftLabelsById[first.shiftId] || first.shiftId;
    return dir === 'min' ? `${shiftLabel} below minimum` : `${shiftLabel} above maximum`;
  }
  const kind = seniorCompositionKind(first?.message);
  if (kind && first?.shiftId) {
    const shiftLabel = shiftLabelsById[first.shiftId] || first.shiftId;
    return kind === 'emCount' ? `${shiftLabel} — not enough EM residents` : `${shiftLabel} — junior PGY covered a slot a senior already filled`;
  }
  if (first?.rule && ISSUE_RULE_LABELS[first.rule]) return ISSUE_RULE_LABELS[first.rule];
  return normalizeIssueMessage(first?.message) || 'Issue';
}

// Groups a flat issue list "by kind" for the panel-flood fix: key is groupKeyForIssue(issue) (a
// `rule` id, a coverage shiftId, or a normalized message template) — so 43 differently-worded
// "Isolated night stint of N (...)" warnings collapse into one collapsible group instead of 43 rows.
// Group order: export-blocking groups first (any group containing at least one blocking issue),
// then by count descending — matches "Should look at"'s existing blocking-first issue order, just
// applied at the group level. Insertion order (first-seen key) is the stable tiebreak for equal
// counts within the same blocking tier, since Array.prototype.sort is stable. `shiftLabelsById` is
// passed straight through to labelForIssueGroup — see its own comment.
export function groupIssuesByKind(list, exportBlockingRuleIds = new Set(), shiftLabelsById = {}) {
  const arr = Array.isArray(list) ? list : [];
  const order = [];
  const byKey = new Map();
  for (const issue of arr) {
    const key = groupKeyForIssue(issue);
    if (!byKey.has(key)) { byKey.set(key, []); order.push(key); }
    byKey.get(key).push(issue);
  }
  const groups = order.map(key => {
    const items = byKey.get(key);
    const blocking = items.some(i => exportBlockingRuleIds.has(i.rule));
    return { key, label: labelForIssueGroup(key, items, shiftLabelsById), count: items.length, blocking, items };
  });
  groups.sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    return b.count - a.count;
  });
  return groups;
}

// Tri-state cell/day classification shared by every grid-adjacent view that flags a resident+date
// with issues (ScheduleGrid's own cells, PerResidentMonthView, ResidentCardsView) — previously each
// forked its own "any issue at all -> red alarm" check, which couldn't distinguish a hard error from
// an export-blocking soft warning from a purely advisory one. `list` is the slice of issues for one
// resident+date (e.g. violMap[`${residentId}_${dateStr}`] or []).
export function classifyCellIssues(list, exportBlockingRuleIds = new Set()) {
  const items = Array.isArray(list) ? list : [];
  const hasError = items.some(i => i.level === 'error');
  const hasWarn = items.some(i => i.level !== 'error');
  const hasBlockingWarn = items.some(i => i.level !== 'error' && exportBlockingRuleIds.has(i.rule));
  return {
    hasIssue: items.length > 0,
    hasError,
    hasWarn,
    hasBlockingWarn,
    hasAdvisoryOnly: hasWarn && !hasError && !hasBlockingWarn,
  };
}
