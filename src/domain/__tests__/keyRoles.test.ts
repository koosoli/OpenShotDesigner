import { describe, expect, it } from 'vitest';
import type { Person } from '../people';
import {
  KEY_CREW_ROLES,
  assignKeyCrew,
  keyCrewDisplayName,
  keyCrewMember,
  keyCrewMembers,
  projectHeadFieldsFor,
} from '../people';

const person = (id: string, displayName: string, role?: string): Person => ({
  id,
  displayName,
  kind: 'crew',
  ...(role ? { role } : {}),
});

describe('key crew roles', () => {
  it('every role key is unique and every department is a real one', () => {
    const keys = KEY_CREW_ROLES.map((role) => role.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolves a head by their exact role title', () => {
    const people = [person('p1', 'Jane Doe', 'Director'), person('p2', 'John Smith')];
    expect(keyCrewMember(people, 'director')?.id).toBe('p1');
  });

  it('resolves aliases such as DP / DOP case-insensitively', () => {
    expect(keyCrewMember([person('p1', 'Ada', 'dp')], 'cinematographer')?.displayName).toBe('Ada');
    expect(keyCrewMember([person('p1', 'Ada', 'DOP')], 'cinematographer')?.displayName).toBe('Ada');
    expect(keyCrewMember([person('p1', 'Ada', ' Director of Photography ')], 'cinematographer')?.id).toBe('p1');
  });

  it('does not match an unrelated role', () => {
    expect(keyCrewMember([person('p1', 'Ada', 'Gaffer')], 'director')).toBeUndefined();
    expect(keyCrewMember([person('p1', 'Ada')], 'director')).toBeUndefined();
  });

  it('assigning a role vacates the previous holder but keeps them on the list', () => {
    const before = [person('p1', 'Jane', 'Director'), person('p2', 'Sam')];
    const after = assignKeyCrew(before, 'director', 'p2');
    expect(after).toHaveLength(2);
    expect(after.find((p) => p.id === 'p1')?.role).toBeUndefined();
    expect(after.find((p) => p.id === 'p2')?.role).toBe('Director');
    expect(after.find((p) => p.id === 'p2')?.department).toBe('Direction');
  });

  it('assigning does not overwrite a department the person already has', () => {
    const after = assignKeyCrew([{ ...person('p1', 'Jane'), department: 'Production' }], 'director', 'p1');
    expect(after[0].department).toBe('Production');
  });

  it('assigning an unknown person id simply vacates the role', () => {
    const after = assignKeyCrew([person('p1', 'Jane', 'Director')], 'director', '');
    expect(after[0].role).toBeUndefined();
    expect(keyCrewMember(after, 'director')).toBeUndefined();
  });

  it('lists co-heads but reports the first for single-name paperwork', () => {
    const people = [person('p1', 'A', 'Director'), person('p2', 'B', 'Director')];
    expect(keyCrewMembers(people, 'director')).toHaveLength(2);
    expect(keyCrewMember(people, 'director')?.id).toBe('p1');
  });

  it('mirrors only the roles that are actually filled into the legacy fields', () => {
    expect(projectHeadFieldsFor([person('p1', 'Jane', 'Director')])).toEqual({ director: 'Jane' });
    expect(projectHeadFieldsFor([])).toEqual({});
  });

  it('falls back to the legacy free-text name when nobody holds the role', () => {
    expect(keyCrewDisplayName([], 'director', { director: 'Legacy Name' })).toBe('Legacy Name');
    expect(keyCrewDisplayName([person('p1', 'Jane', 'Director')], 'director', { director: 'Legacy Name' })).toBe('Jane');
    expect(keyCrewDisplayName([], 'gaffer')).toBeUndefined();
    expect(keyCrewDisplayName([], 'director', { director: '   ' })).toBeUndefined();
  });
});
