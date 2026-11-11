// Stale-response guard for overlapping async loads. `next()` starts a new load and returns an
// `isLatest()` predicate that turns false as soon as a newer load has started.
export function createLatestGuard() {
  let current = 0;
  return {
    next() {
      const mine = ++current;
      return () => mine === current;
    },
  };
}
