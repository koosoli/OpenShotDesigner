import { describe, expect, it } from 'vitest';
import { deriveDaylight } from '../reports';

// Berlin, mid-summer and mid-winter. The same coordinates the sun domain was
// verified against, so a change in the astronomy shows up here too. Cases that
// assert a printed clock name their zone as well, so the expectation does not
// move when the machine running the suite does.
const BERLIN = { lat: 52.52, lng: 13.405 };

/**
 * The machine's zone read straight from `Intl`, not from the sun domain's own
 * `machineTimeZone()`: an expectation built out of the function under test
 * passes whatever that function returns, including a hard-coded 'UTC'.
 */
const MACHINE_ZONE = new Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * A sheet that fell back has to have printed in the machine's zone, not merely
 * to have named it: naming that same zone deliberately must produce the same
 * clock for the same Berlin day.
 */
const expectPrintedInTheMachineZone = (daylight: ReturnType<typeof deriveDaylight>) => {
  expect(daylight.timeZone).toBe(MACHINE_ZONE);
  const named = deriveDaylight({ ...BERLIN, date: '2026-06-21', timeZone: MACHINE_ZONE });
  expect(named.timeZoneOrigin).toBe('location');
  expect(daylight.sunrise).toBe(named.sunrise);
  expect(daylight.sunset).toBe(named.sunset);
};

