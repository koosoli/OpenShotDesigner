/**
 * Day Out Of Days (DOOD) matrix (plan §12.11).
 *
 * A pure derivation over the schedule: a character WORKS on a production day
 * when any scheduled 'scene' block that day references a script scene the
 * character appears in. Nothing here is persisted (plan §4.12 derived-view
 * rule / rule 37).
 */

import type { Character } from '../script/types';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import type { CastAssignment, Person } from '../people';

export type DoodWorkStatus = 'work' | 'hold' | 'start' | 'finish' | 'off';

export interface DoodCell {
  dayId: string;
  status: DoodWorkStatus;
}

export interface DoodRow {
  characterId: string;
  displayName: string;
  cells: DoodCell[];
}

export interface DoodColumn {
  dayId: string;
  dayName: string;
  date?: string;
}

export interface DeriveDoodInput {
  days: ProductionDay[];
  blocks: ScheduleBlock[];
  characters: Character[];
  castAssignments?: CastAssignment[];
  people?: Person[];
  /**
   * Resolve a script scene id to its character ids. Required to detect work
   * days unless `scenesPerCharacter` alone is supplied.
   */
  getSceneCharacterIds?: (scriptSceneId: string) => string[] | undefined;
  /** Optional refinement predicate on top of the base scene membership. */
  scenesPerCharacter?: (characterId: string, scriptSceneId: string) => boolean;
}

const dayBlocks = (day: ProductionDay, blocks: ScheduleBlock[]): ScheduleBlock[] =>
  day.scheduleBlockIds
    .map((id) => blocks.find((b) => b.id === id))
    .filter((b): b is ScheduleBlock => !!b);

/**
 * Build the DOOD matrix. Statuses per row:
 * - 'start'  first working day (also used when the single work day is both
 *            first and last)
 * - 'finish' last working day
 * - 'work'   intermediate working days
 * - 'hold'   non-working days strictly between first and last work day
 * - 'off'    days outside that range
 */
export const deriveDood = (input: DeriveDoodInput): {
  columns: DoodColumn[];
  rows: DoodRow[];
} => {
  const { days, blocks, characters, castAssignments = [], people = [] } = input;

  const columns: DoodColumn[] = days.map((day) => ({
    dayId: day.id,
    dayName: day.name,
    date: day.date,
  }));

  // Per character, which column indices are work days.
  const rows: DoodRow[] = characters.map((character) => {
    const assignment = castAssignments.find((a) => a.characterId === character.id);
    const person = assignment ? people.find((p) => p.id === assignment.personId) : undefined;
    const displayName = person?.displayName ?? character.canonicalName;

    const workIndices = new Set<number>();
    days.forEach((day, index) => {
      const works = dayBlocks(day, blocks).some((block) => {
        if (block.kind !== 'scene') return false;
        if (input.getSceneCharacterIds) {
          const memberIds = input.getSceneCharacterIds(block.scriptSceneId);
          return !!memberIds?.includes(character.id);
        }
        if (input.scenesPerCharacter) {
          return input.scenesPerCharacter(character.id, block.scriptSceneId);
        }
        return false;
      });
      if (works) workIndices.add(index);
    });

    const indices = [...workIndices].sort((a, b) => a - b);
    const first = indices[0];
    const last = indices[indices.length - 1];

    const cells: DoodCell[] = days.map((day, index) => {
      let status: DoodWorkStatus = 'off';
      if (workIndices.has(index)) {
        status = index === first ? 'start' : index === last ? 'finish' : 'work';
      } else if (first !== undefined && index > first && index < last) {
        status = 'hold';
      }
      return { dayId: day.id, status };
    });

    return { characterId: character.id, displayName, cells };
  });

  return { columns, rows };
};
