import { describe, it, expect } from 'vitest';
import {
  groupPanelIssues, labelForIssue, isJumpableIssue, ISSUE_RULE_LABELS,
  normalizeIssueMessage, groupIssuesByKind, labelForIssueGroup, groupKeyForIssue, GROUP_MESSAGE_LABELS,
  issueJumpTarget, issueKey, classifyCellIssues,
} from './reviewPanel.js';

const err = (over = {}) => ({ residentId: 'r1', name: 'A B', dateStr: '2026-01-05', shiftId: 'POD-D', message: 'boom', level: 'error', ...over });
const warn = (over = {}) => ({ residentId: 'r1', name: 'A B', dateStr: '2026-01-06', shiftId: 'POD-N', message: 'meh', level: 'warn', ...over });

describe('groupPanelIssues', () => {
  it('splits errors into mustFix and everything else into warns', () => {
    const issues = [err(), warn(), warn({ residentId: 'r2' })];
    const g = groupPanelIssues(issues);
    expect(g.mustFix).toHaveLength(1);
    expect(g.warns).toHaveLength(2);
  });

  it('separates export-blocking warns from other warns using the caller-supplied Set', () => {
    const blocking = new Set(['postNightRest']);
    const issues = [
      warn({ rule: 'postNightRest' }),
      warn({ rule: 'someOtherRule' }),
      warn({}), // no rule at all — never blocking
    ];
    const g = groupPanelIssues(issues, blocking);
    expect(g.blockingWarns).toHaveLength(1);
    expect(g.blockingWarns[0].rule).toBe('postNightRest');
    expect(g.otherWarns).toHaveLength(2);
  });

  it('orderedWarns puts every blocking warn before any other warn', () => {
    const blocking = new Set(['postNightRest']);
    const other = warn({ rule: 'x', dateStr: '2026-01-01' });
    const blockingIssue = warn({ rule: 'postNightRest', dateStr: '2026-01-02' });
    const g = groupPanelIssues([other, blockingIssue], blocking);
    expect(g.orderedWarns).toEqual([blockingIssue, other]);
  });

  it('defaults to an empty blocking set and tolerates a non-array input', () => {
    expect(groupPanelIssues(undefined)).toEqual({ mustFix: [], warns: [], blockingWarns: [], otherWarns: [], orderedWarns: [] });
    const g = groupPanelIssues([warn()]);
    expect(g.blockingWarns).toHaveLength(0);
    expect(g.otherWarns).toHaveLength(1);
  });
});

describe('labelForIssue', () => {
  it('uses the rule label table when the rule id is known', () => {
    expect(labelForIssue(warn({ rule: 'postNightRest' }))).toBe(ISSUE_RULE_LABELS.postNightRest);
    expect(labelForIssue(warn({ rule: 'underTarget' }))).toBe(ISSUE_RULE_LABELS.underTarget);
  });

  it('falls back to the issue message for an unknown or absent rule id — never a bare id', () => {
    expect(labelForIssue(warn({ rule: 'somethingNew', message: 'plain text' }))).toBe('plain text');
    expect(labelForIssue(warn({ rule: undefined, message: 'plain text' }))).toBe('plain text');
  });

  it('falls back to a generic label when neither a known rule nor a message exists', () => {
    expect(labelForIssue({})).toBe('Issue');
    expect(labelForIssue(null)).toBe('');
  });

  it('appends the shifts-worked/target numbers for an underTarget issue whose message carries them', () => {
    const issue = warn({ rule: 'underTarget', message: 'Under target: 18/20 shifts' });
    expect(labelForIssue(issue)).toBe(`${ISSUE_RULE_LABELS.underTarget} — 18 of 20`);
  });

  it('falls back to the plain rule label when an underTarget message has no parseable counts', () => {
    expect(labelForIssue(warn({ rule: 'underTarget', message: 'weird' }))).toBe(ISSUE_RULE_LABELS.underTarget);
  });
});

describe('issueJumpTarget / isJumpableIssue', () => {
  it('targets a cell when residentId and dateStr are both present', () => {
    expect(issueJumpTarget(err())).toEqual({ type: 'cell', residentId: 'r1', dateStr: '2026-01-05' });
    expect(isJumpableIssue(err())).toBe(true);
  });

  it('falls back to anchorDate for a cell target when dateStr is null', () => {
    const issue = err({ dateStr: null, anchorDate: '2026-02-01' });
    expect(issueJumpTarget(issue)).toEqual({ type: 'cell', residentId: 'r1', dateStr: '2026-02-01' });
  });

  it('targets the resident ROW when a resident is named but no date (nor anchorDate) is known', () => {
    const issue = err({ dateStr: null });
    expect(issueJumpTarget(issue)).toEqual({ type: 'row', residentId: 'r1' });
    expect(isJumpableIssue(issue)).toBe(true);
  });

  it('is not jumpable at all when no resident is named — block-wide issues have no row or cell', () => {
    expect(issueJumpTarget(err({ residentId: null }))).toBeNull();
    expect(isJumpableIssue(err({ residentId: null }))).toBe(false);
    expect(isJumpableIssue(null)).toBe(false);
  });
});

