/**
 * Camera and sound reports — the two pieces of set paperwork that come off the
 * continuity log for free (plan §35).
 *
 * These are the sheets that travel with the media: the camera report goes to
 * the DIT and then to post, the sound report to the mixer and then to post, and
 * between them they are how anyone months later works out what a file on a
 * drive actually is. The continuity log already holds every fact on both, so
 * neither of these stores anything of its own — they are derivations, and
 * correcting a take corrects both reports (rule 37).
 *
 * They are two functions rather than one with a flag, because they are two
 * documents that disagree on purpose:
 *
 *  - A **wild track** — sound with no picture — is a row on the sound report
 *    and no row at all on the camera report.
 *  - An **MOS** take is a row on the camera report and, on the sound report,
 *    a row that exists only to say no audio was recorded. Leaving it off
 *    entirely is what makes post go looking for a file that never existed.
 *  - They roll over on different schedules. A day can burn three camera cards
 *    against one sound roll, so the two reports group differently and a shared
 *    implementation would have to pick one.
 *
 * Grouping is by ROLL, which is what a report is: one sheet per card, in the
 * order the cards were used. A take with no roll recorded lands in an
 * explicitly unnamed group rather than being dropped or filed under "A001" —
 * the takes are real and the sheet has to account for them (rule 13).
 */

import type { ContinuitySources, ResolveMetadataRow } from './resolveCsv';
import { buildResolveRows } from './resolveCsv';
import type { Take } from './types';

/** How a roll with no recorded identifier is labelled on both reports. */
export const UNNAMED_ROLL = 'Roll not recorded';

export interface CameraReportRow {
  takeId: string;
  /** The camera's file on the card, when the reconciliation pass has run. */
  fileName?: string;
  scene: string;
  shot: string;
  take: number;
  /** "A", "B" — which camera, on a multi-camera day. */
  camera?: string;
  description?: string;
  lens?: string;
  fps?: string;
  shutter?: string;
  iso?: string;
  whitePoint?: string;
  filter?: string;
  aperture?: string;
  /** Undefined = not yet judged, which is not the same as NG. */
  isGoodTake?: boolean;
  /** True when the take was shot without sound. Printed, because post asks. */
  mos: boolean;
  notes?: string;
}

export interface SoundReportRow {
  takeId: string;
  soundFileName?: string;
  scene: string;
  shot: string;
  take: number;
  isGoodTake?: boolean;
  /** No sound was recorded for this take, deliberately. */
  mos: boolean;
  /** Sound with no picture. */
  wildTrack: boolean;
  notes?: string;
}

export interface ReportRoll<TRow> {
  /** The roll identifier, or `UNNAMED_ROLL`. */
  roll: string;
  /** True when the roll had no identifier recorded. */
  unnamed: boolean;
  rows: TRow[];
  /** Rows explicitly marked good. */
  goodCount: number;
  /** Rows explicitly marked NG. Judged takes only; unjudged count as neither. */
  ngCount: number;
}

export interface SetReport<TRow> {
  rolls: Array<ReportRoll<TRow>>;
  /** Every row across every roll, for a total line. */
  totalRows: number;
  totalGood: number;
}

const blankToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Group rows by roll, in first-use order.
 *
 * First-use order rather than alphabetical: cards are used in a sequence and
 * the report is read in that sequence. Sorting `A001, A002, A010` as strings
 * would also put `A010` before `A002` the day a production reaches ten cards,
 * which is the kind of wrong that is only noticed once.
 */
const groupByRoll = <TRow>(
  entries: ReadonlyArray<{ roll: string | undefined; row: TRow; isGoodTake?: boolean }>,
): Array<ReportRoll<TRow>> => {
  const rolls: Array<ReportRoll<TRow>> = [];
  const index = new Map<string, ReportRoll<TRow>>();
  for (const entry of entries) {
    const named = blankToUndefined(entry.roll);
    const key = named ?? UNNAMED_ROLL;
    let group = index.get(key);
    if (!group) {
      group = { roll: key, unnamed: named === undefined, rows: [], goodCount: 0, ngCount: 0 };
      index.set(key, group);
      rolls.push(group);
    }
    group.rows.push(entry.row);
    if (entry.isGoodTake === true) group.goodCount += 1;
    else if (entry.isGoodTake === false) group.ngCount += 1;
  }
  return rolls;
};

const totalise = <TRow>(rolls: Array<ReportRoll<TRow>>): SetReport<TRow> => ({
  rolls,
  totalRows: rolls.reduce((sum, roll) => sum + roll.rows.length, 0),
  totalGood: rolls.reduce((sum, roll) => sum + roll.goodCount, 0),
});

