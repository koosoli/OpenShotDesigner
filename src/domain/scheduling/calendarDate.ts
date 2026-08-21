/**
 * Pure ISO date (yyyy-mm-dd) day math for the production timeline calendar.
 *
 * No React, no persistence — domain logic only (repo rule: business logic
 * lives in the domain layer with unit tests). Dates are timezone-free
 * calendar days: internally converted to whole-day numbers since epoch so
 * timeline math never drifts across DST boundaries.
 */

import type { ProductionCalendarEvent, ProductionDay } from './types';

export const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MS_PER_DAY = 86_400_000;

/** Whole days since 1970-01-01 for an ISO date; null when absent/malformed. */
export const isoDayNumber = (value: string | undefined): number | null => {
  if (!value || !ISO_DAY_PATTERN.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / MS_PER_DAY) : null;
};

/** ISO date (yyyy-mm-dd) from a whole-day epoch number. */
export const dayNumberToIso = (dayNumber: number): string =>
  new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);

/**
 * Shift an ISO date by whole days. Returns undefined for absent/malformed
 * input — missing data stays unknown instead of silently becoming an epoch.
 */
export const addIsoDays = (value: string | undefined, days: number): string | undefined => {
  const base = isoDayNumber(value);
  return base === null ? undefined : dayNumberToIso(base + days);
};

/** Today's local date as an ISO string (yyyy-mm-dd). */
export const todayIso = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

/**
 * Default date for a NEW shooting day: the day after the last already-dated
 * production day, or today when nothing is dated yet. Undated entries are
 * ignored rather than treated as epoch 0 (rule 13).
 */
export const followingDayAfterLast = (days: Array<ProductionDay | string | undefined>): string => {
  let latest: number | null = null;
  for (const entry of days) {
    const value = typeof entry === 'string' ? entry : entry?.date;
    const dayNumber = isoDayNumber(value);
    if (dayNumber === null) continue;
    latest = latest === null ? dayNumber : Math.max(latest, dayNumber);
  }
  return latest === null ? todayIso() : dayNumberToIso(latest + 1);
};

/** Inclusive [start..end] day span of one calendar clip. */
export interface ClipSpan {
  start: number;
  end: number;
}

/** Normalized span for an event; null when it has no usable start date. */
export const eventSpan = (event: ProductionCalendarEvent): ClipSpan | null => {
  const start = isoDayNumber(event.startDate);
  if (start === null) return null;
  const end = isoDayNumber(event.endDate);
  return { start, end: end === null || end < start ? start : end };
};

/** Normalized single-day span for a production day; null when undated. */
export const productionDaySpan = (day: ProductionDay): ClipSpan | null => {
  const start = isoDayNumber(day.date);
  return start === null ? null : { start, end: start };
};

export interface TimelineBounds {
  /** First day of the axis (whole-day epoch number). */
  start: number;
  /** Last day of the axis (inclusive). */
  end: number;
  /** Visible day count — always ≥ minDays so a fresh project still renders. */
  days: number;
}

/**
 * Bounding axis for the timeline with `padding` free days on each side so new
 * clips are never flush against an edge and drags can extend past content.
 */
export const timelineBoundsFor = (
  spans: ClipSpan[],
  options: { padding?: number; minDays?: number } = {},
): TimelineBounds => {
  const padding = Math.max(0, options.padding ?? 2);
  const minDays = Math.max(1, options.minDays ?? 14);
  let start: number | null = null;
  let end: number | null = null;
  for (const span of spans) {
    start = start === null ? span.start : Math.min(start, span.start);
    end = end === null ? span.end : Math.max(end, span.end);
  }
  if (start === null || end === null) {
    const today = isoDayNumber(todayIso()) ?? 0;
    return { start: today - padding, end: today + padding + minDays - 1, days: minDays };
  }
  const paddedStart = start - padding;
  const paddedEnd = end + padding;
  return {
    start: paddedStart,
    end: paddedEnd,
    days: Math.max(minDays, paddedEnd - paddedStart + 1),
  };
};

/**
 * Default period for a newly created timeline line: the FIRST production day
 * when one is dated (so users can just drag it into place afterwards),
 * otherwise today. Always a single day to begin with.
 */
export const defaultNewEventPeriod = (
  days: ProductionDay[],
): { startDate: string; endDate: string } => {
  const firstDated = days
    .map((day) => day.date)
    .find((date): date is string => isoDayNumber(date) !== null);
  const startDate = firstDated ?? todayIso();
  return { startDate, endDate: startDate };
};

/**
 * Apply a whole-day delta to an event span.
 * - `move`: shifts both ends equally.
 * - `resize-start`: moves only the start, clamped so start ≤ end.
 * - `resize-end`: moves only the end, clamped so end ≥ start.
 */
export const shiftClipSpan = (
  event: ProductionCalendarEvent,
  deltaDays: number,
  mode: 'move' | 'resize-start' | 'resize-end',
): { startDate: string; endDate: string } => {
  const span = eventSpan(event) ?? { start: isoDayNumber(todayIso()) ?? 0, end: isoDayNumber(todayIso()) ?? 0 };
  if (mode === 'move') {
    return { startDate: dayNumberToIso(span.start + deltaDays), endDate: dayNumberToIso(span.end + deltaDays) };
  }
  if (mode === 'resize-start') {
    const nextStart = Math.min(span.start + deltaDays, span.end);
    return { startDate: dayNumberToIso(nextStart), endDate: dayNumberToIso(span.end) };
  }
  const nextEnd = Math.max(span.end + deltaDays, span.start);
  return { startDate: dayNumberToIso(span.start), endDate: dayNumberToIso(nextEnd) };
};
