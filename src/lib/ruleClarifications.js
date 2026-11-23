// Rule clarifications: open scheduling-rule questions the program chief answers in-app, plus new rule
// requests. Lives in appSettings.ruleClarifications ({ v:1, items }) - NOT its own res_* key (same reason
// as appSettings.jeopardyLog). Pure module: never imports ResidentScheduler.jsx. Stored data is untrusted.

export const TOPICS = ['rotation-split', 'off-service', 'qgenda-naming', 'shift-rules', 'other'];
export const TOPIC_LABELS = {
  'rotation-split': 'Rotation splits',
  'off-service': 'Off-service',
  'qgenda-naming': 'QGenda naming',
  'shift-rules': 'Shift rules',
  other: 'Other',
};
export const STATUSES = ['open', 'answered', 'applied', 'withdrawn'];
export const STATUS_LABELS = { open: 'Open', answered: 'Answered', applied: 'Applied', withdrawn: 'Withdrawn' };

const o = (id, label) => ({ id, label });
const q = (id, topic, title, detail, currentRule, options, recommended) => ({
  id, kind: 'question', topic, title, detail, currentRule, options, recommended,
});

export const SEED_RULE_QUESTIONS = [
  q('q-rot-short', 'rotation-split', 'Short rotations (under 4 weeks)',
    'A resident is with us for less than a full 4-week block, for example 2 weeks of Peds or 1 week of Neuro. How many shifts should we expect from them?',
    'The app prorates by days in some cases; the interim pick is a share by days (2 weeks Peds = 8 of 15; 1 week Neuro = 4 of 14).',
    [o('by-days', 'Share by days (2 weeks Peds = 8 of 15; 1 week Neuro = 4 of 14)'), o('full', 'Full number regardless of length'), o('chief-sets', 'I will set the number for each rotation')], 'by-days'),
  q('q-rot-long', 'rotation-split', 'Long rotations (about 5 weeks)',
    'A rotation runs 35 days, for example Peds 11/9 to 12/13. Should the number of shifts go up?',
    'The standard number (15 for Peds) applies.',
    [o('standard', 'Keep the standard number (15)'), o('scale', 'Scale up by days (19)'), o('chief-sets', 'I will set the number for each rotation')], 'standard'),
  q('q-rot-cross', 'rotation-split', 'Rotation that crosses two of our blocks',
    'A rotation starts in one block and ends in the next. How should its shifts be divided between the two blocks?',
    'Not split by the app today; each block counts its own days.',
    [o('by-days', 'Split by the days in each block'), o('front', 'Front-load: most in the first block'), o('back', 'Back-load: most in the second block'), o('chief-sets', 'I will set the split for each rotation')], 'by-days'),
  q('q-rot-incomplete', 'rotation-split', 'Shifts not finished by the end of a rotation',
    'If a resident leaves a rotation owing shifts, what happens to the shortfall?',
    'The shortfall is only noted; nothing carries over.',
    [o('note', 'Note only, drop it'), o('carry', "Carry to the resident's next rotation with us"), o('payback', 'Pay back in a later block')], 'note'),
  q('q-rot-im', 'rotation-split', 'IM rotations',
    'IM rotations are mostly 15 days and the target is 6 shifts. Is 6 per 15-day rotation right? What should an 8-day IM rotation owe (3?)',
    'Target 6 per IM rotation, regardless of length.',
    [o('six-prorate', '6 per 15 days, prorated (8 days = 3)'), o('six-flat', '6 for any IM rotation'), o('chief-sets', 'I will set the number for each rotation')], 'six-prorate'),
  q('q-rot-bamc', 'rotation-split', 'BAMC repeat rotators',
    'A BAMC resident rotates with us in back-to-back blocks. Is each 4-week block its own quota (19), with nothing carried between blocks? What should a 31-day BAMC rotation owe?',
    'Each block is its own quota of 19.',
    [o('own-quota', 'Each 4-week block is its own quota (19); nothing carries over'), o('carry', 'Quota carries between blocks'), o('chief-sets', 'I will set the number, including for 31-day rotations')], 'own-quota'),
  q('q-rot-before', 'rotation-split', 'Shifts worked in QGenda before our block starts',
    'A resident already worked shifts in QGenda in the same rotation before our block begins. Should those count toward the rotation total?',
    'Shifts before the block start are not counted.',
    [o('count', 'Count them toward the rotation total'), o('ignore', 'Ignore them')], 'count'),
  q('q-rot-daysoff', 'rotation-split', "Off-service residents' days off inside a rotation",
    'Weekends and their own didactics fall inside a rotation. Is there any fixed rule on how those reduce the shifts owed?',
    'No fixed rule; the chief enters days off by hand.',
    [o('none', 'No fixed rule, I will enter them by hand'), o('rule', 'Yes, there is a rule (explain in the note)')], 'none'),
  q('q-os-bamc-pa', 'off-service', 'BAMC PA rows on the roster',
    'BAMC PA rows appear on the roster. We do not schedule them. Should the app show them for reference only, or hide them?',
    'They are listed like other off-service rows.',
    [o('show', 'Show for reference only'), o('hide', 'Hide them')], 'show'),
  q('q-qg-slots', 'qgenda-naming', 'Numbered off-service slots in QGenda',
    'QGenda lists off-service residents as numbered slots ("Neurology 1", "SAMMC9 - PGY2", "Resident 5, SAMMC3 PGY3", "Off Service, Anes") and not by name. How should exports handle this?',
    'Exports use whatever label the QGenda task mapping gives.',
    [o('names', 'Export with real names'), o('slot-list', 'I keep a slot-to-person list for each rotation'), o('suggest', 'The app suggests matches by dates and I confirm')], 'suggest'),
  q('q-qg-slot-label', 'qgenda-naming', 'Slot label versus specialty',
    'Some slots hold shifts that do not fit the label (for example a "Psychiatry" slot with only Peds shifts). Are slot labels reused across specialties?',
    'The app trusts the slot label.',
    [o('yes', 'Yes, labels are reused'), o('no', 'No, labels match the specialty'), o('sometimes', 'Sometimes (explain in the note)')]),
  q('q-qg-sammc', 'qgenda-naming', 'SAMMC versus BAMC in QGenda',
    'Are "SAMMC" and "BAMC" the same program in QGenda?',
    'Treated as separate labels.',
    [o('same', 'Yes, same program'), o('different', 'No, different programs')]),
  q('q-qg-military', 'qgenda-naming', 'Military rows in QGenda',
    'Who are the "Military EMPA", "Military PGY-1/2" and "Military Psych PA" rows, and should the app ever schedule them?',
    'The app does not schedule them.',
    [o('never', 'Never schedule them'), o('sometimes', 'Schedule some (explain in the note)')], 'never'),
  q('q-qg-peds-night', 'qgenda-naming', 'Peds Night (FM only) 11p-8a',
    'Please confirm the "*Peds Night (FM only) 11p-8a" task is for FM residents only, and which PGY.',
    'PED-N-FM is limited to the FM rotation.',
    [o('fm-only', 'FM only (say which PGY in the note)'), o('other', 'Other (explain in the note)')]),
];

