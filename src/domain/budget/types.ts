/**
 * Budget domain types (plan §4, §16 — derived paperwork).
 *
 * A budget is DERIVED from what the production already knows — who is on the
 * crew and what they cost, which gear is on the plan, how many days are on the
 * schedule — plus explicit lines for everything that has no other home
 * (location fees, catering, insurance). Only rates and manual lines are
 * persisted; the numbers that come out are recomputed every time (rule 37).
 *
 * Money is stored as a plain decimal amount in the project's currency. Nothing
 * here converts currencies, and a missing rate is a missing rate — it is
 * reported, never read as zero (rule 13).
 */

/**
 * What a rate is quoted per. `week` is pro-rated by `BudgetSettings.weekDays`
 * (a five-day week is the industry default); `flat` is paid once regardless
 * of the schedule.
 */
export type RateBasis = 'day' | 'week' | 'flat';

export interface RateCard {
  amount: number;
  basis: RateBasis;
  /**
   * VAT on top of this rate, as a percentage. Absent means the production's
   * default rate; 0 means none — a salaried employee, a reverse-charged
   * foreign supplier, a small business below the registration threshold.
   */
  vatPercent?: number;
}

/**
 * A rate for a class of equipment. Equipment on a plan is derived from canvas
 * elements rather than stored as entities, so a rate is keyed by the same
 * name/brand/model key the master equipment list groups by.
 */
export interface EquipmentRate extends RateCard {
  id: string;
  /** `equipmentRateKey(item)` — stable for a given name, brand and model. */
  key: string;
  /** The item as it read when the rate was entered, so the list stays readable if the gear leaves the plan. */
  label: string;
}

export type BudgetCategory =
  | 'above_the_line'
  | 'crew'
  | 'cast'
  | 'equipment'
  | 'location'
  | 'travel'
  | 'catering'
  | 'art'
  | 'post'
  | 'insurance'
  | 'other';

/** A hand-entered line: anything the production knows that nothing else derives. */
export interface BudgetLine extends RateCard {
  id: string;
  category: BudgetCategory;
  label: string;
  /** Days or weeks the rate applies to; ignored for `flat`. Absent = the shoot's day count. */
  units?: number;
  quantity?: number;
  notes?: string;
}

export interface BudgetSettings {
  /** ISO 4217 code, display only. */
  currency: string;
  /** Applied to any rate without its own `vatPercent`. */
  defaultVatPercent: number;
  /** Working days in a paid week, for pro-rating weekly rates. */
  weekDays: number;
  /** Percentage added on top of the net total as contingency; 0 or absent for none. */
  contingencyPercent?: number;
}

export interface ProjectBudget {
  settings: BudgetSettings;
  lines: BudgetLine[];
  equipmentRates: EquipmentRate[];
  /**
   * What was actually spent, entered as it is paid. The estimate side of this
   * panel is derived (rule 37); actuals are the one thing that cannot be —
   * the receipt is a fact about the world, not about the project. Optional
   * and absent-safe: a production that never logs any simply has none.
   */
  actuals?: BudgetActual[];
}

/** Money that actually left the account, against the estimate above it. */
export interface BudgetActual {
  id: string;
  category: BudgetCategory;
  /** What it was, in words the wrap report can quote. */
  label: string;
  /** Plain decimal in the project's currency, same convention as rates. */
  amount: number;
  /** The shooting day it belongs to (`ProductionDay.id`), when one does. */
  productionDayId?: string;
  /** ISO date it was paid, when known. */
  date?: string;
  note?: string;
  /**
   * The estimated line this spend belongs to, as `deriveBudget` writes entry
   * ids: `person:<id>`, `line:<id>`, `equipment:<key>`. Optional — unattached
   * actuals still count in the total, they just have no line to differ from.
   * This is the field that makes "Alex wants more money" answerable: attach
   * the extra to his entry and the variance shows on his row alone.
   */
  entryId?: string;
}
