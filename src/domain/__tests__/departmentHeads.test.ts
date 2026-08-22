import { describe, expect, it } from 'vitest';
import { deriveDepartmentHeads, groupDepartmentHeads } from '../reports';
import type { Person } from '../people';

const people: Person[] = [
  { id: 'p1', displayName: 'Mara Vogel', kind: 'crew', department: 'Direction', role: 'Director', phone: '+49 170 1' },
  { id: 'p2', displayName: 'Jonas Feld', kind: 'crew', department: 'Camera', role: 'DOP', phone: '+49 170 2' },
  { id: 'p3', displayName: 'Priya Anand', kind: 'crew', department: 'Direction', role: '1st AD', phone: '+49 170 3', productionPhone: '+49 151 3' },
  { id: 'p4', displayName: 'Tom Reilly', kind: 'crew', department: 'Lighting / Electric', role: 'Gaffer' },
  { id: 'p5', displayName: 'Nadia Roux', kind: 'crew', department: 'Lighting / Electric', role: 'Gaffer' },
  { id: 'p6', displayName: 'Sam Doe', kind: 'crew', department: 'Camera', role: 'Clapper Loader' },
  { id: 'p7', displayName: 'Cleo Park', kind: 'cast', role: 'Lead' },
];

describe('deriveDepartmentHeads', () => {
  const heads = deriveDepartmentHeads(people);

  it('lists heads in canonical role order, not people order', () => {
    expect(heads.map((h) => h.roleLabel)).toEqual([
      'Director',
      'Director of Photography',
      '1st Assistant Director',
      'Gaffer',
    ]);
  });

  it('resolves a role through its aliases, so an imported "DOP" still finds its head', () => {
    expect(heads.find((h) => h.roleLabel === 'Director of Photography')?.displayName).toBe('Jonas Feld');
  });

  /**
   * A line reading "Key Grip — —" says the production has no key grip. It
   * almost never means that; it means nobody has typed the title yet, and
   * printing it as fact is worse than leaving it out (rule 13).
   */
  it('omits roles nobody holds rather than printing them empty', () => {
    expect(heads.some((h) => h.roleLabel === 'Key Grip')).toBe(false);
    expect(heads.some((h) => h.roleLabel === 'Producer')).toBe(false);
  });

  it('prints the production number when there is one', () => {
    expect(heads.find((h) => h.roleLabel === '1st Assistant Director')?.phone).toBe('+49 151 3');
  });

  it('omits a phone entirely rather than emitting an empty string', () => {
    const gaffer = heads.find((h) => h.roleLabel === 'Gaffer');
    expect(gaffer?.displayName).toBe('Tom Reilly');
    expect(gaffer).not.toHaveProperty('phone');
  });

  it('flags a shared title instead of silently dropping the second holder', () => {
    expect(heads.find((h) => h.roleLabel === 'Gaffer')?.shared).toBe(true);
    expect(heads.find((h) => h.roleLabel === 'Director')?.shared).toBeUndefined();
  });

  it('ignores crew who hold no key role, and cast entirely', () => {
    expect(heads.some((h) => h.displayName === 'Sam Doe')).toBe(false);
    expect(heads.some((h) => h.displayName === 'Cleo Park')).toBe(false);
  });

  it('returns nothing for a production with no crew list yet', () => {
    expect(deriveDepartmentHeads([])).toEqual([]);
  });
});

describe('groupDepartmentHeads', () => {
  it('groups by department, in the order each department first appears', () => {
    const groups = groupDepartmentHeads(deriveDepartmentHeads(people));
    expect(groups.map((g) => g.department)).toEqual(['Direction', 'Camera', 'Lighting / Electric']);
    expect(groups[0].heads.map((h) => h.roleLabel)).toEqual(['Director', '1st Assistant Director']);
  });
});
