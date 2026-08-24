/**
 * Wall-clock times on a shooting day, as minutes past midnight.
 *
 * A call sheet writes times as `"07:30"` and nothing else — no date, no zone.
 * That is not a shortcut: a day's crew call is a time on that day at that
 * location, and attaching a timestamp to it would invite conversions nobody
 * asked for. So the arithmetic the schedule needs is minute arithmetic.
 *
 * Extracted from `reports/callSheet.ts`, which had the only copy, so the
 * schedule-health checks read call and wrap the same way the sheet prints them.
 * Two parsers that disagree about what `"7:5"` means would put a warning on a
 * day whose sheet looks fine.
 */

/**
 * `"07:30"` as 450, or null when the text is not a plain 24-hour clock time.
 *
 * Null rather than a guess, deliberately. These fields are free text so that
 * "O/C" and "on set 08:00" stay expressible (see `ProductionDay.callSheet`),
 * and a parser that pulled `8` out of "on set 08:00" would then be asked to
 * decide what "TBC" means. Anything it cannot read exactly is unknown, and
 * every caller here treats unknown as "no warning" rather than as a default.
 */
export const parseClockMinutes = (clock: string | undefined): number | null => {
  if (!clock || !/^\d{1,2}:\d{2}$/.test(clock.trim())) return null;
  const [hours, minutes] = clock.trim().split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

/** 450 as `"07:30"`. Wraps past midnight rather than reporting hour 25. */
export const formatClockMinutes = (total: number): string => {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

/** `"09:45"` from a duration in minutes; `"26:00"` stays 26 hours, not 2. */
export const formatDurationHours = (minutes: number): string => {
  const rounded = Math.round(minutes);
  const sign = rounded < 0 ? '-' : '';
  const absolute = Math.abs(rounded);
  return `${sign}${Math.floor(absolute / 60)}h ${String(absolute % 60).padStart(2, '0')}m`;
};

/**
 * Minutes from a wrap on one day to a call on the next.
 *
 * A wrap at 23:00 followed by an 08:00 call is nine hours, not fifteen
 * negative ones: the second time is understood to be on the following
 * calendar day whenever it is not later than the first. That is the same
 * assumption a production office makes reading two consecutive sheets, and
 * the alternative — requiring both days to be dated — would make turnaround
 * unavailable on the undated schedules the app deliberately supports.
 */
export const minutesBetweenDays = (wrapMinutes: number, nextCallMinutes: number): number =>
  nextCallMinutes > wrapMinutes
    ? nextCallMinutes - wrapMinutes
    : nextCallMinutes + 1440 - wrapMinutes;
