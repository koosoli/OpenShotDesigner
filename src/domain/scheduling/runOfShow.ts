/**
 * Run-of-show domain (plan §15).
 *
 * An ordered cue list for live/broadcast-style shows. Pure calculations
 * only — no React, no persistence (repo rule: business logic lives in the
 * domain layer with unit tests). Missing technical data stays unknown
 * (`null`), never silently substituted with 0 (plan rule 13).
 */

import type { ValidationIssue } from '../validation';
import { issue } from '../validation';

export interface RunOfShowCue {
  id: string;
  segmentId?: string;
  label: string;
  /** 'HH:MM:SS' or 'HH:MM' */
  plannedStart?: string;
  plannedDurationSeconds?: number;
  order: number;
  cameraNotes?: string;
  lightingNotes?: string;
  audioNotes?: string;
  videoNotes?: string;
  stageNotes?: string;
  productionNotes?: string;
}

/** Sort cues by `order` ascending, stable (ties keep input order). */
export const sortCues = (cues: RunOfShowCue[]): RunOfShowCue[] =>
  cues
    .map((cue, i) => ({ cue, i }))
    .sort((a, b) => (a.cue.order !== b.cue.order ? a.cue.order - b.cue.order : a.i - b.i))
    .map(({ cue }) => cue);

/**
 * Assign `order` 0..n-1 from each cue's position in the given array.
 *
 * The array must ALREADY be in the running order the caller intends — that is
 * what a drag, an arrow press or an insert produces. Sorting it by the stored
 * `order` first would undo the very move being saved, which is exactly how the
 * cue list came to be unreorderable. Cues whose `order` is already correct are
 * returned untouched so React sees stable identities.
 */
export const renumberCuesByPosition = (cues: readonly RunOfShowCue[]): RunOfShowCue[] =>
  cues.map((cue, index) => (cue.order === index ? cue : { ...cue, order: index }));

/**
 * Put an arbitrary, unordered collection of cues into running order and give
 * it a clean 0..n-1 sequence.
 *
 * For callers holding the raw project array — a delete filters it without ever
 * sorting it — where the stored `order` is the only record of the running
 * order and must be honoured before the gap it left is closed up.
 */
export const sortAndRenumberCues = (cues: readonly RunOfShowCue[]): RunOfShowCue[] =>
  renumberCuesByPosition(sortCues([...cues]));

/**
 * Move the cue at `fromIndex` of the running order to `toIndex`, closing the
 * gap behind it and renumbering the whole list by its new positions.
 *
 * Indices are positions in the sorted running order — what the operator sees
 * on screen and drags between — not indices into the stored project array.
 * An out-of-range `fromIndex` leaves the order alone; `toIndex` is clamped, so
 * dragging past either end parks the cue at that end rather than losing it.
 */
export const moveCueInList = (
  cues: readonly RunOfShowCue[],
  fromIndex: number,
  toIndex: number,
): RunOfShowCue[] => {
  const ordered = sortCues([...cues]);
  if (fromIndex < 0 || fromIndex >= ordered.length) return renumberCuesByPosition(ordered);
  const target = Math.max(0, Math.min(toIndex, ordered.length - 1));
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(target, 0, moved);
  return renumberCuesByPosition(ordered);
};

/** Parse 'HH:MM' or 'HH:MM:SS' into seconds; returns null when unparseable. */
const parseTimeToSeconds = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] !== undefined ? Number(match[3]) : 0;
  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
};

/**
 * Resolve each cue's start time in seconds.
 *
 * - A cue with a parseable `plannedStart` uses it directly.
 * - Otherwise the cue starts where the previous cue ended: previous resolved
 *   start + previous cue's `plannedDurationSeconds` (or `showStartSeconds`,
 *   default 0, for the first cue).
 * - Unresolvable starts (bad time string, missing previous duration) are
 *   `null` — never coerced to 0.
 */
export const computeCueStarts = (
  cues: RunOfShowCue[],
  showStartSeconds?: number,
): Array<{ cueId: string; startSeconds: number | null }> => {
  const sorted = sortCues(cues);
  const out: Array<{ cueId: string; startSeconds: number | null }> = [];
  // End of the previous cue; null when unknown (missing duration upstream).
  let cursor: number | null = showStartSeconds ?? 0;

  for (const cue of sorted) {
    let start: number | null = null;
    if (cue.plannedStart !== undefined) {
      const parsed = parseTimeToSeconds(cue.plannedStart);
      if (parsed !== null) {
        start = parsed;
        // An explicit start resets the timeline; a missing duration makes the
        // next accumulated start unknown.
        cursor = cue.plannedDurationSeconds !== undefined ? parsed + cue.plannedDurationSeconds : null;
      }
      // Unparseable time string → unresolvable for this cue; the previous
      // end remains valid for following accumulation.
    } else if (cursor !== null) {
      start = cursor;
      cursor =
        cue.plannedDurationSeconds !== undefined ? cursor + cue.plannedDurationSeconds : null;
    }

    out.push({ cueId: cue.id, startSeconds: start });
  }

  return out;
};

/**
 * Total run time in seconds across all cues. Returns `null` when ANY cue
 * lacks `plannedDurationSeconds` (unknown ≠ 0, plan rule 13).
 */
