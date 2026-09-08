/**
 * The people domain as commands.
 *
 * First cluster migrated off the free-form `updateProjectMeta` patches
 * (audit 2026-09-08, P1). People were the right place to start for two
 * reasons.
 *
 * The first is integrity. A person is referenced from five places — cast
 * assignments, location contact lists, task assignees, call-sheet pick-ups and
 * the mirrored director/DP fields on the project. That cleanup was written out
 * by hand inside `ContactsPanel`, so the invariant lived in a React component
 * and was reachable only by rendering one. Any second delete path — a
 * dashboard, an import that replaces the crew, a future bulk edit — would have
 * had to reimplement it, and would have got it slightly wrong.
 *
 * The second is the change log. `updateProjectMeta` produced "Update project
 * metadata" for every one of these, which is useless as an audit trail and
 * useless as an undo label. A command says "Remove Sam Ortiz (Gaffer) and 3
 * references", which is something a person can read a week later.
 *
 * Every function here is pure: project in, new project plus metadata out. No
 * React, no storage, no clock beyond the timestamp. That is what makes them
 * testable without a DOM and reusable outside the panel they came from.
 */
import type { Project } from '../../types';
import type { CastAssignment, Person } from '../people/types';
import {
  assignCast,
  removePerson,
  setCastNumber,
  unassignCast,
  upsertPerson,
} from '../people/logic';
import { KEY_CREW_ROLES, assignKeyCrew, projectHeadFieldsFor } from '../people/keyRoles';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

const peopleOf = (project: Project): Person[] => project.people ?? [];
const castOf = (project: Project): CastAssignment[] => project.castAssignments ?? [];

/** Name for a log line; falls back to the id so an entry is never anonymous. */
const nameOf = (person: Person | undefined, fallbackId: string): string =>
  person?.displayName?.trim() || `contact ${fallbackId.slice(0, 8)}`;

export interface UpsertPersonInput {
  person: Person;
}

/** Add a contact, or replace the existing one with the same id. */
export const upsertPersonCommand = (
  project: Project,
  input: UpsertPersonInput,
): CommandResult => {
  if (!input.person || typeof input.person.id !== 'string' || input.person.id.trim() === '') {
    throw new Error('upsertPerson: person.id must be a non-empty string.');
  }
  const existing = peopleOf(project).some((person) => person.id === input.person.id);
  const people = upsertPerson(peopleOf(project), input.person);
  return {
    project: { ...project, people },
    meta: {
      type: 'upsertPerson',
      entityId: input.person.id,
      timestamp: commandTimestamp(),
      description: `${existing ? 'Update' : 'Add'} ${nameOf(input.person, input.person.id)}`,
    },
  };
};

export interface RemovePersonInput {
  personId: string;
}

/**
 * Remove a contact and every reference to them.
 *
 * The reference sweep is `removePerson`'s, unchanged — this command exists to
 * make it the *only* way a person leaves a project, and to report what it
 * touched. The count in the description is deliberately concrete: "and 3
 * references" tells a producer that something else changed, which "Update
 * project metadata" never did.
 */
export const removePersonCommand = (
  project: Project,
  input: RemovePersonInput,
): CommandResult => {
  if (typeof input.personId !== 'string' || input.personId.trim() === '') {
    throw new Error('removePerson: personId must be a non-empty string.');
  }
  const removed = peopleOf(project).find((person) => person.id === input.personId);
  if (!removed) {
    throw new Error(`removePerson: unknown person id "${input.personId}".`);
  }

  const next = removePerson(
    {
      people: peopleOf(project),
      castAssignments: castOf(project),
      locations: project.locations ?? [],
      tasks: project.tasks ?? [],
      productionDays: project.productionDays ?? [],
    },
    input.personId,
  );

  // Counted before the write so the description reports what actually went,
  // not what the caller assumed would go.
  const clearedCast = castOf(project).filter(
    (assignment) => assignment.personId === input.personId,
  ).length;
  const clearedLocations = (project.locations ?? []).filter((location) =>
    location.contactIds?.includes(input.personId),
  ).length;
  const clearedTasks = (project.tasks ?? []).filter((task) =>
    task.assigneeIds?.includes(input.personId),
  ).length;
  const clearedPickups = (project.productionDays ?? []).filter((day) =>
    day.callSheet?.pickups?.some((pickup) => pickup.personId === input.personId),
  ).length;
  const references = clearedCast + clearedLocations + clearedTasks + clearedPickups;

  /**
   * A removed head of department must not stay named on the paperwork.
   * `director` and `cinematographer` are mirrored onto the project because the
   * exports render them; leaving the old name there would print a person who
   * is no longer on the show.
   */
  const heads = projectHeadFieldsFor(next.people);
  const headPatch: Partial<Project> = {};
  for (const role of KEY_CREW_ROLES) {
    if (!role.projectField) continue;
    headPatch[role.projectField] = heads[role.projectField] ?? '';
  }

  return {
    project: {
      ...project,
      ...headPatch,
      people: next.people,
      castAssignments: next.castAssignments,
      locations: next.locations as Project['locations'],
      tasks: next.tasks as Project['tasks'],
      productionDays: next.productionDays as Project['productionDays'],
    },
    meta: {
      type: 'removePerson',
      entityId: input.personId,
      timestamp: commandTimestamp(),
      description:
        references === 0
          ? `Remove ${nameOf(removed, input.personId)}`
          : `Remove ${nameOf(removed, input.personId)} and ${references} reference${references === 1 ? '' : 's'}`,
    },
    ...(references > 0
      ? {
          warnings: [
            `Cleared ${clearedCast} cast assignment${clearedCast === 1 ? '' : 's'}, ${clearedLocations} location link${clearedLocations === 1 ? '' : 's'}, ${clearedTasks} task assignment${clearedTasks === 1 ? '' : 's'} and ${clearedPickups} call-sheet pick-up${clearedPickups === 1 ? '' : 's'}.`,
          ],
        }
      : {}),
  };
};

