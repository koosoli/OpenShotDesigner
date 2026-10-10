/**
 * Performers Production Time Report — SAG-AFTRA "Exhibit G".
 *
 * The daily sheet a 2nd AD fills in on set: for every performer who worked,
 * when they reported to make-up and to set, when they broke for meals, when
 * they were dismissed, and their travel. Payroll pays from it and the union
 * audits it, so the times are what someone ENTERED — the schedule only seeds
 * the rows. What is derived is the arithmetic a tired AD gets wrong at wrap:
 * hours worked, overtime, meal penalties and short rest (forced calls).
 *
 * Rules used (theatrical/TV day performer, simplified — the contract has
 * many exceptions, so these are warnings, not payroll):
 *  - First meal within 6 hours of the first call; the next within 6 hours of
 *    the end of the previous meal. Each started half hour past that is one
 *    meal penalty period.
 *  - A meal is at least 30 minutes; a shorter one does not reset the clock.
 *  - 12 hours rest between dismissal and the next day's first call; less is a
 *    forced call.
 *  - Work time runs from the first call to the last dismissal, minus meals;
 *    over 8 hours is overtime for a day performer, over 10 for a weekly one.
 *  - A minor has a maximum working day (8 hours by default); the actual limit
 *    depends on age and state law, so it is a setting on the sheet.
 *
 * Every number above is a per-sheet setting (`limits`), so a production on a
 * different agreement can make the warnings match it.
 *
 * Times are "HH:MM" on a 24-hour clock. A time earlier than the first call is
 * read as after midnight.
 */

import { createId } from '../ids';

export type ExhibitGStatus = 'W' | 'SW' | 'WF' | 'SWF' | 'H' | 'T' | 'R' | 'F' | 'WD' | 'PW';

export interface PerformerTimeEntry {
  id: string;
  /** Contact the row is for. */
  personId?: string;
  /** Role the row is for. */
  characterId?: string;
  /** Printed name; kept so a row survives the contact being deleted. */
  name: string;
  role?: string;
  castNumber?: number;
  status?: ExhibitGStatus;
  minor?: boolean;
  stunt?: boolean;
  /** Day performer (default) or weekly performer — weekly overtime starts later. */
  contract?: 'day' | 'weekly';
  /** Reported to make-up / wardrobe (first call). */
  reportMakeup?: string;
  /** Reported on set. */
  reportOnSet?: string;
  meal1Out?: string;
  meal1In?: string;
  meal2Out?: string;
  meal2In?: string;
  /** Dismissed on set. */
  dismissOnSet?: string;
  /** Dismissed from make-up / wardrobe (last dismissal). */
  dismissMakeup?: string;
  /** Travel to location: leave / arrive; and the return. */
  travelOutLeave?: string;
  travelOutArrive?: string;
  travelBackLeave?: string;
  travelBackArrive?: string;
  /** Wardrobe changes / outfits supplied. */
  outfits?: number;
  /** Stunt adjustment, forced call waiver, etc. */
  adjustment?: string;
  /** Performer initials (signature column). */
  initials?: string;
  notes?: string;
}

export interface PerformerTimeReport {
  id: string;
  /** Production day this sheet is for. */
  dayId: string;
  entries: PerformerTimeEntry[];
  preparedBy?: string;
  notes?: string;
  /** This sheet's rule limits, where they differ from the defaults. */
  limits?: Partial<ExhibitGLimits>;
}

export interface ExhibitGLimits {
  /** A meal is due this long after the call or the end of the last meal. */
  mealDueAfterMinutes: number;
  /** Shorter breaks are not a meal. */
  minMealMinutes: number;
  /** Rest owed between dismissal and the next call. */
  restMinutes: number;
  /** Straight time before overtime, day performers. */
  straightTimeMinutes: number;
  /** Straight time before overtime, weekly performers. */
  weeklyStraightTimeMinutes: number;
  /** Longest working day for a minor. */
  minorMaxWorkMinutes: number;
}

export interface ExhibitGWarning {
  entryId: string;
  kind: 'meal_penalty' | 'short_meal' | 'forced_call' | 'overtime' | 'missing_time' | 'order' | 'minor_hours';
  message: string;
}

export interface ExhibitGTotals {
  /** Minutes from first call to last dismissal, minus meals. */
  workedMinutes?: number;
  overtimeMinutes?: number;
  /** Half-hour meal penalty periods. */
  mealPenalties: number;
}

