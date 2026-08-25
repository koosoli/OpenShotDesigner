/**
 * The end-of-day production report (plan §35) — the daily progress report, or
 * "the DPR", the sheet a production office reads before anything else.
 *
 * It answers one question in several ways: did today go the way it was meant
 * to. What was scheduled, what was actually shot, how many pages that came to,
 * how many setups, when the first shot went and when the last one did, and
 * whether the unit finished the day ahead of the plan or behind it.
 *
 * Every number is derived. Nothing here is typed twice: the plan comes from
 * the schedule, the actuals come from the continuity log, and the pages come
 * from the screenplay's own eighths. That is the whole reason this is worth
 * building rather than filling in by hand — a hand-typed DPR disagrees with
 * the take log within a week.
 *
 * ## Where the actual times come from, and what they are not
 *
 * The log records `loggedAt` per take and nothing else: there is no "camera
 * rolled" clock in this app, and inventing one would mean asking the person
 * logging continuity to press two more buttons per take, which is how a log
 * stops being kept. So the first and last times reported here are the first
 * and last TAKES LOGGED, and they are labelled as that. They bracket the
 * shooting day tightly enough to be useful and are not the same thing as call
 * and wrap — a unit that spends the first hour lighting has a first take
 * later than its call, which is the normal case and not a delay.
 *
 * Everything is honest about missing inputs (rule 13). A day where no strip
 * carries an estimate reports its schedule variance as unknown rather than as
 * zero; a screenplay with no page lengths reports pages as unknown rather than
 * as none.
 */

import type { Take } from '../continuity';
import { dayChecklist } from '../continuity';
import type { ChecklistShot, ChecklistSources } from '../continuity';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import { formatDurationHours, parseClockMinutes } from '../scheduling/clock';
import type { LogisticsJourneyStage } from '../logistics';

/** How a scene fared on the day. */
export interface DailyProgressScene {
  sceneNumber: string;
  /** Page length in eighths, when the screenplay records one. */
  pageEighths?: number;
  plannedShots: number;
  coveredShots: number;
  /** Every planned shot has a good take. */
  complete: boolean;
}

export interface DailyProgressReport {
  productionDayId: string;
  dayName: string;
  date?: string;
  crewCall?: string;
  plannedWrap?: string;

  /** Scenes scheduled for the day, in schedule order. */
  scenes: DailyProgressScene[];
  scenesScheduled: number;
  /** Scenes where every planned shot has a good take. */
  scenesCompleted: number;

  /**
   * Page eighths scheduled and covered, or null when ANY scheduled scene has
   * no recorded length — a partial page count read as a total is the number
   * most likely to be quoted at a production meeting.
   */
  pagesScheduledEighths: number | null;
  pagesCoveredEighths: number | null;

  /** Distinct setups the day's planned shots belong to. */
  setupsScheduled: number;
  setupsCompleted: number;

  shotsScheduled: number;
  /** Planned shots with a good take today. */
  shotsCovered: number;
  /** Planned shots with takes but nothing marked good. */
  shotsAttempted: number;
  /** Planned shots with no takes at all — the gap list. */
  shotsNotShot: ChecklistShot[];
  /** Shot today without being planned for today: pickups, safeties, inserts. */
  shotsUnscheduled: ChecklistShot[];

  takesLogged: number;
  takesGood: number;
  takesNg: number;

  /** Clock time of the first take logged, `HH:MM`, in the reader's zone. */
  firstTakeAt?: string;
  lastTakeAt?: string;
  /** Between them, as `9h 05m`. */
  shootingSpanMinutes?: number;

  /**
   * Scheduled minutes for the strips whose shots were all covered, against the
   * minutes actually spent between the first and last take. Negative is ahead
   * of schedule. Null when the day has no usable estimates or too few takes to
   * measure a span — reporting "on schedule" from no data is worse than
   * reporting nothing.
   */
  scheduleVarianceMinutes: number | null;
  /** Ready to print: "1h 20m behind", "on schedule", or undefined. */
  scheduleVarianceLabel?: string;

