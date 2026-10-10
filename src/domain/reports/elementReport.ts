/**
 * Prop (and any other breakdown element) report.
 *
 * The props master's question is not "which scenes" but "which days, and in
 * whose hands": for every tagged element, the scenes it appears in, the
 * shooting days those scenes are scheduled on, and the characters in those
 * scenes. Pure derivation over the breakdown and the schedule (rule 37).
 */

import type { BreakdownCategory, BreakdownItem, Character, ScriptScene } from '../script/types';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import { sceneIdsScheduledOn } from './dayCast';
import type { DaySceneSources } from './dayCast';

export interface ElementReportDay {
  dayId: string;
  dayName: string;
  date?: string;
}

export interface ElementReportRow {
  item: BreakdownItem;
  scenes: ScriptScene[];
  days: ElementReportDay[];
  characterNames: string[];
  /** Total page eighths of the scenes it appears in (omitted scenes excluded). */
  pageEighths: number;
}

export interface DeriveElementReportInput {
  items: readonly BreakdownItem[];
  /** Resolve an item to the scenes it was tagged in. */
  scenesForItem: (item: BreakdownItem) => ScriptScene[];
  characters: readonly Character[];
  days: readonly ProductionDay[];
  blocks: readonly ScheduleBlock[];
  /** Only this category; all categories when absent. */
  category?: BreakdownCategory;
  /** Setups, so setup and shot strips count as shooting their scene. */
  setups?: DaySceneSources['setups'];
  /** All script scenes, to resolve setup strips by scene number. */
  scriptScenes?: DaySceneSources['scriptScenes'];
}

export const deriveElementReport = (input: DeriveElementReportInput): ElementReportRow[] => {
  const daysByScene = new Map<string, ElementReportDay[]>();
  for (const day of input.days) {
    const ids = sceneIdsScheduledOn(day.scheduleBlockIds, input.blocks, {
      scriptScenes: input.scriptScenes,
      setups: input.setups,
    });
    for (const sceneId of ids) {
      const list = daysByScene.get(sceneId) ?? [];
      list.push({ dayId: day.id, dayName: day.name, date: day.date });
      daysByScene.set(sceneId, list);
    }
  }
  const dayOrder = new Map(input.days.map((day, index) => [day.id, index] as const));
  const characterName = new Map(input.characters.map((character) => [character.id, character.canonicalName] as const));

  return input.items
    .filter((item) => !input.category || item.category === input.category)
    .map((item) => {
      const scenes = input.scenesForItem(item);
      const days = new Map<string, ElementReportDay>();
      const names = new Set<string>();
      let pageEighths = 0;
      for (const scene of scenes) {
        for (const day of daysByScene.get(scene.id) ?? []) days.set(day.dayId, day);
        for (const id of scene.characterIds) {
          const name = characterName.get(id);
          if (name) names.add(name);
        }
        if (!scene.omitted) pageEighths += scene.pageLengthEighths ?? 0;
      }
      return {
        item,
        scenes,
        days: [...days.values()].sort((a, b) => (dayOrder.get(a.dayId) ?? 0) - (dayOrder.get(b.dayId) ?? 0)),
        characterNames: [...names].sort((a, b) => a.localeCompare(b)),
        pageEighths,
      };
    })
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
};