describe('deriveDaylight', () => {
  it('calculates both ends from the location pin and the date', () => {
    const daylight = deriveDaylight({ ...BERLIN, date: '2026-06-21' });
    expect(daylight.sunriseOrigin).toBe('derived');
    expect(daylight.sunsetOrigin).toBe('derived');
    expect(daylight.sunrise).toMatch(/^\d{2}:\d{2}$/);
    expect(daylight.sunset).toMatch(/^\d{2}:\d{2}$/);
  });

  it('puts midsummer sunrise before midwinter sunrise, and sunset after', () => {
    const summer = deriveDaylight({ ...BERLIN, date: '2026-06-21' });
    const winter = deriveDaylight({ ...BERLIN, date: '2026-12-21' });
    expect(summer.sunrise! < winter.sunrise!).toBe(true);
    expect(summer.sunset! > winter.sunset!).toBe(true);
  });

  /**
   * The whole point of the override: a production works to its own published
   * times, or to a time adjusted for a ridge line no ephemeris knows about.
   */
  it('lets an explicit time beat the calculation', () => {
    const daylight = deriveDaylight({ ...BERLIN, date: '2026-06-21', sunsetOverride: '20:15' });
    expect(daylight.sunset).toBe('20:15');
    expect(daylight.sunsetOrigin).toBe('override');
    // The other end is untouched — the two are independent.
    expect(daylight.sunriseOrigin).toBe('derived');
  });

  it('honours an override even with no location to calculate from', () => {
    const daylight = deriveDaylight({ date: '2026-06-21', sunriseOverride: '04:50' });
    expect(daylight.sunrise).toBe('04:50');
    expect(daylight.sunriseOrigin).toBe('override');
    expect(daylight.sunsetOrigin).toBe('unknown');
  });

  it('treats a blank override as absent rather than as an empty time', () => {
    const daylight = deriveDaylight({ ...BERLIN, date: '2026-06-21', sunriseOverride: '   ' });
    expect(daylight.sunriseOrigin).toBe('derived');
  });

  it('reports unknown rather than guessing when there is no pin', () => {
    const daylight = deriveDaylight({ date: '2026-06-21' });
    expect(daylight).toMatchObject({ sunriseOrigin: 'unknown', sunsetOrigin: 'unknown' });
    expect(daylight.sunrise).toBeUndefined();
  });

  it('reports unknown when the day has no date yet', () => {
    expect(deriveDaylight(BERLIN).sunriseOrigin).toBe('unknown');
  });

  it('ignores a malformed date instead of drifting into another day', () => {
    expect(deriveDaylight({ ...BERLIN, date: '21/06/2026' }).sunriseOrigin).toBe('unknown');
  });

  /**
   * "—" for a Tromsø shoot in December is technically true and useless. The
   * sheet has to say why there is no sunrise.
   */
  it('explains a polar night instead of printing a blank', () => {
    const daylight = deriveDaylight({ lat: 69.65, lng: 18.96, date: '2026-12-21' });
    expect(daylight.note).toMatch(/polar night/i);
    expect(daylight.sunriseOrigin).toBe('unknown');
  });

  it('explains midnight sun the same way', () => {
    const daylight = deriveDaylight({ lat: 69.65, lng: 18.96, date: '2026-06-21' });
    expect(daylight.note).toMatch(/midnight sun/i);
    expect(daylight.sunsetOrigin).toBe('unknown');
  });

  /**
   * The bug that made this worth threading a zone through: a producer in
   * Luxembourg scheduling a Los Angeles day. Before, the sheet printed the LA
   * sun in CEST — 14:44 and 05:07 — and looked entirely plausible while being
   * nine hours wrong on the one document the crew turns up on.
   */
  it('prints an LA shoot day in LA time, wherever it was scheduled from', () => {
    const daylight = deriveDaylight({
      lat: 34.0522,
      lng: -118.2437,
      date: '2026-06-21',
      timeZone: 'America/Los_Angeles',
    });
    expect(daylight.sunrise).toBe('05:44');
    expect(daylight.sunset).toBe('20:07');
    expect(daylight.timeZone).toBe('America/Los_Angeles');
    expect(daylight.timeZoneOrigin).toBe('location');
  });

  it('gives the same instants a different clock when the location is in Berlin', () => {
    const la = deriveDaylight({ lat: 34.0522, lng: -118.2437, date: '2026-06-21', timeZone: 'America/Los_Angeles' });
    const berlin = deriveDaylight({ lat: 52.52, lng: 13.405, date: '2026-06-21', timeZone: 'Europe/Berlin' });
    expect(berlin.sunrise).toBe('04:46');
    expect(berlin.sunset).toBe('21:32');
    expect(berlin.sunrise).not.toBe(la.sunrise);
  });

  it('crosses a spring-forward day without losing an hour', () => {
    const daylight = deriveDaylight({
      lat: 40.7128,
      lng: -74.006,
      date: '2026-03-08',
      timeZone: 'America/New_York',
    });
    expect(daylight.sunrise).toBe('07:21');
    expect(daylight.sunset).toBe('18:54');
  });

  it('crosses a fall-back day without gaining one', () => {
    const daylight = deriveDaylight({
      lat: 40.7128,
      lng: -74.006,
      date: '2026-11-01',
      timeZone: 'America/New_York',
    });
    expect(daylight.sunrise).toBe('06:28');
    expect(daylight.sunset).toBe('16:51');
  });

  /** Rule 13: the sheet says the zone it could not read rather than implying one. */
  it('falls back visibly when the location names a zone nobody knows', () => {
    const daylight = deriveDaylight({ ...BERLIN, date: '2026-06-21', timeZone: 'Mars/Olympus_Mons' });
    expect(daylight.timeZoneOrigin).toBe('fallback');
    expect(daylight.note).toMatch(/Mars\/Olympus_Mons/);
    expect(daylight.note).toMatch(/not recognised/i);
    expectPrintedInTheMachineZone(daylight);
  });

  it('says the zone came from the machine when the location has none', () => {
    const daylight = deriveDaylight({ ...BERLIN, date: '2026-06-21' });
    expect(daylight.timeZoneOrigin).toBe('machine');
    expectPrintedInTheMachineZone(daylight);
  });

  it('reports an unreadable zone even on a sheet with no pin to calculate from', () => {
    const daylight = deriveDaylight({ date: '2026-06-21', timeZone: 'Mars/Olympus_Mons' });
    expect(daylight.timeZoneOrigin).toBe('fallback');
    expect(daylight.note).toMatch(/not recognised/i);
  });

  it('still honours an override during a polar night', () => {
    const daylight = deriveDaylight({
      lat: 69.65,
      lng: 18.96,
      date: '2026-12-21',
      sunriseOverride: 'no sunrise — work to lamps',
    });
    expect(daylight.sunrise).toBe('no sunrise — work to lamps');
    expect(daylight.sunriseOrigin).toBe('override');
  });

  describe('golden hour', () => {
    it('runs from sunrise in the morning and to sunset in the evening', () => {
      const daylight = deriveDaylight({ ...BERLIN, date: '2026-06-21', timeZone: 'Europe/Berlin' });
      expect(daylight.goldenHourMorning?.from).toBe(daylight.sunrise);
      expect(daylight.goldenHourEvening?.to).toBe(daylight.sunset);
    });

    it('gives Berlin midsummer an evening window ending near 21:30', () => {
      const daylight = deriveDaylight({ ...BERLIN, date: '2026-06-21', timeZone: 'Europe/Berlin' });
      expect(daylight.goldenHourEvening?.to).toMatch(/^21:3\d$/);
      // Long, because the sun sinks at a shallow angle at this latitude in June.
      expect(daylight.goldenHourEvening?.from).toMatch(/^20:\d\d$/);
    });

    it('is printed in the location zone, not the machine zone', () => {
      const berlin = deriveDaylight({ ...BERLIN, date: '2026-06-21', timeZone: 'Europe/Berlin' });
      const tokyo = deriveDaylight({ ...BERLIN, date: '2026-06-21', timeZone: 'Asia/Tokyo' });
      expect(berlin.goldenHourEvening?.to).not.toBe(tokyo.goldenHourEvening?.to);
    });

    it('is absent when there is no pin to calculate from', () => {
      const daylight = deriveDaylight({ date: '2026-06-21', sunsetOverride: '21:32' });
      expect(daylight.goldenHourEvening).toBeUndefined();
    });

    it('is absent during a polar night rather than a plausible pair of times', () => {
      const daylight = deriveDaylight({ lat: 69.65, lng: 18.96, date: '2026-12-21' });
      expect(daylight.goldenHourMorning).toBeUndefined();
      expect(daylight.goldenHourEvening).toBeUndefined();
    });

    it('stays astronomical when sunset has been corrected by hand', () => {
      // The override says something about the horizon, not about the sun's
      // elevation. Shifting the window to match would invent a second fact
      // out of the first.
      const plain = deriveDaylight({ ...BERLIN, date: '2026-06-21', timeZone: 'Europe/Berlin' });
      const corrected = deriveDaylight({
        ...BERLIN,
        date: '2026-06-21',
        timeZone: 'Europe/Berlin',
        sunsetOverride: '20:15',
      });
      expect(corrected.sunset).toBe('20:15');
      expect(corrected.goldenHourEvening).toEqual(plain.goldenHourEvening);
    });
  });
});
