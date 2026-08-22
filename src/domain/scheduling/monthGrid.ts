/**
 * Month-grid math for the production calendar (plan §4.7).
 *
 * Pure, timezone-free calendar-day arithmetic on top of `calendarDate.ts`.
 * Weeks start on Monday (ISO) by default.
 */

import { dayNumberToIso, isoDayNumber } from './calendarDate';
import type { ProductionCalendarEvent, ProductionDay } from './types';

export const YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/;

export interface MonthGridDay {
  iso: string;
  /** Day of month, 1-31. */
  dayOfMonth: number;
  inMonth: boolean;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

export interface MonthGrid {
  yearMonth: string;
  /** Always 6 rows × 7 days so the grid never jumps in height. */
  weeks: MonthGridDay[][];
}

export const yearMonthOf = (iso: string): string => iso.slice(0, 7);

/** Shift a yyyy-mm by whole months (negative allowed). */
export const shiftYearMonth = (yearMonth: string, delta: number): string => {
  const [y, m] = yearMonth.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12 + 12) % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
};

export const monthLabel = (yearMonth: string, locale?: string): string => {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** Monday-first weekday index for an ISO day. */
const mondayIndex = (dayNumber: number): number => ((dayNumber + 3) % 7 + 7) % 7; // 1970-01-01 was a Thursday (index 3)

export const buildMonthGrid = (yearMonth: string): MonthGrid => {
  if (!YEAR_MONTH_PATTERN.test(yearMonth)) throw new Error(`Invalid year-month: ${yearMonth}`);
  const first = isoDayNumber(`${yearMonth}-01`);
  if (first === null) throw new Error(`Invalid year-month: ${yearMonth}`);
  const start = first - mondayIndex(first);
  const weeks: MonthGridDay[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const row: MonthGridDay[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const dayNumber = start + week * 7 + weekday;
      const iso = dayNumberToIso(dayNumber);
      row.push({ iso, dayOfMonth: Number(iso.slice(8, 10)), inMonth: yearMonthOf(iso) === yearMonth, weekday });
    }
    weeks.push(row);
  }
  return { yearMonth, weeks };
};

/** Events whose inclusive span covers `iso`, in start order. */
export const eventsOnDay = (events: readonly ProductionCalendarEvent[], iso: string): ProductionCalendarEvent[] => {
  const day = isoDayNumber(iso);
  if (day === null) return [];
  return events
    .filter((event) => {
      const start = isoDayNumber(event.startDate);
      const end = isoDayNumber(event.endDate) ?? start;
      return start !== null && end !== null && day >= start && day <= end;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
};

export const productionDaysOn = (days: readonly ProductionDay[], iso: string): ProductionDay[] =>
  days.filter((day) => day.date === iso);

/** The month that should open by default: today if anything is scheduled around it, else the first dated item. */
export const defaultCalendarMonth = (
  events: readonly ProductionCalendarEvent[],
  days: readonly ProductionDay[],
  today: string,
): string => {
  const dated = [...events.map((event) => event.startDate), ...days.map((day) => day.date)]
    .filter((value): value is string => !!value && isoDayNumber(value) !== null)
    .sort();
  if (dated.length === 0) return yearMonthOf(today);
  const todayMonth = yearMonthOf(today);
  if (dated.some((value) => yearMonthOf(value) === todayMonth)) return todayMonth;
  return yearMonthOf(dated[0]);
};
