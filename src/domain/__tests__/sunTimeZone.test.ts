import { describe, expect, it } from 'vitest';
import { sunTimes } from '../sun/position';
import {
  clockInZone,
  isKnownTimeZone,
  partsInZone,
  resolveTimeZone,
  startOfDayInZone,
  startOfNextDayInZone,
  wallClockToUtc,
} from '../sun/timeZone';

/**
 * The whole point of this file is that none of it depends on where the machine
 * running it is. Every instant is written as UTC and every zone is named, so a
 * developer in Luxembourg, a CI box on UTC and a laptop on Kiritimati all get
 * the same answers. `process.env.TZ` is deliberately not touched: vitest runs
 * these in worker threads, where changing it does not reach Node's tzset, so it
 * would look like a pin and pin nothing.
 */

const utc = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min, 0));

const hours = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;

/**
 * What the machine's own clock reads at an instant, asked of `Intl` with no
 * zone named at all — which is what "the machine zone" means.
 */
const machineClock = (instant: Date) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(instant);

/**
 * Assert a fallback landed on the machine's zone by what it prints, not by
 * comparing `machineTimeZone()` with itself — that assertion held whatever the
 * function returned, including a hard-coded 'UTC'. Two instants six months
 * apart, so a fixed offset standing in for a zone fails on one of them.
 */
const expectPrintsTheMachineClock = (zoneId: string) => {
  expect(isKnownTimeZone(zoneId)).toBe(true);
  for (const instant of [utc(2026, 1, 15, 12), utc(2026, 7, 15, 12)]) {
    expect(clockInZone(instant, zoneId)).toBe(machineClock(instant));
  }
};

describe('resolveTimeZone', () => {
  it('takes a zone the platform knows at its word', () => {
    expect(resolveTimeZone('America/Los_Angeles')).toEqual({
      id: 'America/Los_Angeles',
      origin: 'requested',
    });
  });

  it('falls back to the machine zone when no zone is set, and says so', () => {
    const resolved = resolveTimeZone(undefined);
    expect(resolved.origin).toBe('machine');
    expectPrintsTheMachineClock(resolved.id);
  });

  it('treats blank as absent rather than as a zone named ""', () => {
    expect(resolveTimeZone('   ').origin).toBe('machine');
  });

  /** Rule 13: an unreadable zone is reported, never quietly swapped. */
  it('falls back visibly for a zone the platform does not know', () => {
    const resolved = resolveTimeZone('Mars/Olympus_Mons');
    expect(resolved.origin).toBe('fallback');
    expect(resolved.requested).toBe('Mars/Olympus_Mons');
    expectPrintsTheMachineClock(resolved.id);
  });

  it('knows a real zone from an invented one', () => {
    expect(isKnownTimeZone('Europe/Berlin')).toBe(true);
    expect(isKnownTimeZone('Europe/Berlyn')).toBe(false);
    expect(isKnownTimeZone('')).toBe(false);
  });
});

describe('reading an instant in a zone', () => {
  it('reads one instant as different wall clocks either side of the world', () => {
    const instant = utc(2026, 6, 21, 12, 44);
    expect(clockInZone(instant, 'America/Los_Angeles')).toBe('05:44');
    expect(clockInZone(instant, 'Europe/Luxembourg')).toBe('14:44');
    expect(clockInZone(instant, 'Pacific/Kiritimati')).toBe('02:44');
  });

  it('breaks an instant into the fields that zone shows on its calendar', () => {
    // 06:30 UTC on the 21st is still the 20th in Los Angeles.
    expect(partsInZone(utc(2026, 6, 21, 6, 30), 'America/Los_Angeles')).toEqual({
      year: 2026,
      month: 6,
      day: 20,
      hour: 23,
      minute: 30,
      second: 0,
    });
  });
});

describe('wallClockToUtc', () => {
  it('resolves a wall clock in a zone to the instant it names', () => {
    expect(wallClockToUtc(
      { year: 2026, month: 6, day: 21, hour: 5, minute: 44, second: 0 },
      'America/Los_Angeles',
    ).toISOString()).toBe('2026-06-21T12:44:00.000Z');
  });

  it('uses the offset in force on the day, not a fixed one', () => {
    // Los Angeles is UTC-8 in January and UTC-7 in July; noon is not the same
    // instant in both, and a fixed offset would put one of them an hour out.
    const winter = wallClockToUtc({ year: 2026, month: 1, day: 15, hour: 12, minute: 0, second: 0 }, 'America/Los_Angeles');
    const summer = wallClockToUtc({ year: 2026, month: 7, day: 15, hour: 12, minute: 0, second: 0 }, 'America/Los_Angeles');
    expect(winter.toISOString()).toBe('2026-01-15T20:00:00.000Z');
    expect(summer.toISOString()).toBe('2026-07-15T19:00:00.000Z');
  });

  /**
   * 02:30 on a spring-forward morning is a time the clocks never show. The
   * honest answer is the instant they jumped to, not a fabricated one.
   */
  it('lands on the jump for a wall clock that never happens', () => {
    const skipped = wallClockToUtc(
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 },
      'America/New_York',
    );
    expect(skipped.toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(clockInZone(skipped, 'America/New_York')).toBe('03:30');
  });
});