export interface AssignCastInput {
  characterId: string;
  /** Empty or absent vacates the role. */
  personId?: string;
  /** Merged character catalogue to persist alongside, keeping discovered ids stable. */
  characters?: Project['characters'];
}

/** Cast a performer in a character, or vacate the part. */
export const assignCastCommand = (
  project: Project,
  input: AssignCastInput,
): CommandResult => {
  if (typeof input.characterId !== 'string' || input.characterId.trim() === '') {
    throw new Error('assignCast: characterId must be a non-empty string.');
  }
  const castAssignments = input.personId
    ? assignCast(castOf(project), input.characterId, input.personId)
    : unassignCast(castOf(project), input.characterId);

  const person = input.personId
    ? peopleOf(project).find((candidate) => candidate.id === input.personId)
    : undefined;
  const characterName =
    (input.characters ?? project.characters ?? []).find(
      (character) => character.id === input.characterId,
    )?.canonicalName ?? input.characterId;

  return {
    project: {
      ...project,
      ...(input.characters ? { characters: input.characters } : {}),
      castAssignments,
    },
    meta: {
      type: 'assignCast',
      entityId: input.characterId,
      timestamp: commandTimestamp(),
      description: input.personId
        ? `Cast ${nameOf(person, input.personId)} as ${characterName}`
        : `Vacate ${characterName}`,
    },
  };
};

export interface SetCastNumberInput {
  characterId: string;
  castNumber: number;
}

/** Set the cast number a character is called by on the paperwork. */
export const setCastNumberCommand = (
  project: Project,
  input: SetCastNumberInput,
): CommandResult => {
  if (!Number.isFinite(input.castNumber)) {
    throw new Error('setCastNumber: castNumber must be a finite number.');
  }
  return {
    project: {
      ...project,
      castAssignments: setCastNumber(castOf(project), input.characterId, input.castNumber),
    },
    meta: {
      type: 'setCastNumber',
      entityId: input.characterId,
      timestamp: commandTimestamp(),
      description: `Set cast number ${input.castNumber}`,
    },
  };
};

export interface AssignKeyRoleInput {
  roleKey: string;
  /** Empty vacates the role. */
  personId: string;
}

/**
 * Fill or vacate a key production role.
 *
 * Director and DP are mirrored onto the project's own fields because the
 * export views read those rather than the crew list. Doing that here rather
 * than at the call site is the point: the crew page and the printed header can
 * no longer drift apart, whichever screen made the change.
 */
export const assignKeyRoleCommand = (
  project: Project,
  input: AssignKeyRoleInput,
): CommandResult => {
  const role = KEY_CREW_ROLES.find((entry) => entry.key === input.roleKey);
  if (!role) {
    throw new Error(`assignKeyRole: unknown role key "${input.roleKey}".`);
  }
  const people = assignKeyCrew(peopleOf(project), input.roleKey, input.personId);
  const heads = projectHeadFieldsFor(people);

  const patch: Partial<Project> = { people };
  if (role.projectField) {
    patch[role.projectField] = heads[role.projectField] ?? '';
  }

  const person = peopleOf(project).find((candidate) => candidate.id === input.personId);
  return {
    project: { ...project, ...patch },
    meta: {
      type: 'assignKeyRole',
      entityId: input.personId || input.roleKey,
      timestamp: commandTimestamp(),
      description: input.personId
        ? `Assign ${nameOf(person, input.personId)} as ${role.label}`
        : `Vacate ${role.label}`,
    },
  };
};

export interface ImportPeopleInput {
  people: Person[];
}

/** Append imported contacts to the crew list. */
export const importPeopleCommand = (
  project: Project,
  input: ImportPeopleInput,
): CommandResult => {
  if (!Array.isArray(input.people)) {
    throw new Error('importPeople: people must be an array.');
  }
  return {
    project: { ...project, people: [...peopleOf(project), ...input.people] },
    meta: {
      type: 'importPeople',
      timestamp: commandTimestamp(),
      description: `Import ${input.people.length} contact${input.people.length === 1 ? '' : 's'}`,
    },
  };
};
