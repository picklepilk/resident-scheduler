import { describe, it, expect } from 'vitest';
import { createLatestGuard } from './latestGuard.js';

describe('createLatestGuard', () => {
  it('only the most recent load is latest', () => {
    const g = createLatestGuard();
    const first = g.next();
    expect(first()).toBe(true);
    const second = g.next();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
