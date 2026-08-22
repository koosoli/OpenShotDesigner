import { describe, expect, it } from 'vitest';
import {
  compassPoint,
  formatSunTime,
  sunPosition,
  sunTimes,
} from '../sun/position';

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

describe('sunTimes', () => {
  const berlin = { lat: 52.52, lng: 13.405 };

  it('finds sunrise before solar noon and sunset after it', () => {
    const times = sunTimes({ ...berlin, date: new Date(2026, 5, 21, 12) });
    expect(times.sunrise).not.toBeNull();
    expect(times.sunset).not.toBeNull();
    expect(times.sunrise!.getTime()).toBeLessThan(times.solarNoon.getTime());
    expect(times.sunset!.getTime()).toBeGreaterThan(times.solarNoon.getTime());
  });

  it('gives a longer day in midsummer than in midwinter', () => {
    const summer = sunTimes({ ...berlin, date: new Date(2026, 5, 21, 12) });
    const winter = sunTimes({ ...berlin, date: new Date(2026, 11, 21, 12) });
    const length = (t: ReturnType<typeof sunTimes>) => t.sunset!.getTime() - t.sunrise!.getTime();
    expect(length(summer)).toBeGreaterThan(length(winter) + 6 * 3600_000);
  });

  it('orders the golden and civil boundaries sensibly', () => {
    const times = sunTimes({ ...berlin, date: new Date(2026, 5, 21, 12) });
    expect(times.civilDawn!.getTime()).toBeLessThan(times.sunrise!.getTime());
    expect(times.sunrise!.getTime()).toBeLessThan(times.goldenHourMorningEnd!.getTime());
    expect(times.goldenHourEveningStart!.getTime()).toBeLessThan(times.sunset!.getTime());
    expect(times.sunset!.getTime()).toBeLessThan(times.civilDusk!.getTime());
  });

  it('reports midnight sun above the arctic circle in June', () => {
    const times = sunTimes({ lat: 78.2, lng: 15.6, date: new Date(2026, 5, 21, 12) });
    expect(times.midnightSun).toBe(true);
    expect(times.polarNight).toBe(false);
    expect(times.sunrise).toBeNull();
    expect(times.sunset).toBeNull();
  });

  it('reports polar night above the arctic circle in December', () => {
    const times = sunTimes({ lat: 78.2, lng: 15.6, date: new Date(2026, 11, 21, 12) });
    expect(times.polarNight).toBe(true);
    expect(times.midnightSun).toBe(false);
  });

  it('reports neither for an ordinary day', () => {
    const times = sunTimes({ ...berlin, date: new Date(2026, 5, 21, 12) });
    expect(times.polarNight).toBe(false);
    expect(times.midnightSun).toBe(false);
  });
});

describe('formatting helpers', () => {
  it('formats a time and says nothing for an event that does not happen', () => {
    expect(formatSunTime(new Date(2026, 5, 21, 4, 43))).toBe('04:43');
    expect(formatSunTime(null)).toBe('—');
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
