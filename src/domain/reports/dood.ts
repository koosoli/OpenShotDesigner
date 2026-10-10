/**
 * Day Out Of Days (DOOD) matrix (plan §12.11).
 *
 * A pure derivation over the schedule: a character WORKS on a production day
 * when any scheduled 'scene' block that day references a script scene the
 * character appears in. Nothing here is derived-and-stored (plan §4.12
 * derived-view rule / rule 37); the only persisted input is the producer's
 * hand-entered marks (`DoodOverride`) for things a schedule cannot know —
 * travel, a wardrobe fitting, a paid holiday.
 *
 * The codes are the industry ones a payroll accountant expects:
 *   SW  start work            W   work            WF  work finish
 *   SWF start-work-finish (a one-day performer)
 *   H   hold (paid, not working, between first and last day)
 *   WD  work-drop  /  PW  pick-up work — a long gap where the performer is
 *       dropped and picked up again instead of being held and paid. SAG-AFTRA
 *       allows one drop/pick-up per performer when the gap is long enough
 *       (ten or more calendar days for a day performer), so only the longest
 *       qualifying gap is dropped.
 *   T   travel     R  rehearsal     F  fitting     HO  holiday
 */

import type { Character } from '../script/types';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import type { CastAssignment, Person } from '../people';
import { charactersScheduledOn, sceneIdsScheduledOn } from './dayCast';
import type { DayCastSources, DaySceneSources } from './dayCast';

export type DoodWorkStatus =
  | 'work'
  | 'hold'
  | 'start'
  | 'finish'
  | 'start_finish'
  | 'drop'
  | 'pickup'
  | 'travel'
  | 'rehearsal'
  | 'fitting'
  | 'holiday'
  | 'off';

/** Statuses a person can set by hand on one cell. */
export type DoodManualStatus = 'travel' | 'rehearsal' | 'fitting' | 'holiday' | 'hold' | 'off';

/**
 * One hand-entered DOOD cell. Persisted on the project (`doodOverrides`).
 * `rowId` is a character id for the cast DOOD, or `${kind}:${id}` for the
 * element DOODs (locations, props…), so one list serves every matrix.
 */
export interface DoodOverride {
  rowId: string;
  dayId: string;
  status: DoodManualStatus;
}

export const DOOD_MANUAL_STATUSES: readonly DoodManualStatus[] = [
  'travel',
  'rehearsal',
  'fitting',
  'holiday',
  'hold',
  'off',
];

export interface DoodStatusMeta {
  /** Printed code. */
  code: string;
  title: string;
  /** Whether the day is paid as a work day. */
  counts: 'work' | 'hold' | 'travel' | 'holiday' | 'none';
}

export const DOOD_STATUS_META: Record<DoodWorkStatus, DoodStatusMeta> = {
  start: { code: 'SW', title: 'Start work', counts: 'work' },
  work: { code: 'W', title: 'Work', counts: 'work' },
  finish: { code: 'WF', title: 'Work finish', counts: 'work' },
  start_finish: { code: 'SWF', title: 'Start-work-finish (one day)', counts: 'work' },
  drop: { code: 'WD', title: 'Work, then drop (picked up later)', counts: 'work' },
  pickup: { code: 'PW', title: 'Pick-up work after a drop', counts: 'work' },
  hold: { code: 'H', title: 'Hold (paid, not working)', counts: 'hold' },
  travel: { code: 'T', title: 'Travel', counts: 'travel' },
  rehearsal: { code: 'R', title: 'Rehearsal', counts: 'work' },
  fitting: { code: 'F', title: 'Fitting', counts: 'none' },
  holiday: { code: 'HO', title: 'Holiday', counts: 'holiday' },
  off: { code: '', title: 'Off', counts: 'none' },
};

export const doodStatusCode = (status: DoodWorkStatus): string => DOOD_STATUS_META[status]?.code ?? '';

export interface DoodCell {
  dayId: string;
  status: DoodWorkStatus;
  /** True when the status came from a hand-entered override. */
  manual?: boolean;
}

export interface DoodTotals {
  work: number;
  hold: number;
  travel: number;
  holiday: number;
  rehearsal: number;
  fitting: number;
  /** Paid days: work + hold + travel + holiday. */
  total: number;
  /** Date (or day name) of the first and last working day. */
  start?: string;
  finish?: string;
}

