/**
 * Schedule what-if: what moving one strip would do, before it is dropped.
 *
 * The board answers "where is this scene shot"; the expensive consequences
 * live elsewhere — a day that grows past its page count, a performer who now
 * has to be held (and paid) over a gap, or who can be dropped instead. This
 * applies the move to a copy with the real command and compares the two.
 */
import type { Project } from '../../types';
import { moveScheduleBlockCommand } from '../commands/moveScheduleBlock';
import { deriveDaySummary } from '../scheduling';
import { deriveDood } from './dood';
import { deriveOneLiner } from './oneLiner';

export interface WhatIfDay {
  dayId: string;
  dayName: string;
  pagesBefore: number;
  pagesAfter: number;
  minutesBefore: number;
  minutesAfter: number;
}

export interface WhatIfPerformer {
  name: string;
  /** Paid days (work + hold + travel + holiday) before → after. */
  paidBefore: number;
  paidAfter: number;
  holdBefore: number;
  holdAfter: number;
}

export interface ScheduleWhatIf {
  fromDayId: string | null;
  toDayId: string | null;
  days: WhatIfDay[];
  performers: WhatIfPerformer[];
  /** Change in paid cast days across the whole schedule. */
  paidDaysDelta: number;
}

const pagesByDay = (project: Project): Map<string, number> =>
  new Map(deriveOneLiner({
    days: project.productionDays ?? [],
    blocks: project.scheduleBlocks ?? [],
    scenes: project.scriptScenes ?? [],
    setups: project.setups,
  }).map((day) => [day.dayId, day.pageEighths] as const));

const doodOf = (project: Project) => deriveDood({
  days: project.productionDays ?? [],
  blocks: project.scheduleBlocks ?? [],
  characters: project.characters ?? [],
  castAssignments: project.castAssignments,
  people: project.people,
  castSources: { scriptScenes: project.scriptScenes, setups: project.setups, castAssignments: project.castAssignments },
  overrides: project.doodOverrides,
  dropAfterDays: project.doodDropAfterDays,
});

export const scheduleWhatIf = (project: Project, blockId: string, toDayId: string | null): ScheduleWhatIf | undefined => {
  const days = project.productionDays ?? [];
  const fromDay = days.find((day) => day.scheduleBlockIds.includes(blockId));
  const fromDayId = fromDay?.id ?? null;
  if (fromDayId === toDayId) return undefined;
  let after: Project;
  try {
    after = moveScheduleBlockCommand(project, { blockId, toDayId }).project;
  } catch {
    return undefined;
  }

  const pagesBefore = pagesByDay(project);
  const pagesAfter = pagesByDay(after);
  const affected = [fromDayId, toDayId].filter((id): id is string => !!id);
  const whatIfDays = affected.map((dayId): WhatIfDay => {
    const before = days.find((day) => day.id === dayId)!;
    const afterDay = (after.productionDays ?? []).find((day) => day.id === dayId)!;
    return {
      dayId,
      dayName: before.name,
      pagesBefore: pagesBefore.get(dayId) ?? 0,
      pagesAfter: pagesAfter.get(dayId) ?? 0,
      minutesBefore: deriveDaySummary(before, project.scheduleBlocks ?? []).totalEstimatedMinutes,
      minutesAfter: deriveDaySummary(afterDay, after.scheduleBlocks ?? []).totalEstimatedMinutes,
    };
  });

  const doodBefore = doodOf(project);
  const doodAfter = doodOf(after);
  const performers: WhatIfPerformer[] = [];
  let paidDaysDelta = 0;
  for (const row of doodBefore.rows) {
    const next = doodAfter.rows.find((candidate) => candidate.characterId === row.characterId);
    if (!next) continue;
    const delta = next.totals.total - row.totals.total;
    paidDaysDelta += delta;
    if (delta !== 0 || next.totals.hold !== row.totals.hold) {
      performers.push({
        name: row.displayName,
        paidBefore: row.totals.total,
        paidAfter: next.totals.total,
        holdBefore: row.totals.hold,
        holdAfter: next.totals.hold,
      });
    }
  }
  return { fromDayId, toDayId, days: whatIfDays, performers, paidDaysDelta };
};
