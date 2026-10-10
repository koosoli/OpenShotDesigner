/**
 * Budget top sheet: the one page a financier or line producer reads first.
 *
 * Every account (budget category) with its estimate, what has been spent so
 * far and the difference, grouped above and below the line, then contingency,
 * VAT and the grand total. A pure re-shaping of `deriveBudget`'s summary and
 * the logged actuals (rule 37) — nothing new is stored.
 */
import type { BudgetActual, BudgetCategory } from './types';
import type { BudgetSummary } from './logic';
import { BUDGET_CATEGORIES, roundMoney } from './logic';
import { actualsByCategory } from './actuals';

/** Classic account numbers, so the top sheet reads like an industry one. */
export const ACCOUNT_NUMBERS: Record<BudgetCategory, string> = {
  above_the_line: '1000',
  cast: '1500',
  crew: '2000',
  equipment: '3000',
  location: '3500',
  art: '4000',
  travel: '4500',
  catering: '5000',
  post: '6000',
  insurance: '7000',
  other: '8000',
};

export interface TopSheetRow {
  account: string;
  category: BudgetCategory;
  label: string;
  /** Estimated net. */
  estimate: number;
  /** Logged spend; undefined when nothing has been logged in this account. */
  actual?: number;
  /** estimate − actual (positive = under budget); only with an actual. */
  variance?: number;
  /** Share of the estimated net total, 0–100. */
  percent: number;
}

export interface TopSheet {
  aboveTheLine: TopSheetRow[];
  belowTheLine: TopSheetRow[];
  subtotalAbove: number;
  subtotalBelow: number;
  net: number;
  contingency: number;
  vat: number;
  total: number;
  actualTotal?: number;
}

export const deriveTopSheet = (summary: BudgetSummary, actuals: readonly BudgetActual[] = []): TopSheet => {
  const spent = new Map(actualsByCategory(actuals).map((entry) => [entry.category, entry.total] as const));
  const net = summary.net || 0;
  const rows = BUDGET_CATEGORIES.map(({ key, label }): TopSheetRow | undefined => {
    const estimate = summary.categories.find((category) => category.category === key)?.net ?? 0;
    const actual = spent.get(key);
    if (estimate === 0 && actual === undefined) return undefined;
    return {
      account: ACCOUNT_NUMBERS[key],
      category: key,
      label,
      estimate: roundMoney(estimate),
      ...(actual !== undefined ? { actual: roundMoney(actual), variance: roundMoney(estimate - actual) } : {}),
      percent: net > 0 ? Math.round((estimate / net) * 1000) / 10 : 0,
    };
  }).filter((row): row is TopSheetRow => !!row);

  const aboveTheLine = rows.filter((row) => row.category === 'above_the_line');
  const belowTheLine = rows.filter((row) => row.category !== 'above_the_line');
  const sum = (list: TopSheetRow[]) => roundMoney(list.reduce((total, row) => total + row.estimate, 0));
  const actualTotal = actuals.length ? roundMoney(actuals.reduce((total, entry) => total + entry.amount, 0)) : undefined;
  return {
    aboveTheLine,
    belowTheLine,
    subtotalAbove: sum(aboveTheLine),
    subtotalBelow: sum(belowTheLine),
    net: roundMoney(net),
    contingency: roundMoney(summary.contingency),
    vat: roundMoney(summary.vat),
    total: roundMoney(summary.total),
    ...(actualTotal !== undefined ? { actualTotal } : {}),
  };
};
