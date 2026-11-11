// Next value of the gate's `profile` state after a profiles SELECT.
//   undefined = not fetched yet, null = fetched, no row (or first fetch failed).
// A failed re-fetch (e.g. a token-refresh blip on onAuthStateChange) must KEEP the previous
// profile: treating it as "no row" renders the pending-approval screen for an admin and unmounts
// the scheduler mid-session. A first-ever failure resolves to null so the gate cannot hang on a
// blank screen.
export function nextProfile(prev, data, error) {
  if (error) return prev === undefined ? null : prev;
  return data ?? null;
}
