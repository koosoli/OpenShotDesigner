import { describe, expect, it } from 'vitest';
import {
  compassPoint,
  formatSunTime,
  sunPosition,
  sunTimes,
} from '../sun/position';
import { partsInZone } from '../sun/timeZone';

/**
 * Reference values come from the NOAA solar calculator. Tolerances are loose
 * enough to survive the refraction model but tight enough to catch a sign flip
 * or a wrong hour angle, which are the mistakes this kind of code actually makes.
 */

const utc = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min, 0));

describe('sunPosition', () => {
  it('puts the sun nearly overhead at the equator at equinox noon', () => {
    // 0N 0E, March equinox, 12:00 UTC — solar noon on the Greenwich meridian.
    const sun = sunPosition({ lat: 0, lng: 0, date: utc(2026, 3, 20, 12) });
    expect(sun.elevationDeg).toBeGreaterThan(87);
  });

  it('puts the sun due south at local noon in the northern hemisphere', () => {
    // Berlin, midsummer, 11:00 UTC ~ 13:00 local solar time-ish.
    const sun = sunPosition({ lat: 52.52, lng: 13.405, date: utc(2026, 6, 21, 11) });
    expect(sun.azimuthDeg).toBeGreaterThan(150);
    expect(sun.azimuthDeg).toBeLessThan(210);
    expect(sun.elevationDeg).toBeGreaterThan(55);
  });

  it('puts the sun due north at local noon in the southern hemisphere', () => {
    // Sydney, their midwinter, around local solar noon (UTC+10).
    const sun = sunPosition({ lat: -33.87, lng: 151.21, date: utc(2026, 6, 21, 2) });
    expect(sun.azimuthDeg).toBeGreaterThan(330);
    expect(sun.elevationDeg).toBeGreaterThan(25);
  });

  it('rises in the east and sets in the west', () => {
    const morning = sunPosition({ lat: 52.52, lng: 13.405, date: utc(2026, 3, 20, 5, 20) });
    const evening = sunPosition({ lat: 52.52, lng: 13.405, date: utc(2026, 3, 20, 17, 20) });
    expect(morning.azimuthDeg).toBeGreaterThan(60);
    expect(morning.azimuthDeg).toBeLessThan(120);
    expect(evening.azimuthDeg).toBeGreaterThan(240);
    expect(evening.azimuthDeg).toBeLessThan(300);
  });

  it('reports the sun below the horizon at local midnight', () => {
    const sun = sunPosition({ lat: 52.52, lng: 13.405, date: utc(2026, 1, 15, 23) });
    expect(sun.elevationDeg).toBeLessThan(0);
  });

  it('points shadows away from the sun', () => {
    const sun = sunPosition({ lat: 52.52, lng: 13.405, date: utc(2026, 6, 21, 11) });
    const separation = ((sun.shadowAzimuthDeg - sun.azimuthDeg) % 360 + 360) % 360;
    expect(separation).toBeCloseTo(180, 6);
  });

  it('gives a short shadow for a high sun and a long one for a low sun', () => {
    const high = sunPosition({ lat: 0, lng: 0, date: utc(2026, 3, 20, 12) });
    const low = sunPosition({ lat: 52.52, lng: 13.405, date: utc(2026, 12, 21, 11) });
    expect(high.shadowLengthRatio!).toBeLessThan(0.2);
    expect(low.shadowLengthRatio!).toBeGreaterThan(2);
  });

  it('reports an unknown shadow length below the horizon rather than a huge number', () => {
    // Rule 13: unknown stays unknown. A shadow with no sun is not "very long".
    const night = sunPosition({ lat: 52.52, lng: 13.405, date: utc(2026, 1, 15, 23) });
    expect(night.shadowLengthRatio).toBeNull();
  });

  it('keeps azimuth inside 0..360 everywhere it is asked', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const lat of [-80, -33.87, 0, 52.52, 78]) {
        const sun = sunPosition({ lat, lng: 13.4, date: utc(2026, 5, 5, hour) });
        expect(sun.azimuthDeg).toBeGreaterThanOrEqual(0);
        expect(sun.azimuthDeg).toBeLessThan(360);
        expect(Number.isFinite(sun.elevationDeg)).toBe(true);
      }
    }
  });

  it('is higher in summer than in winter at the same latitude and hour', () => {
    const summer = sunPosition({ lat: 52.52, lng: 13.405, date: utc(2026, 6, 21, 11) });
    const winter = sunPosition({ lat: 52.52, lng: 13.405, date: utc(2026, 12, 21, 11) });
    expect(summer.elevationDeg).toBeGreaterThan(winter.elevationDeg + 30);
  });
});

/**
 * Every case here names both the instant (as UTC) and the shoot's zone, so the
 * results do not move when the machine running the suite does. Setting
 * `process.env.TZ` inside the test would not help: vitest runs these in worker
 * threads, where Node's tzset does not apply and the answer would still be the
 * developer's own clock. Being explicit is the fix, not a workaround for it.
 */
