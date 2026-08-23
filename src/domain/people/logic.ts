/**
 * Contacts / crew-list logic (plan §4.5).
 *
 * Pure operations over the project's people and cast assignments: CRUD,
 * cast ↔ character linking, search/grouping for the contacts panel, and a
 * CSV round-trip for exchanging lists with spreadsheets. No React, no I/O.
 */

import { createId } from '../ids';
import type { CastAssignment, Person, PersonKind } from './types';

export const PERSON_KINDS: PersonKind[] = ['crew', 'cast', 'talent', 'contact', 'client', 'artist', 'other'];

export const PERSON_KIND_LABELS: Record<PersonKind, string> = {
  crew: 'Crew',
  cast: 'Cast',
  talent: 'Talent',
  contact: 'Contact',
  client: 'Client',
  artist: 'Artist',
  other: 'Other',
};

/** Common departments offered as suggestions; free text is always allowed. */
export const PRODUCTION_DEPARTMENTS = [
  'Production',
  'Direction',
  'Camera',
  'Lighting / Electric',
  'Grip',
  'Sound',
  'Art',
  'Costume',
  'Hair & Makeup',
  'Locations',
  'Transport',
  'Stunts',
  'VFX',
  'Post',
  'Cast',
  'Other',
];

const normalize = (value: string | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

export const personInitials = (person: Pick<Person, 'displayName'>): string =>
  normalize(person.displayName)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

/** Insert or replace by id; unknown ids append. Display name is trimmed and never empty. */
export const upsertPerson = (people: readonly Person[], person: Person): Person[] => {
  const cleaned: Person = { ...person, displayName: normalize(person.displayName) || 'Unnamed' };
  const index = people.findIndex((candidate) => candidate.id === person.id);
  if (index === -1) return [...people, cleaned];
  return people.map((candidate, i) => (i === index ? cleaned : candidate));
};

export interface PeopleReferences {
  people: Person[];
  castAssignments: CastAssignment[];
  /** Locations keep contact ids; removed people must drop out of them too. */
  locations: Array<{ contactIds?: string[] }>;
  /** Task assignees reference people by id. Optional: not every caller has tasks. */
  tasks?: Array<{ assigneeIds?: string[] }>;
  /** Call-sheet pick-ups name the person collected. Optional for the same reason. */
  productionDays?: Array<{ callSheet?: { pickups?: Array<{ personId: string }> } }>;
}

/**
 * Remove a person and every reference to them (referential integrity on
 * delete). Anything that points at a person by id has to be listed here — a
 * dangling assignee silently disappears from a task card, and a dangling
 * pick-up prints as "contact removed" on a call sheet, which is honest but is
 * not something anyone asked to keep.
 */
export const removePerson = <R extends PeopleReferences>(refs: R, personId: string): R => ({
  ...refs,
  people: refs.people.filter((person) => person.id !== personId),
  castAssignments: refs.castAssignments.filter((assignment) => assignment.personId !== personId),
  locations: refs.locations.map((location) =>
    location.contactIds?.includes(personId)
      ? { ...location, contactIds: location.contactIds.filter((id) => id !== personId) }
      : location,
  ),
  ...(refs.tasks
    ? {
        tasks: refs.tasks.map((task) =>
          task.assigneeIds?.includes(personId)
            ? { ...task, assigneeIds: task.assigneeIds.filter((id) => id !== personId) }
            : task,
        ),
      }
    : {}),
  ...(refs.productionDays
    ? {
        productionDays: refs.productionDays.map((day) =>
          day.callSheet?.pickups?.some((pickup) => pickup.personId === personId)
            ? {
                ...day,
                callSheet: {
                  ...day.callSheet,
                  pickups: day.callSheet.pickups.filter((pickup) => pickup.personId !== personId),
                },
              }
            : day,
        ),
      }
    : {}),
});

/** One performer per character: assigning replaces any previous assignment for that character. */
export const assignCast = (
  assignments: readonly CastAssignment[],
  characterId: string,
  personId: string,
  notes?: string,
): CastAssignment[] => {
  const remaining = assignments.filter((assignment) => assignment.characterId !== characterId);
  const next: CastAssignment = { id: createId('cast'), characterId, personId };
  if (notes) next.notes = notes;
  return [...remaining, next];
};

export const unassignCast = (assignments: readonly CastAssignment[], characterId: string): CastAssignment[] =>
  assignments.filter((assignment) => assignment.characterId !== characterId);

export const castPersonForCharacter = (
  assignments: readonly CastAssignment[],
  people: readonly Person[],
  characterId: string,
): Person | undefined => {
  const assignment = assignments.find((candidate) => candidate.characterId === characterId);
  return assignment ? people.find((person) => person.id === assignment.personId) : undefined;
};

export interface PeopleFilter {
  query?: string;
  kind?: PersonKind | 'all';
  department?: string | 'all';
}

export const filterPeople = (people: readonly Person[], filter: PeopleFilter = {}): Person[] => {
  const query = normalize(filter.query).toLowerCase();
  const kind = filter.kind && filter.kind !== 'all' ? filter.kind : undefined;
  const department = filter.department && filter.department !== 'all' ? filter.department.toLowerCase() : undefined;
  return people.filter((person) => {
    if (kind && (person.kind ?? 'other') !== kind) return false;
    if (department && normalize(person.department).toLowerCase() !== department) return false;
    if (!query) return true;
    const haystack = [person.displayName, person.role, person.department, person.company, person.email, person.phone, person.productionPhone, person.notes]
      .map((value) => normalize(value).toLowerCase())
      .join(' ');
    return query.split(' ').every((term) => haystack.includes(term));
  });
};

export const sortPeople = (people: readonly Person[]): Person[] =>
  [...people].sort(
    (a, b) =>
      normalize(a.department).localeCompare(normalize(b.department)) ||
      normalize(a.role).localeCompare(normalize(b.role)) ||
      normalize(a.displayName).localeCompare(normalize(b.displayName)),
  );

export interface DepartmentGroup {
  department: string;
  people: Person[];
}

/** Stable department groups in preset order, unknown departments alphabetically after, "Unassigned" last. */
export const groupPeopleByDepartment = (people: readonly Person[]): DepartmentGroup[] => {
  const buckets = new Map<string, Person[]>();
  for (const person of sortPeople(people)) {
    const key = normalize(person.department) || 'Unassigned';
    const bucket = buckets.get(key) ?? [];
    bucket.push(person);
    buckets.set(key, bucket);
  }
  const rank = (name: string): number => {
    if (name === 'Unassigned') return Number.MAX_SAFE_INTEGER;
    const index = PRODUCTION_DEPARTMENTS.findIndex((preset) => preset.toLowerCase() === name.toLowerCase());
    return index === -1 ? PRODUCTION_DEPARTMENTS.length : index;
  };
  return [...buckets.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([department, members]) => ({ department, people: members }));
};

// ---------------------------------------------------------------------------
// CSV round-trip
// ---------------------------------------------------------------------------

const CSV_COLUMNS: Array<PersonTextField> = [
  'displayName',
  'kind',
  'department',
  'role',
  'phone',
  'productionPhone',
  'email',
  'company',
  'address',
  'rate',
  'emergencyContact',
  'hotelName',
  'hotelAddress',
  'hotelCheckIn',
  'hotelCheckOut',
  'notes',
];

/**
 * Fields a CSV can carry: the ones whose value is a string.
 *
 * `Record<keyof Person, string>` was fine while every field was text. It stopped
 * being true when framing arrived as an object, and the map is the right place
 * to say so — a spreadsheet column holds text, and a crop rectangle is not text.
 */
type PersonTextField = {
  [K in keyof Person]-?: NonNullable<Person[K]> extends string ? K : never;
}[keyof Person];

const CSV_HEADERS: Record<PersonTextField, string> = {
  id: 'Id',
  displayName: 'Name',
  kind: 'Type',
  department: 'Department',
  role: 'Role',
  phone: 'Phone',
  productionPhone: 'Production phone',
  email: 'Email',
  company: 'Company',
  address: 'Address',
  rate: 'Rate',
  emergencyContact: 'Emergency contact',
  hotelName: 'Hotel',
  hotelAddress: 'Hotel address',
  hotelCheckIn: 'Check-in',
  hotelCheckOut: 'Check-out',
  notes: 'Notes',
  headshotAssetId: 'Headshot asset',
};

const csvEscape = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const peopleToCsv = (people: readonly Person[]): string => {
  const header = CSV_COLUMNS.map((column) => CSV_HEADERS[column]).join(',');
  const rows = sortPeople(people).map((person) =>
    CSV_COLUMNS.map((column) => csvEscape(String(person[column] ?? ''))).join(','),
  );
  return [header, ...rows].join('\n') + '\n';
};

const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
};

