// Optional (above-min) top-up ordering. PED Night is preferred over PED Swing (chief, 2026-10-31):
// deferred shifts are swept only after every other shift's optional headroom is spent.
// Predicates accept a shift object ({id}) as fillDayPass passes, or a bare shift id.
export const OPTIONAL_DEFERRED_SHIFT_IDS = ['PED-S'];

const idOf = s => (s && typeof s === 'object' ? s.id : s);
const isDeferred = s => OPTIONAL_DEFERRED_SHIFT_IDS.includes(idOf(s));

export function optionalSweepPredicates() {
  return [s => !isDeferred(s), s => isDeferred(s)];
}
