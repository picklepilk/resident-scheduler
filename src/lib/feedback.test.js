import { describe, it, expect } from 'vitest';
import { buildFeedbackRow, myFeedbackPath, FEEDBACK_MESSAGE_MAX } from './feedback.js';

const user = { id: '11111111-2222-3333-4444-555555555555', email: 'doc@example.com' };

describe('buildFeedbackRow', () => {
  it('uses exactly the applied table columns', () => {
    const row = buildFeedbackRow({ type: 'bug', message: 'hi', page: 'schedule', meta: { a: 1 }, user, userAgent: 'UA', appVersion: '0.1.0' });
    expect(Object.keys(row).sort()).toEqual(
      ['app', 'app_version', 'message', 'meta', 'page', 'reported_by', 'reporter_name', 'type', 'user_agent']
    );
    expect(row).toMatchObject({ app: 'resident-scheduler', type: 'bug', reported_by: user.id, reporter_name: 'doc@example.com' });
  });
  it('never sets status or admin fields', () => {
    const row = buildFeedbackRow({ type: 'idea', message: 'x', user });
    expect(row).not.toHaveProperty('status');
    expect(row).not.toHaveProperty('admin_reply');
    expect(row).not.toHaveProperty('id');
  });
  it('clips message to 4000 chars', () => {
    expect(buildFeedbackRow({ type: 'bug', message: 'a'.repeat(5000), user }).message).toHaveLength(FEEDBACK_MESSAGE_MAX);
    expect(FEEDBACK_MESSAGE_MAX).toBe(4000);
  });
  it('returns null when signed out or message empty', () => {
    expect(buildFeedbackRow({ type: 'bug', message: 'x', user: null })).toBeNull();
    expect(buildFeedbackRow({ type: 'bug', message: '   ', user })).toBeNull();
  });
  it('defaults reporter_name to empty string and nullables to null', () => {
    const row = buildFeedbackRow({ type: 'crash', message: 'x', user: { id: user.id } });
    expect(row.reporter_name).toBe('');
    expect(row.page).toBeNull();
    expect(row.meta).toBeNull();
  });
});

describe('myFeedbackPath', () => {
  it('selects this app only, with reply columns, newest first', () => {
    const p = myFeedbackPath();
    expect(p).toContain('app=eq.resident-scheduler');
    expect(p).toContain('admin_reply');
    expect(p).toContain('admin_reply_at');
    expect(p).toContain('order=created_at.desc');
    expect(p).toContain('limit=20');
  });
  it('sanitises limit', () => {
    expect(myFeedbackPath('abc')).toContain('limit=20');
    expect(myFeedbackPath(9999)).toContain('limit=100');
  });
});
