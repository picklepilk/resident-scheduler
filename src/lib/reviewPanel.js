// Pure grouping/labeling for the Schedule tab's review panel (P2 of the chief-review-loop plan).
// This module never calls validateAll() itself — it only partitions/labels the SAME root `issues`
// array ResidentScheduler.jsx's own `issues` memo already computed once (see CLAUDE.md "Counts
// come from the root issues memo, never a new validateAll call"). Kept lib-legal (lib/* may never
// import ResidentScheduler.jsx) by taking `exportBlockingRuleIds` as a parameter instead of
// importing EXPORT_BLOCKING_RULE_IDS — same trick lib/scheduleGrouping.js uses for CATEGORIES/
// BLOCK_TYPES_EM/isEmResident.

// Plain-language names for the validateAll issue `rule` ids that would otherwise show up as a bare
// programmer id somewhere in the panel (e.g. a future group-by-rule header). Most validateAll
// issues already carry a fully-formed human `message` and no `rule` id at all — this map only
// covers the couple of rules that DO stamp one (postNightRest, underTarget; see validateAll).
// Anything absent or unknown falls through to the issue's own `message` in labelForIssue below,
// never a raw id — same posture as UNDER_TARGET_BLOCK_LABELS' own fallback.
export const ISSUE_RULE_LABELS = {
  postNightRest: 'Rest after a night shift',
  underTarget: 'Under shift target',
};

// The single place anything renders "what rule is this" text for a validateAll issue. Prefers the
// rule label when the id is known, otherwise the issue's own message (already plain language for
// every validateAll push site), and only as a last resort the raw rule id or a generic fallback —
// so a bare, unmapped programmer id is never actually the thing shown to the chief.
export function labelForIssue(issue) {
  if (!issue) return '';
  if (issue.rule && ISSUE_RULE_LABELS[issue.rule]) return ISSUE_RULE_LABELS[issue.rule];
  return issue.message || issue.rule || 'Issue';
}

// An issue row can only "jump to cell" when it names both a resident and a date — several issue
// kinds (the Over/Under target totals, block-wide capacity notes) carry `dateStr: null` and have no
// single cell to select. See validateAll's own dateStr:null pushes for the over/under-target branch.
export function isJumpableIssue(issue) {
  return !!(issue && issue.residentId && issue.dateStr);
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