describe('issueKey', () => {
  it('is stable identity, not array position', () => {
    const a = err();
    const b = err({ message: 'different' });
    expect(issueKey(a)).not.toBe(issueKey(b));
    expect(issueKey(a)).toBe(issueKey({ ...a }));
  });

  it('tolerates a null/empty issue', () => {
    expect(issueKey(null)).toBe('');
  });
});

describe('normalizeIssueMessage', () => {
  it('strips parentheticals, day+date tokens, and numbers so same-kind messages collapse', () => {
    const a = normalizeIssueMessage('Isolated night stint of 3 (Wed 1/5–Fri 1/7) — aim for 5-6 in a row');
    const b = normalizeIssueMessage('Isolated night stint of 1 (Mon 2/2–Mon 2/2) — aim for 5-6 in a row');
    expect(a).toBe(b);
  });

  it('leaves a message with no numbers/dates essentially unchanged (whitespace-normalized)', () => {
    expect(normalizeIssueMessage('No full weekend (Sat+Sun) off this block')).toBe('No full weekend off this block');
  });

  it('tolerates empty input', () => {
    expect(normalizeIssueMessage('')).toBe('');
    expect(normalizeIssueMessage(null)).toBe('');
  });
});

describe('labelForIssueGroup', () => {
  it('uses the rule label map when the group key is a rule id', () => {
    expect(labelForIssueGroup('underTarget', [warn({ rule: 'underTarget' })])).toBe(ISSUE_RULE_LABELS.underTarget);
  });

  it('uses the message-template label map when the group key is a normalized message', () => {
    const key = normalizeIssueMessage('Isolated night stint of 3 (Wed 1/5–Fri 1/7) — aim for 5-6 in a row');
    expect(GROUP_MESSAGE_LABELS[key]).toBe('Isolated night stints');
    expect(labelForIssueGroup(key, [warn({ message: 'Isolated night stint of 3 (Wed 1/5–Fri 1/7) — aim for 5-6 in a row' })])).toBe('Isolated night stints');
  });

  it('falls back to the normalized template when the key is unmapped, not the raw first message', () => {
    expect(labelForIssueGroup('nope', [warn({ message: 'Some other warning' })])).toBe('Some other warning');
  });

  it('never leaks a specific date or count into the fallback label — every item speaks for the group', () => {
    // A raw-message fallback would render this AS-IS, including "3" and the date — which reads as
    // if every item in the group happened on that one date with that one count.
    const issue = warn({ message: 'Trauma shifts: 3 (Wed 1/5) — cap is 2/block' });
    const label = labelForIssueGroup('nope', [issue]);
    expect(label).not.toContain('3');
    expect(label).not.toContain('1/5');
    expect(label).toBe(normalizeIssueMessage(issue.message));
  });

  it('builds a shift-specific label for a coverage-miss group from the shiftLabelsById param, with no date or count', () => {
    const issues = [
      warn({ residentId: null, shiftId: 'TRAUMA-D', message: 'Below minimum staffing: 0/1 on Trauma Day (Tue 7/7)' }),
      warn({ residentId: null, shiftId: 'TRAUMA-D', message: 'Below minimum staffing: 0/1 on Trauma Day (Wed 7/8)' }),
    ];
    const key = groupKeyForIssue(issues[0]);
    const label = labelForIssueGroup(key, issues, { 'TRAUMA-D': 'Trauma Day' });
    expect(label).toBe('Trauma Day below minimum');
    expect(label).not.toMatch(/\d/);
  });

  it('builds a coverage-max label distinctly from a coverage-min one, and falls back to the bare shiftId with no map', () => {
    const issue = warn({ residentId: null, shiftId: 'POD-N', message: 'Above maximum staffing: 3/2 on POD Night (Sat 7/11)' });
    const key = groupKeyForIssue(issue);
    expect(labelForIssueGroup(key, [issue])).toBe('POD-N above maximum');
    expect(labelForIssueGroup(key, [issue], { 'POD-N': 'POD Night' })).toBe('POD Night above maximum');
  });
});