describe('the length of a local day', () => {
  const nyc = 'America/New_York';

  it('is twenty-four hours on an ordinary day', () => {
    const day = utc(2026, 6, 21, 16);
    expect(hours(startOfDayInZone(day, nyc), startOfNextDayInZone(day, nyc))).toBe(24);
  });

  it('is twenty-three hours on a spring-forward day', () => {
    const day = utc(2026, 3, 8, 17);
    expect(hours(startOfDayInZone(day, nyc), startOfNextDayInZone(day, nyc))).toBe(23);
  });

  it('is twenty-five hours on a fall-back day', () => {
    const day = utc(2026, 11, 1, 17);
    expect(hours(startOfDayInZone(day, nyc), startOfNextDayInZone(day, nyc))).toBe(25);
  });

  it('is twenty-six hours where the clocks go back two', () => {
    // Antarctica/Troll drops from UTC+2 to UTC+0 in one step.
    const day = utc(2026, 10, 25, 12);
    expect(hours(startOfDayInZone(day, 'Antarctica/Troll'), startOfNextDayInZone(day, 'Antarctica/Troll'))).toBe(26);
  });

  it('opens the day at the location midnight, not the machine one', () => {
    expect(startOfDayInZone(utc(2026, 6, 21, 16), 'America/Los_Angeles').toISOString())
      .toBe('2026-06-21T07:00:00.000Z');
    expect(startOfDayInZone(utc(2026, 6, 21, 16), 'Europe/Berlin').toISOString())
      .toBe('2026-06-20T22:00:00.000Z');
  });
});

describe('sunTimes across a DST transition', () => {
  const nyc = { lat: 40.7128, lng: -74.006, timeZone: 'America/New_York' };
  const inZone = (value: Date | null) => (value ? clockInZone(value, 'America/New_York') : null);

  it('prints a spring-forward day in the clock the crew will be on', () => {
    // The clocks go forward at 02:00, so sunrise is already on EDT.
    const times = sunTimes({ ...nyc, date: utc(2026, 3, 8, 17) });
    expect(inZone(times.sunrise)).toBe('07:21');
    expect(inZone(times.sunset)).toBe('18:54');
    expect(times.sunrise!.getTime()).toBeLessThan(times.sunset!.getTime());
  });

  it('prints a fall-back day in the clock the crew will be on', () => {
    // The clocks go back at 02:00, so sunrise reads an hour earlier than the
    // day before even though the sun has barely moved.
    const times = sunTimes({ ...nyc, date: utc(2026, 11, 1, 17) });
    expect(inZone(times.sunrise)).toBe('06:28');
    expect(inZone(times.sunset)).toBe('16:51');
    expect(inZone(times.civilDusk)).toBe('17:21');
  });

  /**
   * The sampling bug in one case. Troll's local day on 25 October 2026 is
   * twenty-six hours long and the sun sets at 22:04 local — 1444 minutes in. A
   * fixed 1441-sample sweep stops at 22:00 and reports no sunset at all, which
   * on a call sheet reads as a polar day that is not happening.
   */
  it('still finds a sunset that falls past the twenty-fourth hour of a long day', () => {
    const times = sunTimes({ lat: -72, lng: -20, date: utc(2026, 10, 25, 12), timeZone: 'Antarctica/Troll' });
    const start = startOfDayInZone(utc(2026, 10, 25, 12), 'Antarctica/Troll');
    expect(clockInZone(times.sunset!, 'Antarctica/Troll')).toBe('22:04');
    expect((times.sunset!.getTime() - start.getTime()) / 60_000).toBeGreaterThan(1440);
    expect(times.polarNight).toBe(false);
    expect(times.midnightSun).toBe(false);
  });

  it('reports the fallback zone on the result when the zone is not readable', () => {
    const times = sunTimes({ ...nyc, timeZone: 'Nowhere/Special', date: utc(2026, 11, 1, 17) });
    expect(times.timeZone.origin).toBe('fallback');
    expect(times.timeZone.requested).toBe('Nowhere/Special');
    expectPrintsTheMachineClock(times.timeZone.id);
  });
});
