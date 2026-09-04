/**
 * Generic "where is this used?" reference index (roadmap Phase 9 slice).
 *
 * One walk over the project answers the same question for every entity kind:
 * given a person, location, setup, shot or character id, which parts of the
 * production reference it. Modelled on `domain/media/projectAssetReferences`
 * (a single inventory walker) and on the equipment master list's
 * `usedInSetups` derivation — except this index covers cross-domain links
 * (schedule, tasks, budget, cast) rather than plan elements alone.
 *
 * Pure functions only, no React. Dangling references (ids that point at an
 * entity the project no longer contains) are ignored, never thrown on and
 * never materialised as phantom index keys.
 */

import type { Project } from '../../types';
import { deriveDayNeeds, setupIdsScheduledOn } from '../reports/dayNeeds';
import { charactersScheduledOn } from '../reports/dayCast';

/** One place an entity is referenced: which area, and a human-readable label. */
export interface UsageEntry {
  /** Grouping area, e.g. "Schedule", "Tasks", "Budget", "Cast", "Scenes". */
  section: string;
  /** What references it, e.g. the day name, task title or scene name. */
  label: string;
  /** Extra context, e.g. a call time or cast number. Absent = none. */
  detail?: string;
}

export type UsageEntityKind = 'person' | 'location' | 'setup' | 'shot' | 'character' | 'equipment-item';

/** Per-kind lookup: entity id -> usages. Every known id is present, possibly empty. */
export type UsageMap = Record<string, UsageEntry[]>;

export interface UsageIndex {
  person: UsageMap;
  location: UsageMap;
  setup: UsageMap;
  shot: UsageMap;
  character: UsageMap;
  /** Keyed by `EquipmentItem.id` of plan-level custom equipment rows. */
  'equipment-item': UsageMap;
}

const emptyMap = (ids: readonly string[]): UsageMap => {
  const map: UsageMap = {};
  for (const id of ids) map[id] = [];
  return map;
};

const dayLabel = (day: { name: string; date?: string }): string =>
  day.date ? `${day.name} (${day.date})` : day.name;

const personName = (people: ReadonlyArray<{ id: string; displayName: string }>, id: string): string =>
  people.find((person) => person.id === id)?.displayName ?? id;

/**
 * Build the full reference index for a project. Dangling references are
 * skipped: an entry is only recorded when its target id is a known entity.
 */
