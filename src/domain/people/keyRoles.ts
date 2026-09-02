/**
 * Key crew roles (plan §4.5).
 *
 * A production has a handful of named heads — director, DP, producer, 1st AD —
 * that paperwork refers to by role rather than by name. Those heads are NOT a
 * separate persisted table: the single source of truth (plan rule 37) is the
 * `Person.role` field on the people list, so the crew page, the call sheet and
 * the scene inspector all read the same record instead of keeping copies.
 * A person may hold several jobs; role titles are stored in that existing
 * field separated by `/` (CSV imports using commas, semicolons or pipes are
 * understood as well). This keeps old project files fully compatible.
 *
 * Two legacy string fields (`Project.director`, `Project.cinematographer`)
 * predate the people domain and are still what exports render. They are kept
 * in sync by {@link projectHeadFieldsFor}; neither side is authoritative on its
 * own, and an unmatched free-text name stays valid (a production may name a
 * director before anyone builds a crew list — plan rule 13: unknown stays
 * unknown, never fabricated).
 */

import type { Person } from './types';

export interface KeyCrewRole {
  /** Stable key used by UI state; never persisted on its own. */
  key: string;
  /** Canonical role title written to the `Person.role` title list. */
  label: string;
  /** Department the head belongs to (matches PRODUCTION_DEPARTMENTS). */
  department: string;
  /**
   * Legacy `Project` string field mirrored for this role, when one exists.
   * Only director and cinematographer have one.
   */
  projectField?: 'director' | 'cinematographer';
  /**
   * Lowercase alternative titles that should resolve to this role, so an
   * imported CSV that says "DOP" or "First AD" still finds its head.
   */
  aliases?: string[];
}

export const KEY_CREW_ROLES: KeyCrewRole[] = [
  {
    key: 'director',
    label: 'Director',
    department: 'Direction',
    projectField: 'director',
    aliases: ['dir', 'film director'],
  },
  {
    key: 'cinematographer',
    label: 'Director of Photography',
    department: 'Camera',
    projectField: 'cinematographer',
    aliases: ['dp', 'dop', 'd.p.', 'cinematographer', 'director of photography', 'lighting cameraman'],
  },
  { key: 'producer', label: 'Producer', department: 'Production', aliases: ['prod'] },
  {
    key: 'line_producer',
    label: 'Line Producer',
    department: 'Production',
    aliases: ['production manager', 'upm', 'unit production manager'],
  },
  { key: 'first_ad', label: '1st Assistant Director', department: 'Direction', aliases: ['1st ad', 'first ad', 'ad'] },
  { key: 'second_ad', label: '2nd Assistant Director', department: 'Direction', aliases: ['2nd ad', 'second ad'] },
  {
    key: 'production_designer',
    label: 'Production Designer',
    department: 'Art',
    aliases: ['designer', 'art director'],
  },
  { key: 'gaffer', label: 'Gaffer', department: 'Lighting / Electric', aliases: ['chief lighting technician', 'clt'] },
  { key: 'key_grip', label: 'Key Grip', department: 'Grip', aliases: ['grip'] },
  {
    key: 'sound_mixer',
    label: 'Production Sound Mixer',
    department: 'Sound',
    aliases: ['sound mixer', 'sound recordist', 'mixer'],
  },
  {
    key: 'script_supervisor',
    label: 'Script Supervisor',
    department: 'Direction',
    aliases: ['continuity', 'scripty'],
  },
  { key: 'first_ac', label: '1st Assistant Camera', department: 'Camera', aliases: ['1st ac', 'focus puller'] },
  { key: 'editor', label: 'Editor', department: 'Post', aliases: ['picture editor'] },
];

const normalise = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

/** Individual job titles from the backwards-compatible free-text role field. */
export const personRoleTitles = (person: Pick<Person, 'role'>): string[] =>
  (person.role ?? '')
    .split(/\s*[,;|/]\s*/)
    .map((title) => title.trim())
    .filter(Boolean);

