// Solver test file: the exact payload Optimize would send, with resident ids coded (R01..) and
// every free-text/identity field stripped, so benches can run without the app or real names.
// Pure module. The id -> code map is deliberately never written anywhere.
export const SOLVER_TEST_KIND = 'resident-solver-test';
export const SOLVER_TEST_VERSION = 1;

const STRIP_KEYS = new Set(['name', 'firstName', 'lastName', 'fullName', 'displayName', 'email', 'notes', 'targetNote']);

function stripFields(v) {
  if (Array.isArray(v)) return v.map(stripFields);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!STRIP_KEYS.has(k)) out[k] = stripFields(x);
    return out;
  }
  return v;
}

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildSolverTestFile(payload, { label, startDate, endDate, createdAt = new Date().toISOString(), nameStrings = [] } = {}) {
  const residents = Array.isArray(payload?.residents) ? payload.residents : [];
  const pad = residents.length > 99 ? 3 : 2;
  const codeOf = new Map();
  residents.forEach((r, i) => codeOf.set(String(r.id), `R${String(i + 1).padStart(pad, '0')}`));
  // Strip first (ids live under `id`, never under a stripped key), then code every quoted id.
  let text = JSON.stringify(stripFields(payload));
  if (codeOf.size) {
    const esc = k => JSON.stringify(k).slice(1, -1);
    const re = new RegExp(`"(${[...codeOf.keys()].map(k => escRe(esc(k))).join('|')})"`, 'g');
    const byEsc = new Map([...codeOf].map(([k, c]) => [esc(k), c]));
    text = text.replace(re, (_, id) => `"${byEsc.get(id)}"`);
  }
  const file = {
    kind: SOLVER_TEST_KIND, version: SOLVER_TEST_VERSION, createdAt, label, startDate, endDate,
    residentCount: residents.length, codes: `R01..R${String(residents.length).padStart(pad, '0')} in payload.residents order`,
    payload: JSON.parse(text),
  };
  // Scan the data (payload + caller-supplied label/dates), not the fixed envelope keys, which a short name could match by chance.
  const out = [label, startDate, endDate, JSON.stringify(file.payload)].join('\n').toLowerCase();
  const leaked = new Set((nameStrings || []).map(s => String(s ?? '').trim().toLowerCase()).filter(s => s.length >= 3)
    .filter(s => out.includes(s)));
  if (leaked.size) throw new Error(`Solver test file refused: ${leaked.size} resident name/email string${leaked.size === 1 ? '' : 's'} still present after coding`);
  return file;
}

export function readSolverTestFile(json) {
  let f = json;
  if (typeof f === 'string') { try { f = JSON.parse(f); } catch { throw new Error('Not a solver test file: invalid JSON'); } }
  if (!f || typeof f !== 'object' || f.kind !== SOLVER_TEST_KIND) throw new Error(`Not a solver test file (kind must be "${SOLVER_TEST_KIND}")`);
  if (f.version !== SOLVER_TEST_VERSION) throw new Error(`Unsupported solver test file version ${f.version} (expected ${SOLVER_TEST_VERSION})`);
  if (!f.payload || typeof f.payload !== 'object') throw new Error('Solver test file has no payload');
  const { payload, ...meta } = f;
  return { payload, meta };
}
