// src/lib/solverBudget.js
// Pure helpers for the optimizer engine picker: per-backend CP-SAT time budget, the plain-data
// local-vs-solver comparison object persisted on the generation report, and the quality-vector
// slot labels. No React, no import from ResidentScheduler.jsx (src/lib/ may never import it).

// Fly shared-CPU / default synchronous budget. Values are load-bearing (solver-service tuning).
export const DEFAULT_SOLVE_MAX_TIME_SECONDS = 120;
export const DEEP_SOLVE_MAX_TIME_SECONDS = 300;

// Backends with real headroom (the user's own machine, or Modal's durable jobs with more CPU) get
// the long budget on every Generate; the small shared Fly box keeps 120 s unless Deep Solve.
// jobsMode: 'durable' (Modal) | 'memory' (Fly) | anything else reads as memory.
export function solverBudgetSeconds({ usingLocal = false, jobsMode = 'memory', deep = false } = {}) {
  if (deep) return DEEP_SOLVE_MAX_TIME_SECONDS;
  if (usingLocal || jobsMode === 'durable') return DEEP_SOLVE_MAX_TIME_SECONDS;
  return DEFAULT_SOLVE_MAX_TIME_SECONDS;
}

// Client-side request timeout: budget plus 60 s of queue/transfer slack.
export function solverTimeoutMs(budgetSeconds) {
  return budgetSeconds * 1000 + 60000;
}

export function backendFor({ usingLocal, jobsMode }) {
  if (usingLocal) return 'local';
  return jobsMode === 'durable' ? 'modal' : 'fly';
}
export function backendLabel(backend) {
  if (backend === 'local') return 'This computer';
  if (backend === 'modal') return 'Cloud (Modal)';
  if (backend === 'fly') return 'Cloud (Fly)';
  return 'Cloud';
}

const sameScore = (a, b) => a && b
  && a.errorCount === b.errorCount
  && a.blockingWarnCount === b.blockingWarnCount
  && Array.isArray(a.qualityVector) && Array.isArray(b.qualityVector)
  && a.qualityVector.length === b.qualityVector.length
  && a.qualityVector.every((x, i) => x === b.qualityVector[i]);

const plainScore = s => s
  ? { errorCount: s.errorCount, blockingWarnCount: s.blockingWarnCount, qualityVector: Array.isArray(s.qualityVector) ? [...s.qualityVector] : [] }
  : null;

// Builds report.engineComparison from pickEngineResult's `engineComparison` ({winner, solver, local},
// winner 'cpsat'|'local') plus run context. Plain JSON only (numbers/strings/arrays) - the report is
// persisted. 'tie' = solver result existed, did not strictly win, and scored identically.
export function buildEngineComparison({ pick, target, backend, budgetSeconds, wallSeconds, solverStatus }) {
  const local = plainScore(pick?.local);
  const solver = plainScore(pick?.solver);
  let winner = 'local';
  if (pick?.winner === 'cpsat') winner = 'solver';
  else if (solver && local && sameScore(solver, local)) winner = 'tie';
  return {
    target,
    backend,
    budgetSeconds: Math.round(budgetSeconds),
    wallSeconds: Math.round(wallSeconds * 10) / 10,
    solverStatus: solverStatus == null ? null : String(solverStatus),
    local,
    solver,
    winner,
  };
}

// Quality-vector slot labels, in the order computeQualityVector emits them: the first three slots
// follow the (normalized) soft-rule priority, the last is fairness + shape.
const RULE_SLOT_LABEL = {
  coverageMin: 'Coverage misses',
  seniorComposition: 'Senior gaps',
  postNightRest: 'Rest compromises',
};
export function qualityVectorLabels(rulePriority) {
  const ids = Array.isArray(rulePriority) ? rulePriority.slice(0, 3) : [];
  const labels = ids.map(id => RULE_SLOT_LABEL[id] || String(id));
  while (labels.length < 3) labels.push('-');
  return [...labels, 'Fairness + shape'];
}