describe('sunTimes', () => {
  const berlin = { lat: 52.52, lng: 13.405, timeZone: 'Europe/Berlin' };
  const svalbard = { lat: 78.2, lng: 15.6, timeZone: 'Arctic/Longyearbyen' };

  it('finds sunrise before solar noon and sunset after it', () => {
    const times = sunTimes({ ...berlin, date: utc(2026, 6, 21, 10) });
    expect(times.sunrise).not.toBeNull();
    expect(times.sunset).not.toBeNull();
    expect(times.sunrise!.getTime()).toBeLessThan(times.solarNoon.getTime());
    expect(times.sunset!.getTime()).toBeGreaterThan(times.solarNoon.getTime());
  });

  it('gives a longer day in midsummer than in midwinter', () => {
    const summer = sunTimes({ ...berlin, date: utc(2026, 6, 21, 10) });
    const winter = sunTimes({ ...berlin, date: utc(2026, 12, 21, 11) });
    const length = (t: ReturnType<typeof sunTimes>) => t.sunset!.getTime() - t.sunrise!.getTime();
    expect(length(summer)).toBeGreaterThan(length(winter) + 6 * 3600_000);
  });

  it('orders the golden and civil boundaries sensibly', () => {
    const times = sunTimes({ ...berlin, date: utc(2026, 6, 21, 10) });
    expect(times.civilDawn!.getTime()).toBeLessThan(times.sunrise!.getTime());
    expect(times.sunrise!.getTime()).toBeLessThan(times.goldenHourMorningEnd!.getTime());
    expect(times.goldenHourEveningStart!.getTime()).toBeLessThan(times.sunset!.getTime());
    expect(times.sunset!.getTime()).toBeLessThan(times.civilDusk!.getTime());
  });

  it('reports midnight sun above the arctic circle in June', () => {
    const times = sunTimes({ ...svalbard, date: utc(2026, 6, 21, 10) });
    expect(times.midnightSun).toBe(true);
    expect(times.polarNight).toBe(false);
    expect(times.sunrise).toBeNull();
    expect(times.sunset).toBeNull();
  });

  it('reports polar night above the arctic circle in December', () => {
    const times = sunTimes({ ...svalbard, date: utc(2026, 12, 21, 11) });
    expect(times.polarNight).toBe(true);
    expect(times.midnightSun).toBe(false);
  });

  it('reports neither for an ordinary day', () => {
    const times = sunTimes({ ...berlin, date: utc(2026, 6, 21, 10) });
    expect(times.polarNight).toBe(false);
    expect(times.midnightSun).toBe(false);
  });

  /**
   * The zone has to bound the day, not just be echoed back on the result. The
   * instant here is 22:30 UTC on the 21st, which in Berlin is already half past
   * midnight on the 22nd: a day bounded in UTC would answer with the 21st's sun
   * and be a day out on the call sheet.
   */
  it('finds the day in the zone asked for, not the one the instant reads in UTC', () => {
    const afterBerlinMidnight = utc(2026, 6, 21, 22, 30);
    const times = sunTimes({ ...berlin, date: afterBerlinMidnight });
    expect(times.timeZone).toEqual({ id: 'Europe/Berlin', origin: 'requested' });
    expect(partsInZone(times.sunrise!, 'Europe/Berlin').day).toBe(22);
    expect(partsInZone(times.sunset!, 'Europe/Berlin').day).toBe(22);
    // The 21st's sunset is a day and some minutes earlier, so the two are not
    // interchangeable however close midsummer's days are to each other.
    const dayBefore = sunTimes({ ...berlin, date: utc(2026, 6, 21, 10) });
    expect(partsInZone(dayBefore.sunset!, 'Europe/Berlin').day).toBe(21);
    expect(times.sunset!.getTime() - dayBefore.sunset!.getTime()).toBeGreaterThan(23 * 3600_000);
  });
});

describe('formatting helpers', () => {
  it('formats a time and says nothing for an event that does not happen', () => {
    expect(formatSunTime(new Date(2026, 5, 21, 4, 43))).toBe('04:43');
    expect(formatSunTime(null)).toBe('—');
  });

  /**
   * The bug this guards: one instant, two units, two different call sheets. A
   * producer in Luxembourg printing an LA sunrise must see the LA clock.
   */
  it('prints the same instant differently in two zones', () => {
    const instant = utc(2026, 6, 21, 12, 44);
    expect(formatSunTime(instant, 'America/Los_Angeles')).toBe('05:44');
    expect(formatSunTime(instant, 'Europe/Luxembourg')).toBe('14:44');
    expect(formatSunTime(instant, 'UTC')).toBe('12:44');
  });

  it('prints midnight as 00:00 rather than rolling it into 24:00', () => {
    expect(formatSunTime(utc(2026, 6, 21, 0, 0), 'UTC')).toBe('00:00');
  });

  it('names the compass point for an azimuth', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('W');
    expect(compassPoint(315)).toBe('NW');
    expect(compassPoint(360)).toBe('N');
    expect(compassPoint(-90)).toBe('W');
  });
});