const titleMatchesRole = (title: string, role: KeyCrewRole): boolean => {
  const stored = normalise(title);
  if (stored === normalise(role.label)) return true;
  return (role.aliases ?? []).some((alias) => stored === normalise(alias));
};

const withoutRole = (person: Pick<Person, 'role'>, role: KeyCrewRole): string[] =>
  personRoleTitles(person).filter((title) => !titleMatchesRole(title, role));

export const keyCrewRoleByKey = (key: string): KeyCrewRole | undefined =>
  KEY_CREW_ROLES.find((role) => role.key === key);

/** True when a person's stored role title resolves to the given key role. */
export const personHoldsRole = (person: Pick<Person, 'role'>, role: KeyCrewRole): boolean => {
  return personRoleTitles(person).some((title) => titleMatchesRole(title, role));
};

/**
 * The person currently holding a key role, or undefined when nobody does.
 * When several people carry the same title (co-directors) the first in list
 * order wins for the single-name paperwork fields; the crew list still shows
 * all of them.
 */
export const keyCrewMember = (
  people: readonly Person[],
  roleKey: string,
): Person | undefined => {
  const role = keyCrewRoleByKey(roleKey);
  if (!role) return undefined;
  return people.find((person) => personHoldsRole(person, role));
};

/** Every person holding a key role, in list order. */
export const keyCrewMembers = (people: readonly Person[], roleKey: string): Person[] => {
  const role = keyCrewRoleByKey(roleKey);
  if (!role) return [];
  return people.filter((person) => personHoldsRole(person, role));
};

/**
 * Assign a key role to one person, clearing only that title from anyone else
 * who held it. Other jobs on both people are retained. Passing an empty id
 * vacates the role. Returns a new people array; unrelated fields are untouched.
 */
export const assignKeyCrew = (
  people: readonly Person[],
  roleKey: string,
  personId: string,
): Person[] => {
  const role = keyCrewRoleByKey(roleKey);
  if (!role) return [...people];
  return people.map((person) => {
    if (person.id === personId) {
      const roles = [...withoutRole(person, role), role.label];
      return {
        ...person,
        kind: person.kind ?? 'crew',
        role: roles.join(' / '),
        department: person.department ?? role.department,
      };
    }
    if (personHoldsRole(person, role)) {
      // Vacate this job, not the person's other jobs or primary department.
      const roles = withoutRole(person, role);
      if (roles.length > 0) return { ...person, role: roles.join(' / ') };
      const { role: _dropped, ...rest } = person;
      return rest as Person;
    }
    return person;
  });
};

/**
 * The legacy `Project.director` / `Project.cinematographer` values implied by
 * the current people list. Roles nobody holds return `undefined` so callers can
 * leave an existing free-text name alone rather than blanking it.
 */
export const projectHeadFieldsFor = (
  people: readonly Person[],
): { director?: string; cinematographer?: string } => {
  const out: { director?: string; cinematographer?: string } = {};
  for (const role of KEY_CREW_ROLES) {
    if (!role.projectField) continue;
    const holder = keyCrewMember(people, role.key);
    if (holder?.displayName.trim()) out[role.projectField] = holder.displayName.trim();
  }
  return out;
};

/**
 * Display name for a key role: the assigned crew member when there is one,
 * otherwise the legacy free-text project field, otherwise undefined (unknown —
 * never an empty-looking placeholder).
 */
export const keyCrewDisplayName = (
  people: readonly Person[],
  roleKey: string,
  legacy?: { director?: string; cinematographer?: string },
): string | undefined => {
  const holder = keyCrewMember(people, roleKey);
  if (holder?.displayName.trim()) return holder.displayName.trim();
  const role = keyCrewRoleByKey(roleKey);
  if (role?.projectField) {
    const fallback = legacy?.[role.projectField]?.trim();
    if (fallback) return fallback;
  }
  return undefined;
};
