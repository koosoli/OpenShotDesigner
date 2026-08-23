/**
 * Budget derivation (plan §16 derived-paperwork rule).
 *
 * Everything here is arithmetic over rates the production entered and days the
 * schedule implies. Rounding happens once per line, to the cent, the way an
 * invoice is totalled: the VAT on a line is the rounded VAT of that line, and
 * the totals are sums of rounded lines, so the printed budget adds up by hand.
 */

import type { Person } from '../people';
import type {
  BudgetCategory,
  BudgetLine,
  BudgetSettings,
  EquipmentRate,
  ProjectBudget,
  RateBasis,
  RateCard,
} from './types';

export const BUDGET_CATEGORIES: Array<{ key: BudgetCategory; label: string }> = [
  { key: 'above_the_line', label: 'Above the line' },
  { key: 'crew', label: 'Crew' },
  { key: 'cast', label: 'Cast' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'location', label: 'Locations' },
  { key: 'travel', label: 'Travel & accommodation' },
  { key: 'catering', label: 'Catering' },
  { key: 'art', label: 'Art, costume & make-up' },
  { key: 'post', label: 'Post-production' },
  { key: 'insurance', label: 'Insurance & legal' },
  { key: 'other', label: 'Other' },
];

export const RATE_BASIS_LABELS: Record<RateBasis, string> = { day: 'per day', week: 'per week', flat: 'flat fee' };

/**
 * VAT rates a production is likely to meet. Luxembourg first: it is where this
 * app is built for, and its standard rate is the default. Each entry carries
 * the rates a film production actually encounters; the list is a convenience
 * for the picker, never a constraint — any percentage can be typed.
 */
export interface VatPreset {
  country: string;
  code: string;
  rates: Array<{ label: string; percent: number }>;
}

export const VAT_PRESETS: VatPreset[] = [
  { country: 'Luxembourg', code: 'LU', rates: [{ label: 'Standard', percent: 17 }, { label: 'Intermediate', percent: 14 }, { label: 'Reduced', percent: 8 }, { label: 'Super-reduced', percent: 3 }] },
  { country: 'Germany', code: 'DE', rates: [{ label: 'Standard', percent: 19 }, { label: 'Reduced', percent: 7 }] },
  { country: 'France', code: 'FR', rates: [{ label: 'Standard', percent: 20 }, { label: 'Intermediate', percent: 10 }, { label: 'Reduced', percent: 5.5 }, { label: 'Super-reduced', percent: 2.1 }] },
  { country: 'Belgium', code: 'BE', rates: [{ label: 'Standard', percent: 21 }, { label: 'Reduced', percent: 12 }, { label: 'Reduced', percent: 6 }] },
  { country: 'Netherlands', code: 'NL', rates: [{ label: 'Standard', percent: 21 }, { label: 'Reduced', percent: 9 }] },
  { country: 'Austria', code: 'AT', rates: [{ label: 'Standard', percent: 20 }, { label: 'Reduced', percent: 13 }, { label: 'Reduced', percent: 10 }] },
  { country: 'Switzerland', code: 'CH', rates: [{ label: 'Standard', percent: 8.1 }, { label: 'Accommodation', percent: 3.8 }, { label: 'Reduced', percent: 2.6 }] },
  { country: 'Italy', code: 'IT', rates: [{ label: 'Standard', percent: 22 }, { label: 'Reduced', percent: 10 }, { label: 'Reduced', percent: 5 }, { label: 'Super-reduced', percent: 4 }] },
  { country: 'Spain', code: 'ES', rates: [{ label: 'Standard', percent: 21 }, { label: 'Reduced', percent: 10 }, { label: 'Super-reduced', percent: 4 }] },
  { country: 'Ireland', code: 'IE', rates: [{ label: 'Standard', percent: 23 }, { label: 'Reduced', percent: 13.5 }, { label: 'Reduced', percent: 9 }] },
  { country: 'United Kingdom', code: 'GB', rates: [{ label: 'Standard', percent: 20 }, { label: 'Reduced', percent: 5 }] },
  { country: 'Exempt / reverse charge', code: '—', rates: [{ label: 'No VAT', percent: 0 }] },
];

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = { currency: 'EUR', defaultVatPercent: 17, weekDays: 5 };

export const emptyBudget = (): ProjectBudget => ({ settings: { ...DEFAULT_BUDGET_SETTINGS }, lines: [], equipmentRates: [] });

/** Half-up to the cent, guarding the usual floating-point slip (1.005 → 1.01). */
export const roundMoney = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + 1e-9)) / 100;
};