const iso = v => (typeof v === 'string' && v && !Number.isNaN(Date.parse(v)) ? v : undefined);
const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : undefined);

function normalizeOptions(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const x of raw) {
    if (!x || typeof x.id !== 'string' || !x.id || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({ id: x.id, label: str(x.label, 300) || x.id });
  }
  return out;
}

function normalizeItem(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id) return null;
  const options = normalizeOptions(x.options);
  const item = {
    id: x.id,
    kind: x.kind === 'request' ? 'request' : 'question',
    topic: TOPICS.includes(x.topic) ? x.topic : 'other',
    title: str(x.title, 300) || '(untitled)',
    detail: str(x.detail) || '',
    options,
    status: STATUSES.includes(x.status) ? x.status : 'open',
    createdAt: iso(x.createdAt) || new Date(0).toISOString(),
    updatedAt: iso(x.updatedAt) || iso(x.createdAt) || new Date(0).toISOString(),
  };
  if (typeof x.recommended === 'string' && options.some(op => op.id === x.recommended)) item.recommended = x.recommended;
  if (str(x.currentRule)) item.currentRule = str(x.currentRule);
  if (str(x.createdBy, 200)) item.createdBy = str(x.createdBy, 200);
  if (x.answer && typeof x.answer === 'object') {
    const a = {};
    if (typeof x.answer.choice === 'string' && x.answer.choice) a.choice = x.answer.choice;
    if (str(x.answer.note)) a.note = str(x.answer.note);
    if (str(x.answer.by, 200)) a.by = str(x.answer.by, 200);
    if (iso(x.answer.at)) a.at = iso(x.answer.at);
    if (Object.keys(a).length) item.answer = a;
  }
  if (x.ownerReply && typeof x.ownerReply === 'object' && str(x.ownerReply.text)) {
    item.ownerReply = { text: str(x.ownerReply.text), at: iso(x.ownerReply.at) };
  }
  return item;
}

