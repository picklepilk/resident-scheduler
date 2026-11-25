import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OptimizeScopeControls, { toggleResident, setScopeDate, setAllResidents, filterResidents, EMPTY_SCOPE_SELECTION } from '../components/OptimizeScopeControls.jsx';

const residents = [{ id: 'r1', label: 'Resident One', group: 'PGY-1' }, { id: 'r2', label: 'Resident Two', group: 'PGY-2' }];
const block = { startDate: '2026-11-02', endDate: '2026-11-29' };

describe('OptimizeScopeControls', () => {
  it('renders disclosure, date limits and grouped residents', () => {
    const html = renderToStaticMarkup(createElement(OptimizeScopeControls, { value: EMPTY_SCOPE_SELECTION, block, residents, onChange() {} }));
    expect(html).toContain('Only part of the block');
    expect(html).toContain('min="2026-11-02"');
    expect(html).toContain('max="2026-11-29"');
    expect(html).toContain('Resident One');
    expect(html).toContain('PGY-2');
    expect(html).not.toContain('(selected)');
  });
  it('shows checked residents and the selected marker', () => {
    const html = renderToStaticMarkup(createElement(OptimizeScopeControls, { value: { from: '', to: '', residentIds: ['r2'] }, block, residents }));
    expect(html).toContain('(selected)');
    expect(html).toContain('checked');
  });
  it('toggling a resident yields the expected value', () => {
    const a = toggleResident(EMPTY_SCOPE_SELECTION, 'r1');
    expect(a.residentIds).toEqual(['r1']);
    expect(toggleResident(a, 'r1').residentIds).toEqual([]);
  });
  it('changing dates keeps residents; All and None work', () => {
    const v = { from: '', to: '', residentIds: ['r1'] };
    expect(setScopeDate(v, 'from', '2026-11-03')).toEqual({ from: '2026-11-03', to: '', residentIds: ['r1'] });
    expect(setAllResidents(v, residents, true).residentIds).toEqual(['r1', 'r2']);
    expect(setAllResidents(v, residents, false).residentIds).toEqual([]);
  });
  it('filters by label', () => {
    expect(filterResidents(residents, 'two').map(r => r.id)).toEqual(['r2']);
    expect(filterResidents(residents, '')).toHaveLength(2);
  });
});
