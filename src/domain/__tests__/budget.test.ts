import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET_SETTINGS,
  VAT_PRESETS,
  budgetToCsv,
  deriveBudget,
  emptyBudget,
  isAboveTheLine,
  normaliseRateCard,
  rateNet,
  roundMoney,
} from '../budget';
import type { ProjectBudget } from '../budget';
import type { Person } from '../people';

describe('roundMoney', () => {
  it('rounds half up to the cent and survives floating point', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(NaN)).toBe(0);
  });
});

describe('rateNet', () => {
  it('prices a day rate by days and quantity', () => {
    expect(rateNet({ amount: 450, basis: 'day' }, 6, 1, 5)).toBe(2700);
    expect(rateNet({ amount: 120, basis: 'day' }, 3, 2, 5)).toBe(720);
  });
  /** Six days at €2,000/week over a five-day week is €2,400, not two weeks. */
  it('pro-rates a weekly rate by the day', () => {
    expect(rateNet({ amount: 2000, basis: 'week' }, 6, 1, 5)).toBe(2400);
    expect(rateNet({ amount: 2000, basis: 'week' }, 5, 1, 5)).toBe(2000);
    expect(rateNet({ amount: 2000, basis: 'week' }, 6, 1, 6)).toBe(2000);
  });
  it('a flat fee ignores the schedule', () => {
    expect(rateNet({ amount: 5000, basis: 'flat' }, 0, 1, 5)).toBe(5000);
    expect(rateNet({ amount: 5000, basis: 'flat' }, 12, 1, 5)).toBe(5000);
  });
  it('zero days is zero, never a guess', () => {
    expect(rateNet({ amount: 450, basis: 'day' }, 0, 1, 5)).toBe(0);
  });
  /** A struck line prices as nothing. It used to quietly price as one. */
  it('zero quantity is zero, on every basis', () => {
    expect(rateNet({ amount: 450, basis: 'day' }, 6, 0, 5)).toBe(0);
    expect(rateNet({ amount: 2000, basis: 'week' }, 6, 0, 5)).toBe(0);
    expect(rateNet({ amount: 5000, basis: 'flat' }, 6, 0, 5)).toBe(0);
  });
  it('falls back to one only when the quantity is missing or nonsensical', () => {
    expect(rateNet({ amount: 450, basis: 'day' }, 1, Number.NaN, 5)).toBe(450);
    expect(rateNet({ amount: 450, basis: 'day' }, 1, undefined as unknown as number, 5)).toBe(450);
    expect(rateNet({ amount: 450, basis: 'day' }, 1, -3, 5)).toBe(450);
  });
});

describe('VAT presets', () => {
  it('lead with Luxembourg and its four rates, and default to its standard rate', () => {
    expect(VAT_PRESETS[0].code).toBe('LU');
    expect(VAT_PRESETS[0].rates.map((rate) => rate.percent)).toEqual([17, 14, 8, 3]);
    expect(DEFAULT_BUDGET_SETTINGS.defaultVatPercent).toBe(17);
    expect(DEFAULT_BUDGET_SETTINGS.currency).toBe('EUR');
  });
  it('offer a no-VAT option for reverse charge and employees', () => {
    expect(VAT_PRESETS.some((preset) => preset.rates.some((rate) => rate.percent === 0))).toBe(true);
  });
});

const crew = (id: string, amount: number, basis: 'day' | 'week' | 'flat', vatPercent?: number): Person => ({
  id,
  displayName: id,
  kind: 'crew',
  rateCard: { amount, basis, ...(vatPercent !== undefined ? { vatPercent } : {}) },
});

