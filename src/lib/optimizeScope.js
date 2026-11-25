// Scoped Optimize ("only these dates / residents"). Pure helpers; no app imports.
// Scope shape sent to the solver: { dates?: [fromIso, toIso], residentIds?: [id, ...] }; null = whole block.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const SCOPE_MAX_SECONDS = 120;

const isIso = s => typeof s === 'string' && ISO.test(s);

// knownResidentIds: optional list of ids the app knows (default: the ids on block.schedule).
export function normalizeScope(sel, block, knownResidentIds) {
  try {
    if (!sel || typeof sel !== 'object' || !block || typeof block !== 'object') return null;
    const bs = isIso(block.startDate) ? block.startDate : null;
    const be = isIso(block.endDate) ? block.endDate : null;
    const out = {};

    let from = isIso(sel.from) ? sel.from : null;
    let to = isIso(sel.to) ? sel.to : null;
    if (from || to) {
      if (!from) from = to;
      if (!to) to = from;
      if (from > to) [from, to] = [to, from];
      if (bs && be && (from > be || to < bs)) return null; // selection lies outside the block entirely
      if (bs && from < bs) from = bs;
      if (be && to > be) to = be;
      const whole = (!bs || from <= bs) && (!be || to >= be);
      if (!whole) out.dates = [from, to];
    }

    if (Array.isArray(sel.residentIds) && sel.residentIds.length) {
      const known = Array.isArray(knownResidentIds) ? knownResidentIds : Object.keys(block.schedule || {});
      const knownSet = new Set(known);
      const seen = new Set();
      const ids = [];
      for (const id of sel.residentIds) {
        if (typeof id !== 'string' || seen.has(id) || !knownSet.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
      if (ids.length && ids.length < knownSet.size) out.residentIds = ids;
    }
    return out.dates || out.residentIds ? out : null;
  } catch { return null; }
}

// Scoped runs are short: 120 s, or the chosen budget when that is shorter.
export function scopeBudgetSeconds(scope, chosenSeconds) {
  void scope;
  const n = Number(chosenSeconds);
  return Number.isFinite(n) && n > 0 ? Math.min(SCOPE_MAX_SECONDS, n) : SCOPE_MAX_SECONDS;
}

function fmtDay(iso) {
  if (!isIso(iso)) return String(iso ?? '');
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] || ''}`.trim();
}

export function scopeLabel(scope, residentCount) {
  if (!scope || typeof scope !== 'object') return 'whole block';
  const parts = [];
  if (Array.isArray(scope.dates) && scope.dates.length === 2) {
    parts.push(scope.dates[0] === scope.dates[1] ? fmtDay(scope.dates[0]) : `${fmtDay(scope.dates[0])} to ${fmtDay(scope.dates[1])}`);
  }
  if (Array.isArray(scope.residentIds) && scope.residentIds.length) {
    const n = Number.isFinite(residentCount) ? residentCount : scope.residentIds.length;
    parts.push(`${n} ${n === 1 ? 'resident' : 'residents'}`);
  }
  return parts.length ? parts.join(', ') : 'whole block';
}

// applied comes from the host's report.scope; leaked counts resident-days OUTSIDE the scope that differ.
export function scopeOutcome(report, startSchedule, resultSchedule, scope) {
  const sc = report && typeof report === 'object' ? report.scope : null;
  const hostApplied = !!sc && typeof sc === 'object' && sc.applied === true;
  let leaked = 0;
  if (scope && typeof scope === 'object') {
    const ids = Array.isArray(scope.residentIds) && scope.residentIds.length ? new Set(scope.residentIds) : null;
    const [d0, d1] = Array.isArray(scope.dates) && scope.dates.length === 2 ? scope.dates : [null, null];
    const a = startSchedule && typeof startSchedule === 'object' ? startSchedule : {};
    const b = resultSchedule && typeof resultSchedule === 'object' ? resultSchedule : {};
    for (const rid of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const ra = a[rid] && typeof a[rid] === 'object' ? a[rid] : {};
      const rb = b[rid] && typeof b[rid] === 'object' ? b[rid] : {};
      const residentIn = !ids || ids.has(rid);
      for (const ds of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
        const dateIn = !d0 || (ds >= d0 && ds <= d1);
        if (residentIn && dateIn) continue;
        if ((ra[ds] || null) !== (rb[ds] || null)) leaked++;
      }
    }
  }
  if (!hostApplied) {
    const ignored = sc && typeof sc.ignored === 'string' ? sc.ignored : null;
    return { applied: false, reason: ignored || (sc ? 'not applied' : 'host did not report a scope'), leaked };
  }
  if (leaked > 0) return { applied: false, reason: 'cells outside the selection changed', leaked };
  return { applied: true, leaked };
}
