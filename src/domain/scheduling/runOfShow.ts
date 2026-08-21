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
import { createId } from '../ids';

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