/**
 * Net cost of a rate over `units` days (or weeks' worth of days). A weekly
 * rate is pro-rated by the day: six shooting days at €2,000/week over a
 * five-day week cost €2,400, not two full weeks. A production that pays
 * full weeks regardless enters the rate as a flat fee instead.
 */
export const rateNet = (rate: RateCard, units: number, quantity: number, weekDays: number): number => {
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const days = Number.isFinite(units) && units > 0 ? units : 0;
  const week = Number.isFinite(weekDays) && weekDays > 0 ? weekDays : 5;
  switch (rate.basis) {
    case 'flat':
      return roundMoney(rate.amount * qty);
    case 'week':
      return roundMoney((rate.amount * days * qty) / week);
    case 'day':
    default:
      return roundMoney(rate.amount * days * qty);
  }
};

export const resolveVatPercent = (rate: Pick<RateCard, 'vatPercent'>, settings: BudgetSettings): number => {
  const percent = rate.vatPercent ?? settings.defaultVatPercent;
  return Number.isFinite(percent) && percent >= 0 ? percent : 0;
};

export type BudgetEntrySource = 'person' | 'equipment' | 'line';

export interface BudgetEntry {
  id: string;
  source: BudgetEntrySource;
  category: BudgetCategory;
  label: string;
  detail?: string;
  basis: RateBasis;
  rate: number;
  /** Days priced (weeks are expressed in days and pro-rated). 1 for a flat fee. */
  units: number;
  quantity: number;
  net: number;
  vatPercent: number;
  vat: number;
  gross: number;
  /** Something the reader should know before trusting the number. */
  warning?: string;
}

export interface BudgetCategoryTotal {
  category: BudgetCategory;
  label: string;
  net: number;
  vat: number;
  gross: number;
  entries: BudgetEntry[];
}

export interface BudgetSummary {
  settings: BudgetSettings;
  shootDays: number;
  entries: BudgetEntry[];
  categories: BudgetCategoryTotal[];
  /** VAT grouped by rate, the way a VAT return wants it. */
  vatByRate: Array<{ percent: number; net: number; vat: number }>;
  net: number;
  vat: number;
  gross: number;
  contingency: number;
  /** Gross plus contingency. */
  total: number;
  /** The split a financier reads first. Above = the  category; below = everything else. */
  aboveTheLine: { net: number; vat: number; gross: number };
  belowTheLine: { net: number; vat: number; gross: number };
  /** People and gear with no rate — the budget's known blind spots. */
  unpriced: Array<{ kind: 'person' | 'equipment'; id: string; label: string }>;
}

export interface DeriveBudgetInput {
  budget?: ProjectBudget;
  people?: readonly Person[];
  /** Shooting days on the schedule. 0 is an honest answer for an unscheduled production. */
  shootDays: number;
  /** Days each person is needed, from `countNeedDays`. Missing = 0. */
  personDays?: ReadonlyMap<string, number>;
  /** Gear on the plan, in master-list shape, with the days it is on set. */
  equipment?: ReadonlyArray<{ key: string; label: string; category: string; quantity: number; days: number }>;
}

const entryFrom = (
  base: Omit<BudgetEntry, 'net' | 'vat' | 'gross' | 'vatPercent'>,
  rate: RateCard,
  settings: BudgetSettings,
): BudgetEntry => {
  const net = rateNet(rate, base.units, base.quantity, settings.weekDays);
  const vatPercent = resolveVatPercent(rate, settings);
  const vat = roundMoney((net * vatPercent) / 100);
  return { ...base, net, vatPercent, vat, gross: roundMoney(net + vat) };
};