describe('deriveBudget', () => {
  it('prices crew by their scheduled days at the default VAT', () => {
    const summary = deriveBudget({
      people: [crew('dop', 600, 'day')],
      shootDays: 4,
      personDays: new Map([['dop', 4]]),
    });
    const entry = summary.entries[0];
    expect(entry.net).toBe(2400);
    expect(entry.vatPercent).toBe(17);
    expect(entry.vat).toBe(408);
    expect(entry.gross).toBe(2808);
    expect(summary.total).toBe(2808);
  });

  it('lets a rate carry its own VAT, including none for an employee', () => {
    const summary = deriveBudget({
      people: [crew('pa', 200, 'day', 0), crew('gaffer', 500, 'day', 8)],
      shootDays: 2,
      personDays: new Map([['pa', 2], ['gaffer', 2]]),
    });
    expect(summary.entries.map((e) => e.vat)).toEqual([0, 80]);
    expect(summary.vatByRate).toEqual([
      { percent: 8, net: 1000, vat: 80 },
      { percent: 0, net: 400, vat: 0 },
    ]);
  });

  it('reports an unpriced person rather than pricing them at zero', () => {
    const summary = deriveBudget({ people: [{ id: 'x', displayName: 'Nobody', kind: 'crew' }], shootDays: 3 });
    expect(summary.entries).toHaveLength(0);
    expect(summary.unpriced).toEqual([{ kind: 'person', id: 'x', label: 'Nobody' }]);
  });

  it('warns when a day-rated person is on no scheduled day', () => {
    const summary = deriveBudget({ people: [crew('dop', 600, 'day')], shootDays: 3, personDays: new Map() });
    expect(summary.entries[0].net).toBe(0);
    expect(summary.entries[0].warning).toMatch(/not needed/i);
    const unscheduled = deriveBudget({ people: [crew('dop', 600, 'day')], shootDays: 0 });
    expect(unscheduled.entries[0].warning).toMatch(/no shooting days/i);
  });

  it('prices equipment by its rate key, quantity and days on set', () => {
    const budget: ProjectBudget = {
      ...emptyBudget(),
      equipmentRates: [{ id: 'r1', key: 'lighting:aputure:ls 1200d pro', label: 'Aputure LS 1200d Pro', amount: 90, basis: 'day' }],
    };
    const summary = deriveBudget({
      budget,
      shootDays: 3,
      equipment: [
        { key: 'lighting:aputure:ls 1200d pro', label: 'Aputure LS 1200d Pro', category: 'lighting', quantity: 2, days: 3 },
        { key: 'camera::alexa', label: 'Alexa', category: 'camera', quantity: 1, days: 3 },
      ],
    });
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].net).toBe(540);
    expect(summary.unpriced).toEqual([{ kind: 'equipment', id: 'camera::alexa', label: 'Alexa' }]);
  });

  it('keeps a rate whose gear left the plan visible with a warning', () => {
    const budget: ProjectBudget = {
      ...emptyBudget(),
      equipmentRates: [{ id: 'r1', key: 'grip::dolly', label: 'Dolly', amount: 300, basis: 'flat' }],
    };
    const summary = deriveBudget({ budget, shootDays: 2, equipment: [] });
    expect(summary.entries[0].net).toBe(300);
    expect(summary.entries[0].warning).toMatch(/no longer on any plan/i);
  });

  it('prices manual lines over the shoot by default and adds contingency on the net', () => {
    const budget: ProjectBudget = {
      settings: { currency: 'EUR', defaultVatPercent: 17, weekDays: 5, contingencyPercent: 10 },
      equipmentRates: [],
      lines: [
        { id: 'l1', category: 'catering', label: 'Lunch', amount: 15, basis: 'day', quantity: 20, vatPercent: 3 },
        { id: 'l2', category: 'location', label: 'Warehouse', amount: 1200, basis: 'flat' },
      ],
    };
    const summary = deriveBudget({ budget, shootDays: 4 });
    expect(summary.entries.map((e) => e.net)).toEqual([1200, 1200]);
    expect(summary.entries[0].vat).toBe(36);
    expect(summary.entries[1].vat).toBe(204);
    expect(summary.net).toBe(2400);
    expect(summary.contingency).toBe(240);
    expect(summary.total).toBe(2400 + 240 + 240);
    expect(summary.categories.map((c) => c.category)).toEqual(['location', 'catering']);
  });

  it('totals are sums of rounded lines, so the printed budget adds up by hand', () => {
    const budget: ProjectBudget = {
      ...emptyBudget(),
      lines: Array.from({ length: 3 }, (_, i) => ({ id: `l${i}`, category: 'other' as const, label: `x${i}`, amount: 0.335, basis: 'flat' as const, vatPercent: 17 })),
    };
    const summary = deriveBudget({ budget, shootDays: 0 });
    // Each line: net 0.34 (rounded), VAT 0.06 → gross 0.40; three lines → 1.02 / 0.18 / 1.20.
    expect(summary.entries[0]).toMatchObject({ net: 0.34, vat: 0.06, gross: 0.4 });
    expect(summary.net).toBe(1.02);
    expect(summary.vat).toBe(0.18);
    expect(summary.gross).toBe(1.2);
  });
});