export function normalizeRuleClarifications(raw) {
  const arr = raw && typeof raw === 'object' && Array.isArray(raw.items) ? raw.items : [];
  const seen = new Set();
  const items = [];
  for (const x of arr) {
    const it = normalizeItem(x);
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    items.push(it);
  }
  return { v: 1, items };
}

// Seeds supply the question text; stored supplies answer/status/reply. Stored-only items (requests) kept.
export function mergeSeeds(stored, seeds = SEED_RULE_QUESTIONS, now = new Date().toISOString()) {
  const st = normalizeRuleClarifications(stored);
  const byId = new Map(st.items.map(i => [i.id, i]));
  const seedIds = new Set();
  const items = [];
  for (const s of seeds) {
    seedIds.add(s.id);
    const base = normalizeItem({ ...s, status: 'open', createdAt: now, updatedAt: now });
    const have = byId.get(s.id);
    if (!have) { items.push(base); continue; }
    const merged = { ...base, status: have.status, createdAt: have.createdAt, updatedAt: have.updatedAt };
    if (have.answer) merged.answer = have.answer;
    if (have.ownerReply) merged.ownerReply = have.ownerReply;
    items.push(merged);
  }
  for (const i of st.items) if (!seedIds.has(i.id)) items.push(i);
  return { v: 1, items };
}

// State ops take/return the STORED shape. They materialize the target seed into stored on first touch.
function ensureStored(state, id, seeds = SEED_RULE_QUESTIONS) {
  const st = normalizeRuleClarifications(state);
  if (st.items.some(i => i.id === id)) return st;
  const seed = seeds.find(s => s.id === id);
  if (!seed) return st;
  const now = new Date().toISOString();
  return { v: 1, items: [...st.items, normalizeItem({ ...seed, status: 'open', createdAt: now, updatedAt: now })] };
}

function patch(state, id, fn) {
  const st = ensureStored(state, id);
  const now = new Date().toISOString();
  return { v: 1, items: st.items.map(i => (i.id === id ? normalizeItem({ ...fn(i, now), updatedAt: now }) : i)) };
}

// Pass choice and/or note; an omitted field keeps the prior value. A new answer moves open -> answered.
export function answerItem(state, id, { choice, note, by } = {}) {
  return patch(state, id, (i, now) => {
    const prev = i.answer || {};
    const answer = { ...prev, by: by || prev.by || 'chief', at: now };
    if (choice !== undefined) answer.choice = choice || undefined;
    if (note !== undefined) answer.note = note || undefined;
    const has = answer.choice || answer.note;
    const status = has ? (i.status === 'open' || i.status === 'answered' ? 'answered' : i.status) : (i.status === 'answered' ? 'open' : i.status);
    return { ...i, answer: has ? answer : undefined, status };
  });
}

