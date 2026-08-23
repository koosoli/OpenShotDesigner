import { describe, it, expect } from 'vitest';
import {
  addIsoDays,
  dayNumberToIso,
  defaultNewEventPeriod,
  eventSpan,
  followingDayAfterLast,
  isoDayNumber,
  productionDaySpan,
  shiftClipSpan,
  timelineBoundsFor,
} from '../scheduling/calendarDate';
import type { ProductionCalendarEvent, ProductionDay } from '../scheduling';

const event = (startDate: string, endDate?: string): ProductionCalendarEvent => ({
  id: 'e1',
  title: 'Phase',
  startDate,
  endDate: endDate ?? startDate,
  category: 'preproduction',
});

const day = (date: string | undefined, id = 'd1'): ProductionDay => ({
  id,
  name: `Day ${id}`,
  date,
  scheduleBlockIds: [],
});

describe('calendarDate', () => {
  it('converts ISO dates to stable whole-day numbers and back', () => {
    expect(isoDayNumber('2026-03-01')).toBe(Date.parse('2026-03-01T00:00:00Z') / 86_400_000);
    expect(dayNumberToIso(isoDayNumber('2026-03-01') as number)).toBe('2026-03-01');
    // DST boundary (US 2026-03-08) must not drift a day.
    expect(addIsoDays('2026-03-07', 2)).toBe('2026-03-09');
  });

  it('treats absent or malformed dates as unknown, never epoch', () => {
    expect(isoDayNumber(undefined)).toBeNull();
    expect(isoDayNumber('')).toBeNull();
    expect(isoDayNumber('2026-13-40')).toBeNull();
    expect(isoDayNumber('not-a-date')).toBeNull();
    expect(addIsoDays(undefined, 1)).toBeUndefined();
  });

  it('defaults a new shooting day to the day after the last dated one', () => {
    expect(followingDayAfterLast([day('2026-05-10'), day('2026-05-14'), day(undefined)])).toBe('2026-05-15');
    // Undated-only projects start from today.
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(followingDayAfterLast([day(undefined), day(undefined, 'd2')])).toBe(todayIso);
  });

  it('normalises event spans and treats end < start as single-day', () => {
    expect(eventSpan(event('2026-01-10', '2026-01-12'))).toEqual({
      start: isoDayNumber('2026-01-10'),
      end: isoDayNumber('2026-01-12'),
    });
    expect(eventSpan(event('2026-01-10'))?.start).toBe(eventSpan(event('2026-01-10'))?.end);
    expect(eventSpan(event('2026-01-12', '2026-01-10'))).toEqual({
      start: isoDayNumber('2026-01-12'),
      end: isoDayNumber('2026-01-12'),
    });
    expect(eventSpan(event(''))).toBeNull();
  });

  it('maps production days to single-day spans', () => {
    expect(productionDaySpan(day('2026-02-01'))).toEqual({ start: isoDayNumber('2026-02-01'), end: isoDayNumber('2026-02-01') });
    expect(productionDaySpan(day(undefined))).toBeNull();
  });

  it('bounds the axis with padding and a minimum visible window', () => {
    const bounds = timelineBoundsFor(
      [eventSpan(event('2026-04-01', '2026-04-03')), productionDaySpan(day('2026-04-10'))].filter(
        (span): span is NonNullable<typeof span> => span !== null,
      ),
      { padding: 2 }
    );
    expect(bounds.start).toBe((isoDayNumber('2026-04-01') as number) - 2);
    expect(daysBetween(bounds.start, bounds.end)).toBeGreaterThanOrEqual(14);

    // Empty input still yields a usable axis around today.
    const emptyBounds = timelineBoundsFor([], { minDays: 7 });
    expect(emptyBounds.days).toBe(7);
  });

  it('defaults a new timeline line to the first production day', () => {
    expect(defaultNewEventPeriod([day(undefined), day('2026-06-02', 'd2'), day('2026-06-05', 'd3')])).toEqual({
      startDate: '2026-06-02',
      endDate: '2026-06-02',
    });
    // No dated days → today.
    const fallback = defaultNewEventPeriod([]);
    expect(fallback.startDate).toBe(fallback.endDate);
  });

  it('shifts clips by whole days for move and resize gestures', () => {
    const source = event('2026-07-06', '2026-07-08');
    expect(shiftClipSpan(source, 3, 'move')).toEqual({ startDate: '2026-07-09', endDate: '2026-07-11' });
    expect(shiftClipSpan(source, -10, 'move')).toEqual({ startDate: '2026-06-26', endDate: '2026-06-28' });
    // Resizing clamps so start never passes the end and vice versa.
    expect(shiftClipSpan(source, -5, 'resize-start')).toEqual({ startDate: '2026-07-01', endDate: '2026-07-08' });
    expect(shiftClipSpan(source, -50, 'resize-start').startDate <= shiftClipSpan(source, -50, 'resize-start').endDate).toBe(true);
    expect(shiftClipSpan(source, 20, 'resize-start')).toEqual({ startDate: '2026-07-08', endDate: '2026-07-08' });
    expect(shiftClipSpan(source, 4, 'resize-end')).toEqual({ startDate: '2026-07-06', endDate: '2026-07-12' });
    expect(shiftClipSpan(source, -20, 'resize-end')).toEqual({ startDate: '2026-07-06', endDate: '2026-07-06' });
  });
});

const daysBetween = (startDay: number, endDay: number): number => endDay - startDay + 1;
