/**
 * Schedule health warnings (plan §15).
 *
 * The stripboard already knows everything these checks need: which days exist,
 * what is on them, where those things shoot and when the unit is called. What
 * it does not do is read the schedule back and say the awkward thing out loud
 * — that Tuesday moves the whole unit three times, that Wednesday's call is
 * nine hours after Tuesday's wrap, that Thursday has eleven hours of work
 * inside a ten-hour day.
 *
 * Every rule here is arithmetic on data the user already entered. Nothing is
 * inferred and nothing is invented: a day with no wrap time raises no
 * turnaround warning rather than assuming one (rule 13), and a location with
 * no pin contributes no distance rather than counting as the origin.
 *
 * The thresholds are parameters with documented defaults, because they are
 * agreements rather than facts: ten hours' turnaround is the common minimum in
 * several territories and eleven or twelve in others, and a commercial shooting
 * four setups in a studio has a different idea of "too many moves" than a
 * feature on location. A production that disagrees changes the number rather
 * than learning to ignore the list.
 *
 * Planning aid, not compliance (rule 15). None of this is a substitute for the
 * agreement a production actually works under.
 */

import type { ProductionDay, ScheduleBlock } from './types';
import { formatDurationHours, minutesBetweenDays, parseClockMinutes } from './clock';
import { widestSeparation } from '../locations/distance';

export type ScheduleIssueCode =
  /** More separate shooting locations in one day than `maxCompanyMoves` allows. */
  | 'company_moves'
  /** Two of a day's locations are further apart than `maxSpreadKm`. */
  | 'distant_locations'
  /** A cast member works two locations more than `maxSpreadKm` apart in a day. */
  | 'cast_split_across_locations'
  /** Less than `minTurnaroundMinutes` between one day's wrap and the next call. */
  | 'short_turnaround'
  /** The day's estimated work does not fit between its call and its wrap. */
  | 'day_overruns'
  /** A cast member is called on a day inside a range they are marked unavailable. */
  | 'cast_unavailable';

export type ScheduleIssueSeverity = 'warning' | 'note';

export interface ScheduleIssue {
  code: ScheduleIssueCode;
  severity: ScheduleIssueSeverity;
  /** The day the issue is about. For turnaround, the day whose CALL is early. */
  productionDayId: string;
  dayName: string;
  /** For turnaround: the day that wrapped late. */
  relatedDayId?: string;
  message: string;
}

/** A shooting location as these checks need it. */
export interface HealthLocation {
  name: string;
  lat?: number;
  lng?: number;
}

export interface ScheduleHealthThresholds {
  /**
   * Separate locations in a day before it is worth a note. Default 2 — one
   * move is routine, two is a day the AD should be looking at.
   */
  maxCompanyMoves?: number;
  /**
   * Kilometres between a day's locations before it is worth a warning.
   * Default 25: far enough that two addresses in one town do not trip it,
   * close enough to catch a day that crosses a region. Straight-line (see
   * `locations/distance.ts`), so a short hop over an estuary can read as near.
   */
  maxSpreadKm?: number;
  /**
   * Minutes between wrap and the next call. Default 600 — ten hours, the
   * common minimum. Productions working to eleven or twelve set it here.
   */
  minTurnaroundMinutes?: number;
  /**
   * Minutes of estimated work over the day's own call-to-wrap window before
   * it is worth a warning. Default 0: the window is what the production
   * published, so anything past it is already over.
   */
  overrunGraceMinutes?: number;
}

export interface ScheduleHealthSources {
  days: readonly ProductionDay[];
  blocks: readonly ScheduleBlock[];
  /** The day's shooting locations, already resolved (`resolveDayLocations`). */
  locationsForDay: (day: ProductionDay) => readonly HealthLocation[];
  /**
   * People called on the day, by id (`charactersScheduledOn` resolved through
   * cast assignments, or whatever the caller has). Optional: without it the
   * cast-split check is skipped rather than approximated.
   */
  castForDay?: (day: ProductionDay) => ReadonlySet<string>;
  /** Display name for a person id, for the message. */
  personName?: (personId: string) => string | undefined;
  /**
   * Is this person marked unavailable on this day? Optional: without it the
   * availability check is skipped rather than guessed at. The caller resolves
   * the ranges — here as everywhere, the health check reads answers rather
   * than reaching into people.
   */
  personUnavailableOn?: (personId: string, day: ProductionDay) => boolean;
}

const DEFAULTS: Required<ScheduleHealthThresholds> = {
  maxCompanyMoves: 2,
  maxSpreadKm: 25,
  minTurnaroundMinutes: 600,
  overrunGraceMinutes: 0,
};

/** Distinct locations by name; two strips at one address are not two moves. */
const distinctLocations = (locations: readonly HealthLocation[]): HealthLocation[] => {
  const seen = new Set<string>();
  const out: HealthLocation[] = [];
  for (const location of locations) {
    const key = location.name.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(location);
  }
  return out;
};