export const buildUsageIndex = (project: Project): UsageIndex => {
  const people = project.people ?? [];
  const locations = project.locations ?? [];
  const setups = project.setups ?? [];
  const characters = project.characters ?? [];
  const days = project.productionDays ?? [];
  const blocks = project.scheduleBlocks ?? [];
  const tasks = project.tasks ?? [];
  const takes = project.takes ?? [];
  const scriptScenes = project.scriptScenes ?? [];
  const castAssignments = project.castAssignments ?? [];
  const calendarEvents = project.productionCalendarEvents ?? [];
  const budgetActuals = project.budget?.actuals ?? [];

  const shots = setups.flatMap((setup) =>
    (setup.shots ?? []).map((shot) => ({ setup, shot })),
  );
  const equipmentRows = setups.flatMap((setup) =>
    (setup.customEquipment ?? []).map((item) => ({ setup, item })),
  );

  const knownPersonIds = new Set(people.map((person) => person.id));
  const knownLocationIds = new Set(locations.map((location) => location.id));
  const knownSetupIds = new Set(setups.map((setup) => setup.id));
  const knownShotIds = new Set(shots.map(({ shot }) => shot.id));
  const knownCharacterIds = new Set(characters.map((character) => character.id));
  const knownEquipmentIds = new Set(equipmentRows.map(({ item }) => item.id));

  const index: UsageIndex = {
    person: emptyMap([...knownPersonIds]),
    location: emptyMap([...knownLocationIds]),
    setup: emptyMap([...knownSetupIds]),
    shot: emptyMap([...knownShotIds]),
    character: emptyMap([...knownCharacterIds]),
    'equipment-item': emptyMap([...knownEquipmentIds]),
  };

  const add = (kind: UsageEntityKind, id: string, entry: UsageEntry): void => {
    if (!id) return;
    const map = index[kind];
    const list = map[id];
    // Unknown target = dangling reference: ignore rather than invent a key.
    if (!list) return;
    list.push(entry);
  };

  // --- People: cast links, schedule days, call times, tasks, budget, sites ---
  const characterName = (id: string): string =>
    characters.find((character) => character.id === id)?.canonicalName ?? id;

  for (const assignment of castAssignments) {
    if (!knownPersonIds.has(assignment.personId) || !knownCharacterIds.has(assignment.characterId)) continue;
    add('person', assignment.personId, {
      section: 'Cast',
      label: `Plays ${characterName(assignment.characterId)}`,
      detail: `Cast #${assignment.castNumber}`,
    });
    add('character', assignment.characterId, {
      section: 'Cast',
      label: `Played by ${personName(people, assignment.personId)}`,
      detail: `Cast #${assignment.castNumber}`,
    });
  }

  // Shooting days via the same derivation the day overview and budget use,
  // with no equipment (gear is not a person question). Crew are needed on
  // every shooting day; cast follow the cast model when one exists.
  const needs = deriveDayNeeds({
    days,
    blocks,
    people,
    setups,
    scriptScenes,
    castAssignments,
    equipmentForSetup: () => [],
  });
  const dayById = new Map(days.map((day) => [day.id, day] as const));
  for (const need of needs) {
    const day = dayById.get(need.dayId);
    if (!day) continue;
    for (const personId of [...need.castPersonIds, ...need.crewPersonIds]) {
      add('person', personId, { section: 'Schedule', label: `Needed on ${dayLabel(day)}` });
    }
  }

  for (const day of days) {
    for (const call of day.callSheet?.personCalls ?? []) {
      if (!knownPersonIds.has(call.personId)) continue;
      add('person', call.personId, {
        section: 'Call times',
        label: `Called on ${dayLabel(day)}`,
        detail: [call.time, call.note].filter(Boolean).join(' — ') || undefined,
      });
    }
    for (const pickup of day.callSheet?.pickups ?? []) {
      if (!knownPersonIds.has(pickup.personId)) continue;
      add('person', pickup.personId, {
        section: 'Call times',
        label: `Picked up on ${dayLabel(day)}`,
        detail: [pickup.time, pickup.location].filter(Boolean).join(' — ') || undefined,
      });
    }
  }

  for (const location of locations) {
    for (const contactId of location.contactIds ?? []) {
      add('person', contactId, { section: 'Locations', label: `Site contact at ${location.name}` });
    }
  }

  for (const task of tasks) {
    for (const assigneeId of task.assigneeIds ?? []) {
      add('person', assigneeId, { section: 'Tasks', label: `Assigned: ${task.title}` });
    }
  }

  for (const event of calendarEvents) {
    for (const assigneeId of event.assigneeIds ?? []) {
      add('person', assigneeId, { section: 'Calendar', label: `Assigned: ${event.title}` });
    }
  }

  for (const actual of budgetActuals) {
    if (!actual.entryId?.startsWith('person:')) continue;
    add('person', actual.entryId.slice('person:'.length), {
      section: 'Budget',
      label: `Spend: ${actual.label}`,
    });
  }

  // --- Locations: setups, master plans, script scenes, days, call sheets, tasks ---
  for (const setup of setups) {
    if (setup.locationId && knownLocationIds.has(setup.locationId)) {
      const scene = setup.sceneNumber ? `Scene ${setup.sceneNumber} — ` : '';
      add('location', setup.locationId, { section: 'Scenes', label: `${scene}${setup.name}` });
    }
    if (setup.masterPlanForLocationId && knownLocationIds.has(setup.masterPlanForLocationId)) {
      add('location', setup.masterPlanForLocationId, {
        section: 'Master plan',
        label: `Master plan: ${setup.name}`,
      });
    }
  }

  for (const scene of scriptScenes) {
    if (scene.locationId && knownLocationIds.has(scene.locationId)) {
      add('location', scene.locationId, {
        section: 'Script',
        label: `Scene ${scene.sceneNumber}: ${scene.heading}`,
      });
    }
  }

  for (const day of days) {
    const setupIds = setupIdsScheduledOn(day, blocks, setups, scriptScenes);
    const locationIds = new Set<string>();
    for (const setupId of setupIds) {
      const locationId = setups.find((setup) => setup.id === setupId)?.locationId;
      if (locationId && knownLocationIds.has(locationId)) locationIds.add(locationId);
    }
    for (const locationId of locationIds) {
      add('location', locationId, { section: 'Schedule', label: `Shot on ${dayLabel(day)}` });
    }
    // Per-location call-sheet maps are stored by name, so resolve by name and
    // only when it matches exactly one known location.
    for (const map of day.callSheet?.locationMaps ?? []) {
      const match = locations.filter((location) => location.name === map.locationName);
      if (match.length !== 1) continue;
      add('location', match[0].id, { section: 'Call sheets', label: `Mapped on ${dayLabel(day)}` });
    }
  }

  for (const task of tasks) {
    if (task.link?.kind === 'location') {
      add('location', task.link.id, { section: 'Tasks', label: `Linked: ${task.title}` });
    }
  }

  // --- Setups: contained shots, schedule days/blocks, script match, tasks ---
  const shotOwner = new Map(shots.map(({ setup, shot }) => [shot.id, setup.id] as const));
  for (const { setup, shot } of shots) {
    add('setup', setup.id, {
      section: 'Shots',
      label: `Shot ${shot.shotNumber || shot.id}: ${shot.name}`,
    });
  }

  for (const day of days) {
    const setupIds = setupIdsScheduledOn(day, blocks, setups, scriptScenes);
    for (const setupId of setupIds) {
      add('setup', setupId, { section: 'Schedule', label: `Scheduled on ${dayLabel(day)}` });
    }
  }
  for (const block of blocks) {
    if (block.kind === 'setup') {
      const setup = setups.find((candidate) => candidate.id === block.setupId);
      add('setup', block.setupId, {
        section: 'Schedule',
        label: `Setup block: ${setup?.name ?? block.setupId}`,
      });
    }
  }
  for (const setup of setups) {
    const number = setup.sceneNumber?.trim();
    if (!number) continue;
    const scene = scriptScenes.find((candidate) => candidate.sceneNumber?.trim() === number);
    if (scene) {
      add('setup', setup.id, { section: 'Script', label: `Covers scene ${scene.sceneNumber}: ${scene.heading}` });
    }
  }
  for (const task of tasks) {
    if (task.link?.kind === 'setup') {
      add('setup', task.link.id, { section: 'Tasks', label: `Linked: ${task.title}` });
    }
  }

  // --- Shots: schedule blocks/days, takes, storyboard, script links, tasks ---
  for (const block of blocks) {
    if (block.kind !== 'shots') continue;
    for (const shotId of block.shotIds) {
      if (!knownShotIds.has(shotId)) continue;
      const dayNames = days
        .filter((day) => day.scheduleBlockIds.includes(block.id))
        .map((day) => dayLabel(day));
      add('shot', shotId, {
        section: 'Schedule',
        label: 'In schedule block',
        detail: dayNames.length > 0 ? dayNames.join(', ') : 'Unscheduled block',
      });
    }
  }

  for (const take of takes) {
    if (!knownShotIds.has(take.shotId)) continue;
    const day = take.productionDayId ? dayById.get(take.productionDayId) : undefined;
    add('shot', take.shotId, {
      section: 'Takes',
      label: `Take ${take.takeNumber}`,
      detail: day ? dayLabel(day) : undefined,
    });
    const ownerSetupId = shotOwner.get(take.shotId);
    if (ownerSetupId) {
      add('setup', ownerSetupId, {
        section: 'Takes',
        label: `Take ${take.takeNumber}`,
        detail: day ? dayLabel(day) : undefined,
      });
    }
  }

  for (const { shot } of shots) {
    const hasStoryboard =
      !!shot.storyboardImage || !!shot.storyboardImageEnd || Object.keys(shot.storyboardFrames ?? {}).length > 0;
    if (hasStoryboard) {
      add('shot', shot.id, { section: 'Storyboard', label: 'Has storyboard art' });
    }
  }

  for (const setup of setups) {
    for (const mark of setup.scriptMarks ?? []) {
      add('shot', mark.shotId, { section: 'Script', label: `Lined: ${mark.label || mark.shotId}` });
    }
    for (const row of setup.avScriptRows ?? []) {
      if (row.linkedShotId) add('shot', row.linkedShotId, { section: 'Script', label: `AV row ${row.shotNumber}` });
    }
  }
  for (const row of project.avScriptRows ?? []) {
    if (row.linkedShotId) add('shot', row.linkedShotId, { section: 'Script', label: `AV row ${row.shotNumber}` });
  }
  for (const line of project.scriptLines ?? []) {
    if (line.linkedShotId) add('shot', line.linkedShotId, { section: 'Script', label: `Script line ${line.lineNumber}` });
  }

  for (const task of tasks) {
    if (task.link?.kind === 'shot') {
      add('shot', task.link.id, { section: 'Tasks', label: `Linked: ${task.title}` });
    }
  }

  // --- Characters: script scenes, plan actors, schedule days (cast links above) ---
  for (const scene of scriptScenes) {
    for (const characterId of scene.characterIds ?? []) {
      add('character', characterId, {
        section: 'Script',
        label: `In scene ${scene.sceneNumber}: ${scene.heading}`,
      });
    }
  }

  for (const setup of setups) {
    for (const element of setup.elements ?? []) {
      if (element.type === 'actor' && element.characterId) {
        add('character', element.characterId, {
          section: 'Scenes',
          label: `Blocked in ${setup.name}`,
          detail: element.name || undefined,
        });
      }
    }
  }

  for (const day of days) {
    const scheduled = charactersScheduledOn(day.scheduleBlockIds, blocks, {
      scriptScenes,
      setups,
      castAssignments,
    });
    for (const characterId of scheduled) {
      add('character', characterId, { section: 'Schedule', label: `Scheduled on ${dayLabel(day)}` });
    }
  }

  // --- Equipment items: owning setup plus the days that setup is scheduled on ---
  const daysBySetup = new Map<string, string[]>();
  for (const day of days) {
    for (const setupId of setupIdsScheduledOn(day, blocks, setups, scriptScenes)) {
      const list = daysBySetup.get(setupId) ?? [];
      list.push(dayLabel(day));
      daysBySetup.set(setupId, list);
    }
  }
  for (const { setup, item } of equipmentRows) {
    add('equipment-item', item.id, { section: 'Scenes', label: `Listed in ${setup.name}` });
    for (const label of daysBySetup.get(setup.id) ?? []) {
      add('equipment-item', item.id, { section: 'Schedule', label: `Needed on ${label}` });
    }
  }

  return index;
};

/** Usages for one entity; unknown ids read as unused, never throw. */
export const usagesFor = (index: UsageIndex, kind: UsageEntityKind, id: string): UsageEntry[] =>
  index[kind][id] ?? [];

/** Total usage count for one entity; unknown ids read as zero. */
export const usageCountFor = (index: UsageIndex, kind: UsageEntityKind, id: string): number =>
  usagesFor(index, kind, id).length;
