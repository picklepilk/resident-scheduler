// Pure: "where is this generate / long solve actually computing right now?"
// The client knows only where it ROUTED a request (usingLocal, jobsMode); the solver stamps its own
// identity (`runner`, solver-service/solver/runner.py) on /health and every job progress tick. This
// merges the two so the UI can say "verified: running on <host>" or flag a mismatch, instead of
// trusting routing alone. No React, no import from ResidentScheduler.jsx.

const KIND_LABEL = { modal: 'Modal (cloud)', fly: 'Fly.io (cloud)', 'self-hosted': 'Self-hosted server' };

// `claim` = what the client intended: 'browser' (built-in JS engine in this tab) | 'this-computer'
// (run-local solver on loopback) | 'cloud'. `runner` = the solver's self-report, or null/undefined
// while nothing has answered yet. `jobsMode` ('durable' | 'memory' | null) refines an unverified
// cloud claim.
export function describeRunLocation({ claim, runner = null, jobsMode = null } = {}) {
  if (claim === 'browser') {
    return { where: 'browser', verified: true, title: 'This browser tab', detail: 'Built-in engine runs on this device’s CPU, not on a server.', warning: null, runner: null };
  }
  const r = runner && typeof runner === 'object' ? runner : null;
  if (!r) {
    const guess = claim === 'this-computer' ? 'This computer (loopback solver)'
      : jobsMode === 'durable' ? 'Cloud (Modal)' : jobsMode === 'memory' ? 'Cloud (Fly or self-hosted)' : 'Cloud optimizer';
    return { where: claim === 'this-computer' ? 'this-computer' : 'cloud', verified: false, title: guess, detail: 'Waiting for the solver to report its host…', warning: null, runner: null };
  }
  const kind = r.kind in KIND_LABEL ? r.kind : 'self-hosted';
  const hostBits = [r.host, r.os && r.arch ? `${r.os}/${r.arch}` : r.os || r.arch, r.cpus ? `${r.cpus} cores` : null].filter(Boolean).join(' · ');
  let warning = null;
  if (claim === 'this-computer' && kind !== 'self-hosted') warning = `Routed to “this computer” but the responder reports ${KIND_LABEL[kind]}.`;
  if (claim === 'cloud' && kind === 'self-hosted' && jobsMode === 'durable') warning = 'Cloud reports durable (Modal) jobs but the responder is a plain server.';
  const title = claim === 'this-computer' ? `This computer${r.host ? ` (${r.host})` : ''}`
    : kind === 'self-hosted' ? `Server ${r.host || ''}`.trim() : KIND_LABEL[kind];
  return { where: claim === 'this-computer' ? 'this-computer' : kind, verified: true, title, detail: hostBits, warning, runner: r };
}

// Load as a 0..1 fraction of cores, for a bar. null when the platform gives no load average.
export function loadFraction(runner) {
  if (!runner || typeof runner.load1 !== 'number' || !(runner.cpus > 0)) return null;
  return Math.max(0, Math.min(1, runner.load1 / runner.cpus));
}
