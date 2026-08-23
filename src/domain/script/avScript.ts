/**
 * Keeping the AV script and the shot list in step (plan §4.4, rule 37).
 *
 * The two documents describe the same shoot from different ends: the AV script
 * is what the audience gets, in delivery order, video down one column and audio
 * down the other; the shot list is what the unit shoots. A row that is a shot
 * should therefore BE that shot — same number, same name — and a shot that
 * nobody has scripted should be visible as a gap rather than quietly absent.
 *
 * What this module deliberately does NOT do is force one row per shot in both
 * directions:
 *
 *  - A row can legitimately have no shot. Titles, lower thirds, graphics,
 *    stock and archive footage, a music-only beat. In this codebase a shot is
 *    a camera on the floor plan, and a camera becomes a camera package in the
 *    equipment manifest, a line in day needs and money in the budget — so
 *    inventing a shot for a lower third invents a camera and charges for it.
 *  - A row can need several shots (a montage is one line of script and five
 *    setups), and a shot can cover several rows (one locked-off take under
 *    three paragraphs of voice-over).
 *
 * So the link is explicit, the NUMBER IS DERIVED FROM IT rather than copied —
 * a stored copy is exactly how "shot 2" came to mean nothing to "shot 1/2" —
 * and the gaps are reported so they can be filled in one press.
 */

import type { AVScriptRow, Shot } from '../../types';

/** The minimum of a shot this module needs; keeps it testable without the world. */
export interface AvLinkedShot {
  id: string;
  shotNumber: string;
  name?: string;
  shotSize?: Shot['shotSize'];
}

/** Rows that are deliberately not shots still print, and are never reported as gaps. */
export const isShotlessRow = (row: AVScriptRow): boolean => row.noShot === true;

/**
 * What a row's number should read.
 *
 * A linked row shows its shot's number, always: the shot list is where numbers
 * are assigned and renumbered, so any copy stored here is stale the moment
 * someone presses Renumber. An unlinked row keeps its own.
 */
export const avRowNumber = (row: AVScriptRow, shots: readonly AvLinkedShot[]): string => {
  if (!row.linkedShotId) return row.shotNumber;
  const shot = shots.find((candidate) => candidate.id === row.linkedShotId);
  return shot ? shot.shotNumber : row.shotNumber;
};

/** True when the row points at a shot that no longer exists. */
export const isDanglingRow = (row: AVScriptRow, shots: readonly AvLinkedShot[]): boolean =>
  Boolean(row.linkedShotId) && !shots.some((shot) => shot.id === row.linkedShotId);

export interface AvCoverage {
  /** Shots with no row scripting them, in shot-list order. */
  missingShots: AvLinkedShot[];
  /** Rows whose shot has been deleted; their copy is still worth keeping. */
  danglingRows: AVScriptRow[];
  /** Rows that are deliberately not shots — graphics, stock, titles. */
  shotlessRows: AVScriptRow[];
  /** True when every shot is scripted and every link resolves. */
  inStep: boolean;
}

export const avCoverage = (rows: readonly AVScriptRow[], shots: readonly AvLinkedShot[]): AvCoverage => {
  const linked = new Set(rows.map((row) => row.linkedShotId).filter(Boolean));
  const missingShots = shots.filter((shot) => !linked.has(shot.id));
  const danglingRows = rows.filter((row) => isDanglingRow(row, shots));
  const shotlessRows = rows.filter((row) => !row.linkedShotId && isShotlessRow(row));
  return {
    missingShots,
    danglingRows,
    shotlessRows,
    inStep: missingShots.length === 0 && danglingRows.length === 0,
  };
};

/**
 * Rows for the shots that have none, ready to append.
 *
 * The video column starts from the shot's own framing so the row is not blank,
 * and the audio column is left empty on purpose: nobody can guess the
 * voice-over, and a placeholder there would be read as written copy.
 */
export const rowsForMissingShots = (
  shots: readonly AvLinkedShot[],
  makeId: () => string,
  describe?: (shot: AvLinkedShot) => string,
): AVScriptRow[] =>
  shots.map((shot) => ({
    id: makeId(),
    shotNumber: shot.shotNumber,
    shotName: shot.name || `Shot ${shot.shotNumber}`,
    ...(shot.shotSize ? { shotSize: shot.shotSize } : {}),
    video: describe?.(shot) ?? '',
    audio: '',
    linkedShotId: shot.id,
  }));

/**
 * The rows to keep when a shot is deleted.
 *
 * A row that was never written into goes with its shot — it was scaffolding.
 * A row carrying video or audio copy is somebody's writing, so it survives with
 * its link cleared and its number frozen at what it last read, the same way an
 * omitted scene keeps its number and a pick-up for a deleted contact keeps its
 * time. Silently deleting written copy because a camera was removed from a
 * floor plan is not a trade this app should make.
 */
export const rowsAfterShotRemoval = (
  rows: readonly AVScriptRow[],
  removedShotIds: ReadonlySet<string>,
  shots: readonly AvLinkedShot[],
): AVScriptRow[] => {
  const out: AVScriptRow[] = [];
  for (const row of rows) {
    if (!row.linkedShotId || !removedShotIds.has(row.linkedShotId)) {
      out.push(row);
      continue;
    }
    const written = Boolean((row.video ?? '').trim() || (row.audio ?? '').trim());
    if (!written) continue;
    const { linkedShotId: _dropped, ...rest } = row;
    out.push({ ...rest, shotNumber: avRowNumber(row, shots) });
  }
  return out;
};