/** Estimated minutes of everything scheduled on a day, and whether any is missing. */
const estimatedMinutesOn = (
  day: ProductionDay,
  blocks: readonly ScheduleBlock[],
): { minutes: number; complete: boolean } => {
  const byId = new Map(blocks.map((block) => [block.id, block] as const));
  let minutes = 0;
  let complete = true;
  for (const blockId of day.scheduleBlockIds) {
    const block = byId.get(blockId);
    if (!block) continue;
    const estimate = block.estimatedMinutes;
    if (typeof estimate !== 'number' || !Number.isFinite(estimate)) {
      // One unestimated strip means the total is a floor, not a total. Saying
      // "11h of work in a 10h day" from a partial sum would be a number the
      // user cannot check against anything on screen.
      complete = false;
      continue;
    }
    minutes += estimate;
  }
  return { minutes, complete };
};

/**
 * Every schedule warning, in day order.
 *
 * An empty result means these five questions found nothing, not that the
 * schedule is sound — the caller should say so rather than printing a tick.
 */
export const scheduleIssues = (
  sources: ScheduleHealthSources,
  thresholds: ScheduleHealthThresholds = {},
): ScheduleIssue[] => {
  const limits = { ...DEFAULTS, ...thresholds };
  const issues: ScheduleIssue[] = [];
  const days = sources.days;

  days.forEach((day, index) => {
    const locations = distinctLocations(sources.locationsForDay(day));

    if (locations.length > limits.maxCompanyMoves) {
      issues.push({
        code: 'company_moves',
        severity: 'note',
        productionDayId: day.id,
        dayName: day.name,
        message: `${day.name} shoots at ${locations.length} locations — ${
          locations.length - 1
        } company moves.`,
      });
    }

    const gap = widestSeparation(locations);
    if (gap && gap.km > limits.maxSpreadKm) {
      issues.push({
        code: 'distant_locations',
        severity: 'warning',
        productionDayId: day.id,
        dayName: day.name,
        message: `${day.name} spans ${Math.round(gap.km)} km — ${gap.from.name} to ${
          gap.to.name
        } (straight line).`,
      });

      // Which performers actually have to make that move. Only asked once the
      // day is already known to be spread out, and only when the caller can
      // answer it: a wide day with no cast in common is a unit problem, and a
      // wide day that one actor is booked across is a different one.
      const cast = sources.castForDay?.(day);
      if (cast && cast.size > 0) {
        const names = [...cast]
          .map((personId) => sources.personName?.(personId) ?? personId)
          .sort((a, b) => a.localeCompare(b));
        issues.push({
          code: 'cast_split_across_locations',
          severity: 'warning',
          productionDayId: day.id,
          dayName: day.name,
          message: `${names.length} cast member${
            names.length === 1 ? ' is' : 's are'
          } called across ${day.name}'s ${Math.round(gap.km)} km: ${names.join(', ')}.`,
        });
      }
    }

    const call = parseClockMinutes(day.crewCall);
    const wrap = parseClockMinutes(day.plannedWrap);

    if (call !== null && wrap !== null) {
      const window = wrap > call ? wrap - call : wrap + 1440 - call;
      const work = estimatedMinutesOn(day, sources.blocks);
      if (work.complete && work.minutes > window + limits.overrunGraceMinutes) {
        issues.push({
          code: 'day_overruns',
          severity: 'warning',
          productionDayId: day.id,
          dayName: day.name,
          message: `${day.name} has ${formatDurationHours(
            work.minutes,
          )} of work scheduled in a ${formatDurationHours(window)} day.`,
        });
      }
    }

    // Availability: someone scheduled today is marked unavailable that day.
    // Asked per day over the same cast set the split check uses, and only
    // when the caller can answer — a production with no availability typed
    // in gets no warnings, not a wall of them.
    if (sources.personUnavailableOn) {
      const cast = sources.castForDay?.(day);
      if (cast && cast.size > 0) {
        const names = [...cast]
          .filter((personId) => sources.personUnavailableOn!(personId, day))
          .map((personId) => sources.personName?.(personId) ?? personId)
          .sort((a, b) => a.localeCompare(b));
        if (names.length > 0) {
          issues.push({
            code: 'cast_unavailable',
            severity: 'warning',
            productionDayId: day.id,
            dayName: day.name,
            message: `${names.join(', ')} ${
              names.length === 1 ? 'is' : 'are'
            } marked unavailable on ${day.name}${day.date ? ` (${day.date})` : ''}.`,
          });
        }
      }
    }

    // Turnaround is a property of the pair, reported on the day that starts
    // early — that is the sheet whose call time would have to move.
    const previous = index > 0 ? days[index - 1] : null;
    const previousWrap = previous ? parseClockMinutes(previous.plannedWrap) : null;
    if (previous && previousWrap !== null && call !== null) {
      const turnaround = minutesBetweenDays(previousWrap, call);
      if (turnaround < limits.minTurnaroundMinutes) {
        issues.push({
          code: 'short_turnaround',
          severity: 'warning',
          productionDayId: day.id,
          dayName: day.name,
          relatedDayId: previous.id,
          message: `${formatDurationHours(turnaround)} turnaround: ${previous.name} wraps ${
            previous.plannedWrap
          }, ${day.name} calls ${day.crewCall}.`,
        });
      }
    }
  });

  return issues;
};

/** Counts by severity, for a badge that does not need the whole list. */
export const scheduleHealthSummary = (
  issues: readonly ScheduleIssue[],
): { warnings: number; notes: number } => ({
  warnings: issues.filter((issue) => issue.severity === 'warning').length,
  notes: issues.filter((issue) => issue.severity === 'note').length,
});
