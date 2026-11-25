// Pre-Optimize check (2026-11-24): ask a solver host to price the current grid in score mode and tell the chief
// whether the grid breaks any hard solver rule (then Optimize loses its warm start and starts slower).
// Pure helpers only; the call itself lives in ResidentScheduler (runOptimizePrecheck) via solverClient.solveRemote.

export const PRECHECK_SECONDS = 10;

// Solver rule names (solver-service/solver/validate.py) in plain words.
export const RULE_LABELS = {
  eligibility: 'a shift the resident is not eligible for',
  locked: 'a locked cell not kept',
  coverageMax: 'too many people on a shift',
  seniorComposition: 'a shift with no senior',
  circadianPair: 'an evening followed by a day shift',
  nightRunMax: 'too many nights in a row',
  nightCap: 'too many nights',
  nightSegments: 'too many separate night runs',
  consecutiveWork: 'too many work days in a row',
  jcCap: 'too many JC shifts',
  bamcWedNight: 'too many BAMC Wednesday nights',
  pedsMixMax: 'too many peds shifts',
  targetCeiling: 'more shifts than the target allows',
  traumaPedsSplit: 'trauma and peds not split as required',
};

export const ruleLabel = rule => RULE_LABELS[rule] || String(rule);

// The same payload, switched to score mode with a short limit. Never mutates the input.
export function precheckRequest(payload) {
  return { ...payload, config: { ...(payload?.config || {}), mode: 'score', maxTimeSeconds: PRECHECK_SECONDS, numWorkers: 1 } };
}

// `report` = the solver response's report. null = host sent no hintCheck (older host) or garbage.
export function summarizePrecheck(report) {
  const hc = report?.hintCheck;
  if (!hc || typeof hc !== 'object' || !Array.isArray(hc.violations)) return null;
  const rules = hc.violations
    .filter(v => v && typeof v.rule === 'string' && Number.isFinite(v.count) && v.count > 0)
    .map(v => ({ rule: v.rule, count: v.count, label: ruleLabel(v.rule) }))
    .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));
  if (hc.feasible === true && rules.length === 0) return { ok: true };
  if (rules.length === 0) return null; // infeasible but nothing named (e.g. unknown cells): say nothing rather than guess
  return { ok: false, total: rules.reduce((n, r) => n + r.count, 0), rules };
}

export function precheckLine(summary) {
  if (!summary) return '';
  if (summary.ok) return "Starting grid passes the solver's rules.";
  const parts = summary.rules.slice(0, 3).map(r => `${r.label} ${r.count}`);
  const more = summary.rules.length > 3 ? `, and ${summary.rules.length - 3} more` : '';
  const n = summary.total;
  return `Starting grid breaks ${n} solver ${n === 1 ? 'rule' : 'rules'} (${parts.join(', ')}${more}). Optimize will start slower.`;
}