export const deriveBudget = (input: DeriveBudgetInput): BudgetSummary => {
  const budget = input.budget ?? emptyBudget();
  const settings = { ...DEFAULT_BUDGET_SETTINGS, ...budget.settings };
  const entries: BudgetEntry[] = [];
  const unpriced: BudgetSummary['unpriced'] = [];
  const shootDays = Math.max(0, Math.floor(input.shootDays));

  for (const person of input.people ?? []) {
    const kind = person.kind ?? 'other';
    const below: BudgetCategory | null = kind === 'crew' ? 'crew' : kind === 'cast' || kind === 'talent' ? 'cast' : null;
    if (!below) continue;
    const category: BudgetCategory = isAboveTheLine(person) ? 'above_the_line' : below;
    const label = person.displayName;
    if (!person.rateCard) {
      unpriced.push({ kind: 'person', id: person.id, label });
      continue;
    }
    const days = input.personDays?.get(person.id) ?? 0;
    const units = person.rateCard.basis === 'flat' ? 1 : days;
    const warning =
      person.rateCard.basis !== 'flat' && days === 0
        ? shootDays === 0
          ? 'No shooting days scheduled yet'
          : 'Not needed on any scheduled day'
        : undefined;
    entries.push(
      entryFrom(
        {
          id: `person:${person.id}`,
          source: 'person',
          category,
          label,
          detail: [person.role, person.department].filter(Boolean).join(' · ') || undefined,
          basis: person.rateCard.basis,
          rate: person.rateCard.amount,
          units,
          quantity: 1,
          ...(warning ? { warning } : {}),
        },
        person.rateCard,
        settings,
      ),
    );
  }

  const rateByKey = new Map(budget.equipmentRates.map((rate) => [rate.key, rate] as const));
  const seenKeys = new Set<string>();
  for (const item of input.equipment ?? []) {
    seenKeys.add(item.key);
    const rate = rateByKey.get(item.key);
    if (!rate) {
      unpriced.push({ kind: 'equipment', id: item.key, label: item.label });
      continue;
    }
    const units = rate.basis === 'flat' ? 1 : item.days;
    const warning =
      rate.basis !== 'flat' && item.days === 0
        ? shootDays === 0
          ? 'No shooting days scheduled yet'
          : 'Its setups are not on any scheduled day'
        : undefined;
    entries.push(
      entryFrom(
        {
          id: `equipment:${item.key}`,
          source: 'equipment',
          category: 'equipment',
          label: item.label,
          detail: `${item.category}${item.quantity > 1 ? ` · ×${item.quantity}` : ''}`,
          basis: rate.basis,
          rate: rate.amount,
          units,
          quantity: item.quantity,
          ...(warning ? { warning } : {}),
        },
        rate,
        settings,
      ),
    );
  }
  // A rate whose gear has left the plan is still money somebody expected to
  // spend; keep it visible rather than dropping it with the element.
  for (const rate of budget.equipmentRates) {
    if (seenKeys.has(rate.key)) continue;
    entries.push(
      entryFrom(
        {
          id: `equipment:${rate.key}`,
          source: 'equipment',
          category: 'equipment',
          label: rate.label,
          detail: 'No longer on any plan',
          basis: rate.basis,
          rate: rate.amount,
          units: rate.basis === 'flat' ? 1 : 0,
          quantity: 1,
          warning: 'This gear is no longer on any plan; remove the rate if it is not coming',
        },
        rate,
        settings,
      ),
    );
  }

  for (const line of budget.lines) {
    const units = line.basis === 'flat' ? 1 : line.units ?? shootDays;
    entries.push(
      entryFrom(
        {
          id: `line:${line.id}`,
          source: 'line',
          category: line.category,
          label: line.label || 'Untitled line',
          detail: line.notes,
          basis: line.basis,
          rate: line.amount,
          units,
          quantity: line.quantity ?? 1,
          ...(line.basis !== 'flat' && line.units === undefined && shootDays === 0
            ? { warning: 'Priced over the shooting days, and none are scheduled yet' }
            : {}),
        },
        line,
        settings,
      ),
    );
  }

  const categories: BudgetCategoryTotal[] = BUDGET_CATEGORIES.map(({ key, label }) => {
    const own = entries.filter((entry) => entry.category === key);
    return {
      category: key,
      label,
      entries: own,
      net: roundMoney(own.reduce((sum, entry) => sum + entry.net, 0)),
      vat: roundMoney(own.reduce((sum, entry) => sum + entry.vat, 0)),
      gross: roundMoney(own.reduce((sum, entry) => sum + entry.gross, 0)),
    };
  }).filter((category) => category.entries.length > 0);

  const byRate = new Map<number, { net: number; vat: number }>();
  for (const entry of entries) {
    const bucket = byRate.get(entry.vatPercent) ?? { net: 0, vat: 0 };
    bucket.net += entry.net;
    bucket.vat += entry.vat;
    byRate.set(entry.vatPercent, bucket);
  }
  const vatByRate = [...byRate.entries()]
    .map(([percent, sums]) => ({ percent, net: roundMoney(sums.net), vat: roundMoney(sums.vat) }))
    .sort((a, b) => b.percent - a.percent);

  const net = roundMoney(entries.reduce((sum, entry) => sum + entry.net, 0));
  const vat = roundMoney(entries.reduce((sum, entry) => sum + entry.vat, 0));
  const gross = roundMoney(net + vat);
  const contingencyPercent = settings.contingencyPercent ?? 0;
  const contingency = roundMoney((net * (Number.isFinite(contingencyPercent) ? Math.max(0, contingencyPercent) : 0)) / 100);

  const sumOf = (list: BudgetEntry[]) => ({
    net: roundMoney(list.reduce((sum, entry) => sum + entry.net, 0)),
    vat: roundMoney(list.reduce((sum, entry) => sum + entry.vat, 0)),
    gross: roundMoney(list.reduce((sum, entry) => sum + entry.gross, 0)),
  });

  return {
    settings,
    shootDays,
    entries,
    categories,
    aboveTheLine: sumOf(entries.filter((entry) => entry.category === 'above_the_line')),
    belowTheLine: sumOf(entries.filter((entry) => entry.category !== 'above_the_line')),
    vatByRate,
    net,
    vat,
    gross,
    contingency,
    total: roundMoney(gross + contingency),
    unpriced,
  };
};

