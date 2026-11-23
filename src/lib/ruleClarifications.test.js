import { describe, it, expect } from 'vitest';
import {
  SEED_RULE_QUESTIONS, normalizeRuleClarifications, mergeSeeds, answerItem, setStatus, setOwnerReply,
  addRequest, buildClarificationRequestText, buildAnswersMarkdown,
} from './ruleClarifications.js';

describe('normalizeRuleClarifications', () => {
  it('guards junk', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { items: 'no' }, { items: [null, 1, {}, { id: '' }] }]) {
      expect(normalizeRuleClarifications(bad)).toEqual({ v: 1, items: [] });
    }
  });
  it('coerces fields and drops dup ids', () => {
    const r = normalizeRuleClarifications({ items: [
      { id: 'a', kind: 'zzz', topic: 'nope', status: 'bad', options: [{ id: 'x', label: 'X' }, { id: 'x' }, null], recommended: 'ghost', answer: { choice: 3, note: 'n' } },
      { id: 'a', title: 'dup' },
    ] });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ kind: 'question', topic: 'other', status: 'open', options: [{ id: 'x', label: 'X' }] });
    expect(r.items[0].recommended).toBeUndefined();
    expect(r.items[0].answer).toEqual({ note: 'n' });
  });
});

describe('seeds', () => {
  it('have unique ids and a valid recommended option', () => {
    const ids = SEED_RULE_QUESTIONS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SEED_RULE_QUESTIONS) if (s.recommended) expect(s.options.some(o => o.id === s.recommended)).toBe(true);
  });
});

describe('mergeSeeds', () => {
  it('adds all seeds to empty state, no dups on re-merge', () => {
    const m = mergeSeeds(undefined);
    expect(m.items).toHaveLength(SEED_RULE_QUESTIONS.length);
    expect(mergeSeeds(m).items).toHaveLength(SEED_RULE_QUESTIONS.length);
  });
  it('stored answer wins, requests kept, new seeds appear', () => {
    let st = answerItem({ v: 1, items: [] }, 'q-rot-short', { choice: 'full', by: 'chief@x' });
    st = addRequest(st, { title: 'New thing' });
    const extra = [...SEED_RULE_QUESTIONS, { id: 'q-new', kind: 'question', topic: 'other', title: 'N', detail: '', options: [] }];
    const m = mergeSeeds(st, extra);
    expect(m.items.find(i => i.id === 'q-rot-short').answer.choice).toBe('full');
    expect(m.items.find(i => i.id === 'q-rot-short').status).toBe('answered');
    expect(m.items.some(i => i.title === 'New thing')).toBe(true);
    expect(m.items.some(i => i.id === 'q-new')).toBe(true);
  });
});

describe('answerItem / status / reply', () => {
  it('sets choice then keeps it when only note changes', () => {
    let st = answerItem(undefined, 'q-rot-long', { choice: 'scale', by: 'c' });
    st = answerItem(st, 'q-rot-long', { note: 'hello' });
    const i = st.items.find(x => x.id === 'q-rot-long');
    expect(i.answer).toMatchObject({ choice: 'scale', note: 'hello', by: 'c' });
    expect(i.status).toBe('answered');
  });
  it('unknown id is a no-op; clearing answer reopens', () => {
    expect(answerItem(undefined, 'zzz', { choice: 'a' }).items).toHaveLength(0);
    let st = answerItem(undefined, 'q-rot-long', { choice: 'scale' });
    st = answerItem(st, 'q-rot-long', { choice: '' });
    expect(st.items[0].status).toBe('open');
    expect(st.items[0].answer).toBeUndefined();
  });
  it('applied status survives re-answer; reply set/clear', () => {
    let st = answerItem(undefined, 'q-rot-long', { choice: 'scale' });
    st = setStatus(st, 'q-rot-long', 'applied');
    st = answerItem(st, 'q-rot-long', { note: 'x' });
    expect(st.items[0].status).toBe('applied');
    st = setOwnerReply(st, 'q-rot-long', ' done ');
    expect(st.items[0].ownerReply.text).toBe('done');
    st = setOwnerReply(st, 'q-rot-long', '');
    expect(st.items[0].ownerReply).toBeUndefined();
    expect(setStatus(st, 'q-rot-long', 'bogus').items[0].status).toBe('applied');
  });
});

describe('addRequest', () => {
  it('adds a request, ignores empty title', () => {
    const st = addRequest(undefined, { title: ' T ', detail: 'd', topic: 'shift-rules', by: 'me' });
    expect(st.items[0]).toMatchObject({ kind: 'request', title: 'T', topic: 'shift-rules', createdBy: 'me', status: 'open' });
    expect(addRequest(st, { title: '  ' }).items).toHaveLength(1);
    expect(addRequest(st, { title: 'U', topic: 'weird' }).items[1].topic).toBe('other');
  });
});

describe('builders', () => {
  const items = mergeSeeds(answerItem(undefined, 'q-rot-short', { choice: 'by-days', note: 'ok', by: 'chief' })).items;
  it('request text lists only open questions with letters', () => {
    const t = buildClarificationRequestText(items);
    expect(t).toContain('1. ');
    expect(t).toContain('a) ');
    expect(t).toContain('(suggested)');
    expect(t).not.toContain('Short rotations');
    expect(buildClarificationRequestText([])).toMatch(/No open/);
    expect(buildClarificationRequestText(null)).toMatch(/No open/);
  });
  it('markdown has status, choice label, note', () => {
    const md = buildAnswersMarkdown(items);
    expect(md).toContain('## Short rotations (under 4 weeks)');
    expect(md).toContain('- status: answered');
    expect(md).toContain('choice: Share by days');
    expect(md).toContain('note: ok');
    expect(md).toContain('Answer: none yet.');
    expect(buildAnswersMarkdown(undefined)).toContain('Items: 0');
  });
});
