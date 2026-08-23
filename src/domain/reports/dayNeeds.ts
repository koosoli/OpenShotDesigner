/**
 * What each shooting day needs (plan §15, §16).
 *
 * One derivation answers the production manager's daily question — who and
 * what has to be available on which day — and feeds two things: the day
 * overview (people × days, gear × days) and the budget, which prices a person
 * by the days they work and a piece of gear by the days it is on set.
 *
 * Resolution, per day, from its schedule blocks:
 *  - setups on the day: a `setup` block's setup, the setups owning a `shots`
 *    block's shots, and the setups that carry a scheduled `scene` block's
 *    scene number (the only link a setup has to a script scene);
 *  - cast: through `castFilterForDay`, so a production with no cast model
 *    calls all its performers and one with assignments calls exactly those;
 *  - crew: everyone, on every shooting day. A production that wants
 *    otherwise expresses it with an explicit budget line; silently guessing
 *    who is "really" needed would be wrong more often than right (rule 13);
 *  - equipment: whatever the day's setups derive, grouped by the master-list
 *    key and quantified by the peak any single setup needs.
 *
 * Pure: the equipment derivation for a setup is injected, because it lives
 * with the plan-element catalogue rather than here.
 */

import type { ProductionDay, ScheduleBlock } from '../scheduling';
import type { Person } from '../people';
import { castFilterForDay } from './dayCast';
import type { DayCastSources } from './dayCast';

export interface DayNeedsEquipment {
  /** `equipmentKey(item)`: category, brand and model/name. */
  key: string;
  label: string;
  category: string;
  /** The most of this item any one setup on the day needs at once. */
  quantity: number;
}

export interface DayNeeds {
  dayId: string;
  dayName: string;
  date?: string;
  /** A shooting day unless the sheet says otherwise. */
  kind: 'shoot' | 'rehearsal' | 'scout' | 'event';
  setupIds: string[];
  sceneNumbers: string[];
  castPersonIds: string[];
  crewPersonIds: string[];
  equipment: DayNeedsEquipment[];
}

export interface DeriveDayNeedsInput {
  days: readonly ProductionDay[];
  blocks: readonly ScheduleBlock[];
  people?: readonly Person[];
  setups: ReadonlyArray<{
    id: string;
    sceneNumber?: string;
    elements?: Array<{ id: string; type: string; characterId?: string }>;
    shots?: Array<{ id: string }>;
  }>;
  scriptScenes?: ReadonlyArray<{ id: string; sceneNumber?: string; characterIds?: string[] }>;
  castAssignments?: DayCastSources['castAssignments'];
  /** Gear a setup derives, in the master-list shape. */
  equipmentForSetup: (setupId: string) => ReadonlyArray<{
    category: string;
    name: string;
    brand?: string;
    model?: string;
    quantity: number;
  }>;
}

/** The same grouping key the master equipment list uses, so rates line up with it. */
export const equipmentKey = (item: { category: string; name: string; brand?: string; model?: string }): string =>
  `${item.category}:${(item.brand || '').trim().toLowerCase()}:${(item.model || item.name).trim().toLowerCase()}`;

export const equipmentLabel = (item: { name: string; brand?: string; model?: string }): string => {
  const model = (item.model || item.name).trim();
  const brand = (item.brand || '').trim();
  // "ARRI ARRI Alexa" when the model already names its maker; "Generic" says nothing.
  if (!brand || /^generic$/i.test(brand) || model.toLowerCase().startsWith(brand.toLowerCase())) return model || item.name;
  return `${brand} ${model}`;
};

const isShootingDay = (day: ProductionDay): boolean => (day.callSheet?.type ?? 'shoot') === 'shoot';