/**
 * The slate and camera values for a take, resolved exactly the way the Resolve
 * export resolves them.
 *
 * Deliberately built on `buildResolveRows` rather than re-reading the plan:
 * the override-then-shot-then-camera precedence is intricate (a take's
 * override wins, an absent override resolves live so correcting the plan
 * corrects the take), and a second implementation of it would drift. The
 * printed report and the exported metadata then say the same thing about the
 * same take, which is the property that matters when post compares them.
 */
const resolvedRows = (
  takes: readonly Take[],
  sources: ContinuitySources,
): Map<string, ResolveMetadataRow> => {
  const rows = buildResolveRows(takes, sources);
  const byTakeId = new Map<string, ResolveMetadataRow>();
  takes.forEach((take, index) => byTakeId.set(take.id, rows[index]));
  return byTakeId;
};

/**
 * The camera report for a set of takes, one section per camera card.
 *
 * Wild tracks are excluded: no camera rolled, so there is nothing for this
 * sheet to account for.
 */
export const cameraReport = (
  takes: readonly Take[],
  sources: ContinuitySources,
): SetReport<CameraReportRow> => {
  const resolved = resolvedRows(takes, sources);
  const entries = takes
    .filter((take) => take.wildTrack !== true)
    .map((take) => {
      const row = resolved.get(take.id) ?? {};
      const cameraRow: CameraReportRow = {
        takeId: take.id,
        ...(blankToUndefined(row['File Name']) ? { fileName: row['File Name'] } : {}),
        scene: row.Scene ?? '',
        shot: row.Shot ?? '',
        take: take.takeNumber,
        ...(blankToUndefined(row['Camera #']) ? { camera: row['Camera #'] } : {}),
        ...(blankToUndefined(row.Description) ? { description: row.Description } : {}),
        ...(blankToUndefined(row['Focal Point (mm)']) ? { lens: row['Focal Point (mm)'] } : {}),
        ...(blankToUndefined(row['Camera FPS']) ? { fps: row['Camera FPS'] } : {}),
        ...(blankToUndefined(row['Shutter Speed']) ? { shutter: row['Shutter Speed'] } : {}),
        ...(blankToUndefined(row.ISO) ? { iso: row.ISO } : {}),
        ...(blankToUndefined(row['White Point (Kelvin)'])
          ? { whitePoint: row['White Point (Kelvin)'] }
          : {}),
        ...(blankToUndefined(row.Filter) ? { filter: row.Filter } : {}),
        ...(blankToUndefined(row['Camera Aperture']) ? { aperture: row['Camera Aperture'] } : {}),
        ...(take.isGoodTake === undefined ? {} : { isGoodTake: take.isGoodTake }),
        mos: take.mos === true,
        ...(blankToUndefined(take.comments) ? { notes: take.comments } : {}),
      };
      return { roll: take.rollCard, row: cameraRow, isGoodTake: take.isGoodTake };
    });
  return totalise(groupByRoll(entries));
};

/**
 * The sound report for a set of takes, one section per sound roll.
 *
 * MOS takes are INCLUDED and flagged. A take missing from the sound report and
 * a take marked MOS on it look the same to a machine and completely different
 * to a person: the first sends an assistant hunting for a file, the second
 * tells them not to.
 */
export const soundReport = (
  takes: readonly Take[],
  sources: ContinuitySources,
): SetReport<SoundReportRow> => {
  const resolved = resolvedRows(takes, sources);
  const entries = takes.map((take) => {
    const row = resolved.get(take.id) ?? {};
    const soundRow: SoundReportRow = {
      takeId: take.id,
      ...(blankToUndefined(take.soundFileName) ? { soundFileName: take.soundFileName } : {}),
      scene: row.Scene ?? '',
      shot: row.Shot ?? '',
      take: take.takeNumber,
      ...(take.isGoodTake === undefined ? {} : { isGoodTake: take.isGoodTake }),
      mos: take.mos === true,
      wildTrack: take.wildTrack === true,
      // The mixer's note, falling back to the scripty's. Two people write about
      // the same take and the mixer's is the one this sheet is for; using the
      // other only when there is no mixer note keeps the row from being empty
      // on a production where one person keeps both logs.
      ...(blankToUndefined(take.soundNotes) ?? blankToUndefined(take.comments)
        ? { notes: blankToUndefined(take.soundNotes) ?? blankToUndefined(take.comments) }
        : {}),
    };
    return { roll: take.soundRoll, row: soundRow, isGoodTake: take.isGoodTake };
  });
  return totalise(groupByRoll(entries));
};
