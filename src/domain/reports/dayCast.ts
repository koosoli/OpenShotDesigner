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

/**
 * Lookup tables, cached per source array. Every derivation here runs once per
 * day (and the one-liner once per strip), so scanning the block, setup and
 * scene lists each time made a long schedule quadratic. The project's arrays
 * are immutable, so a WeakMap keyed on the array itself is a safe cache.
 */
const memo = <K extends object, V>(build: (key: K) => V) => {
  const cache = new WeakMap<K, V>();
  return (key: K): V => {
    let value = cache.get(key);
    if (value === undefined) {
      value = build(key);
      cache.set(key, value);
    }
    return value;
  };
};

const blockIndex = memo((blocks: readonly ScheduleBlock[]) => new Map(blocks.map((block) => [block.id, block] as const)));

type SetupLike = { id: string; sceneNumber?: string; elements?: Array<{ id: string; type: string; characterId?: string }>; shots?: Array<{ id: string }> };
const setupIndex = memo((setups: readonly SetupLike[]) => {
  const byId = new Map<string, SetupLike>();
  const ownerOfShot = new Map<string, SetupLike>();
  for (const setup of setups) {
    byId.set(setup.id, setup);
    for (const shot of setup.shots ?? []) if (!ownerOfShot.has(shot.id)) ownerOfShot.set(shot.id, setup);
  }
  return { byId, ownerOfShot };
});

const sceneIndex = memo((scenes: ReadonlyArray<{ id: string; sceneNumber?: string; characterIds?: string[] }>) => {
  const byId = new Map(scenes.map((scene) => [scene.id, scene] as const));
  const idsByNumber = new Map<string, string[]>();
  for (const scene of scenes) {
    const number = scene.sceneNumber?.trim();
    if (!number) continue;
    const list = idsByNumber.get(number);
    if (list) list.push(scene.id);
    else idsByNumber.set(number, [scene.id]);
  }
  return { byId, idsByNumber };
});

const NO_SETUPS: SetupLike[] = [];
const NO_SCENES: Array<{ id: string; sceneNumber: string }> = [];

/** The slice of a project this derivation needs; keeps it pure and testable. */
export interface DayCastSources {
  scriptScenes?: ReadonlyArray<{ id: string; characterIds?: string[] }>;
  setups?: ReadonlyArray<{
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
  const byId = blockIndex(blocks);
  const setups = setupIndex(sources.setups ?? NO_SETUPS);
  const scenes = sceneIndex(sources.scriptScenes ?? NO_SCENES);
  const characterIds = new Set<string>();

  const addSetup = (setup: SetupLike | undefined): void => {
    for (const id of characterIdsOnSetup(setup)) characterIds.add(id);
  };

  for (const blockId of scheduleBlockIds) {
    const block = byId.get(blockId);
    if (!block) continue;
    switch (block.kind) {
      case 'scene': {
        for (const id of scenes.byId.get(block.scriptSceneId)?.characterIds ?? []) characterIds.add(id);
        break;
      }
      case 'setup':
        addSetup(setups.byId.get(block.setupId));
        break;
      case 'shots': {
        // A shot belongs to exactly one setup; the actors on it are called.
        for (const shotId of block.shotIds) addSetup(setups.ownerOfShot.get(shotId));
        break;
      }
      default:
        // Banners, cues and segments carry no cast of their own.
        break;
    }
  }

  return characterIds;
};

/** The slice of a project `sceneIdsScheduledOn` needs. */
export interface DaySceneSources {
  scriptScenes?: ReadonlyArray<{ id: string; sceneNumber: string }>;
  setups?: ReadonlyArray<{ id: string; sceneNumber?: string; shots?: Array<{ id: string }> }>;
}

/**
 * Script scenes shot on a day, from scene strips directly and from setup and
 * shot strips through the setup's scene number — the same link the strip
 * labels use. A setup numbered "12" brings every scene numbered "12".
 */
export const sceneIdsScheduledOn = (
  scheduleBlockIds: readonly string[],
  blocks: readonly ScheduleBlock[],
  sources: DaySceneSources,
): Set<string> => {
  const byId = blockIndex(blocks);
  const setups = setupIndex(sources.setups ?? NO_SETUPS);
  const scenes = sceneIndex(sources.scriptScenes ?? NO_SCENES);
  const ids = new Set<string>();
  const addSetup = (setup: SetupLike | undefined) => {
    const number = setup?.sceneNumber?.trim();
    if (!number) return;
    for (const id of scenes.idsByNumber.get(number) ?? []) ids.add(id);
  };
  for (const blockId of scheduleBlockIds) {
    const block = byId.get(blockId);
    if (!block) continue;
    if (block.kind === 'scene') ids.add(block.scriptSceneId);
    else if (block.kind === 'setup') addSetup(setups.byId.get(block.setupId));
    else if (block.kind === 'shots') {
      for (const shotId of block.shotIds) addSetup(setups.ownerOfShot.get(shotId));
    }
  }
  return ids;
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