export const totalRunTime = (cues: RunOfShowCue[]): number | null => {
  let total = 0;
  for (const cue of cues) {
    if (cue.plannedDurationSeconds === undefined) return null;
    total += cue.plannedDurationSeconds;
  }
  return total;
};

/**
 * Cue-list consistency checks:
 * - duplicate cue ids (`DUPLICATE_CUE_ID`, error)
 * - empty/whitespace labels (`EMPTY_CUE_LABEL`, error)
 * - cues without a duration (`MISSING_DURATION`, warning per cue)
 * - explicit `plannedStart` earlier than the previous resolved start
 *   (`OVERLAPPING_CUES`, warning)
 */
export const validateCueList = (cues: RunOfShowCue[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  const sorted = sortCues(cues);

  for (const cue of sorted) {
    if (seenIds.has(cue.id)) {
      issues.push(
        issue('error', 'DUPLICATE_CUE_ID', `Cue id "${cue.id}" is used more than once.`, cue.id),
      );
    }
    seenIds.add(cue.id);

    if (cue.label.trim() === '') {
      issues.push(
        issue('error', 'EMPTY_CUE_LABEL', `Cue "${cue.id}" has an empty label.`, cue.id),
      );
    }

    if (cue.plannedDurationSeconds === undefined) {
      issues.push(
        issue(
          'warning',
          'MISSING_DURATION',
          `Cue "${cue.label}" has no planned duration.`,
          cue.id,
        ),
      );
    }
  }

  const starts = computeCueStarts(sorted);
  for (let i = 1; i < sorted.length; i += 1) {
    const cue = sorted[i];
    if (cue.plannedStart === undefined) continue;
    const parsed = parseTimeToSeconds(cue.plannedStart);
    if (parsed === null) continue;
    const prevStart = starts[i - 1]?.startSeconds;
    if (prevStart === null || prevStart === undefined) continue;
    if (parsed < prevStart) {
      issues.push(
        issue(
          'warning',
          'OVERLAPPING_CUES',
          `Cue "${cue.label}" starts before the previous cue's start.`,
          cue.id,
        ),
      );
    }
  }

  return issues;
};

/**
 * The department note fields in the order a show caller reads them, with the
 * label each one prints under. One list, so the editor and the printed sheet
 * cannot drift apart or quietly drop a department.
 */
export const CUE_NOTE_FIELDS = [
  { key: 'cameraNotes', label: 'Camera' },
  { key: 'lightingNotes', label: 'Lighting' },
  { key: 'audioNotes', label: 'Audio' },
  { key: 'videoNotes', label: 'Video' },
  { key: 'stageNotes', label: 'Stage' },
  { key: 'productionNotes', label: 'Production' },
] as const satisfies ReadonlyArray<{ key: keyof RunOfShowCue; label: string }>;

export interface RunOfShowSheetNote {
  department: string;
  text: string;
}

export interface RunOfShowSheetRow {
  cueId: string;
  /** Position on paper, 1-based: what the caller says out loud. */
  number: number;
  label: string;
  segmentName?: string;
  /** Resolved start, seconds past midnight; null when it cannot be worked out. */
  startSeconds: number | null;
  durationSeconds: number | null;
  notes: RunOfShowSheetNote[];
}

export interface RunOfShowSheet {
  rows: RunOfShowSheetRow[];
  /** null when any cue lacks a duration — an unknown total, not a short show. */
  totalRunTimeSeconds: number | null;
  issues: ValidationIssue[];
}

/**
 * Everything the printed run of show needs, derived once from the cue list.
 *
 * The paper sheet is the document the show is actually called from, so it has
 * to agree with the screen down to the resolved start times: same sort, same
 * `computeCueStarts`, same validation. Deriving it here rather than in the
 * print component is what keeps that true (rule 4: no business logic in
 * components).
 *
 * Duplicate issues are collapsed — the same hole in the list reported twice
 * reads as two problems to whoever is holding the page.
 */
export const buildRunOfShowSheet = (
  cues: readonly RunOfShowCue[],
  segments: ReadonlyArray<{ id: string; name: string }> = [],
  showStartSeconds?: number,
): RunOfShowSheet => {
  const ordered = sortCues([...cues]);
  const segmentNames = new Map(segments.map((segment) => [segment.id, segment.name] as const));
  const startById = new Map(
    computeCueStarts(ordered, showStartSeconds).map((start) => [start.cueId, start.startSeconds] as const),
  );

  const rows = ordered.map((cue, index) => {
    const segmentName = cue.segmentId === undefined ? undefined : segmentNames.get(cue.segmentId);
    const notes: RunOfShowSheetNote[] = [];
    for (const field of CUE_NOTE_FIELDS) {
      const text = cue[field.key];
      if (typeof text === 'string' && text.trim() !== '') {
        notes.push({ department: field.label, text: text.trim() });
      }
    }
    return {
      cueId: cue.id,
      number: index + 1,
      label: cue.label,
      ...(segmentName === undefined ? {} : { segmentName }),
      startSeconds: startById.get(cue.id) ?? null,
      durationSeconds: cue.plannedDurationSeconds ?? null,
      notes,
    };
  });

  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const candidate of validateCueList(ordered)) {
    const key = `${candidate.code}:${candidate.entityId ?? ''}:${candidate.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push(candidate);
  }

  return { rows, totalRunTimeSeconds: totalRunTime(ordered), issues };
};
