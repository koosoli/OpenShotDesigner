import { describe, expect, it } from 'vitest';
import { deriveDaylight } from '../reports';

// Berlin, mid-summer and mid-winter. The same coordinates the sun domain was
// verified against, so a change in the astronomy shows up here too.
const BERLIN = { lat: 52.52, lng: 13.405 };

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
});
