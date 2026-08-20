import { describe, it, expect } from 'vitest';
import { appendImportLog, normalizeImportLog, IMPORT_LOG_CAP_BYTES } from './importLog.js';

function entry(overrides = {}) {
  return { id: 'x', at: '2026-08-19T00:00:00.000Z', kind: 'roster', summary: '1 imported', ...overrides };
}

describe('appendImportLog', () => {
  it('appends to an empty/undefined log', () => {
    expect(appendImportLog(undefined, entry({ id: '1' }))).toEqual([entry({ id: '1' })]);
    expect(appendImportLog([], entry({ id: '1' }))).toEqual([entry({ id: '1' })]);
  });

  it('treats a non-array log as empty rather than throwing (untrusted-shape guard)', () => {
    expect(appendImportLog(null, entry({ id: '1' }))).toEqual([entry({ id: '1' })]);
    expect(appendImportLog('corrupt', entry({ id: '1' }))).toEqual([entry({ id: '1' })]);
    expect(appendImportLog({ not: 'an array' }, entry({ id: '1' }))).toEqual([entry({ id: '1' })]);
  });

  it('preserves existing entries and appends the new one last', () => {
    const log = [entry({ id: '1' }), entry({ id: '2' })];
    const next = appendImportLog(log, entry({ id: '3' }));
    expect(next.map(e => e.id)).toEqual(['1', '2', '3']);
    // original array is untouched (immutable append)
    expect(log.map(e => e.id)).toEqual(['1', '2']);
  });

  it('evicts the oldest entries once the serialized array exceeds the cap', () => {
    // Each entry ~1KB via rawText padding; cap tiny so eviction is exercised deterministically.
    const big = 'x'.repeat(1000);
    let log = [];
    for (let i = 0; i < 10; i++) {
      log = appendImportLog(log, entry({ id: String(i), rawText: big }), 3000);
    }
    // Well under 10 entries survive a 3000-byte cap at ~1KB/entry.
    expect(log.length).toBeLessThan(10);
    expect(JSON.stringify(log).length).toBeLessThanOrEqual(3000);
    // Newest entry always survives.
    expect(log[log.length - 1].id).toBe('9');
    // Oldest entries were evicted first (ids are in ascending, i.e. oldest-first, order).
    expect(log[0].id).not.toBe('0');
  });

  it('never drops a single entry larger than the cap, even though it exceeds it', () => {
    const huge = 'x'.repeat(5000);
    const log = appendImportLog([], entry({ id: 'solo', rawText: huge }), 3000);
    expect(log).toHaveLength(1);
    expect(log[0].id).toBe('solo');
  });

  it('evicts older neighbors around an oversized entry once a newer one is appended', () => {
    const huge = 'x'.repeat(2500);
    let log = appendImportLog([], entry({ id: 'a', rawText: huge }), 3000);
    log = appendImportLog(log, entry({ id: 'b', rawText: huge }), 3000);
    // 'a' no longer fits alongside 'b' under the cap — only the newest survives.
    expect(log.map(e => e.id)).toEqual(['b']);
  });

  it('defaults to IMPORT_LOG_CAP_BYTES (~500KB) when no cap is passed', () => {
    const log = appendImportLog([], entry({ id: '1' }));
    expect(JSON.stringify(log).length).toBeLessThanOrEqual(IMPORT_LOG_CAP_BYTES);
  });
});

describe('normalizeImportLog', () => {
  it('passes through a real array', () => {
    const log = [entry({ id: '1' })];
    expect(normalizeImportLog(log)).toBe(log);
  });

  it('coerces non-array/nullish values to an empty array', () => {
    expect(normalizeImportLog(null)).toEqual([]);
    expect(normalizeImportLog(undefined)).toEqual([]);
    expect(normalizeImportLog('corrupt')).toEqual([]);
    expect(normalizeImportLog({ not: 'an array' })).toEqual([]);
  });
});