/** Stable key for the money formatters: `formatMoney(1234.5, 'EUR')` → "€1,234.50". */
export const formatMoney = (value: number, currency: string): string => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

const csvCell = (value: string | number | undefined): string => {
  const text = value === undefined ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The budget as a spreadsheet: one row per entry, then the totals. */
export const budgetToCsv = (summary: BudgetSummary): string => {
  const rows: Array<Array<string | number | undefined>> = [
    ['Category', 'Item', 'Detail', 'Basis', 'Rate', 'Units', 'Quantity', 'Net', 'VAT %', 'VAT', 'Gross', 'Note'],
  ];
  for (const category of summary.categories) {
    for (const entry of category.entries) {
      rows.push([
        category.label,
        entry.label,
        entry.detail,
        RATE_BASIS_LABELS[entry.basis],
        entry.rate,
        entry.units,
        entry.quantity,
        entry.net,
        entry.vatPercent,
        entry.vat,
        entry.gross,
        entry.warning,
      ]);
    }
    rows.push([category.label, 'Subtotal', '', '', '', '', '', category.net, '', category.vat, category.gross, '']);
  }
  rows.push(['', 'Total net', '', '', '', '', '', summary.net, '', summary.vat, summary.gross, '']);
  if (summary.contingency > 0) {
    rows.push(['', `Contingency ${summary.settings.contingencyPercent ?? 0}%`, '', '', '', '', '', summary.contingency, '', '', '', '']);
  }
  rows.push(['', 'Total', '', '', '', '', '', '', '', '', summary.total, summary.settings.currency]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
};

/** The next unused line id is the caller's job; this only validates shape. */
export const normaliseRateCard = (raw: Partial<RateCard> | undefined): RateCard | undefined => {
  if (!raw || typeof raw.amount !== 'number' || !Number.isFinite(raw.amount) || raw.amount < 0) return undefined;
  const basis: RateBasis = raw.basis === 'week' || raw.basis === 'flat' ? raw.basis : 'day';
  const card: RateCard = { amount: raw.amount, basis };
  if (typeof raw.vatPercent === 'number' && Number.isFinite(raw.vatPercent) && raw.vatPercent >= 0) card.vatPercent = raw.vatPercent;
  return card;
};

export const isEquipmentRate = (value: unknown): value is EquipmentRate =>
  !!value && typeof value === 'object' && typeof (value as EquipmentRate).key === 'string' && normaliseRateCard(value as EquipmentRate) !== undefined;

export const isBudgetLine = (value: unknown): value is BudgetLine =>
  !!value && typeof value === 'object' && typeof (value as BudgetLine).id === 'string' && normaliseRateCard(value as BudgetLine) !== undefined;

/** "€450 per day · VAT 17%" — a rate card in words, for lists and printouts. */
export const describeRateCard = (card: RateCard | undefined, currency: string): string => {
  if (!card) return '';
  const vat = card.vatPercent === undefined ? '' : card.vatPercent === 0 ? ' · no VAT' : ` · VAT ${card.vatPercent}%`;
  return `${formatMoney(card.amount, currency)} ${RATE_BASIS_LABELS[card.basis]}${vat}`;
};

/**
 * Above the line: the creative principals a financier reads first — producers,
 * director, writers, principal cast. Everyone else is below the line. The
 * default comes from the role; `Person.aboveTheLine` overrides it either way,
 * because "Director" on a commercial and "Director" on a feature are not
 * always budgeted alike.
 */
export const isAboveTheLine = (person: Pick<Person, 'kind' | 'role' | 'aboveTheLine'>): boolean => {
  if (typeof person.aboveTheLine === 'boolean') return person.aboveTheLine;
  if (person.kind === 'cast') return true;
  if (person.kind !== 'crew') return false;
  const role = (person.role ?? '').toLowerCase();
  if (/photograph|assistant director|\b(1st|2nd|3rd)\b|art director|casting|technical director|post/.test(role)) return false;
  return /producer|director|writer|screenplay|showrunner|creator/.test(role);
};
