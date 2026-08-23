/**
 * Wall-clock time in the shoot's zone, not the machine's (plan §37, rule 13).
 *
 * A producer in Luxembourg schedules a Los Angeles day. The sun does not care
 * where the laptop is, but every printed time does: a call sheet that says
 * sunset 17:12 when it means 08:12 in CET is the one document the crew turns up
 * on, and it is silently wrong. So the day's boundaries and every time printed
 * from them are resolved in the location's IANA zone.
 *
 * Everything here goes through `Intl.DateTimeFormat`, which already carries the
 * IANA database the platform ships. A hand-rolled offset table would be a
 * second, staler copy of that data, and DST rules change by legislation more
 * often than anyone expects.
 *
 * When a zone is not recognised the machine's zone is used and that substitution
 * is reported, never hidden — rule 13: unknown stays unknown, the paperwork says
 * what it does not know rather than inventing a plausible number.
 */

/** How the zone a time is printed in was arrived at. */
export type TimeZoneOrigin =
  /** The caller named a zone and the platform knows it. */
  | 'requested'
  /** No zone was named, so the machine's own zone stands in. */
  | 'machine'
  /** A zone was named and is not recognised here; the machine's zone stood in. */
  | 'fallback';

export interface ResolvedTimeZone {
  /** The IANA zone actually used for bounding the day and printing times. */
  id: string;
  origin: TimeZoneOrigin;
  /** The unrecognised zone that was asked for, kept so a sheet can name it. */
  requested?: string;
}

/** Broken-down wall-clock fields in some zone. */
export interface ZonedParts {
  year: number;
  /** 1-12, the way a human writes a date rather than the way `Date` counts. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Formatters are not cheap to construct and the sampler asks for a few thousand
 * of them per day, so one per zone is kept and reused.
 */
const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const clockFormatters = new Map<string, Intl.DateTimeFormat>();

const partsFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = partsFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    // h23 rather than hour12:false: some platforms still print midnight as "24"
    // for the latter, which would push every midnight into the previous day.
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  partsFormatters.set(timeZone, formatter);
  return formatter;
};

const clockFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = clockFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
  clockFormatters.set(timeZone, formatter);
  return formatter;
};

/** The zone this machine is set to, which is the only zone we can assume. */
export const machineTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Whether the platform's IANA database knows this zone. */
export const isKnownTimeZone = (timeZone: string): boolean => {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

/**
 * Settle on the zone to work in. A location with no zone set behaves exactly as
 * before — the machine's zone — and says so; a zone this platform cannot read
 * falls back to the same place but is reported as a fallback so the caller can
 * print the substitution instead of pretending it did not happen.
 */
export const resolveTimeZone = (requested?: string): ResolvedTimeZone => {
  const trimmed = requested?.trim();
  if (!trimmed) return { id: machineTimeZone(), origin: 'machine' };
  if (isKnownTimeZone(trimmed)) return { id: trimmed, origin: 'requested' };
  return { id: machineTimeZone(), origin: 'fallback', requested: trimmed };
};

/** The wall-clock fields an instant reads as in a zone. */
export const partsInZone = (instant: Date, timeZone: string): ZonedParts => {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
};

/** How far ahead of UTC a zone is at a given instant, in milliseconds. */
const offsetAt = (instant: Date, timeZone: string): number => {
  const parts = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // The instant's milliseconds are dropped by the formatter, so drop them here
  // too rather than letting them show up as a sub-second offset.
  return asUtc - (instant.getTime() - instant.getMilliseconds());
};

/**
 * The UTC instant at which a zone's clocks read the given wall-clock time.
 *
 * The offset depends on the instant and the instant depends on the offset, so
 * both offsets in force around the moment are tried — half a day either side is
 * wider than any transition — and a candidate counts only if reading it back in
 * the zone gives the wall clock that was asked for.
 *
 * Twice a year neither one candidate nor exactly one is right. On a fall-back
 * day the named hour happens twice and the first occurrence is taken, which is
 * the one a crew called for 01:30 would turn up to. On a spring-forward day it
 * never happens at all, and rather than invent an instant the clocks never
 * showed, the answer is the moment they jumped to — the true start of that
 * local hour, and the earliest time anyone could be on set for it.
 */
export const wallClockToUtc = (wall: ZonedParts, timeZone: string): Date => {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const half = 43_200_000;
  const before = naive - offsetAt(new Date(naive - half), timeZone);
  const after = naive - offsetAt(new Date(naive + half), timeZone);
  const reachable = (candidate: number): boolean =>
    offsetAt(new Date(candidate), timeZone) === naive - candidate;

  if (reachable(before) && reachable(after)) return new Date(Math.min(before, after));
  if (reachable(before)) return new Date(before);
  if (reachable(after)) return new Date(after);
  return new Date(Math.max(before, after));
};

/** Midnight opening the local day that contains this instant, as a UTC instant. */
export const startOfDayInZone = (instant: Date, timeZone: string): Date => {
  const parts = partsInZone(instant, timeZone);
  return wallClockToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, timeZone);
};

/**
 * Midnight opening the *next* local day. Paired with `startOfDayInZone` this
 * gives the real length of the local day — 23 hours in spring, 25 in autumn —
 * which a fixed 24-hour span silently gets wrong twice a year.
 */
export const startOfNextDayInZone = (instant: Date, timeZone: string): Date => {
  const parts = partsInZone(instant, timeZone);
  // Date.UTC rolls day 32 into the next month, so no calendar arithmetic here.
  return wallClockToUtc({ ...parts, day: parts.day + 1, hour: 0, minute: 0, second: 0 }, timeZone);
};

/** "HH:MM" as the clocks read it in a zone. Call sheets print wall-clock, always. */
export const clockInZone = (instant: Date, timeZone: string): string => {
  const parts = clockFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${read('hour').padStart(2, '0')}:${read('minute').padStart(2, '0')}`;
};

/**
 * Every IANA zone this platform can offer, for a picker. Older engines lack
 * `Intl.supportedValuesOf`, and an empty list is the honest answer there — the
 * caller falls back to letting the user type the zone rather than showing a
 * short invented list that would quietly exclude the shoot's actual zone.
 */
export const supportedTimeZones = (): string[] => {
  const supportedValuesOf = (
    Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  if (typeof supportedValuesOf !== 'function') return [];
  try {
    return supportedValuesOf('timeZone');
  } catch {
    return [];
  }
};