export function setStatus(state, id, status) {
  if (!STATUSES.includes(status)) return normalizeRuleClarifications(state);
  return patch(state, id, i => ({ ...i, status }));
}

export function setOwnerReply(state, id, text) {
  return patch(state, id, (i, now) => ({ ...i, ownerReply: String(text || '').trim() ? { text: String(text).trim(), at: now } : undefined }));
}

export function addRequest(state, { title, detail, topic, by } = {}) {
  const st = normalizeRuleClarifications(state);
  const t = String(title || '').trim();
  if (!t) return st;
  const now = new Date().toISOString();
  let id;
  do { id = `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; } while (st.items.some(i => i.id === id));
  const item = normalizeItem({ id, kind: 'request', topic: TOPICS.includes(topic) ? topic : 'other', title: t, detail: String(detail || '').trim(), options: [], status: 'open', createdBy: by || 'chief', createdAt: now, updatedAt: now });
  return { v: 1, items: [...st.items, item] };
}

const optLabel = (item, id) => (item.options.find(o2 => o2.id === id) || {}).label || id;

export function buildClarificationRequestText(items) {
  const open = (Array.isArray(items) ? items : []).filter(i => i.status === 'open' && i.kind === 'question');
  if (!open.length) return 'No open rule questions right now.';
  const lines = ['Hi, a few scheduling rules I want to get right. Please reply with a letter for each (and a note if you like), or answer in the Rule questions tab of the scheduler.', ''];
  open.forEach((it, n) => {
    lines.push(`${n + 1}. ${it.title}`);
    if (it.detail) lines.push(`   ${it.detail}`);
    if (it.currentRule) lines.push(`   Today the app: ${it.currentRule}`);
    it.options.forEach((op, k) => lines.push(`   ${String.fromCharCode(97 + k)}) ${op.label}${op.id === it.recommended ? ' (suggested)' : ''}`));
    lines.push('');
  });
  return lines.join('\n').trimEnd() + '\n';
}

export function buildAnswersMarkdown(items) {
  const list = Array.isArray(items) ? items : [];
  const n = s => list.filter(i => i.status === s).length;
  const lines = ['# Rule clarifications', '', `Items: ${list.length}. Open ${n('open')}, answered ${n('answered')}, applied ${n('applied')}, withdrawn ${n('withdrawn')}.`, ''];
  for (const it of list) {
    lines.push(`## ${it.title}`, '');
    lines.push(`- id: ${it.id}`, `- kind: ${it.kind}`, `- topic: ${TOPIC_LABELS[it.topic] || it.topic}`, `- status: ${it.status}`);
    if (it.createdBy) lines.push(`- requested by: ${it.createdBy}`);
    lines.push(`- created: ${it.createdAt}`, `- updated: ${it.updatedAt}`);
    if (it.detail) lines.push('', it.detail);
    if (it.currentRule) lines.push('', `Current app rule: ${it.currentRule}`);
    if (it.options.length) {
      lines.push('', 'Options:');
      it.options.forEach(op => lines.push(`- ${op.label}${op.id === it.recommended ? ' (suggested)' : ''} [${op.id}]`));
    }
    if (it.answer) {
      lines.push('', `Answer${it.answer.by ? ` by ${it.answer.by}` : ''}${it.answer.at ? ` at ${it.answer.at}` : ''}:`);
      if (it.answer.choice) lines.push(`- choice: ${optLabel(it, it.answer.choice)} [${it.answer.choice}]`);
      if (it.answer.note) lines.push(`- note: ${it.answer.note}`);
    } else lines.push('', 'Answer: none yet.');
    if (it.ownerReply) lines.push('', `Owner reply${it.ownerReply.at ? ` (${it.ownerReply.at})` : ''}: ${it.ownerReply.text}`);
    lines.push('');
  }
  return lines.join('\n');
}
