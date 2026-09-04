/**
 * Immutable call sheet revisions (roadmap Phase 4.1).
 *
 * An issued REV is a frozen promise to the crew: once stored, its snapshot
 * must never silently change. Later edits create a NEW revision instead of
 * rewriting the old one. All helpers here are pure — no UI, no store writes.
 */

import { createId } from '../ids';
import type { CallSheetIssueRevision, ProductionDay } from '../scheduling';

/**
 * Volatile issuance metadata, ignored when comparing a live document against
 * an issued snapshot (see `hasChangedSinceIssue`):
 * - `revision` / `issuedAt`: stamped at issue time; they identify the REV,
 *   they are not shoot content.
 * - `generatedAt`: publish-wrapper timestamp on `GeneratedSheet`; same reason.
 * - `isDraft`: the draft watermark flips as soon as anything changes, so it
 *   can never be evidence of a change itself — comparing it would always
 *   report "changed" right after issuing.
 */
const VOLATILE_ISSUE_FIELDS: ReadonlySet<string> = new Set([
  'revision',
  'issuedAt',
  'generatedAt',
  'isDraft',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Recursively sort object keys; arrays keep their order, values pass through. */
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
};

/** Recursively drop the volatile issuance fields listed above. */
const stripVolatile = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (VOLATILE_ISSUE_FIELDS.has(key)) continue;
      out[key] = stripVolatile(entry);
    }
    return out;
  }
  return value;
};

/**
 * Canonical JSON of the issued document content: stable key order, so the
 * same document always freezes to the same string regardless of how its keys
 * were inserted. `undefined` at the root has no JSON form, so it freezes as
 * `null` rather than failing the `string` contract.
 */
export const snapshotCallSheet = (doc: unknown): string =>
  JSON.stringify(canonicalize(doc)) ?? 'null';

/**
 * True when the live document's content differs from the issued snapshot.
 * Volatile issuance metadata (see list above) is ignored on both sides, and
 * the stored snapshot is re-canonicalized before comparing, so legacy
 * snapshots written with plain `JSON.stringify` still compare correctly.
 * An unreadable snapshot returns `true`: without proof of equality the only
 * safe answer is "changed".
 */
export const hasChangedSinceIssue = (
  liveDoc: unknown,
  lastIssue: CallSheetIssueRevision,
): boolean => {
  let issued: unknown;
  try {
    issued = JSON.parse(lastIssue.snapshotJson) as unknown;
  } catch {
    return true;
  }
  return snapshotCallSheet(stripVolatile(liveDoc)) !== snapshotCallSheet(stripVolatile(issued));
};

export interface IssuedCallSheetRevision {
  day: ProductionDay;
  revision: CallSheetIssueRevision;
}

/** Thrown when an existing snapshot cannot be parsed — a REV may be appended, never repaired. */
const assertStoredSnapshotsReadable = (issues: readonly CallSheetIssueRevision[]): void => {
  for (const issue of issues) {
    try {
      JSON.parse(issue.snapshotJson) as unknown;
    } catch {
      throw new Error(
        `Refusing to issue: stored REV ${issue.revision} (${issue.id}) has an unreadable snapshot.`,
      );
    }
  }
};

/**
 * Append a new immutable revision entry to the day. The revision number is
 * one past the highest stored revision, and the snapshot is frozen from `doc`
 * at call time — later mutations of `doc` or of the returned day cannot reach
 * it, because `snapshotJson` is a string. Existing entries are carried over by
 * reference and never rewritten; if any stored snapshot fails to parse the
 * call throws instead of building on a tampered history. The input day is
 * never mutated. The new entry starts with no acknowledgements: confirming
 * receipt is something the crew does after issue, not something issue grants.
 */
export const issueCallSheetRevision = (
  day: ProductionDay,
  doc: unknown,
  at?: string,
): IssuedCallSheetRevision => {
  const existing: readonly CallSheetIssueRevision[] = day.callSheet?.issues ?? [];
  assertStoredSnapshotsReadable(existing);
  const revisionNumber = existing.reduce((max, issue) => Math.max(max, issue.revision), 0) + 1;
  const revision: CallSheetIssueRevision = {
    id: createId('call-sheet-issue'),
    revision: revisionNumber,
    issuedAt: at ?? new Date().toISOString(),
    snapshotJson: snapshotCallSheet(doc),
    acknowledgements: [],
  };
  return {
    day: {
      ...day,
      callSheet: { ...day.callSheet, issues: [...existing, revision] },
    },
    revision,
  };
};
