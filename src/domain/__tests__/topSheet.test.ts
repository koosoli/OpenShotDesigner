import { describe, expect, it } from 'vitest';
import { deriveTopSheet } from '../budget/topSheet';
import type { BudgetSummary } from '../budget/logic';

const summary = {
  settings: { currency: 'EUR', defaultVatPercent: 19, weekDays: 5 },
  shootDays: 2,
  entries: [],
  categories: [
    { category: 'above_the_line', label: 'Above the line', net: 1000, vat: 0, gross: 1000, entries: [] },
    { category: 'crew', label: 'Crew', net: 3000, vat: 0, gross: 3000, entries: [] },
  ],
  vatByRate: [],
  net: 4000,
  vat: 760,
  gross: 4760,
  contingency: 400,
  total: 5160,
  aboveTheLine: { net: 1000, vat: 0, gross: 1000 },
  belowTheLine: { net: 3000, vat: 0, gross: 3000 },
  unpriced: [],
} as unknown as BudgetSummary;

describe('deriveTopSheet', () => {
  it('splits accounts above and below the line with shares and totals', () => {
    const sheet = deriveTopSheet(summary);
    expect(sheet.aboveTheLine).toEqual([expect.objectContaining({ account: '1000', estimate: 1000, percent: 25 })]);
    expect(sheet.belowTheLine).toEqual([expect.objectContaining({ account: '2000', estimate: 3000, percent: 75 })]);
    expect(sheet).toMatchObject({ subtotalAbove: 1000, subtotalBelow: 3000, total: 5160 });
    expect(sheet.actualTotal).toBeUndefined();
  });

  it('shows actuals and variance once spend is logged, including unbudgeted accounts', () => {
    const sheet = deriveTopSheet(summary, [
      { id: 'a', category: 'crew', label: 'Crew wk 1', amount: 3200 },
      { id: 'b', category: 'catering', label: 'Lunch', amount: 150 },
    ]);
    expect(sheet.belowTheLine.find((row) => row.category === 'crew')).toMatchObject({ actual: 3200, variance: -200 });
    expect(sheet.belowTheLine.find((row) => row.category === 'catering')).toMatchObject({ estimate: 0, actual: 150 });
    expect(sheet.actualTotal).toBe(3350);
  });
});