export interface DoodRow {
  /** Character id for the cast DOOD; `${kind}:${id}` for element rows. */
  characterId: string;
  displayName: string;
  /** Character name when a performer name is displayed instead. */
  roleName?: string;
  castNumber?: number;
  cells: DoodCell[];
  totals: DoodTotals;
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
  /**
   * Resolve work days the way the call sheet does — scene strips, setup
   * strips (actors on the plan) and shot strips alike. When given it is used
   * instead of the two scene-only resolvers above, so a production that
   * schedules by setup gets a DOOD too.
   */
  castSources?: DayCastSources;
  /** Hand-entered cells. */
  overrides?: readonly DoodOverride[];
  /**
   * Minimum gap, in calendar days between two work days, that is dropped
   * rather than held. Undated schedules count schedule days instead. Set 0 to
   * never drop. Default 10.
   */
  dropAfterDays?: number;
  /** Omit rows that never work and have no manual cells. Default false. */
  hideIdle?: boolean;
}

const dayBlocks = (day: ProductionDay, blocks: ScheduleBlock[]): ScheduleBlock[] =>
  day.scheduleBlockIds
    .map((id) => blocks.find((b) => b.id === id))
    .filter((b): b is ScheduleBlock => !!b);

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDayNumber = (date?: string): number | undefined => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const ms = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Number.isFinite(ms) ? Math.round(ms / DAY_MS) : undefined;
};

/** Paid-day totals for one row. */
export const doodTotals = (cells: readonly DoodCell[], columns: readonly DoodColumn[]): DoodTotals => {
  const totals: DoodTotals = { work: 0, hold: 0, travel: 0, holiday: 0, rehearsal: 0, fitting: 0, total: 0 };
  cells.forEach((cell, index) => {
    const meta = DOOD_STATUS_META[cell.status];
    if (cell.status === 'rehearsal') totals.rehearsal += 1;
    if (cell.status === 'fitting') totals.fitting += 1;
    if (meta.counts === 'work') {
      totals.work += 1;
      const column = columns[index];
      const label = column?.date ?? column?.dayName;
      if (totals.start === undefined) totals.start = label;
      totals.finish = label;
    } else if (meta.counts === 'hold') totals.hold += 1;
    else if (meta.counts === 'travel') totals.travel += 1;
    else if (meta.counts === 'holiday') totals.holiday += 1;
  });
  totals.total = totals.work + totals.hold + totals.travel + totals.holiday;
  return totals;
};

/**
 * Turn the set of working day indices for one row into cells.
 * Exported so element DOODs (locations, props) share the exact rules.
 */
export const doodCellsFromWorkDays = (
  days: readonly ProductionDay[],
  workIndices: ReadonlySet<number>,
  options: {
    rowId: string;
    overrides?: readonly DoodOverride[];
    dropAfterDays?: number;
    /** Day indices whose work is a rehearsal rather than a shoot. */
    rehearsalIndices?: ReadonlySet<number>;
  },
): DoodCell[] => {
  const indices = [...workIndices].sort((a, b) => a - b);
  const first = indices[0];
  const last = indices[indices.length - 1];
  const dropAfter = options.dropAfterDays ?? 10;

  // The longest gap that qualifies for a drop/pick-up.
  let dropFrom: number | undefined;
  let dropTo: number | undefined;
  if (dropAfter > 0 && indices.length > 1) {
    let longest = 0;
    for (let i = 1; i < indices.length; i += 1) {
      const a = indices[i - 1];
      const b = indices[i];
      if (b - a < 2) continue;
      const fromDate = isoDayNumber(days[a]?.date);
      const toDate = isoDayNumber(days[b]?.date);
      // Free days between the two work days.
      const gap = fromDate !== undefined && toDate !== undefined ? toDate - fromDate - 1 : b - a - 1;
      if (gap >= dropAfter && gap > longest) {
        longest = gap;
        dropFrom = a;
        dropTo = b;
      }
    }
  }

  const overrideByDay = new Map(
    (options.overrides ?? [])
      .filter((override) => override.rowId === options.rowId)
      .map((override) => [override.dayId, override.status] as const),
  );

  return days.map((day, index) => {
    const manual = overrideByDay.get(day.id);
    if (manual) return { dayId: day.id, status: manual, manual: true };
    let status: DoodWorkStatus = 'off';
    if (workIndices.has(index)) {
      if (options.rehearsalIndices?.has(index)) status = 'rehearsal';
      else if (index === first && index === last) status = 'start_finish';
      else if (index === dropFrom) status = 'drop';
      else if (index === dropTo) status = index === last ? 'finish' : 'pickup';
      else if (index === first) status = 'start';
      else if (index === last) status = 'finish';
      else status = 'work';
    } else if (
      first !== undefined &&
      index > first &&
      index < last &&
      !(dropFrom !== undefined && dropTo !== undefined && index > dropFrom && index < dropTo)
    ) {
      status = 'hold';
    }
    return { dayId: day.id, status };
  });
};

