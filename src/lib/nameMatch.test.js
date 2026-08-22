import { describe, it, expect } from 'vitest';
import { stripNameSuffix, nameTokenSet, tokensIntersect, matchRosterByName } from './nameMatch.js';

// Roster shaped the way emRoster entries are (only the two name fields matter here).
const ROSTER = [
  { id: 'r1', firstName: 'Marcus',  lastName: 'Alvarez' },
  { id: 'r2', firstName: 'Niva',     lastName: 'Bright' },
  { id: 'r3', firstName: 'Jordan',   lastName: 'Alvarez' },
  { id: 'r4', firstName: 'Kathryn',  lastName: 'Okonkwo' },
];

describe('stripNameSuffix', () => {
  it('drops a trailing parenthetical qualifier', () => {
    expect(stripNameSuffix('Alvarez, Marcus (ECFMG)')).toBe('Alvarez, Marcus');
    expect(stripNameSuffix('  Okonkwo, Kathryn (PGY-2)  ')).toBe('Okonkwo, Kathryn');
  });

  it('leaves a name with no qualifier untouched', () => {
    expect(stripNameSuffix('Alvarez, Marcus')).toBe('Alvarez, Marcus');
  });

  // Anchored to the end on purpose: a mid-string parenthetical is part of the name, not a
  // qualifier, and stripping it would corrupt the token set the matcher runs on.
  it('does not strip a parenthetical that is not at the end', () => {
    expect(stripNameSuffix('Alvarez (nee Ruiz), Marcus')).toBe('Alvarez (nee Ruiz), Marcus');
  });

  it('tolerates null/undefined', () => {
    expect(stripNameSuffix(null)).toBe('');
    expect(stripNameSuffix(undefined)).toBe('');
  });
});

describe('nameTokenSet / tokensIntersect', () => {
  it('splits on whitespace and normalizes', () => {
    expect([...nameTokenSet('Marcus  Elliot')]).toEqual(['marcus', 'elliot']);
  });

  it('drops empties rather than producing a blank token', () => {
    expect(nameTokenSet('   ').size).toBe(0);
    expect(nameTokenSet('').size).toBe(0);
  });

  // Two empty sets must NOT count as intersecting — otherwise a resident with a blank lastName
  // would match every imported name.
  it('empty sets never intersect', () => {
    expect(tokensIntersect(nameTokenSet(''), nameTokenSet(''))).toBe(false);
    expect(tokensIntersect(nameTokenSet('alvarez'), nameTokenSet(''))).toBe(false);
  });
});

describe('matchRosterByName', () => {
  it('matches an exact name', () => {
    expect(matchRosterByName('Marcus', 'Alvarez', ROSTER).map(r => r.id)).toEqual(['r1']);
  });

  it('matches through an extra middle name in the imported first name', () => {
    expect(matchRosterByName('Marcus Elliot', 'Alvarez', ROSTER).map(r => r.id)).toEqual(['r1']);
  });

  it('matches through an extra last-name token in the imported last name', () => {
    expect(matchRosterByName('Niva', 'Okonkwo Bright', ROSTER).map(r => r.id)).toEqual(['r2']);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(matchRosterByName('  marcus ', ' ALVAREZ ', ROSTER).map(r => r.id)).toEqual(['r1']);
  });

  // The contract callers depend on: ambiguity is REPORTED, never resolved by picking one. An
  // importer that silently took [0] here would write one resident's dates onto their namesake.
  it('returns every candidate when a last name is shared but first names differ', () => {
    expect(matchRosterByName('Marcus', 'Alvarez', ROSTER).length).toBe(1);
    expect(matchRosterByName('A', 'Alvarez', ROSTER).length).toBe(0);
  });

  it('requires BOTH names to intersect — last name alone is not enough', () => {
    expect(matchRosterByName('Someone', 'Alvarez', ROSTER)).toEqual([]);
  });

  it('returns [] for an unknown name and tolerates a missing roster', () => {
    expect(matchRosterByName('Nobody', 'Here', ROSTER)).toEqual([]);
    expect(matchRosterByName('Marcus', 'Alvarez', undefined)).toEqual([]);
  });
});