  /**
   * The containers routed to this day, with wherever the transport captain has
   * marked them. Absent means nobody marked it — printed as "not marked",
   * which is a different fact from "packed" and the one an AD actually needs
   * when a case everyone assumed was on the truck is still in the warehouse.
   * The whole section is absent when the caller supplies no containers at all.
   */
  gearMovement?: GearMovementRow[];
}

/** One container on the day's report. */
export interface GearMovementRow {
  id: string;
  name: string;
  kind: string;
  journey?: LogisticsJourneyStage;
}

export interface DailyProgressSources extends ChecklistSources {
  /** Scenes, for their page lengths. Optional: a project may have no script. */
  scriptScenes?: Array<{ id: string; sceneNumber?: string; pageLengthEighths?: number }>;
  /**
   * Containers routed to a day, for the gear-movement section. Optional: a
   * project may have no logistics module enabled, and a report without the
   * section is honest where one with an empty list would claim the fleet was
   * accounted for.
   */
  containersForDay?: (day: ProductionDay) => ReadonlyArray<{
    id: string;
    name: string;
    kind: string;
    journey?: LogisticsJourneyStage;
  }>;
}

/**
 * A take's clock time, in the zone times are being read in.
 *
 * `loggedAt` is an ISO instant, so this is a display conversion rather than a
 * fact about the day. The zone is the caller's to supply — a producer reading
 * a report from another continent should see the unit's clock, not their own —
 * and defaults to the machine's, which is what it did before there was
 * anywhere to say otherwise.
 */
const clockOf = (iso: string | undefined, timeZone?: string): string | undefined => {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    // An unreadable zone is not a reason to lose the time; the caller's own
    // daylight logic already reports a bad zone in words.
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }
};

const msOf = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? null : value;
};

/** Scene numbers in schedule order, deduplicated, from the day's planned shots. */
const sceneOrderOf = (planned: readonly ChecklistShot[]): string[] => {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const shot of planned) {
    const sceneNumber = shot.sceneNumber?.trim();
    if (!sceneNumber || seen.has(sceneNumber)) continue;
    seen.add(sceneNumber);
    order.push(sceneNumber);
  }
  return order;
};

/**
 * Estimated minutes for the strips on this day whose planned shots were all
 * covered, and whether every one of them carried an estimate.
 *
 * Only completed strips count. A strip half-shot has spent time that produced
 * something, and crediting its whole estimate would report a day as on
 * schedule that is in fact a scene short.
 */
const completedScheduleMinutes = (
  day: ProductionDay,
  blocks: readonly ScheduleBlock[],
  sources: DailyProgressSources,
  coveredShotIds: ReadonlySet<string>,
): { minutes: number; complete: boolean } => {
  const byId = new Map(blocks.map((block) => [block.id, block] as const));
  const setups = sources.setups ?? [];
  let minutes = 0;
  let complete = true;

  /** The planned shots a strip stands for. */
  const shotsOfBlock = (block: ScheduleBlock): string[] => {
    switch (block.kind) {
      case 'shots':
        return [...block.shotIds];
      case 'setup':
        return (setups.find((setup) => setup.id === block.setupId)?.shots ?? [])
          .filter((shot) => shot.unplanned !== true)
          .map((shot) => shot.id);
      case 'scene': {
        const scene = sources.scriptScenes?.find((entry) => entry.id === block.scriptSceneId);
        const sceneNumber = scene?.sceneNumber;
        if (!sceneNumber) return [];
        return setups
          .filter((setup) => setup.sceneNumber === sceneNumber)
          .flatMap((setup) =>
            (setup.shots ?? []).filter((shot) => shot.unplanned !== true).map((shot) => shot.id),
          );
      }
      default:
        // Meals, moves, banners and cues schedule no shots, so there is no
        // "was it covered" to ask. Their time is real and counts once the day
        // has any completed work at all.
        return [];
    }
  };

  for (const blockId of day.scheduleBlockIds) {
    const block = byId.get(blockId);
    if (!block) continue;
    const shotIds = shotsOfBlock(block);
    const isWork = shotIds.length > 0;
    if (isWork && !shotIds.every((shotId) => coveredShotIds.has(shotId))) continue;
    const estimate = block.estimatedMinutes;
    if (typeof estimate !== 'number' || !Number.isFinite(estimate)) {
      complete = false;
      continue;
    }
    minutes += estimate;
  }

  return { minutes, complete };
};

