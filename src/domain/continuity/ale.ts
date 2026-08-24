/**
 * Avid Log Exchange (ALE) export — the same take log, in the format Media
 * Composer reads.
 *
 * The Resolve CSV next door and this file carry identical facts. What differs
 * is the contract: Resolve wants a comma-separated file whose HEADER NAMES it
 * matches exactly, Avid wants a tab-separated file in three named sections
 * whose COLUMN NAMES it matches exactly. Neither will tell you when a name is
 * wrong; both report a successful import and populate nothing.
 *
 * ## The format
 *
 * Three sections, each introduced by its name alone on a line:
 *
 *     Heading
 *     FIELD_DELIM<TAB>TABS
 *     VIDEO_FORMAT<TAB>1080
 *     AUDIO_FORMAT<TAB>48kHz
 *     FPS<TAB>25
 *     <blank>
 *     Column
 *     Name<TAB>Tape<TAB>Scene<TAB>…
 *     <blank>
 *     Data
 *     A001C001<TAB>A001<TAB>4<TAB>…
 *
 * `FIELD_DELIM	TABS` is the only heading entry that is genuinely required;
 * the rest describe the media and are written because an ALE without them is
 * unusual enough to look broken to a human reading it.
 *
 * ## What is and is not asserted
 *
 * `Name`, `Tape`, `Source File`, `Scene`, `Take`, `Shot`, `Descript`,
 * `Comments`, `Camroll` and `Soundroll` are Avid's own bin columns and land in
 * the corresponding bin fields. Everything after them is a CUSTOM column: Avid
 * accepts it, shows it, and keeps it with the clip, but there is no reserved
 * meaning. Both groups are named below so a future reader does not have to
 * guess which is which.
 *
 * `Start` and `End` timecodes are NOT emitted. The app has no timecode: the
 * continuity log records what was shot, not where on a tape it sits, and
 * writing `00:00:00:00` for every clip would be a fabricated value that Avid
 * would happily treat as real (rule 13). Clips match on `Name` / `Source
 * File`, which is the same basis the Resolve export matches on.
 *
 * Unlike the Resolve header, this contract has NOT been verified against a
 * real Media Composer import — see `docs/regression-checklist.md`, where it is
 * a standing manual gate exactly as the Resolve one is.
 */

import type { ContinuitySources } from './resolveCsv';
import { buildResolveRows } from './resolveCsv';
import type { Take } from './types';

/**
 * Avid's own bin columns. Order matters only for readability; the names do
 * not — Avid matches them, so they must not be renamed or "tidied".
 */
const AVID_COLUMNS = [
  'Name',
  'Tape',
  'Source File',
  'Scene',
  'Take',
  'Shot',
  'Descript',
  'Comments',
  'Camroll',
  'Soundroll',
] as const;

/** Custom columns. Avid keeps and shows these; it assigns them no meaning. */
const CUSTOM_COLUMNS = [
  'Camera',
  'Camera Type',
  'FPS',
  'Shutter',
  'ISO',
  'White Point',
  'Lens',
  'Filter',
  'Aperture',
  'Location',
  'Day Night',
  'Environment',
  'Date Shot',
  'Circled',
  'Keywords',
  'Director',
  'DP',
  'Sound Mixer',
  'Script Supervisor',
  'Camera Notes',
] as const;

export const ALE_COLUMNS = [...AVID_COLUMNS, ...CUSTOM_COLUMNS] as const;

export type AleColumn = (typeof ALE_COLUMNS)[number];
export type AleRow = Partial<Record<AleColumn, string>>;

export interface AleHeading {
  /** Frame rate written into the heading. Defaults to 25 when unknown. */
  fps?: string;
  videoFormat?: string;
  audioFormat?: string;
}

/**
 * A clip's `Name` in Avid: the file name without its extension.
 *
 * Avid's clip name is conventionally the file stem — `A001C002.mov` on the
 * card is `A001C002` in the bin — and `Source File` carries the full name. A
 * name with no dot is returned unchanged rather than truncated at some other
 * character.
 */
export const aleClipName = (fileName: string | undefined): string => {
  const value = (fileName ?? '').trim();
  const dot = value.lastIndexOf('.');
  return dot > 0 ? value.slice(0, dot) : value;
};

/**
 * Tabs and newlines are the format's structure, so a value containing either
 * would silently split a row into two or shift every later column.
 *
 * ALE has no quoting mechanism at all — this is why the Resolve exporter can
 * quote a comma and this one cannot. Whitespace is collapsed to single spaces,
 * which loses the line break in a long comment and keeps the row intact. That
 * trade is the right way round: a mangled comment is readable, a mangled file
 * is not importable.
 */
