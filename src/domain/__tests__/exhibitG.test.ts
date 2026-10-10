import { describe, expect, it } from 'vitest';
import { exhibitGTotals, exhibitGWarnings, parseClock, seedExhibitGEntries } from '../reports/exhibitG';
import type { PerformerTimeEntry, PerformerTimeReport } from '../reports/exhibitG';

const entry = (overrides: Partial<PerformerTimeEntry>): PerformerTimeEntry => ({ id: 'e1', name: 'ADA', personId: 'p1', ...overrides });

describe('parseClock', () => {
  it('reads 24-hour times', () => {
    expect(parseClock('06:30')).toBe(390);
    expect(parseClock('6:30')).toBe(390);
    expect(parseClock('1830')).toBe(1110);
    expect(parseClock('nope')).toBeUndefined();
  });
});

describe('exhibitGTotals', () => {
  it('subtracts meals from the working day and finds overtime', () => {
    const totals = exhibitGTotals(entry({ reportMakeup: '06:00', meal1Out: '12:00', meal1In: '12:30', dismissMakeup: '17:30' }));
    expect(totals.workedMinutes).toBe(11 * 60);
    expect(totals.overtimeMinutes).toBe(3 * 60);
    expect(totals.mealPenalties).toBe(0);
  });

  it('counts a started half hour past six hours as a meal penalty', () => {
    // Meal 61 minutes late: three half-hour periods started.
    expect(exhibitGTotals(entry({ reportMakeup: '06:00', meal1Out: '13:01', meal1In: '13:31', dismissMakeup: '16:00' })).mealPenalties).toBe(3);
  });

  it('penalises the stretch after the last meal too', () => {
    const totals = exhibitGTotals(entry({ reportMakeup: '06:00', meal1Out: '11:00', meal1In: '11:30', dismissMakeup: '18:15' }));
    expect(totals.mealPenalties).toBe(2);
  });

  it('does not reset the clock for a meal under 30 minutes', () => {
    const totals = exhibitGTotals(entry({ reportMakeup: '06:00', meal1Out: '11:00', meal1In: '11:20', dismissMakeup: '13:00' }));
    expect(totals.mealPenalties).toBe(2);
  });

  it('reads dismissal after midnight as the next day', () => {
    const totals = exhibitGTotals(entry({ reportMakeup: '16:00', meal1Out: '21:00', meal1In: '21:30', dismissMakeup: '01:30' }));
    expect(totals.workedMinutes).toBe(9 * 60);
  });
});

describe('exhibitGWarnings', () => {
  it('flags a forced call when rest is under twelve hours', () => {
    const yesterday: PerformerTimeReport = { id: 'r0', dayId: 'd0', entries: [entry({ reportMakeup: '10:00', dismissMakeup: '23:00' })] };
    const today: PerformerTimeReport = { id: 'r1', dayId: 'd1', entries: [entry({ reportMakeup: '07:00', dismissMakeup: '15:00', meal1Out: '12:00', meal1In: '12:30' })] };
    const warnings = exhibitGWarnings(today, { report: yesterday, daysBetween: 1 });
    expect(warnings.some((w) => w.kind === 'forced_call')).toBe(true);
  });

  it('flags missing times', () => {
    const warnings = exhibitGWarnings({ id: 'r', dayId: 'd', entries: [entry({})] });
    expect(warnings[0].kind).toBe('missing_time');
  });
});

describe('seedExhibitGEntries', () => {
  it('adds missing performers in cast order and keeps existing rows', () => {
    const rows = seedExhibitGEntries({
      performers: [
        { personId: 'p2', name: 'BEA', castNumber: 2, callTime: '07:00', status: 'SW' },
        { personId: 'p1', name: 'ADA', castNumber: 1 },
      ],
      existing: [entry({ reportMakeup: '06:00', castNumber: 1 })],
    });
    expect(rows.map((row) => row.name)).toEqual(['ADA', 'BEA']);
    expect(rows[0].reportMakeup).toBe('06:00');
    expect(rows[1]).toMatchObject({ reportMakeup: '07:00', status: 'SW' });
  });
});

describe('nextClockStep', () => {
  it('offers the step after the last recorded one, and nothing once wrapped', async () => {
    const { nextClockStep } = await import('../reports/exhibitG');
    expect(nextClockStep({ id: 'e', name: 'A' }).next?.label).toBe('In make-up');
    expect(nextClockStep({ id: 'e', name: 'A', reportMakeup: '07:00' }).next?.label).toBe('On set');
    const wrapped = nextClockStep({ id: 'e', name: 'A', reportMakeup: '07:00', meal1Out: '12:00', meal1In: '12:30', dismissMakeup: '19:00' });
    expect(wrapped.last?.label).toBe('Out of make-up');
    expect(wrapped.next).toBeUndefined();
  });
});

describe('Exhibit G contracts, minors and sheet limits', () => {
  it('starts weekly overtime after ten hours', () => {
    const day = { reportMakeup: '06:00', meal1Out: '12:00', meal1In: '12:30', dismissMakeup: '17:30' };
    expect(exhibitGTotals(entry(day)).overtimeMinutes).toBe(180);
    expect(exhibitGTotals(entry({ ...day, contract: 'weekly' })).overtimeMinutes).toBe(60);
  });

  it('warns when a minor works past the limit', () => {
    const report: PerformerTimeReport = { id: 'r', dayId: 'd', entries: [entry({ minor: true, reportMakeup: '07:00', meal1Out: '12:00', meal1In: '12:30', dismissMakeup: '16:30' })] };
    expect(exhibitGWarnings(report).some((w) => w.kind === 'minor_hours')).toBe(true);
    expect(exhibitGWarnings({ ...report, limits: { minorMaxWorkMinutes: 10 * 60 } }).some((w) => w.kind === 'minor_hours')).toBe(false);
  });

  it('applies a sheet’s own meal clock', () => {
    const late = entry({ reportMakeup: '06:00', meal1Out: '12:30', meal1In: '13:00', dismissMakeup: '15:00' });
    expect(exhibitGTotals(late).mealPenalties).toBe(1);
    expect(exhibitGTotals(late, { mealDueAfterMinutes: 7 * 60 }).mealPenalties).toBe(0);
  });
});
