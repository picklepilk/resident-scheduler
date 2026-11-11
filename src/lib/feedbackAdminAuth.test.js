import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handler } from '../../netlify/functions/feedback-admin.js';

const ENV_KEYS = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FEEDBACK_ADMIN_PASSWORD'];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  process.env.VITE_SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'placeholder';
  process.env.FEEDBACK_ADMIN_PASSWORD = 'correct-horse';
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

// DELETE is unsupported, so an authorised call falls through to 405 without touching Supabase.
const call = headers => handler({ httpMethod: 'DELETE', headers });

describe('feedback-admin password check', () => {
  it('accepts the correct password (reaches the method switch)', async () => {
    expect((await call({ 'x-feedback-password': 'correct-horse' })).statusCode).toBe(405);
    expect((await call({ 'X-Feedback-Password': 'correct-horse' })).statusCode).toBe(405);
  });
  it('rejects wrong, prefix, longer and missing passwords', async () => {
    for (const h of [{ 'x-feedback-password': 'wrong' }, { 'x-feedback-password': 'correct-hors' }, { 'x-feedback-password': 'correct-horse!' }, {}]) {
      expect((await call(h)).statusCode).toBe(401);
    }
  });
});