/** Setups a day's blocks resolve to, in block order, de-duplicated. */
export const setupIdsScheduledOn = (
  day: ProductionDay,
  blocks: readonly ScheduleBlock[],
  setups: DeriveDayNeedsInput['setups'],
  scenes: ReadonlyArray<{ id: string; sceneNumber?: string }> = [],
): string[] => {
  const byId = new Map(blocks.map((block) => [block.id, block] as const));
  const out: string[] = [];
  const add = (id: string | undefined) => {
    if (id && !out.includes(id)) out.push(id);
  };
  for (const blockId of day.scheduleBlockIds) {
    const block = byId.get(blockId);
    if (!block) continue;
    switch (block.kind) {
      case 'setup':
        add(setups.find((setup) => setup.id === block.setupId)?.id);
        break;
      case 'shots':
        for (const shotId of block.shotIds) {
          add(setups.find((setup) => (setup.shots ?? []).some((shot) => shot.id === shotId))?.id);
        }
        break;
      case 'scene': {
        const number = scenes.find((scene) => scene.id === block.scriptSceneId)?.sceneNumber?.trim();
        if (!number) break;
        for (const setup of setups) {
          if (setup.sceneNumber?.trim() === number) add(setup.id);
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
};

export const deriveDayNeeds = (input: DeriveDayNeedsInput): DayNeeds[] => {
  const people = input.people ?? [];
  const crewIds = people.filter((person) => person.kind === 'crew').map((person) => person.id);
  const performers = people.filter((person) => person.kind === 'cast' || person.kind === 'talent');
  const castSources: DayCastSources = {
    scriptScenes: input.scriptScenes as DayCastSources['scriptScenes'],
    setups: input.setups as DayCastSources['setups'],
    castAssignments: input.castAssignments,
  };

  return input.days.map((day) => {
    const setupIds = setupIdsScheduledOn(day, input.blocks, input.setups, input.scriptScenes ?? []);
    const sceneNumbers: string[] = [];
    for (const id of setupIds) {
      const number = input.setups.find((setup) => setup.id === id)?.sceneNumber?.trim();
      if (number && !sceneNumbers.includes(number)) sceneNumbers.push(number);
    }
    for (const blockId of day.scheduleBlockIds) {
      const block = input.blocks.find((candidate) => candidate.id === blockId);
      if (block?.kind !== 'scene') continue;
      const number = input.scriptScenes?.find((scene) => scene.id === block.scriptSceneId)?.sceneNumber?.trim();
      if (number && !sceneNumbers.includes(number)) sceneNumbers.push(number);
    }

    const castFilter = castFilterForDay(day.scheduleBlockIds, input.blocks, castSources);
    const castPersonIds = performers
      .filter((person) => !castFilter || castFilter.includes(person.id))
      .map((person) => person.id);

    const equipment = new Map<string, DayNeedsEquipment>();
    for (const setupId of setupIds) {
      for (const item of input.equipmentForSetup(setupId)) {
        const key = equipmentKey(item);
        const existing = equipment.get(key);
        if (existing) existing.quantity = Math.max(existing.quantity, item.quantity);
        else equipment.set(key, { key, label: equipmentLabel(item), category: item.category, quantity: item.quantity });
      }
    }

    return {
      dayId: day.id,
      dayName: day.name,
      date: day.date,
      kind: day.callSheet?.type ?? 'shoot',
      setupIds,
      sceneNumbers,
      castPersonIds,
      crewPersonIds: isShootingDay(day) ? [...crewIds] : [],
      equipment: [...equipment.values()],
    };
  });
};

/** Shooting days per person and per equipment key — what the budget prices by. */
export const countNeedDays = (
  needs: readonly DayNeeds[],
): { shootDays: number; personDays: Map<string, number>; equipmentDays: Map<string, number> } => {
  const personDays = new Map<string, number>();
  const equipmentDays = new Map<string, number>();
  let shootDays = 0;
  for (const day of needs) {
    if (day.kind !== 'shoot') continue;
    shootDays += 1;
    for (const id of [...day.castPersonIds, ...day.crewPersonIds]) personDays.set(id, (personDays.get(id) ?? 0) + 1);
    for (const item of day.equipment) equipmentDays.set(item.key, (equipmentDays.get(item.key) ?? 0) + 1);
  }
  return { shootDays, personDays, equipmentDays };
};