export interface DailyProgressOptions {
  /** Zone the clock times are printed in. Defaults to the machine's. */
  timeZone?: string;
  /**
   * Minutes either side of the estimate that still read as on schedule.
   * Default 15 — a DPR that says "3 minutes behind" is noise.
   */
  onScheduleToleranceMinutes?: number;
}

/**
 * The report for one shooting day.
 *
 * `allTakes` is the whole log rather than the day's, because `dayChecklist`
 * scopes coverage to the day itself: a shot carried over from yesterday shows
 * today's takes, and "did we get it TODAY" is the question a DPR answers.
 */
export const dailyProgressReport = (
  day: ProductionDay,
  blocks: readonly ScheduleBlock[],
  sources: DailyProgressSources,
  allTakes: readonly Take[],
  options: DailyProgressOptions = {},
): DailyProgressReport => {
  const tolerance = options.onScheduleToleranceMinutes ?? 15;
  const checklist = dayChecklist(day.scheduleBlockIds, blocks, sources, allTakes, day.id);
  const dayTakes = allTakes.filter((take) => take.productionDayId === day.id);

  const coveredShotIds = new Set(
    checklist.planned.filter((shot) => shot.covered).map((shot) => shot.shotId),
  );

  // Scenes, in schedule order, with their pages and their coverage.
  const sceneNumbers = sceneOrderOf(checklist.planned);
  const scenes: DailyProgressScene[] = sceneNumbers.map((sceneNumber) => {
    const shots = checklist.planned.filter((shot) => shot.sceneNumber === sceneNumber);
    const covered = shots.filter((shot) => shot.covered).length;
    const scriptScene = sources.scriptScenes?.find(
      (entry) => entry.sceneNumber?.trim() === sceneNumber,
    );
    const pageEighths = scriptScene?.pageLengthEighths;
    return {
      sceneNumber,
      ...(typeof pageEighths === 'number' && Number.isFinite(pageEighths) ? { pageEighths } : {}),
      plannedShots: shots.length,
      coveredShots: covered,
      complete: shots.length > 0 && covered === shots.length,
    };
  });

  // Pages, or null the moment any scheduled scene has no recorded length —
  // "we shot 2 4/8 pages" from a partial sum is the number most likely to be
  // repeated at a production meeting, and the hardest to trace afterwards.
  const everyScenePaged = scenes.length > 0 && scenes.every((scene) => scene.pageEighths !== undefined);
  const pagesScheduledEighths = everyScenePaged
    ? scenes.reduce((sum, scene) => sum + (scene.pageEighths as number), 0)
    : null;
  const pagesCoveredEighths = everyScenePaged
    ? scenes
        .filter((scene) => scene.complete)
        .reduce((sum, scene) => sum + (scene.pageEighths as number), 0)
    : null;

  const plannedSetupIds = new Set(checklist.planned.map((shot) => shot.setupId));
  const completedSetupIds = new Set(
    [...plannedSetupIds].filter((setupId) =>
      checklist.planned
        .filter((shot) => shot.setupId === setupId)
        .every((shot) => shot.covered),
    ),
  );

  const loggedTimes = dayTakes
    .map((take) => msOf(take.loggedAt))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const firstMs = loggedTimes[0];
  const lastMs = loggedTimes[loggedTimes.length - 1];
  const spanMinutes =
    loggedTimes.length > 1 ? Math.round((lastMs - firstMs) / 60000) : undefined;

  const scheduled = completedScheduleMinutes(day, blocks, sources, coveredShotIds);
  const variance =
    scheduled.complete && spanMinutes !== undefined && scheduled.minutes > 0
      ? spanMinutes - scheduled.minutes
      : null;
  const varianceLabel =
    variance === null
      ? undefined
      : Math.abs(variance) <= tolerance
        ? 'on schedule'
        : `${formatDurationHours(Math.abs(variance))} ${variance > 0 ? 'behind' : 'ahead'}`;

  return {
    productionDayId: day.id,
    dayName: day.name,
    ...(day.date ? { date: day.date } : {}),
    ...(day.crewCall ? { crewCall: day.crewCall } : {}),
    ...(day.plannedWrap ? { plannedWrap: day.plannedWrap } : {}),

    scenes,
    scenesScheduled: scenes.length,
    scenesCompleted: scenes.filter((scene) => scene.complete).length,

    pagesScheduledEighths,
    pagesCoveredEighths,

    setupsScheduled: plannedSetupIds.size,
    setupsCompleted: completedSetupIds.size,

    shotsScheduled: checklist.planned.length,
    shotsCovered: coveredShotIds.size,
    shotsAttempted: checklist.noGoodTake.length,
    shotsNotShot: checklist.notShot,
    shotsUnscheduled: checklist.unscheduled,

    takesLogged: dayTakes.length,
    takesGood: dayTakes.filter((take) => take.isGoodTake === true).length,
    takesNg: dayTakes.filter((take) => take.isGoodTake === false).length,

    ...(firstMs !== undefined
      ? { firstTakeAt: clockOf(new Date(firstMs).toISOString(), options.timeZone) }
      : {}),
    ...(lastMs !== undefined && loggedTimes.length > 1
      ? { lastTakeAt: clockOf(new Date(lastMs).toISOString(), options.timeZone) }
      : {}),
    ...(spanMinutes !== undefined ? { shootingSpanMinutes: spanMinutes } : {}),

    scheduleVarianceMinutes: variance,
    ...(varianceLabel ? { scheduleVarianceLabel: varianceLabel } : {}),

    ...(sources.containersForDay
      ? {
          gearMovement: sources
            .containersForDay(day)
            .map((container) => ({
              id: container.id,
              name: container.name,
              kind: container.kind,
              ...(container.journey ? { journey: container.journey } : {}),
            })),
        }
      : {}),
  };
};

/**
 * Page eighths as a production writes them: 20 → `2 4/8`, 8 → `1`, 3 → `3/8`.
 *
 * Eighths and not a decimal, because that is the unit a schedule is built in
 * and "2.5 pages" is not a thing anyone says on a set.
 */
export const formatPageEighths = (eighths: number | null | undefined): string => {
  if (eighths === null || eighths === undefined || !Number.isFinite(eighths)) return '—';
  const whole = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  if (whole === 0 && remainder === 0) return '0';
  if (remainder === 0) return String(whole);
  if (whole === 0) return `${remainder}/8`;
  return `${whole} ${remainder}/8`;
};

/** The shooting span as `9h 05m`, or a dash. */
export const formatSpan = (minutes: number | undefined): string =>
  minutes === undefined ? '—' : formatDurationHours(minutes);

/**
 * The day's window from its own call and wrap, for the header line. Null when
 * either is missing or not a plain clock time.
 */
export const plannedDayMinutes = (day: ProductionDay): number | null => {
  const call = parseClockMinutes(day.crewCall);
  const wrap = parseClockMinutes(day.plannedWrap);
  if (call === null || wrap === null) return null;
  return wrap > call ? wrap - call : wrap + 1440 - call;
};
