// Pure helpers for the Optimize progress tracker (student-app parity, owner 2026-11-22: "shows me
// where in the process the solver is"). Reads the solver job's `progress` object
// (solver-service/solver/solve.py ProgressReporter: {stage, stages, elapsed, budget, best,
// stageName?}) and turns it into labelled steps. Must not import ResidentScheduler.jsx.
//
// Stage order is solve.py's `_STAGE_NAMES` (errors, blocking warns, rank, rest-after-coverage,
// quality) plus the outer-LNS polish stage (stage 6, stageName 'outerLns') when it is enabled.
// `stages` is 6 with outer LNS, 5 without, 1 for objectiveMode 'weighted'.

export const OPTIMIZE_STEPS = [
  { key: 'errors', label: 'Hard rules', detail: 'Removing rule breaks (errors)' },
  { key: 'blocking', label: 'Blocking warnings', detail: 'Clearing warnings that block export' },
  { key: 'rank', label: 'Rule priority', detail: 'Trading soft rules in your Soft Rule Priority order' },
  { key: 'rest', label: 'Rest', detail: 'Protecting rest after nights' },
  { key: 'quality', label: 'Fairness & variety', detail: 'Balancing targets, areas, variety and preferences' },
  { key: 'polish', label: 'Polishing', detail: 'Re-solving small pieces of the grid to find better swaps' },
];

// The steps this run actually has. stages 1 = a single weighted solve, shown as one step.
export function stepsFor(stages) {
  const n = Number(stages) || 0;
  if (n === 1) return [{ key: 'single', label: 'Optimizing', detail: 'Single weighted solve' }];
  if (n === 5) return OPTIMIZE_STEPS.slice(0, 5);
  return OPTIMIZE_STEPS;
}

// Folds one poll's progress into the running tracker. `prev` is the previous tracker (or null),
// `now` a ms timestamp. Counts improvements (a lower `best` within the same stage) and remembers
// when the last one happened, so the panel can say "last improvement 12 s ago".
export function trackOptimizeProgress(prev, progress, now) {
  if (!progress || typeof progress !== 'object') return prev || null;
  const stage = Number(progress.stage) || 0;
  const best = typeof progress.best === 'number' && Number.isFinite(progress.best) ? progress.best : null;
  const base = prev && prev.stage === stage
    ? prev
    : { stage, stageStartedAt: now, best: null, improvements: prev?.improvements || 0, lastImprovedAt: prev?.lastImprovedAt ?? null, stageImprovements: 0 };
  let { improvements, lastImprovedAt, stageImprovements } = base;
  if (best != null && (base.best == null || best < base.best)) {
    improvements += 1; stageImprovements += 1; lastImprovedAt = now;
  }
  return {
    ...base,
    best: best != null && (base.best == null || best < base.best) ? best : base.best,
    improvements, lastImprovedAt, stageImprovements,
    stages: Number(progress.stages) || 0,
    elapsed: Number(progress.elapsed) || 0,
    budget: Number(progress.budget) || 0,
  };
}

// Display model for the tracker. `status` = job status ('queued'|'running'|'done'|...).
// Returns { steps: [{key,label,detail,state:'done'|'current'|'pending'}], currentIndex, current,
//   stepText, elapsed, budget, pct, finishedEarly }.
export function describeOptimizeProgress(tracker, status, { elapsedFallback = 0, budgetFallback = 0 } = {}) {
  const steps = stepsFor(tracker?.stages || 6);
  const done = status === 'done';
  const raw = tracker?.stage || 0;
  // finish() sets stage = stages; while running, a stage beyond the list (should not happen) clamps.
  const currentIndex = done ? steps.length : Math.min(Math.max(raw - 1, -1), steps.length - 1);
  const out = steps.map((s, i) => ({ ...s, state: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending' }));
  const elapsed = tracker?.elapsed || elapsedFallback;
  const budget = tracker?.budget || budgetFallback;
  const pct = budget > 0 ? Math.min(100, Math.round((elapsed / budget) * 100)) : 0;
  const current = currentIndex >= 0 && currentIndex < steps.length ? out[currentIndex] : null;
  const stepText = done ? 'Finished'
    : status === 'queued' ? 'Waiting for the machine'
    : current ? `Step ${currentIndex + 1} of ${steps.length}: ${current.label}`
    : 'Starting';
  return { steps: out, currentIndex, current, stepText, elapsed, budget, pct, finishedEarly: done && budget > 0 && elapsed < budget * 0.9 };
}

// "12 s ago" / "2 min ago" / null.
export function agoText(ms, now) {
  if (ms == null) return null;
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s} s ago`;
  return `${Math.floor(s / 60)} min ago`;
}