export const EXHIBIT_G_LIMITS: ExhibitGLimits = {
  mealDueAfterMinutes: 6 * 60,
  minMealMinutes: 30,
  restMinutes: 12 * 60,
  straightTimeMinutes: 8 * 60,
  weeklyStraightTimeMinutes: 10 * 60,
  minorMaxWorkMinutes: 8 * 60,
};

/** A sheet's limits with the defaults filled in. */
export const resolveExhibitGLimits = (limits?: Partial<ExhibitGLimits>): ExhibitGLimits => ({ ...EXHIBIT_G_LIMITS, ...(limits ?? {}) });

/** "HH:MM" → minutes after midnight, or undefined. */
export const parseClock = (value?: string): number | undefined => {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 47 || minutes > 59) return undefined;
  return hours * 60 + minutes;
};

export const formatMinutes = (minutes?: number): string => {
  if (minutes === undefined || !Number.isFinite(minutes)) return '—';
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
};

/** An entry's times on one timeline, minutes from the start of its day. */
const timeline = (entry: PerformerTimeEntry) => {
  const first = parseClock(entry.reportMakeup) ?? parseClock(entry.reportOnSet);
  const at = (value?: string): number | undefined => {
    const raw = parseClock(value);
    if (raw === undefined) return undefined;
    // After-midnight times: anything before the first call belongs to tomorrow.
    return first !== undefined && raw < first ? raw + 24 * 60 : raw;
  };
  return {
    first,
    meal1Out: at(entry.meal1Out),
    meal1In: at(entry.meal1In),
    meal2Out: at(entry.meal2Out),
    meal2In: at(entry.meal2In),
    last: at(entry.dismissMakeup) ?? at(entry.dismissOnSet),
  };
};

/** Hours, overtime and meal penalties for one row. */
export const exhibitGTotals = (entry: PerformerTimeEntry, sheetLimits?: Partial<ExhibitGLimits>): ExhibitGTotals => {
  const limits = resolveExhibitGLimits(sheetLimits);
  const t = timeline(entry);
  let mealPenalties = 0;
  const meals: Array<[number, number]> = [];
  if (t.meal1Out !== undefined && t.meal1In !== undefined && t.meal1In > t.meal1Out) meals.push([t.meal1Out, t.meal1In]);
  if (t.meal2Out !== undefined && t.meal2In !== undefined && t.meal2In > t.meal2Out) meals.push([t.meal2Out, t.meal2In]);

  if (t.first !== undefined && t.last !== undefined && t.last > t.first) {
    // Walk the day: each stretch without a qualifying meal may run 6 hours.
    let clock = t.first;
    const penaltiesUntil = (until: number) => {
      const late = until - clock - limits.mealDueAfterMinutes;
      return late > 0 ? Math.ceil(late / 30) : 0;
    };
    for (const [out, back] of meals) {
      mealPenalties += penaltiesUntil(out);
      if (back - out >= limits.minMealMinutes) clock = back;
    }
    mealPenalties += penaltiesUntil(t.last);
  }

  if (t.first === undefined || t.last === undefined || t.last <= t.first) return { mealPenalties };
  const mealMinutes = meals.reduce((sum, [out, back]) => sum + (back - out), 0);
  const workedMinutes = t.last - t.first - mealMinutes;
  return {
    workedMinutes,
    overtimeMinutes: Math.max(0, workedMinutes - (entry.contract === 'weekly' ? limits.weeklyStraightTimeMinutes : limits.straightTimeMinutes)),
    mealPenalties,
  };
};

