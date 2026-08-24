/**
 * Sun planning for one scene setup (plan §37) — the whole answer, once.
 *
 * The floor-plan overlay and the inspector's readout ask the same question
 * about the same scene, and each had its own copy of the arithmetic. Both
 * copies had the same bug: they built the planned moment with
 * `new Date(year, month, day, hour, minute)`, which is the WALL CLOCK OF THE
 * MACHINE. Set the scrubber to 18:00 for a location in Tokyo while working in
 * Luxembourg and the app computed the sun for 18:00 Luxembourg time — a shadow
 * pointing the wrong way on the plan and an evening readout that said "below
 * horizon" for a scene shooting in daylight. The panel then printed
 * "Calculated for <the Tokyo location>" underneath it.
 *
 * The zone comes from the location, the same field the call sheet uses, and
 * where it did came from is reported so the UI can say "shown in this
 * machine's zone" rather than implying the location's (rule 13).
 */

import { sunPosition, sunTimes } from './position';
import type { SunPosition, SunTimes } from './position';
import { resolveTimeZone, wallClockToUtc } from './timeZone';
import type { ResolvedTimeZone } from './timeZone';

export interface SunPlanInput {
  /** The location's pin. Without both, there is nothing to compute. */
  lat?: number;
  lng?: number;
  /** IANA zone of the location. Absent falls back to the machine's zone. */
  timeZone?: string;
  /** ISO date (YYYY-MM-DD) being planned. */
  date?: string;
  /** Minutes past local midnight the scrubber sits at. Defaults to solar noon-ish. */
  timeMinutes?: number;
}

export interface SunPlan {
  /** The planned instant, resolved through the location's zone. */
  moment: Date;
  /** Which zone that was, and how it was arrived at. */
  timeZone: ResolvedTimeZone;
  /** Where the sun is at that instant. */
  position: SunPosition;
  /** The day's events, in the same zone. */
  times: SunTimes;
}

/** Noon, as the default a scrubber opens at. */
export const DEFAULT_SUN_MINUTES = 12 * 60;

/**
 * The full sun picture for a scene, or null when the inputs do not support one.
 *
 * Null rather than a default is the whole contract: a scene with no location
 * pin has no sun position, and the alternative — computing one for coordinates
 * the app guessed — draws a confident arrow in the wrong direction.
 */
export const sceneSunPlan = (input: SunPlanInput): SunPlan | null => {
  const { lat, lng } = input;
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null;
  if (typeof lng !== 'number' || !Number.isFinite(lng)) return null;

  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec((input.date ?? '').trim());
  if (!parts) return null;

  const zone = resolveTimeZone(input.timeZone);
  const minutes = Number.isFinite(input.timeMinutes)
    ? (input.timeMinutes as number)
    : DEFAULT_SUN_MINUTES;

  const moment = wallClockToUtc(
    {
      year: Number(parts[1]),
      month: Number(parts[2]),
      day: Number(parts[3]),
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
      second: 0,
    },
    zone.id,
  );
  if (Number.isNaN(moment.getTime())) return null;

  return {
    moment,
    timeZone: zone,
    position: sunPosition({ lat, lng, date: moment }),
    times: sunTimes({ lat, lng, date: moment, timeZone: zone.id }),
  };
};
