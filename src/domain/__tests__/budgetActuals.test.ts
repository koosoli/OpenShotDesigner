import { describe, expect, it } from 'vitest';
import { actualsByCategory, actualsVariance, sumActuals, varianceByEntry } from '../budget/actuals';
import type { BudgetActual } from '../budget/types';

const entry = (partial: Partial<BudgetActual>): BudgetActual => ({
  id: 'a1',
  category: 'catering',
  label: 'Craft services',
  amount: 10,
  ...partial,
});

describe('sumActuals', () => {
  it('sums every entry, empty ledger included', () => {
    expect(sumActuals([])).toBe(0);
    expect(sumActuals([entry({ amount: 10.25 }), entry({ amount: 4.75 })])).toBe(15);
  });
});

describe('actualsByCategory', () => {
  it('groups by category and omits categories nobody spent on', () => {
    const grouped = actualsByCategory([
      entry({ category: 'catering', amount: 30 }),
      entry({ category: 'catering', amount: 12 }),
      entry({ category: 'travel', amount: 100 }),
    ]);
    expect(grouped).toEqual([
      { category: 'catering', total: 42 },
      { category: 'travel', total: 100 },
    ]);
  });
});

describe('actualsVariance', () => {
  /**
   * "€0 against €40k" is not on budget — it is nobody having typed anything.
   * The variance only speaks once a fact exists to compare.
   */
  it('stays undefined until at least one actual has been logged', () => {
    expect(actualsVariance([], 40000)).toBeUndefined();
    expect(actualsVariance([entry({ amount: 50 })], undefined)).toBeUndefined();
  });

  it('signs the delta from the production’s point of view', () => {
    // Spent more than estimated: over is positive.
    expect(actualsVariance([entry({ amount: 450 })], 400)).toEqual({ over: 50 });
    // Spent less: negative, and still a fact worth stating.
    expect(actualsVariance([entry({ amount: 350 })], 400)).toEqual({ over: -50 });
  });

  it('rounds away float dust', () => {
    expect(actualsVariance([entry({ amount: 0.1 }), entry({ amount: 0.2 })], 0.3)).toEqual({
      over: 0,
    });
  });
});

describe('varianceByEntry', () => {
  const lines = [
    { id: 'person:alex', label: 'Alex Lead', net: 400 },
    { id: 'line:loc', label: 'Location fee', net: 500 },
  ];

  it('is empty before anything is logged', () => {
    expect(varianceByEntry([], lines)).toEqual([]);
  });

  it('shows spent against estimate for the attached line only', () => {
    const rows = varianceByEntry(
      [entry({ amount: 450, entryId: 'person:alex' })],
      lines,
    );
    expect(rows).toHaveLength(2);
    const alex = rows.find((row) => row.entryId === 'person:alex');
    expect(alex).toMatchObject({ estimate: 400, spent: 450, over: 50 });
    // The location fee has an estimate and no spend yet — zero spent, not
    // absent, because "nothing logged" on a known line is the AD's gap list.
    expect(rows.find((row) => row.entryId === 'line:loc')).toMatchObject({
      estimate: 500,
      spent: 0,
      over: -500,
    });
  });

  it('keeps spend whose line has since been deleted, estimate unknown', () => {
    const rows = varianceByEntry(
      [entry({ amount: 120, entryId: 'person:gone' })],
      [{ id: 'line:loc', label: 'Location fee', net: 500 }],
    );
    expect(rows.find((row) => row.entryId === 'person:gone')).toMatchObject({
      estimate: null,
      spent: 120,
      over: 120,
    });
  });
});
