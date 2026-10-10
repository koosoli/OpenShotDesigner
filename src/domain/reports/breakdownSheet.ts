/**
 * Breakdown sheets: one per scene, the classic production document.
 *
 * Everything a department head needs from one scene on one page — the
 * slugline split into INT/EXT, set and day/night, the story day, length in
 * eighths, the cast by number, and every tagged element grouped by
 * department — with the header coloured by the same INT/EXT + DAY/NIGHT code
 * as the stripboard. Pure derivation (rule 37).
 */

import type { BreakdownCategory, BreakdownItem, Character, ScriptScene } from '../script/types';
import type { CastAssignment, Person } from '../people';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import { BREAKDOWN_CATEGORY_ORDER, sortScenesByNumber } from './breakdown';
import { sceneIdsScheduledOn } from './dayCast';
import type { DaySceneSources } from './dayCast';
import { stripColorKey } from '../scheduling/stripboardPrint';
import type { StripColorKey } from '../scheduling/stripboardPrint';

export interface BreakdownSheetCast {
  castNumber?: number;
  character: string;
  performer?: string;
}

export interface BreakdownSheet {
  sceneId: string;
  sceneNumber: string;
  heading: string;
  intExt: string;
  set: string;
  timeOfDay: string;
  scriptDay?: string;
  synopsis?: string;
  pageEighths?: number;
  omitted: boolean;
  colorKey: StripColorKey;
  cast: BreakdownSheetCast[];
  elements: Array<{ category: BreakdownCategory; items: string[] }>;
  /** Shooting days this scene is scheduled on, by name. */
  shootDays: string[];
}

const INT_EXT_LABEL: Record<string, string> = { INT: 'INT', EXT: 'EXT', INT_EXT: 'INT/EXT', OTHER: '' };

/** The set name out of a slugline: "INT. DINER - BOOTH - NIGHT" -> "DINER - BOOTH". */
const setFromHeading = (heading: string, timeOfDay?: string): string => {
  let text = heading.trim().replace(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s*/i, '');
  if (timeOfDay) {
    const index = text.toUpperCase().lastIndexOf(timeOfDay.toUpperCase());
    if (index > 0) text = text.slice(0, index);
  }
  return text.replace(/[\s.\-–—]+$/, '').trim();
};

export const deriveBreakdownSheets = (input: {
  /** Scenes with `breakdownItemIds` attached (see `attachBreakdownItemsToScenes`). */
  scenes: readonly ScriptScene[];
  characters: readonly Character[];
  breakdownItems: readonly BreakdownItem[];
  castAssignments?: readonly CastAssignment[];
  people?: readonly Person[];
  days?: readonly ProductionDay[];
  blocks?: readonly ScheduleBlock[];
  setups?: DaySceneSources['setups'];
}): BreakdownSheet[] => {
  const itemById = new Map(input.breakdownItems.map((item) => [item.id, item] as const));
  const characterById = new Map(input.characters.map((character) => [character.id, character] as const));
  const personById = new Map((input.people ?? []).map((person) => [person.id, person] as const));
  const daysByScene = new Map<string, string[]>();
  for (const day of input.days ?? []) {
    for (const sceneId of sceneIdsScheduledOn(day.scheduleBlockIds, input.blocks ?? [], { scriptScenes: [...input.scenes], setups: input.setups })) {
      daysByScene.set(sceneId, [...(daysByScene.get(sceneId) ?? []), day.name]);
    }
  }

  return sortScenesByNumber([...input.scenes]).map((scene) => {
    const cast = scene.characterIds
      .map((id): BreakdownSheetCast | undefined => {
        const character = characterById.get(id);
        if (!character) return undefined;
        const assignment = input.castAssignments?.find((candidate) => candidate.characterId === id);
        const performer = assignment ? personById.get(assignment.personId)?.displayName : undefined;
        return {
          character: character.canonicalName,
          ...(assignment ? { castNumber: assignment.castNumber } : {}),
          ...(performer ? { performer } : {}),
        };
      })
      .filter((entry): entry is BreakdownSheetCast => !!entry)
      .sort((a, b) => (a.castNumber ?? 9999) - (b.castNumber ?? 9999) || a.character.localeCompare(b.character));

    const elements = BREAKDOWN_CATEGORY_ORDER.map((category) => ({
      category,
      items: scene.breakdownItemIds
        .map((id) => itemById.get(id))
        .filter((item): item is BreakdownItem => !!item && item.category === category)
        .map((item) => item.name),
    })).filter((group) => group.items.length > 0);

    const timeOfDay = scene.timeOfDay ?? '';
    return {
      sceneId: scene.id,
      sceneNumber: scene.sceneNumber,
      heading: scene.heading,
      intExt: INT_EXT_LABEL[scene.intExt ?? 'OTHER'] ?? '',
      set: setFromHeading(scene.heading, timeOfDay),
      timeOfDay,
      ...(scene.scriptDay ? { scriptDay: scene.scriptDay } : {}),
      ...(scene.synopsis ? { synopsis: scene.synopsis } : {}),
      ...(scene.pageLengthEighths !== undefined ? { pageEighths: scene.pageLengthEighths } : {}),
      omitted: !!scene.omitted,
      colorKey: stripColorKey({ id: scene.id, kind: 'scene', scriptSceneId: scene.id }, `${scene.intExt ?? ''} ${timeOfDay}`),
      cast,
      elements,
      shootDays: daysByScene.get(scene.id) ?? [],
    };
  });
};
