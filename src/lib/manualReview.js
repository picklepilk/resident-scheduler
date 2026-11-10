// Residents whose rotation needs a per-block hand check (chief: "case by case — follow the app's
// rules, but this is a nuance that needs manual editing per block"). EM Home PGY-2 EM/EMS and
// EM/TOX only. Pure; takes the block-composed resident (blockType already resolved for the block).
const MANUAL_REVIEW_BLOCK_TYPES = ['EM_EMS', 'EM_TOX'];

export function needsManualReview(resident) {
  return !!resident && MANUAL_REVIEW_BLOCK_TYPES.includes(resident.blockType);
}

export function manualReviewLabel(resident) {
  return resident?.blockType === 'EM_TOX' ? 'EM/TOX' : 'EM/EMS';
}

export const manualReviewTooltip = (resident) =>
  `${manualReviewLabel(resident)} — check this resident's shifts by hand each block`;
