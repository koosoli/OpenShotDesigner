/**
 * Who is called on a shooting day (plan §15, rule 4: not in a component).
 *
 * A day's cast is derived from what is actually scheduled on it. That has to
 * work for all three ways of scheduling, not just one:
 *
 *  - a `scene` block  → the screenplay scene's characters,
 *  - a `setup` block  → the actors standing on that floor-plan setup,
 *  - a `shots` block  → the actors on the setups those shots belong to.
 *
 * Only handling `scene` blocks meant a production that schedules by setup — the
 * script-optional path the app explicitly supports (rule 1) — printed call
 * sheets reading "No cast scheduled" while its actors were on the plan.
 *
 * Characters resolve to people through `castAssignments`; an actor marker with
 * no linked character, or a character nobody is cast for, simply contributes
 * nobody rather than inventing a name (rule 13).
 */

import type { ScheduleBlock } from '../scheduling';
import type { CastAssignment } from '../people';

/** The slice of a project this derivation needs; keeps it pure and testable. */
export interface DayCastSources {
  scriptScenes?: Array<{ id: string; characterIds?: string[] }>;
  setups?: Array<{
    id: string;
    elements?: Array<{ id: string; type: string; characterId?: string }>;
    shots?: Array<{ id: string }>;
  }>;
  castAssignments?: CastAssignment[];
}

/** Actor markers on one setup that are linked to a script character. */
const characterIdsOnSetup = (
  setup: NonNullable<DayCastSources['setups']>[number] | undefined,
): string[] =>
  (setup?.elements ?? [])
    .filter((element) => element.type === 'actor' && !!element.characterId)
    .map((element) => element.characterId as string);

/**
 * Every character scheduled on a day, from scenes, setups and shots alike.
 * Returns a Set so callers can test membership without re-deriving.
 */
export const charactersScheduledOn = (
  scheduleBlockIds: readonly string[],
  blocks: readonly ScheduleBlock[],
  sources: DayCastSources,
): Set<string> => {
  const byId = new Map(blocks.map((block) => [block.id, block] as const));
  const setups = sources.setups ?? [];
  const characterIds = new Set<string>();

  const addSetup = (setupId: string): void => {
    for (const id of characterIdsOnSetup(setups.find((setup) => setup.id === setupId))) {
      characterIds.add(id);
    }
  };

  for (const blockId of scheduleBlockIds) {
    const block = byId.get(blockId);
    if (!block) continue;
    switch (block.kind) {
      case 'scene': {
        const scene = sources.scriptScenes?.find((candidate) => candidate.id === block.scriptSceneId);
        for (const id of scene?.characterIds ?? []) characterIds.add(id);
        break;
      }
      case 'setup':
        addSetup(block.setupId);
        break;
      case 'shots': {
        // A shot belongs to exactly one setup; the actors on it are called.
        for (const shotId of block.shotIds) {
          const owner = setups.find((setup) => (setup.shots ?? []).some((shot) => shot.id === shotId));
          if (owner) addSetup(owner.id);
        }
        break;
      }
      default:
        // Banners, cues and segments carry no cast of their own.
        break;
    }
  }

  return characterIds;
};

/**
 * People called on a day: the performers cast as the characters scheduled on
 * it. Ids are de-duplicated, so an actor playing two scheduled characters is
 * listed once.
 */
export const castPersonIdsForDay = (
  scheduleBlockIds: readonly string[],
  blocks: readonly ScheduleBlock[],
  sources: DayCastSources,
): string[] => {
  const characterIds = charactersScheduledOn(scheduleBlockIds, blocks, sources);
  if (characterIds.size === 0) return [];
  const personIds = new Set<string>();
  for (const assignment of sources.castAssignments ?? []) {
    if (characterIds.has(assignment.characterId)) personIds.add(assignment.personId);
  }
  return [...personIds];
};

/**
 * Cast numbers required by scheduled work, sorted as an AD expects to scan
 * them. Missing assignments remain unknown and are not invented here.
 */
export const castNumbersScheduledOn = (
  scheduleBlockIds: readonly string[],
  blocks: readonly ScheduleBlock[],
  sources: DayCastSources,
): number[] => {
  const characterIds = charactersScheduledOn(scheduleBlockIds, blocks, sources);
  return [...new Set(
    (sources.castAssignments ?? [])
      .filter((assignment) => characterIds.has(assignment.characterId))
      .map((assignment) => assignment.castNumber),
  )].sort((a, b) => a - b);
};

/**
 * The cast filter to hand `deriveCallSheet`, or `undefined` for "call everyone".
 *
 * `castPersonIdsForDay` answers "who is cast for what is scheduled", and `[]`
 * is its honest answer both when a day genuinely calls nobody and when the
 * production has no cast model at all. The call sheet cannot tell those apart:
 * it reads an empty array as an explicit filter matching no one, so a concert
 * or a broadcast — no characters, no cast assignments, performers sitting in
 * `people` as `kind: 'cast'` — issued its show-day sheet with an empty cast
 * table while the band stood on the plan.
 *
 * This is the same defect as "call sheets listed no cast unless screenplay
 * scenes were scheduled", one layer up: that fix taught the derivation to walk
 * setups and shots, but a production that never had characters still lands on
 * `[]`.
 *
 * So the distinction is whether cast linkage exists at all:
 *
 *  - no `castAssignments` → this production does not route cast through
 *    characters. Return `undefined`; every cast/talent person is called.
 *  - assignments exist → the day's resolved list is authoritative, empty
 *    included, because "nobody is called on a company-move day" is a real
 *    and useful answer.
 */
export const castFilterForDay = (
  scheduleBlockIds: readonly string[],
  blocks: readonly ScheduleBlock[],
  sources: DayCastSources,
): string[] | undefined => {
  if ((sources.castAssignments ?? []).length === 0) return undefined;
  return castPersonIdsForDay(scheduleBlockIds, blocks, sources);
};
