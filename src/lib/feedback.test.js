import { describe, it, expect, vi } from 'vitest';
import { validateFeedback, buildFeedbackBody, buildFeedbackPayload, submitFeedback, FEEDBACK_MAX } from './feedback.js';

const clientWith = insert => ({ from: vi.fn(() => ({ insert })) });

describe('validateFeedback', () => {
  it('requires a known kind and non-blank message', () => {
    expect(validateFeedback({ kind: 'bug', message: 'x' })).toBeNull();
    expect(validateFeedback({ kind: 'nope', message: 'x' })).toBeTruthy();
    expect(validateFeedback({ kind: 'idea', message: '   ' })).toBeTruthy();
    expect(validateFeedback({ kind: 'idea', message: undefined })).toBeTruthy();
  });
  it('enforces the 4000 char cap', () => {
    expect(validateFeedback({ kind: 'bug', message: 'a'.repeat(FEEDBACK_MAX) })).toBeNull();
    expect(validateFeedback({ kind: 'bug', message: 'a'.repeat(FEEDBACK_MAX + 1) })).toBeTruthy();
  });
});

describe('payload', () => {
  it('has app, kind, body only, with page prefix', () => {
    expect(buildFeedbackPayload({ kind: 'crash', message: ' hi ', page: '/requests' }))
      .toEqual({ app: 'residentscheduling', kind: 'crash', body: '[page: /requests] hi' });
  });
  it('drops the prefix when it would exceed the cap', () => {
    const msg = 'a'.repeat(FEEDBACK_MAX);
    expect(buildFeedbackBody(msg, '/x')).toBe(msg);
    expect(buildFeedbackBody('a', undefined)).toBe('a');
  });
});

describe('submitFeedback', () => {
  it('inserts without chaining select and reports ok', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = clientWith(insert);
    expect(await submitFeedback(client, { kind: 'idea', message: 'm', page: '/' })).toEqual({ ok: true });
    expect(client.from).toHaveBeenCalledWith('feedback');
    expect(insert).toHaveBeenCalledWith({ app: 'residentscheduling', kind: 'idea', body: '[page: /] m' });
  });
  it('returns the error message on failure (caller keeps text)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    expect(await submitFeedback(clientWith(insert), { kind: 'bug', message: 'm' })).toEqual({ ok: false, error: 'boom' });
  });
  it('catches thrown errors and skips insert when invalid', async () => {
    const insert = vi.fn().mockRejectedValue(new Error('net'));
    expect(await submitFeedback(clientWith(insert), { kind: 'bug', message: 'm' })).toEqual({ ok: false, error: 'net' });
    const never = vi.fn();
    const r = await submitFeedback(clientWith(never), { kind: 'bug', message: '' });
    expect(r.ok).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });
});
