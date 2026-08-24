/**
 * Sunrise and sunset on a call sheet (plan §16).
 *
 * Every unit works to the light. An exterior day is planned around when it
 * arrives and when it goes, and the first thing anyone checks on a sheet for a
 * location they have not been to is what time they lose it.
 *
 * The numbers are derived from the day's date and the shooting location's
 * coordinates — the calculation already exists in `domain/sun` — but derived is
 * not the same as fixed. A production may work to the times its own service
 * publishes, or to a time adjusted for a valley or a building line that no
 * ephemeris knows about. So this is the derived-plus-override shape the rest of
 * the call sheet already uses (rule 37): the calculation fills the field, an
 * explicit entry wins, and the sheet says which it is showing so nobody
 * mistakes a typed time for an astronomical one.
 */

import { clockInZone, resolveTimeZone, sunTimes, wallClockToUtc } from '../sun';

export interface DaylightSource {
  /** ISO date (YYYY-MM-DD) of the shooting day. */
  date?: string;
  /** Coordinates of the day's shooting location, when it has a pin. */
  lat?: number;
  lng?: number;
  /**
   * IANA zone of the shooting location. A producer scheduling from another
   * continent is the normal case, not the exception, and without this the sheet
   * prints the sun in whatever zone the laptop happens to be in.
   */
  timeZone?: string;
  /** Explicit entries that beat the calculation. Free text, stored verbatim. */
  sunriseOverride?: string;
  sunsetOverride?: string;
}

export type DaylightOrigin =
  /** Calculated from the location pin and the date. */
  | 'derived'
  /** Typed by the production; the calculation was not used. */
  | 'override'
  /** No pin, no date, or a polar day where the event does not occur. */
  | 'unknown';

/** Where the zone the times are printed in came from. */
export type DaylightTimeZoneOrigin =
  /** The shooting location declares its zone; the times are the unit's own. */
  | 'location'
  /** No zone on the location, so the machine's zone stands in, as it always did. */
  | 'machine'
  /** A zone was set that this machine cannot read; the machine's zone stood in. */
  | 'fallback';

export interface CallSheetDaylight {
  sunrise?: string;
  sunset?: string;
  sunriseOrigin: DaylightOrigin;
  sunsetOrigin: DaylightOrigin;
  /**
   * The two golden hours, as `{ from, to }` clock times in `timeZone`.
   *
   * On a sheet this is the line a DOP reads first for an exterior: sunrise
   * says when there is light, magic hour says when there is the light. Absent
   * when there is no pin or no date to calculate from, and absent at latitudes
   * where the sun does not cross the threshold on this date — a blank is
   * correct there, and a plausible time would not be.
   *
   * DERIVED ONLY, with no override pair of its own. A production that has
   * corrected sunset for a ridge line has said something about the horizon,
   * not about the sun's elevation, and quietly shifting magic hour to match
   * would be inventing a second fact from the first. The `sunset` field
   * carries the correction and this stays what the ephemeris says.
   */
  goldenHourMorning?: { from: string; to: string };
  goldenHourEvening?: { from: string; to: string };
  /** The IANA zone the printed times are in, whichever way it was arrived at. */
  timeZone: string;
  timeZoneOrigin: DaylightTimeZoneOrigin;
  /**
   * Why the times are not the plain derived pair a reader expects: the sun does
   * not rise or set at all at this latitude on this date, or the location's zone
   * could not be read. Printing "—" for a Tromsø shoot in December is
   * technically true and useless; the sheet should say why (rule 13).
   */
  note?: string;
}

/**
 * A date-only ISO string as noon *at the location*, so the day never slips a
 * zone. Noon rather than midnight because it is the furthest an hour of DST or
 * a date-line neighbour can push the instant without landing on another date.
 */
const noonInZone = (iso: string, timeZone: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = wallClockToUtc(
    { year: Number(year), month: Number(month), day: Number(day), hour: 12, minute: 0, second: 0 },
    timeZone,
  );
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Daylight for one shooting day.
 *
 * An override is honoured even when there is no location to calculate from —
 * that is the whole point of it. The two ends are independent: a production
 * can correct sunset for a ridge line and leave sunrise derived.
 */
export const deriveDaylight = (source: DaylightSource): CallSheetDaylight => {
  const sunriseOverride = source.sunriseOverride?.trim();
  const sunsetOverride = source.sunsetOverride?.trim();

  // Resolved before anything else, and whether or not there is a pin: an
  // unreadable zone is worth saying on a sheet that has only overrides on it.
  const zone = resolveTimeZone(source.timeZone);

  const hasPin = typeof source.lat === 'number' && typeof source.lng === 'number';
  const date = source.date ? noonInZone(source.date, zone.id) : null;

  let derivedSunrise: string | undefined;
  let derivedSunset: string | undefined;
  let goldenHourMorning: { from: string; to: string } | undefined;
  let goldenHourEvening: { from: string; to: string } | undefined;
  const notes: string[] = [];

  if (hasPin && date) {
    const times = sunTimes({
      lat: source.lat as number,
      lng: source.lng as number,
      date,
      timeZone: zone.id,
    });
    if (times.polarNight) notes.push('Polar night — the sun does not rise at this location today.');
    else if (times.midnightSun) notes.push('Midnight sun — the sun does not set at this location today.');
    if (times.sunrise) derivedSunrise = clockInZone(times.sunrise, zone.id);
    if (times.sunset) derivedSunset = clockInZone(times.sunset, zone.id);
    // Both ends of each window have to exist. A day where the sun rises but
    // never climbs past six degrees has no morning golden hour, and printing
    // "05:12–" would read as a missing value rather than as the fact it is.
    if (times.sunrise && times.goldenHourMorningEnd) {
      goldenHourMorning = {
        from: clockInZone(times.sunrise, zone.id),
        to: clockInZone(times.goldenHourMorningEnd, zone.id),
      };
    }
    if (times.goldenHourEveningStart && times.sunset) {
      goldenHourEvening = {
        from: clockInZone(times.goldenHourEveningStart, zone.id),
        to: clockInZone(times.sunset, zone.id),
      };
    }
  }

  // Rule 13: a zone we cannot read is not quietly swapped for a plausible one.
  if (zone.origin === 'fallback') {
    notes.push(
      `Time zone “${zone.requested}” is not recognised here — times are shown in ${zone.id}, this machine’s zone.`,
    );
  }

  const resolve = (
    override: string | undefined,
    derived: string | undefined,
  ): { value?: string; origin: DaylightOrigin } => {
    if (override) return { value: override, origin: 'override' };
    if (derived) return { value: derived, origin: 'derived' };
    return { origin: 'unknown' };
  };

  const sunrise = resolve(sunriseOverride, derivedSunrise);
  const sunset = resolve(sunsetOverride, derivedSunset);
  const note = notes.join(' ');

  return {
    ...(sunrise.value ? { sunrise: sunrise.value } : {}),
    ...(sunset.value ? { sunset: sunset.value } : {}),
    sunriseOrigin: sunrise.origin,
    sunsetOrigin: sunset.origin,
    ...(goldenHourMorning ? { goldenHourMorning } : {}),
    ...(goldenHourEvening ? { goldenHourEvening } : {}),
    timeZone: zone.id,
    timeZoneOrigin: zone.origin === 'requested' ? 'location' : zone.origin,
    ...(note ? { note } : {}),
  };
};