/** Warnings for one sheet; `previous` is the performer's prior work day sheet, for rest periods. */
export const exhibitGWarnings = (
  report: PerformerTimeReport,
  previous?: { report: PerformerTimeReport; daysBetween: number },
): ExhibitGWarning[] => {
  const warnings: ExhibitGWarning[] = [];
  const limits = resolveExhibitGLimits(report.limits);
  for (const entry of report.entries) {
    const t = timeline(entry);
    const totals = exhibitGTotals(entry, report.limits);
    const who = entry.name || 'Performer';
    if (t.first === undefined) {
      warnings.push({ entryId: entry.id, kind: 'missing_time', message: `${who}: no report time.` });
    } else if (t.last === undefined) {
      warnings.push({ entryId: entry.id, kind: 'missing_time', message: `${who}: no dismissal time.` });
    }
    if (totals.mealPenalties > 0) {
      warnings.push({ entryId: entry.id, kind: 'meal_penalty', message: `${who}: ${totals.mealPenalties} meal penalty period${totals.mealPenalties === 1 ? '' : 's'}.` });
    }
    for (const [out, back, label] of [[t.meal1Out, t.meal1In, '1st'], [t.meal2Out, t.meal2In, '2nd']] as const) {
      if (out === undefined || back === undefined) continue;
      if (back <= out) warnings.push({ entryId: entry.id, kind: 'order', message: `${who}: ${label} meal ends before it starts.` });
      else if (back - out < limits.minMealMinutes) {
        warnings.push({ entryId: entry.id, kind: 'short_meal', message: `${who}: ${label} meal is under ${limits.minMealMinutes} minutes and does not count.` });
      }
    }
    if (totals.overtimeMinutes) {
      warnings.push({ entryId: entry.id, kind: 'overtime', message: `${who}: ${formatMinutes(totals.overtimeMinutes)} overtime${entry.contract === 'weekly' ? ' (weekly)' : ''}.` });
    }
    if (entry.minor && totals.workedMinutes !== undefined && totals.workedMinutes > limits.minorMaxWorkMinutes) {
      warnings.push({ entryId: entry.id, kind: 'minor_hours', message: `${who}: a minor worked ${formatMinutes(totals.workedMinutes)}, over the ${formatMinutes(limits.minorMaxWorkMinutes)} limit.` });
    }
    if (previous && t.first !== undefined) {
      const before = previous.report.entries.find((candidate) =>
        (entry.personId && candidate.personId === entry.personId) ||
        (entry.characterId && candidate.characterId === entry.characterId));
      const lastBefore = before ? timeline(before).last : undefined;
      if (lastBefore !== undefined) {
        const rest = previous.daysBetween * 24 * 60 + t.first - lastBefore;
        if (rest < limits.restMinutes) {
          warnings.push({ entryId: entry.id, kind: 'forced_call', message: `${who}: only ${formatMinutes(rest)} rest since the last dismissal (forced call).` });
        }
      }
    }
  }
  return warnings;
};

/** Seed rows for a day: everyone working, in cast-number order, with their call time. */
export const seedExhibitGEntries = (input: {
  performers: Array<{
    personId?: string;
    characterId?: string;
    name: string;
    role?: string;
    castNumber?: number;
    status?: ExhibitGStatus;
    callTime?: string;
  }>;
  existing?: readonly PerformerTimeEntry[];
}): PerformerTimeEntry[] => {
  const existing = [...(input.existing ?? [])];
  const out: PerformerTimeEntry[] = [...existing];
  for (const performer of input.performers) {
    const already = existing.some((entry) =>
      (performer.personId && entry.personId === performer.personId) ||
      (performer.characterId && entry.characterId === performer.characterId));
    if (already) continue;
    const entry: PerformerTimeEntry = { id: createId('exg'), name: performer.name };
    if (performer.personId) entry.personId = performer.personId;
    if (performer.characterId) entry.characterId = performer.characterId;
    if (performer.role) entry.role = performer.role;
    if (performer.castNumber !== undefined) entry.castNumber = performer.castNumber;
    if (performer.status) entry.status = performer.status;
    if (performer.callTime) entry.reportMakeup = performer.callTime;
    out.push(entry);
  }
  return out.sort((a, b) => (a.castNumber ?? 9999) - (b.castNumber ?? 9999) || a.name.localeCompare(b.name));
};

/** The on-set clock steps, in the order a performer's day runs. */
export const EXHIBIT_G_CLOCK_STEPS: ReadonlyArray<{ key: keyof PerformerTimeEntry & string; label: string }> = [
  { key: 'reportMakeup', label: 'In make-up' },
  { key: 'reportOnSet', label: 'On set' },
  { key: 'meal1Out', label: 'Meal out' },
  { key: 'meal1In', label: 'Meal in' },
  { key: 'meal2Out', label: '2nd meal out' },
  { key: 'meal2In', label: '2nd meal in' },
  { key: 'dismissOnSet', label: 'Wrapped on set' },
  { key: 'dismissMakeup', label: 'Out of make-up' },
];

/**
 * The last recorded clock step and the next one to offer. The next step is the
 * first empty one AFTER the last recorded step, so a skipped second meal does
 * not reopen a day that has already wrapped.
 */
export const nextClockStep = (entry: PerformerTimeEntry) => {
  const steps = EXHIBIT_G_CLOCK_STEPS;
  const lastIndex = steps.reduce((found, step, index) => (entry[step.key] ? index : found), -1);
  return {
    last: lastIndex >= 0 ? steps[lastIndex] : undefined,
    next: steps.slice(lastIndex + 1).find((step) => !entry[step.key]),
  };
};