const KIND_LOOKUP = new Map<string, PersonKind>(
  PERSON_KINDS.flatMap((kind) => [[kind, kind], [PERSON_KIND_LABELS[kind].toLowerCase(), kind]] as Array<[string, PersonKind]>),
);

/**
 * Parse a contact CSV (our export or a spreadsheet with a header row).
 * Header names are matched case-insensitively against the export headers or
 * the field names; unknown columns are ignored; rows without a name are
 * skipped. Every imported person gets a fresh id.
 */
export const parsePeopleCsv = (text: string): Person[] => {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const columnFor = (cell: string): PersonTextField | undefined => {
    for (const column of CSV_COLUMNS) {
      if (cell === column.toLowerCase() || cell === CSV_HEADERS[column].toLowerCase()) return column;
    }
    if (cell === 'name' || cell === 'full name') return 'displayName';
    if (cell === 'dept') return 'department';
    if (cell === 'position' || cell === 'title') return 'role';
    if (cell === 'mobile' || cell === 'cell' || cell === 'telephone') return 'phone';
    if (cell === 'prod phone' || cell === 'production mobile' || cell === 'unit phone') {
      return 'productionPhone';
    }
    if (cell === 'e-mail' || cell === 'mail') return 'email';
    return undefined;
  };
  const mapping = header.map(columnFor);
  const out: Person[] = [];
  for (const cells of rows.slice(1)) {
    const person: Person = { id: createId('person'), displayName: '' };
    cells.forEach((cell, index) => {
      const column = mapping[index];
      const value = cell.trim();
      if (!column || !value) return;
      if (column === 'kind') {
        const kind = KIND_LOOKUP.get(value.toLowerCase());
        if (kind) person.kind = kind;
        return;
      }
      if (column === 'id') return;
      person[column] = value;
    });
    if (!normalize(person.displayName)) continue;
    out.push(person);
  }
  return out;
};

/**
 * The number to print on a call sheet for this person.
 *
 * A production-issued number wins over the person's own: it is the line the
 * unit is meant to use today, and printing an agency number instead sends the
 * 2nd AD somewhere that cannot help at 05:00. Falling back rather than copying
 * keeps the two fields independent — clearing the production number restores
 * the personal one instead of leaving a stale duplicate behind.
 */
export const callSheetPhone = (
  person: Pick<Person, 'phone' | 'productionPhone'>,
): string | undefined => {
  const production = person.productionPhone?.trim();
  if (production) return production;
  const personal = person.phone?.trim();
  return personal || undefined;
};

/** True when the number on the call sheet is one the production issued. */
export const usesProductionPhone = (
  person: Pick<Person, 'phone' | 'productionPhone'>,
): boolean => !!person.productionPhone?.trim();
