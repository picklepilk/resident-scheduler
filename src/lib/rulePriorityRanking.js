// Does the chief's Soft Rule Priority rank minimum coverage above the 24h post-night rest
// preference? When it does, best-of-N ranking (scoreGenerationResult's blockingWarnCount) and the
// solver's staged objective must treat a postNightRest warning as cheaper than an open coverage
// slot — mirroring fillDayPass, which already uses a rest-violating candidate instead of leaving a
// hole under that order. The export gate is separate and unaffected: every postNightRest warning
// still needs the chief's acknowledgement before export.
//
// Takes the persisted rulePriority array. Callers must pass a list already run through
// normalizeRulePriority (this file is lib/ and cannot import that helper from the big file); on a
// normalized list both ids are always present. Raw untrusted shape is tolerated but NOT
// normalized here: a non-array or a list missing either id answers true (coverage first), which
// differs from what normalizing a partial list would give (the solver's objective.py applies the
// normalizing semantics itself).
export function restRankedBelowCoverage(rulePriority) {
  if (!Array.isArray(rulePriority)) return true;
  const cov = rulePriority.indexOf('coverageMin');
  const rest = rulePriority.indexOf('postNightRest');
  if (cov < 0 || rest < 0) return true;
  return cov < rest;
}
