import { describe, it, expect } from 'vitest';
import {
  assignCast,
  castPersonForCharacter,
  filterPeople,
  groupPeopleByDepartment,
  parsePeopleCsv,
  peopleToCsv,
  personInitials,
  removePerson,
  unassignCast,
  upsertPerson,
} from '../people';
import type { CastAssignment, Person } from '../people';

const people: Person[] = [
  { id: 'p1', displayName: 'Ava Stone', kind: 'crew', department: 'Camera', role: 'DP', phone: '+1 555 0100', email: 'ava@example.com' },
  { id: 'p2', displayName: 'Ben Ortiz', kind: 'crew', department: 'Lighting / Electric', role: 'Gaffer' },
  { id: 'p3', displayName: 'Cleo Park', kind: 'cast', role: 'Lead', notes: 'Needs 7am pickup, "north gate"' },
  { id: 'p4', displayName: 'Dan Li', kind: 'crew', department: 'Camera', role: '1st AC' },
  { id: 'p5', displayName: 'Eve', kind: 'contact', company: 'Rentals Inc' },
];

describe('upsertPerson / removePerson', () => {
  it('appends unknown people and replaces known ones, trimming the name', () => {
    const added = upsertPerson(people, { id: 'p6', displayName: '  Finn  ' });
    expect(added).toHaveLength(6);
    expect(added[5].displayName).toBe('Finn');
    const replaced = upsertPerson(added, { id: 'p1', displayName: 'Ava S.' });
    expect(replaced).toHaveLength(6);
    expect(replaced[0].displayName).toBe('Ava S.');
    expect(upsertPerson([], { id: 'x', displayName: '   ' })[0].displayName).toBe('Unnamed');
  });

  it('removes a person together with cast assignments and location contact references', () => {
    const refs = {
      people,
      castAssignments: [{ id: 'c1', characterId: 'ch1', personId: 'p3' }] as CastAssignment[],
      locations: [{ contactIds: ['p3', 'p5'] }, { contactIds: ['p1'] }, {}],
    };
    const next = removePerson(refs, 'p3');
    expect(next.people.map((p) => p.id)).not.toContain('p3');
    expect(next.castAssignments).toEqual([]);
    expect(next.locations[0].contactIds).toEqual(['p5']);
    expect(next.locations[1]).toBe(refs.locations[1]);
  });
});

describe('cast assignment', () => {
  it('keeps one performer per character and resolves the person', () => {
    let assignments = assignCast([], 'ch1', 'p3');
    assignments = assignCast(assignments, 'ch1', 'p4', 'recast');
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ characterId: 'ch1', personId: 'p4', notes: 'recast' });
    expect(castPersonForCharacter(assignments, people, 'ch1')?.displayName).toBe('Dan Li');
    expect(unassignCast(assignments, 'ch1')).toEqual([]);
    expect(castPersonForCharacter([], people, 'ch1')).toBeUndefined();
  });
});

describe('filterPeople / groupPeopleByDepartment', () => {
  it('filters by kind, department and free text across fields', () => {
    expect(filterPeople(people, { kind: 'crew' })).toHaveLength(3);
    expect(filterPeople(people, { department: 'camera' }).map((p) => p.id)).toEqual(['p1', 'p4']);
    expect(filterPeople(people, { query: 'rentals' }).map((p) => p.id)).toEqual(['p5']);
    expect(filterPeople(people, { query: 'ava dp' }).map((p) => p.id)).toEqual(['p1']);
    expect(filterPeople(people, { query: 'nobody' })).toEqual([]);
  });

  it('groups in department preset order with unassigned last', () => {
    const groups = groupPeopleByDepartment(people);
    expect(groups.map((g) => g.department)).toEqual(['Camera', 'Lighting / Electric', 'Unassigned']);
    expect(groups[0].people.map((p) => p.displayName)).toEqual(['Dan Li', 'Ava Stone']);
  });

  it('computes initials', () => {
    expect(personInitials({ displayName: 'Ava Stone' })).toBe('AS');
    expect(personInitials({ displayName: 'Eve' })).toBe('E');
    expect(personInitials({ displayName: '' })).toBe('?');
  });
});

describe('CSV round-trip', () => {
  it('exports every person and re-imports them with fresh ids', () => {
    const csv = peopleToCsv(people);
    expect(csv.split('\n')[0]).toBe(
      'Name,Type,Department,Role,Phone,Email,Company,Address,Rate,Emergency contact,Hotel,Hotel address,Check-in,Check-out,Notes',
    );
    expect(csv).toContain('"Needs 7am pickup, ""north gate"""');
    const imported = parsePeopleCsv(csv);
    expect(imported).toHaveLength(people.length);
    const cleo = imported.find((p) => p.displayName === 'Cleo Park');
    expect(cleo).toMatchObject({ kind: 'cast', role: 'Lead', notes: 'Needs 7am pickup, "north gate"' });
    expect(cleo?.id).not.toBe('p3');
    expect(new Set(imported.map((p) => p.id)).size).toBe(imported.length);
  });

  it('accepts spreadsheet-style headers and skips nameless rows', () => {
    const csv = 'Full Name,Dept,Position,Mobile,E-mail\r\nGus Reed,Sound,Mixer,0123,gus@x.io\r\n,Sound,Boom,,\r\n';
    const imported = parsePeopleCsv(csv);
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ displayName: 'Gus Reed', department: 'Sound', role: 'Mixer', phone: '0123', email: 'gus@x.io' });
    expect(parsePeopleCsv('Name\n')).toEqual([]);
  });
});
