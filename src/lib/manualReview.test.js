import { describe, it, expect } from 'vitest';
import { needsManualReview, manualReviewTooltip } from './manualReview.js';

describe('needsManualReview', () => {
  it('flags EM_EMS and EM_TOX only', () => {
    expect(needsManualReview({ blockType: 'EM_EMS' })).toBe(true);
    expect(needsManualReview({ blockType: 'EM_TOX' })).toBe(true);
    for (const bt of ['EM', 'ADMIN', 'ORTHO_VAC', undefined]) expect(needsManualReview({ blockType: bt })).toBe(false);
    expect(needsManualReview(null)).toBe(false);
  });
  it('tooltip names the rotation', () => {
    expect(manualReviewTooltip({ blockType: 'EM_TOX' })).toMatch(/^EM\/TOX/);
    expect(manualReviewTooltip({ blockType: 'EM_EMS' })).toMatch(/^EM\/EMS/);
  });
});
