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

/** The slice of a derived budget this comparison needs. */
export interface EstimatedLine {
  id: string;
  label: string;
  net: number;
}

/**
 * Per-line variance: every target that has an estimate OR at least one
 * attached actual, with spent summed across its actuals.
 *
 * A line with an estimate and no spend shows zero spent — that silence IS
 * information once a ledger exists ("nobody logged the location fee").
 * Before any ledger exists the whole table stays empty; see the module note.
 */
export const varianceByEntry = (
  actuals: readonly BudgetActual[],
  estimatedLines: readonly EstimatedLine[],
): Array<{ entryId: string; label: string; estimate: number | null; spent: number; over: number }> => {
  // No ledger, no comparison. Rows of "0 against 400" for every line would
  // be noise pretending to be information; the section above already says
  // nothing has been logged.
  if (actuals.length === 0) return [];
  const spentByEntry = new Map<string, number>();
  for (const actual of actuals) {
    if (!actual.entryId) continue;
    spentByEntry.set(actual.entryId, (spentByEntry.get(actual.entryId) ?? 0) + actual.amount);
  }

  const rows: Array<{
    entryId: string;
    label: string;
    estimate: number | null;
    spent: number;
    over: number;
  }> = [];
  const seen = new Set<string>();

  for (const line of estimatedLines) {
    const spent = spentByEntry.get(line.id);
    seen.add(line.id);
    rows.push({
      entryId: line.id,
      label: line.label,
      estimate: Number.isFinite(line.net) ? line.net : null,
      spent: spent ?? 0,
      over: round2((spent ?? 0) - (Number.isFinite(line.net) ? line.net : 0)),
    });
  }

  // Actuals attached to an id the current estimate no longer contains — the
  // person left, the line was deleted. They still spent the money; the row
  // stays, estimate unknown, so nothing silently vanishes from the wrap.
  for (const [entryId, spent] of spentByEntry) {
    if (seen.has(entryId)) continue;
    rows.push({ entryId, label: entryId, estimate: null, spent, over: round2(spent) });
  }

  return rows;
};

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

/**
 * Set the logged spend on one estimated line: creates, updates, or — at 0 or
 * cleared — removes its attachment. One actual per line keeps the cost
 * report one row per line; extra receipts can always be merged into it.
 */
export const setEntryActual = (
  actuals: readonly BudgetActual[],
  entryId: string,
  amount: number | undefined,
): BudgetActual[] | undefined => {
  const existing = actuals.find((entry) => entry.entryId === entryId);
  if (!amount || amount <= 0) {
    return existing ? actuals.filter((entry) => entry !== existing) : undefined;
  }
  if (existing) {
    return actuals.map((entry) =>
      entry === existing ? { ...entry, amount: round2(amount), entryId } : entry,
    );
  }
  const next: BudgetActual = {
    id: `actual-${entryId}`,
    category: 'other',
    label: entryId,
    amount: round2(amount),
    entryId,
  };
  return [...actuals, next];
};