export const sanitiseAleField = (value: string): string =>
  value.replace(/[\t\r\n]+/g, ' ').trim();

/**
 * One ALE row per take, built from the same resolution the Resolve export
 * uses — take override, then shot, then camera — so the two exports cannot
 * disagree about the same take.
 */
export const buildAleRows = (
  takes: readonly Take[],
  sources: ContinuitySources,
): AleRow[] => {
  const resolved = buildResolveRows(takes, sources);
  return takes.map((take, index) => {
    const row = resolved[index] ?? {};
    return {
      Name: aleClipName(take.fileName),
      // The camera card is Avid's "Tape" for file-based media: it is the
      // physical thing the clip came off, which is what the column means.
      Tape: take.rollCard ?? '',
      'Source File': take.fileName ?? '',
      Scene: row.Scene ?? '',
      Take: String(take.takeNumber),
      Shot: row.Shot ?? '',
      Descript: row.Description ?? '',
      Comments: row.Comments ?? '',
      Camroll: take.rollCard ?? '',
      Soundroll: take.soundRoll ?? '',
      Camera: row['Camera #'] ?? '',
      'Camera Type': row['Camera Type'] ?? '',
      FPS: row['Camera FPS'] ?? '',
      Shutter: row['Shutter Speed'] ?? '',
      ISO: row.ISO ?? '',
      'White Point': row['White Point (Kelvin)'] ?? '',
      Lens: row['Focal Point (mm)'] ?? '',
      Filter: row.Filter ?? '',
      Aperture: row['Camera Aperture'] ?? '',
      Location: row.Location ?? '',
      'Day Night': row['Day / Night'] ?? '',
      Environment: row.Environment ?? '',
      'Date Shot': row['Date Recorded'] ?? '',
      // The editors' word for a good take, and blank while it is unjudged:
      // "not marked good" and "marked bad" are different facts.
      Circled: take.isGoodTake === undefined ? '' : take.isGoodTake ? 'TRUE' : 'FALSE',
      Keywords: row.Keywords ?? '',
      Director: row.Director ?? '',
      DP: row.DOP ?? '',
      'Sound Mixer': row['Sound Mixer'] ?? '',
      'Script Supervisor': row['Script Supervisor'] ?? '',
      'Camera Notes': row['Camera Notes'] ?? '',
    };
  });
};

/**
 * Serialise rows to ALE bytes.
 *
 * CRLF throughout, like the Resolve export and like every ALE an Avid has
 * written. Rows with no `Name` are still emitted: a take whose file name has
 * not been reconciled yet attaches to no clip, which is the honest state, and
 * dropping it would lose the only record that the take happened.
 */
export const serialiseAle = (
  rows: readonly AleRow[],
  heading: AleHeading = {},
): string => {
  const lines: string[] = [
    'Heading',
    'FIELD_DELIM\tTABS',
    `VIDEO_FORMAT\t${sanitiseAleField(heading.videoFormat ?? '1080')}`,
    `AUDIO_FORMAT\t${sanitiseAleField(heading.audioFormat ?? '48kHz')}`,
    `FPS\t${sanitiseAleField(heading.fps ?? '25')}`,
    '',
    'Column',
    ALE_COLUMNS.join('\t'),
    '',
    'Data',
  ];
  for (const row of rows) {
    lines.push(ALE_COLUMNS.map((column) => sanitiseAleField(row[column] ?? '')).join('\t'));
  }
  return `${lines.join('\r\n')}\r\n`;
};

/**
 * The frame rate for the heading, read off the takes themselves.
 *
 * A day shot at one rate — the normal case — gets that rate. A day mixing 25
 * and 50 gets the most common one, because the heading has room for exactly
 * one value and the alternative is to invent a default that matches nothing in
 * the file. Callers that care should say so in the UI rather than here.
 */
export const dominantFps = (
  takes: readonly Take[],
  sources: ContinuitySources,
): string | undefined => {
  const counts = new Map<string, number>();
  for (const row of buildResolveRows(takes, sources)) {
    const fps = (row['Camera FPS'] ?? '').trim();
    if (!fps) continue;
    counts.set(fps, (counts.get(fps) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [fps, count] of counts) {
    if (count > bestCount) {
      best = fps;
      bestCount = count;
    }
  }
  return best;
};

/** The whole file for a set of takes. */
export const exportAle = (
  takes: readonly Take[],
  sources: ContinuitySources,
  heading: AleHeading = {},
): string =>
  serialiseAle(buildAleRows(takes, sources), {
    ...heading,
    fps: heading.fps ?? dominantFps(takes, sources),
  });
