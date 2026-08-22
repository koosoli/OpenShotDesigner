import { describe, it, expect } from 'vitest';
import {
  buildMonthGrid,
  defaultCalendarMonth,
  eventsOnDay,
  monthLabel,
  productionDaysOn,
  shiftYearMonth,
} from '../scheduling/monthGrid';
import type { ProductionCalendarEvent, ProductionDay } from '../scheduling';

describe('buildMonthGrid', () => {
  it('produces six Monday-first weeks covering the month', () => {
    const grid = buildMonthGrid('2026-08');
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    // 1 Aug 2026 is a Saturday → Monday 27 Jul starts the grid.
    expect(grid.weeks[0][0]).toMatchObject({ iso: '2026-07-27', inMonth: false, weekday: 0 });
    expect(grid.weeks[0][5]).toMatchObject({ iso: '2026-08-01', inMonth: true, dayOfMonth: 1, weekday: 5 });
    expect(grid.weeks[5][6].iso).toBe('2026-09-06');
    const inMonth = grid.weeks.flat().filter((day) => day.inMonth);
    expect(inMonth).toHaveLength(31);
  });

  it('handles a month starting on Monday and February', () => {
    const june = buildMonthGrid('2026-06'); // 1 June 2026 is a Monday
    expect(june.weeks[0][0]).toMatchObject({ iso: '2026-06-01', inMonth: true });
    const feb = buildMonthGrid('2024-02');
    expect(feb.weeks.flat().filter((day) => day.inMonth)).toHaveLength(29);
  });

  it('rejects malformed input', () => {
    expect(() => buildMonthGrid('2026-13')).toThrow();
    expect(() => buildMonthGrid('nope')).toThrow();
  });
});

describe('shiftYearMonth / monthLabel', () => {
  it('wraps across years in both directions', () => {
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftYearMonth('2026-06', -18)).toBe('2024-12');
    expect(shiftYearMonth('2026-06', 0)).toBe('2026-06');
  });

  it('labels months in UTC so the day never drifts', () => {
    expect(monthLabel('2026-08', 'en-US')).toBe('August 2026');
  });
});

describe('eventsOnDay / productionDaysOn / defaultCalendarMonth', () => {
  const events: ProductionCalendarEvent[] = [
    { id: 'a', title: 'Scout', startDate: '2026-08-10', endDate: '2026-08-12', category: 'preproduction' },
    { id: 'b', title: 'Shoot', startDate: '2026-08-12', endDate: '2026-08-20', category: 'shoot' },
    { id: 'c', title: 'Bad', startDate: 'nope', endDate: 'nope', category: 'custom' },
  ];
  const days: ProductionDay[] = [
    { id: 'd1', name: 'Day 1', date: '2026-08-12', scheduleBlockIds: [] },
    { id: 'd2', name: 'Undated', scheduleBlockIds: [] },
  ];

  it('returns spanning events in start order and ignores malformed dates', () => {
    expect(eventsOnDay(events, '2026-08-12').map((e) => e.id)).toEqual(['a', 'b']);
    expect(eventsOnDay(events, '2026-08-09')).toEqual([]);
    expect(eventsOnDay(events, 'bad')).toEqual([]);
    expect(productionDaysOn(days, '2026-08-12').map((d) => d.id)).toEqual(['d1']);
  });

  it('opens on today when something is scheduled this month, else on the first dated item', () => {
    expect(defaultCalendarMonth(events, days, '2026-08-22')).toBe('2026-08');
    expect(defaultCalendarMonth(events, days, '2026-11-02')).toBe('2026-08');
    expect(defaultCalendarMonth([], [days[1]], '2026-11-02')).toBe('2026-11');
  });
});
