/**
 * Standing call-sheet content (plan §16).
 *
 * Most of a call sheet is the same every day. Walkie channels are assigned once
 * for the shoot; the unit base, the safety policy and the notes about where to
 * park change rarely, if ever. Retyping them per day is how a sheet goes out
 * with last week's hospital on it.
 *
 * The obvious fix — copy yesterday's values onto today when a day is created —
 * is the wrong one, and worth saying why: copies drift. Once fifteen days each
 * hold their own copy of the walkie plan, changing channel 3 means finding and
 * editing fifteen records, and the ones nobody remembers to change are wrong
 * silently. Paperwork that is quietly wrong is worse than paperwork that is
 * obviously blank.
 *
 * So the production holds one set of standing values and every day inherits
 * them live. A day can still override any single field — a location day really
 * does have a different hospital — and only the override is stored. Changing
 * the standing value updates every day that has not overridden it, which is the
 * behaviour anyone actually wants (rule 37).
 */

/** Content that belongs to the production rather than to one day. */
export interface StandingCallSheet {
  /** "Ch 1 Production · Ch 2 Camera · Ch 3 Grip/Electric". Free text. */
  walkieChannels?: string;
  /** Where the unit is based, when it does not move with the location. */
  unitBase?: string;
  parking?: string;
  nearestHospital?: string;
  safetyNotes?: string;
  generalNotes?: string;
}

/** The fields a day may override. Keyed so the resolver stays honest. */
export const STANDING_CALL_SHEET_FIELDS = [
  'walkieChannels',
  'unitBase',
  'parking',
  'nearestHospital',
  'safetyNotes',
  'generalNotes',
] as const;

export type StandingCallSheetField = (typeof STANDING_CALL_SHEET_FIELDS)[number];

export interface ResolvedStandingValue {
  value?: string;
  /** Where the printed value came from, so the editor can say so. */
  origin: 'day' | 'production' | 'unset';
}

export type ResolvedStandingCallSheet = Record<StandingCallSheetField, ResolvedStandingValue>;

const trimmed = (value: string | undefined): string | undefined => {
  const text = value?.trim();
  return text || undefined;
};

/**
 * Resolve each standing field for one day: the day's own entry when it has
 * one, the production's otherwise.
 *
 * A day that has been deliberately emptied is a real state and not the same as
 * one that never set the field — but an empty string cannot express it, since
 * that is also what a cleared input produces. So blank means "inherit", and a
 * day that genuinely has no walkie plan says so in words. That keeps one
 * meaning per stored value rather than two that look identical.
 */
export const resolveStandingCallSheet = (
  standing: StandingCallSheet | undefined,
  day: Partial<Record<StandingCallSheetField, string>> | undefined,
): ResolvedStandingCallSheet => {
  const resolved = {} as ResolvedStandingCallSheet;

  for (const field of STANDING_CALL_SHEET_FIELDS) {
    const dayValue = trimmed(day?.[field]);
    if (dayValue) {
      resolved[field] = { value: dayValue, origin: 'day' };
      continue;
    }
    const standingValue = trimmed(standing?.[field]);
    resolved[field] = standingValue
      ? { value: standingValue, origin: 'production' }
      : { origin: 'unset' };
  }

  return resolved;
};

/** True when the production has any standing content worth inheriting. */
export const hasStandingContent = (standing: StandingCallSheet | undefined): boolean =>
  STANDING_CALL_SHEET_FIELDS.some((field) => !!trimmed(standing?.[field]));