/**
 * Build the DOOD matrix. Rows are ordered by cast number (numbered roles
 * first), then by name.
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

  const rehearsalIndices = new Set(
    days.flatMap((day, index) => (day.callSheet?.type === 'rehearsal' ? [index] : [])),
  );

  const scheduledByDay = input.castSources
    ? days.map((day) => charactersScheduledOn(day.scheduleBlockIds, blocks, input.castSources!))
    : undefined;

  const rows: DoodRow[] = characters.map((character) => {
    const assignment = castAssignments.find((a) => a.characterId === character.id);
    const person = assignment ? people.find((p) => p.id === assignment.personId) : undefined;
    const displayName = person?.displayName ?? character.canonicalName;

    const workIndices = new Set<number>();
    days.forEach((day, index) => {
      if (scheduledByDay) {
        if (scheduledByDay[index].has(character.id)) workIndices.add(index);
        return;
      }
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

    const cells = doodCellsFromWorkDays(days, workIndices, {
      rowId: character.id,
      overrides: input.overrides,
      dropAfterDays: input.dropAfterDays,
      rehearsalIndices,
    });

    const row: DoodRow = {
      characterId: character.id,
      displayName,
      cells,
      totals: doodTotals(cells, columns),
    };
    if (person) row.roleName = character.canonicalName;
    if (assignment) row.castNumber = assignment.castNumber;
    return row;
  });

  const visible = input.hideIdle
    ? rows.filter((row) => row.cells.some((cell) => cell.status !== 'off'))
    : rows;

  const ordered = [...visible].sort((a, b) => {
    if (a.castNumber !== undefined && b.castNumber !== undefined) return a.castNumber - b.castNumber;
    if (a.castNumber !== undefined) return -1;
    if (b.castNumber !== undefined) return 1;
    return 0;
  });

  return { columns, rows: ordered };
};

/** A thing that is "on the day" when any of its scenes is scheduled. */
export interface DoodElementSource {
  /** Row id, conventionally `${kind}:${id}`. */
  rowId: string;
  name: string;
  sceneIds: ReadonlySet<string>;
}

/**
 * DOOD for anything that follows scenes around the schedule — a location, a
 * vehicle, a picture car, an animal. Same codes and drop rule as cast.
 */
export const deriveElementDood = (input: {
  days: ProductionDay[];
  blocks: ScheduleBlock[];
  elements: readonly DoodElementSource[];
  overrides?: readonly DoodOverride[];
  dropAfterDays?: number;
  /** Lets setup and shot strips count as shooting their scene. */
  sceneSources?: DaySceneSources;
}): { columns: DoodColumn[]; rows: DoodRow[] } => {
  const columns: DoodColumn[] = input.days.map((day) => ({ dayId: day.id, dayName: day.name, date: day.date }));
  const daySceneIds = input.days.map((day) => sceneIdsScheduledOn(day.scheduleBlockIds, input.blocks, input.sceneSources ?? {}));
  const rows = input.elements.map((element) => {
    const workIndices = new Set<number>();
    daySceneIds.forEach((ids, index) => {
      for (const id of element.sceneIds) {
        if (ids.has(id)) {
          workIndices.add(index);
          break;
        }
      }
    });
    const cells = doodCellsFromWorkDays(input.days, workIndices, {
      rowId: element.rowId,
      overrides: input.overrides,
      dropAfterDays: input.dropAfterDays ?? 0,
    });
    return { characterId: element.rowId, displayName: element.name, cells, totals: doodTotals(cells, columns) };
  }).filter((row) => row.cells.some((cell) => cell.status !== 'off'));
  return { columns, rows };
};

/** Replace (or clear, with `status: null`) one hand-entered cell. */
export const setDoodOverride = (
  overrides: readonly DoodOverride[] | undefined,
  rowId: string,
  dayId: string,
  status: DoodManualStatus | null,
): DoodOverride[] => {
  const rest = (overrides ?? []).filter((entry) => !(entry.rowId === rowId && entry.dayId === dayId));
  return status ? [...rest, { rowId, dayId, status }] : rest;
};
