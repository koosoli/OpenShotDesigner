import { describe, expect, it } from 'vitest';
import { DEFAULT_SUN_MINUTES, sceneSunPlan } from '../sun/scenePlan';
import { clockInZone, sunPosition } from '../sun';

/** Tokyo, and a date well away from any DST edge. */
const TOKYO = { lat: 35.6762, lng: 139.6503, timeZone: 'Asia/Tokyo' };

describe('sceneSunPlan', () => {
  it('resolves the scrubber time in the location zone, not the machine zone', () => {
    // The bug this replaces: both the canvas overlay and the inspector built
    // the moment with `new Date(y, m, d, h, m)`, which is the machine's wall
    // clock. Planning 18:00 in Tokyo from Europe computed the sun for 18:00
    // Europe — a shadow pointing the wrong way and a readout saying "below
    // horizon" for a scene shooting in daylight.
    const plan = sceneSunPlan({ ...TOKYO, date: '2026-06-21', timeMinutes: 18 * 60 });
    expect(plan).not.toBeNull();
    expect(clockInZone(plan!.moment, 'Asia/Tokyo')).toBe('18:00');
  });

  it('puts the sun above the horizon for a Tokyo midsummer evening', () => {
    const plan = sceneSunPlan({ ...TOKYO, date: '2026-06-21', timeMinutes: 18 * 60 });
    // Sunset in Tokyo on 21 June is around 19:00 local, so 18:00 is daylight
    // whatever zone the machine running this suite happens to be in.
    expect(plan!.position.elevationDeg).toBeGreaterThan(0);
  });

  it('gives the same answer as calling sunPosition on its own moment', () => {
    const plan = sceneSunPlan({ ...TOKYO, date: '2026-06-21', timeMinutes: 9 * 60 });
    const direct = sunPosition({ lat: TOKYO.lat, lng: TOKYO.lng, date: plan!.moment });
    expect(plan!.position).toEqual(direct);
  });

  it("reports the machine's zone when the location declares none", () => {
    const plan = sceneSunPlan({ lat: 35.6762, lng: 139.6503, date: '2026-06-21' });
    expect(plan!.timeZone.origin).toBe('machine');
  });

  it('reports a fallback when the declared zone cannot be read here', () => {
    const plan = sceneSunPlan({ ...TOKYO, timeZone: 'Mars/Olympus_Mons', date: '2026-06-21' });
    expect(plan!.timeZone.origin).toBe('fallback');
  });

  it('returns the day events in the same zone as the moment', () => {
    const plan = sceneSunPlan({ ...TOKYO, date: '2026-06-21', timeMinutes: 12 * 60 });
    expect(plan!.times.timeZone.id).toBe('Asia/Tokyo');
  });

  it('defaults the time to noon when the scrubber has never been moved', () => {
    const plan = sceneSunPlan({ ...TOKYO, date: '2026-06-21' });
    expect(clockInZone(plan!.moment, 'Asia/Tokyo')).toBe('12:00');
    expect(DEFAULT_SUN_MINUTES).toBe(720);
  });

  it('is null rather than guessing when the location has no pin', () => {
    expect(sceneSunPlan({ date: '2026-06-21', timeZone: 'Asia/Tokyo' })).toBeNull();
    expect(sceneSunPlan({ lat: 35.6, date: '2026-06-21' })).toBeNull();
  });

  it('is null rather than guessing when there is no date', () => {
    expect(sceneSunPlan({ ...TOKYO })).toBeNull();
    expect(sceneSunPlan({ ...TOKYO, date: 'next Tuesday' })).toBeNull();
  });

  it('is null for a non-finite coordinate rather than computing NaN degrees', () => {
    expect(sceneSunPlan({ lat: Number.NaN, lng: 139.65, date: '2026-06-21' })).toBeNull();
  });
});
