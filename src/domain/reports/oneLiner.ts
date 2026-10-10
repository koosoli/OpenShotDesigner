/**
 * One-liner schedule — and, with elements, the shooting schedule.
 *
 * The condensed schedule a crew actually carries: every shooting day with its
 * scenes one line each (scene number, INT/EXT, set, day/night, pages, cast
 * numbers), banners for meals and company moves, and a page total at each day
 * break. Setup and shot strips count as shooting their scene, the same link
 * the board uses. With `withElements` each scene also lists its breakdown
 * elements, which is what turns a one-liner into a shooting schedule.
 */

import type { BreakdownItem, ScriptScene } from '../script/types';
import type { CastAssignment } from '../people';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import { MANUAL_TYPE_LABELS, stripColorKey } from '../scheduling/stripboardPrint';
import type { StripColorKey } from '../scheduling/stripboardPrint';
import { BREAKDOWN_CATEGORY_ORDER } from './breakdown';
import { sceneIdsScheduledOn } from './dayCast';
import type { DaySceneSources } from './dayCast';

export interface OneLinerScene {
  kind: 'scene';
  sceneId: string;
  sceneNumber: string;
  intExt: string;
  set: string;
  timeOfDay: string;
  synopsis?: string;
  pageEighths?: number;
  castNumbers: number[];
  colorKey: StripColorKey;
  /** Department -> element names, only with `withElements`. */
  elements?: Array<{ category: string; items: string[] }>;
}

export interface OneLinerBanner {
  kind: 'banner';
  label: string;
  colorKey: StripColorKey;
}

export interface OneLinerDay {
  dayId: string;
  dayName: string;
  date?: string;
  crewCall?: string;
  entries: Array<OneLinerScene | OneLinerBanner>;
  /** Sum of scene eighths on this day (scenes without a length count 0). */
  pageEighths: number;
}

const INT_EXT: Record<string, string> = { INT: 'INT', EXT: 'EXT', INT_EXT: 'I/E', OTHER: '' };

const setOf = (heading: string, timeOfDay?: string): string => {
  let text = heading.trim().replace(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s*/i, '');
  if (timeOfDay) {
    const index = text.toUpperCase().lastIndexOf(timeOfDay.toUpperCase());
    if (index > 0) text = text.slice(0, index);
  }
  return text.replace(/[\s.\-–—]+$/, '').trim();
};

export const deriveOneLiner = (input: {
  days: readonly ProductionDay[];
  blocks: readonly ScheduleBlock[];
  scenes: readonly ScriptScene[];
  setups?: DaySceneSources['setups'];
  castAssignments?: readonly CastAssignment[];
  breakdownItems?: readonly BreakdownItem[];
  withElements?: boolean;
}): OneLinerDay[] => {
  const blockById = new Map(input.blocks.map((block) => [block.id, block] as const));
  const sceneById = new Map(input.scenes.map((scene) => [scene.id, scene] as const));
  const castNumberOf = new Map((input.castAssignments ?? []).map((assignment) => [assignment.characterId, assignment.castNumber] as const));
  const itemById = new Map((input.breakdownItems ?? []).map((item) => [item.id, item] as const));
  const sources = { scriptScenes: input.scenes, setups: input.setups };

  return input.days.map((day) => {
    const seen = new Set<string>();
    const entries: Array<OneLinerScene | OneLinerBanner> = [];
    let pageEighths = 0;
    for (const blockId of day.scheduleBlockIds) {
      const block = blockById.get(blockId);
      if (!block) continue;
      if (block.kind === 'manual') {
        entries.push({ kind: 'banner', label: block.label || MANUAL_TYPE_LABELS[block.manualType ?? 'other'], colorKey: stripColorKey(block, '') });
        continue;
      }
      for (const sceneId of sceneIdsScheduledOn([blockId], input.blocks, sources)) {
        const scene = sceneById.get(sceneId);
        if (!scene || seen.has(sceneId)) continue;
        seen.add(sceneId);
        const timeOfDay = scene.timeOfDay ?? '';
        const entry: OneLinerScene = {
          kind: 'scene',
          sceneId,
          sceneNumber: scene.sceneNumber,
          intExt: INT_EXT[scene.intExt ?? 'OTHER'] ?? '',
          set: setOf(scene.heading, timeOfDay),
          timeOfDay,
          castNumbers: [...new Set(scene.characterIds.map((id) => castNumberOf.get(id)).filter((n): n is number => n !== undefined))].sort((a, b) => a - b),
          colorKey: stripColorKey(block, `${scene.intExt ?? ''} ${timeOfDay}`),
        };
        if (scene.synopsis) entry.synopsis = scene.synopsis;
        if (scene.pageLengthEighths !== undefined) {
          entry.pageEighths = scene.pageLengthEighths;
          pageEighths += scene.pageLengthEighths;
        }
        if (input.withElements) {
          entry.elements = BREAKDOWN_CATEGORY_ORDER.map((category) => ({
            category,
            items: scene.breakdownItemIds
              .map((id) => itemById.get(id))
              .filter((item): item is BreakdownItem => !!item && item.category === category)
              .map((item) => item.name),
          })).filter((group) => group.items.length > 0);
        }
        entries.push(entry);
      }
    }
    return { dayId: day.id, dayName: day.name, date: day.date, crewCall: day.crewCall, entries, pageEighths };
  });
};