describe('groupKeyForIssue', () => {
  it('prefers rule, then a coverage shiftId key, then the normalized message', () => {
    expect(groupKeyForIssue(warn({ rule: 'postNightRest', shiftId: 'POD-D' }))).toBe('postNightRest');
    const coverage = warn({ residentId: null, shiftId: 'TRAUMA-D', message: 'Below minimum staffing: 0/1 on Trauma Day (Tue 7/7)' });
    expect(groupKeyForIssue(coverage)).toBe('coverage:min:TRAUMA-D');
    expect(groupKeyForIssue(warn({ rule: undefined, message: 'plain text' }))).toBe(normalizeIssueMessage('plain text'));
  });

  it('two coverage-miss issues for the SAME shift on different dates share a key; different shifts do not', () => {
    const podMon = warn({ residentId: null, shiftId: 'POD-D', message: 'Below minimum staffing: 0/2 on POD Day (Mon 7/6)' });
    const podTue = warn({ residentId: null, shiftId: 'POD-D', message: 'Below minimum staffing: 0/2 on POD Day (Tue 7/7)' });
    const trauma = warn({ residentId: null, shiftId: 'TRAUMA-D', message: 'Below minimum staffing: 0/1 on Trauma Day (Mon 7/6)' });
    expect(groupKeyForIssue(podMon)).toBe(groupKeyForIssue(podTue));
    expect(groupKeyForIssue(podMon)).not.toBe(groupKeyForIssue(trauma));
  });

  it('tolerates a null issue', () => {
    expect(groupKeyForIssue(null)).toBe('');
  });
});

describe('groupIssuesByKind', () => {
  it('groups by rule id when present, else by normalized message template', () => {
    const issues = [
      warn({ rule: 'postNightRest', residentId: 'a' }),
      warn({ rule: 'postNightRest', residentId: 'b' }),
      warn({ rule: undefined, message: 'Isolated night stint of 3 (Wed 1/5–Fri 1/7) — aim for 5-6 in a row', residentId: 'c' }),
      warn({ rule: undefined, message: 'Isolated night stint of 1 (Mon 2/2–Mon 2/2) — aim for 5-6 in a row', residentId: 'd' }),
    ];
    const groups = groupIssuesByKind(issues);
    expect(groups).toHaveLength(2);
    const byLabel = Object.fromEntries(groups.map(g => [g.label, g.count]));
    expect(byLabel[ISSUE_RULE_LABELS.postNightRest]).toBe(2);
    expect(byLabel['Isolated night stints']).toBe(2);
  });

  it('orders export-blocking groups first, then by count descending', () => {
    const blocking = new Set(['blockingRule']);
    const issues = [
      ...Array.from({ length: 2 }, () => warn({ rule: 'blockingRule' })),
      ...Array.from({ length: 5 }, () => warn({ rule: 'commonRule' })),
      ...Array.from({ length: 1 }, () => warn({ rule: 'rareRule' })),
    ];
    const groups = groupIssuesByKind(issues, blocking);
    expect(groups.map(g => g.key)).toEqual(['blockingRule', 'commonRule', 'rareRule']);
    expect(groups[0].blocking).toBe(true);
  });

  it('tolerates a non-array input and returns no groups', () => {
    expect(groupIssuesByKind(undefined)).toEqual([]);
  });

  it('groups coverage-miss issues by shift, not into one bucket, and labels each with no date/count', () => {
    const dates = ['2026-07-06', '2026-07-07', '2026-07-08'];
    const issues = [
      ...dates.map(d => warn({ residentId: null, shiftId: 'TRAUMA-D', dateStr: d, message: `Below minimum staffing: 0/1 on Trauma Day (Tue 7/7)` })),
      warn({ residentId: null, shiftId: 'POD-D', dateStr: dates[0], message: 'Below minimum staffing: 0/2 on POD Day (Mon 7/6)' }),
    ];
    const groups = groupIssuesByKind(issues, new Set(), { 'TRAUMA-D': 'Trauma Day', 'POD-D': 'POD Day' });
    expect(groups).toHaveLength(2);
    const trauma = groups.find(g => g.count === 3);
    const pod = groups.find(g => g.count === 1);
    expect(trauma.label).toBe('Trauma Day below minimum');
    expect(pod.label).toBe('POD Day below minimum');
    for (const g of groups) expect(g.label).not.toMatch(/\d/);
  });
});

describe('classifyCellIssues', () => {
  it('flags an error over anything else', () => {
    const c = classifyCellIssues([warn({ rule: 'x' }), err()], new Set(['x']));
    expect(c).toEqual({ hasIssue: true, hasError: true, hasWarn: true, hasBlockingWarn: true, hasAdvisoryOnly: false });
  });

  it('flags a blocking warn distinctly from a purely advisory one', () => {
    const blocking = new Set(['postNightRest']);
    expect(classifyCellIssues([warn({ rule: 'postNightRest' })], blocking).hasBlockingWarn).toBe(true);
    expect(classifyCellIssues([warn({ rule: 'postNightRest' })], blocking).hasAdvisoryOnly).toBe(false);
    const advisory = classifyCellIssues([warn({ rule: 'somethingElse' })], blocking);
    expect(advisory.hasBlockingWarn).toBe(false);
    expect(advisory.hasAdvisoryOnly).toBe(true);
  });

  it('is all-false for an empty or missing list', () => {
    expect(classifyCellIssues([])).toEqual({ hasIssue: false, hasError: false, hasWarn: false, hasBlockingWarn: false, hasAdvisoryOnly: false });
    expect(classifyCellIssues(undefined)).toEqual({ hasIssue: false, hasError: false, hasWarn: false, hasBlockingWarn: false, hasAdvisoryOnly: false });
  });
});
