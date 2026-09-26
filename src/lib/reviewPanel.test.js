import { describe, it, expect } from 'vitest';
import { groupPanelIssues, labelForIssue, isJumpableIssue, ISSUE_RULE_LABELS } from './reviewPanel.js';

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
});

describe('isJumpableIssue', () => {
  it('is true only when both residentId and dateStr are present', () => {
    expect(isJumpableIssue(err())).toBe(true);
    expect(isJumpableIssue(err({ dateStr: null }))).toBe(false);
    expect(isJumpableIssue(err({ residentId: null }))).toBe(false);
    expect(isJumpableIssue(null)).toBe(false);
  });
});
