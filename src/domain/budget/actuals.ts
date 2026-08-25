/**
 * Budget actuals — what was spent against what was estimated.
 *
 * The estimate side of the budget is derived (rule 37): change the crew list
 * or the schedule and it recomputes. Actuals are the opposite kind of fact —
 * money that left the account on a given day for a given thing — so they are
 * stored, never derived, and the only interesting question here is comparing
 * the two honestly.
 *
 * Honest means (rule 13): an empty ledger sums to zero because nothing was
 * entered AND nothing was spent are indistinguishable at this level, so a
 * variance is only spoken once at least one actual exists. "€0 against €40k"
 * is not "on budget"; it is "nobody has typed anything yet".
 */

import type { BudgetActual, BudgetCategory } from './types';

/** Total money entered as spent. An empty ledger is zero, loudly. */
export const sumActuals = (actuals: readonly BudgetActual[]): number =>
  actuals.reduce((sum, entry) => sum + entry.amount, 0);

/**
 * Totals per category, in `BUDGET_CATEGORIES` order where present, then any
 * category outside that order appended. A category with no actuals is absent
 * rather than zero, so a section that renders this never prints rows nobody
 * entered.
 */
export const actualsByCategory = (
  actuals: readonly BudgetActual[],
): Array<{ category: BudgetCategory; total: number }> => {
  const totals = new Map<BudgetCategory, number>();
  for (const entry of actuals) {
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amount);
  }
  return [...totals.entries()].map(([category, total]) => ({ category, total }));
};

/**
 * Spent against estimated net, in words.
 *
 * Undefined until at least one actual has been logged — see the module note.
 * `over` is signed from the production's point of view: positive means the
 * estimate was beaten by reality.
 */
export const actualsVariance = (
  actuals: readonly BudgetActual[],
  estimatedNet: number | undefined,
): { over: number } | undefined => {
  if (actuals.length === 0 || estimatedNet === undefined || !Number.isFinite(estimatedNet)) {
    return undefined;
  }
  return { over: round2(sumActuals(actuals) - estimatedNet) };
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
