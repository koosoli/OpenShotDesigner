/**
 * Availability — whether a person can work a given day.
 *
 * The one rule here reads the ranges the production typed against a person:
 * "SARAH is on another job the 12th to the 15th". The schedule-health check
 * uses it to say out loud when a stripboard day calls someone who is not
 * free, which until now the app knew and never said.
 *
 * Dates are ISO `YYYY-MM-DD` and compared as strings: that ordering is exact,
 * timezone-free, and cannot disagree with itself the way a Date parsed in two
 * zones can. A range with an unreadable end never matches anything rather
 * than matching everything (rule 13) — an unbounded "from" would silently
 * block half the schedule on what may be a typo.
 */

import type { Person, UnavailableRange } from './types';

/** True when `dateIso` falls inside the range, counting both ends. */
const rangeCovers = (range: UnavailableRange, dateIso: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.to)) return false;
  // An inverted range (to before from) covers nothing rather than everything;
  // flagging it is validation's job, not availability's.
  return range.from <= dateIso && dateIso <= range.to;
};

/**
 * Is this person marked unavailable on `dateIso` (`YYYY-MM-DD`)?
 *
 * False for every kind of nothing: no person, no ranges, an unreadable date,
 * an unreadable range. "We do not know they are busy" and "they are free"
 * are different facts upstream; at the point of asking, both mean the day
 * may be scheduled.
 */
export const personUnavailableOn = (
  person: Person | undefined,
  dateIso: string | undefined,
): boolean => {
  if (!person?.unavailableRanges?.length || !dateIso) return false;
  return person.unavailableRanges.some((range) => rangeCovers(range, dateIso));
};
