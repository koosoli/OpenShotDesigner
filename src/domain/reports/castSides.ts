/**
 * Sides for every performer called on a shooting day: the day's scenes, in
 * shooting order, kept to the ones each character speaks in. One entry per
 * character with dialogue that day — a character who is only scheduled (no
 * lines) gets no sides, because blank sides are worse than none.
 */
import type { ScheduleBlock } from '../scheduling';
import type { CastAssignment, Person } from '../people';
import { buildScriptSides } from '../script/sides';
import type { SidesLine } from '../script/sides';
import { sceneIdsScheduledOn } from './dayCast';
import type { DaySceneSources } from './dayCast';

export interface CastSidesEntry {
  /** Canonical character name, as the cue reads ("ALEX"). */
  character: string;
  characterId: string;
  performer?: string;
  castNumber?: number;
  /** The day's scenes this character speaks in, in shooting order. */
  sceneIds: string[];
}

export const castSidesForDay = (
  scheduleBlockIds: readonly string[],
  blocks: readonly ScheduleBlock[],
  sources: DaySceneSources & {
    scriptLines: readonly SidesLine[];
    characters: ReadonlyArray<{ id: string; canonicalName: string }>;
    castAssignments?: readonly CastAssignment[];
    people?: readonly Person[];
  },
): CastSidesEntry[] => {
  const dayScenes = [...sceneIdsScheduledOn(scheduleBlockIds, blocks, sources)];
  if (dayScenes.length === 0) return [];
  const entries: CastSidesEntry[] = [];
  for (const character of sources.characters) {
    const sides = buildScriptSides(sources.scriptLines, { sceneIds: dayScenes, character: character.canonicalName, skipOmitted: true });
    if (sides.scenes.length === 0) continue;
    const assignment = sources.castAssignments?.find((candidate) => candidate.characterId === character.id);
    const person = assignment ? sources.people?.find((candidate) => candidate.id === assignment.personId) : undefined;
    entries.push({
      character: character.canonicalName,
      characterId: character.id,
      ...(person ? { performer: person.displayName } : {}),
      ...(assignment?.castNumber !== undefined ? { castNumber: assignment.castNumber } : {}),
      sceneIds: sides.scenes.map((scene) => scene.sceneId),
    });
  }
  return entries.sort((a, b) => (a.castNumber ?? Number.MAX_SAFE_INTEGER) - (b.castNumber ?? Number.MAX_SAFE_INTEGER) || a.character.localeCompare(b.character));
};