describe('budgetToCsv', () => {
  it('writes one row per entry, subtotals and the total', () => {
    const csv = budgetToCsv(
      deriveBudget({ people: [crew('dop, "the" boss', 600, 'day')], shootDays: 1, personDays: new Map([['dop, "the" boss', 1]]) }),
    );
    const lines = csv.split('\n');
    expect(lines[0]).toMatch(/^Category,Item/);
    expect(lines[1]).toContain('"dop, ""the"" boss"');
    expect(lines[2]).toMatch(/^Crew,Subtotal/);
    expect(lines[lines.length - 1]).toMatch(/^,Total,.*702,EUR$/);
  });
});

describe('normaliseRateCard', () => {
  it('accepts a finite non-negative amount and a known basis', () => {
    expect(normaliseRateCard({ amount: 10, basis: 'week', vatPercent: 8 })).toEqual({ amount: 10, basis: 'week', vatPercent: 8 });
    expect(normaliseRateCard({ amount: 10, basis: 'hour' as 'day' })).toEqual({ amount: 10, basis: 'day' });
    expect(normaliseRateCard({ amount: -1, basis: 'day' })).toBeUndefined();
    expect(normaliseRateCard({ amount: 10, basis: 'day', vatPercent: -5 })).toEqual({ amount: 10, basis: 'day' });
    expect(normaliseRateCard(undefined)).toBeUndefined();
  });
});

describe('above the line', () => {
  it('puts producers, director, writers and cast above the line by role and kind', () => {
    expect(isAboveTheLine({ kind: 'crew', role: 'Director' })).toBe(true);
    expect(isAboveTheLine({ kind: 'crew', role: 'Executive Producer' })).toBe(true);
    expect(isAboveTheLine({ kind: 'crew', role: 'Screenwriter' })).toBe(true);
    expect(isAboveTheLine({ kind: 'crew', role: 'Director of Photography / Producer' })).toBe(true);
    expect(isAboveTheLine({ kind: 'cast', role: 'Lead' })).toBe(true);
  });
  it('keeps the director of photography, ADs and talent below the line', () => {
    expect(isAboveTheLine({ kind: 'crew', role: 'Director of Photography' })).toBe(false);
    expect(isAboveTheLine({ kind: 'crew', role: '1st Assistant Director' })).toBe(false);
    expect(isAboveTheLine({ kind: 'crew', role: 'Art Director' })).toBe(false);
    expect(isAboveTheLine({ kind: 'crew', role: 'Gaffer' })).toBe(false);
    expect(isAboveTheLine({ kind: 'talent', role: 'Presenter' })).toBe(false);
  });
  it('an explicit flag wins either way', () => {
    expect(isAboveTheLine({ kind: 'crew', role: 'Gaffer', aboveTheLine: true })).toBe(true);
    expect(isAboveTheLine({ kind: 'cast', role: 'Lead', aboveTheLine: false })).toBe(false);
  });
  it('splits the totals', () => {
    const summary = deriveBudget({
      people: [
        { id: 'dir', displayName: 'Dir', kind: 'crew', role: 'Director', rateCard: { amount: 1000, basis: 'flat', vatPercent: 0 } },
        { id: 'gaf', displayName: 'Gaf', kind: 'crew', role: 'Gaffer', rateCard: { amount: 400, basis: 'day', vatPercent: 0 } },
      ],
      shootDays: 2,
      personDays: new Map([['gaf', 2]]),
    });
    expect(summary.aboveTheLine.gross).toBe(1000);
    expect(summary.belowTheLine.gross).toBe(800);
    expect(summary.categories.map((c) => c.category)).toEqual(['above_the_line', 'crew']);
  });
});
