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

import { sunTimes } from '../sun';

export interface DaylightSource {
  /** ISO date (YYYY-MM-DD) of the shooting day. */
  date?: string;
  /** Coordinates of the day's shooting location, when it has a pin. */
  lat?: number;
  lng?: number;
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

export interface CallSheetDaylight {
  sunrise?: string;
  sunset?: string;
  sunriseOrigin: DaylightOrigin;
  sunsetOrigin: DaylightOrigin;
  /**
   * Set when the sun does not rise or set at all at this latitude on this date.
   * Printing "—" for a Tromsø shoot in December is technically true and
   * useless; the sheet should say why (rule 13).
   */
  note?: string;
}

/** Local wall-clock "HH:MM". Call sheets are read in local time, always. */
const clock = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** A date-only ISO string parsed as local noon, so the day never slips a zone. */
const localNoon = (iso: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
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

  const hasPin = typeof source.lat === 'number' && typeof source.lng === 'number';
  const date = source.date ? localNoon(source.date) : null;

  let derivedSunrise: string | undefined;
  let derivedSunset: string | undefined;
  let note: string | undefined;

  if (hasPin && date) {
    const times = sunTimes({ lat: source.lat as number, lng: source.lng as number, date });
    if (times.polarNight) note = 'Polar night — the sun does not rise at this location today.';
    else if (times.midnightSun) note = 'Midnight sun — the sun does not set at this location today.';
    if (times.sunrise) derivedSunrise = clock(times.sunrise);
    if (times.sunset) derivedSunset = clock(times.sunset);
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

  return {
    ...(sunrise.value ? { sunrise: sunrise.value } : {}),
    ...(sunset.value ? { sunset: sunset.value } : {}),
    sunriseOrigin: sunrise.origin,
    sunsetOrigin: sunset.origin,
    ...(note ? { note } : {}),
  };
};
