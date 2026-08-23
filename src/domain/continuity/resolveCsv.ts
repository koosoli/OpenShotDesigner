/**
 * The DaVinci Resolve metadata export.
 *
 * Resolve's importer (Media Pool → right-click → Import Metadata…) matches
 * rows to clips by FILE NAME and maps values to fields by HEADER NAME. Both
 * matches are exact and both fail silently: a renamed, reordered-by-name or
 * prettified header imports nothing at all, and Resolve reports success either
 * way. That is why the header list below is a literal constant checked
 * byte-for-byte against the vendored template in `docs/resolve-metadata-template.csv`
 * rather than derived from anything, and why it must not be "tidied".
 *
 * The template's second row is an instruction row ("Who directed this?") and is
 * documentation, not data — it is never emitted.
 *
 * Everything the app already knows is filled in from the project, which is the
 * whole reason to log takes here instead of in a spreadsheet: of the 29
 * columns, only file name, roll card, take, good take, comments, keywords and
 * white point have no existing source. Rule 13 holds throughout — a value the
 * app does not know is exported as an empty field, never as a plausible guess.
 */

import { keyCrewDisplayName } from '../people/keyRoles';
import type { Person } from '../people/types';
import type { ContinuityCrewDefaults, Take } from './types';

/**
 * The template's 29 columns, in the template's order. Do not reformat, rename
 * or sort. Note the spaces around the slash in "Day / Night" and the "#" in
 * "Roll Card #" and "Camera #" — Resolve matches those characters too.
 */
export const RESOLVE_METADATA_COLUMNS = [
  'File Name',
  'Production Company',
  'Production Name',
  'Director',
  'DOP',
  'Sound Mixer',
  'Script Supervisor',
  'Date Recorded',
  'Roll Card #',
  'Environment',
  'Location',
  'Day / Night',
  'Scene',
  'Shot',
  'Take',
  'Good Take',
  'Description',
  'Comments',
  'Keywords',
  'Camera #',
  'Camera Type',
  'Camera FPS',
  'Shutter Speed',
  'ISO',
  'White Point (Kelvin)',
  'Focal Point (mm)',
  'Filter',
  'Camera Aperture',
  'Camera Notes',
] as const;

export type ResolveMetadataColumn = (typeof RESOLVE_METADATA_COLUMNS)[number];
export type ResolveMetadataRow = Partial<Record<ResolveMetadataColumn, string>>;

/** The project slice the export reads. Passed in, so this stays pure. */
export interface ContinuitySources {
  productionCompany?: string;
  /** Resolve's "Production Name" — the project title. */
  title?: string;
  director?: string;
  cinematographer?: string;
  /**
   * The crew list. Names for the four crew columns resolve through
   * `keyCrewDisplayName`, so "DOP", "Sound Recordist" and "Scripty" all find
   * their head — the same alias table the call sheet and crew list already
   * use, rather than a second guess at what people type into a role field.
   */
  people?: Person[];
  setups?: Array<{
    id: string;
    sceneNumber?: string;
    location?: string;
    timeOfDay?: string;
    elements?: Array<{
      id: string;
      type: string;
      cameraLabel?: string;
      cameraModel?: string;
      aperture?: string;
      iso?: number;
      shutterAngle?: number;
      ndFilter?: string;
    }>;
    shots?: Array<{
      id: string;
      sceneNumber?: string;
      shotNumber?: string;
      name?: string;
      cameraId?: string;
      cameraLabel?: string;
      lensMm?: number;
      frameRate?: number;
      framingDescription?: string;
      equipmentNotes?: string;
    }>;
  }>;
  /** The day being logged; supplies "Date Recorded". */
  productionDays?: Array<{ id: string; date?: string }>;
  /**
   * Names typed on the continuity page for roles the crew list does not fill.
   * A fallback only — see `ContinuityCrewDefaults`.
   */
  crewDefaults?: ContinuityCrewDefaults;
}

/**
 * ISO `2024-05-21` → the template's `2024_05_21`. Underscores, not hyphens:
 * the template's own sample rows use them, and Resolve stores the string as
 * given.
 *
 * A date that is not an ISO date is passed through untouched rather than
 * reformatted into something wrong.
 */
export const formatRecordedDate = (isoDate: string | undefined): string => {
  const value = (isoDate ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[1]}_${match[2]}_${match[3]}` : value;
};

/**
 * Shutter angle + frame rate → the shutter speed the report wants: 180° at
 * 25fps is `1/50`.
 *
 * Returns empty when either input is missing. The denominator is rounded to a
 * whole number because that is how it is written on a report; a 172.8° shutter
 * at 24fps is written `1/50`, not `1/50.000000001`.
 */
export const shutterSpeedFrom = (
  shutterAngle: number | undefined,
  frameRate: number | undefined,
): string => {
  if (!shutterAngle || !frameRate || shutterAngle <= 0 || frameRate <= 0) return '';
  const denominator = Math.round((360 / shutterAngle) * frameRate);
  return denominator > 0 ? `1/${denominator}` : '';
};

/**
 * The name for one of the four crew columns.
 *
 * `keyCrewDisplayName` prefers the person actually holding the role on the crew
 * list and falls back to the legacy `Project.director` /
 * `Project.cinematographer` strings — the house order everywhere else (rule 37:
 * the crew list is the single source, the legacy fields are a mirror).
 *
 * It matters here beyond tidiness. Those legacy fields are free text, so a
 * project where someone typed "DP / Camera Operator" into the cinematographer
 * field would otherwise export a job title into a column Resolve shows as a
 * person's name — metadata that is wrong rather than merely missing.
 */
const crewName = (
  people: ContinuitySources['people'],
  roleKey: string,
  legacy?: { director?: string; cinematographer?: string },
): string => keyCrewDisplayName(people ?? [], roleKey, legacy) ?? '';

const environmentFrom = (timeOfDay: string | undefined): string => {
  if (!timeOfDay) return '';
  if (/\bINT\b/i.test(timeOfDay)) return 'INT';
  if (/\bEXT\b/i.test(timeOfDay)) return 'EXT';
  return '';
};

const dayNightFrom = (timeOfDay: string | undefined): string => {
  if (!timeOfDay) return '';
  if (/night/i.test(timeOfDay)) return 'NIGHT';
  if (/day/i.test(timeOfDay)) return 'DAY';
  return '';
};

const numberOrBlank = (value: number | undefined): string =>
  value === undefined || value === null || Number.isNaN(value) ? '' : String(value);

/**
 * Build one CSV row per take.
 *
 * Take-level overrides win over the plan, and absent overrides resolve against
 * the shot and its camera live — they are not copied in, so correcting the
 * plan corrects every take that never overrode it.
 *
 * A take whose shot has been deleted still exports, with its slate columns
 * blank: the footage exists, and dropping the row would lose the only record
 * of it (see `logic.orphanedTakes`).
 */
export const buildResolveRows = (
  takes: readonly Take[],
  sources: ContinuitySources,
): ResolveMetadataRow[] => {
  const legacy = { director: sources.director, cinematographer: sources.cinematographer };
  const director = crewName(sources.people, 'director', legacy);
  const dop = crewName(sources.people, 'cinematographer', legacy);
  // Crew list first, then whatever was typed on the continuity page. Filling
  // the crew list later therefore takes over automatically rather than leaving
  // a stale name on the paperwork.
  const soundMixer =
    crewName(sources.people, 'sound_mixer') || (sources.crewDefaults?.soundMixer ?? '');
  const scriptSupervisor =
    crewName(sources.people, 'script_supervisor') || (sources.crewDefaults?.scriptSupervisor ?? '');
  const dayById = new Map((sources.productionDays ?? []).map((day) => [day.id, day] as const));

  return takes.map((take) => {
    const setup = (sources.setups ?? []).find((candidate) =>
      (candidate.shots ?? []).some((shot) => shot.id === take.shotId),
    );
    const shot = (setup?.shots ?? []).find((candidate) => candidate.id === take.shotId);
    const camera = (setup?.elements ?? []).find(
      (element) => element.type === 'camera' && element.id === shot?.cameraId,
    );
    const overrides = take.cameraOverrides ?? {};
    const slate = take.slateOverrides ?? {};
    const day = take.productionDayId ? dayById.get(take.productionDayId) : undefined;

    const frameRate = overrides.cameraFps ?? shot?.frameRate;
    const shutterSpeed =
      overrides.shutterSpeed ?? shutterSpeedFrom(camera?.shutterAngle, frameRate);

    return {
      'File Name': take.fileName ?? '',
      'Production Company': sources.productionCompany ?? '',
      'Production Name': sources.title ?? '',
      Director: director,
      DOP: dop,
      'Sound Mixer': soundMixer,
      'Script Supervisor': scriptSupervisor,
      'Date Recorded': slate.dateRecorded ?? formatRecordedDate(day?.date),
      'Roll Card #': take.rollCard ?? '',
      Environment: slate.environment ?? environmentFrom(setup?.timeOfDay),
      Location: slate.location ?? setup?.location ?? '',
      'Day / Night': slate.dayNight ?? dayNightFrom(setup?.timeOfDay),
      Scene: slate.sceneNumber ?? shot?.sceneNumber ?? setup?.sceneNumber ?? '',
      Shot: slate.shotNumber ?? shot?.shotNumber ?? '',
      Take: String(take.takeNumber),
      // 1 or 0, never true/yes — and blank while the take is unjudged, because
      // "not marked good" and "marked bad" are different facts.
      'Good Take': take.isGoodTake === undefined ? '' : take.isGoodTake ? '1' : '0',
      Description: slate.description ?? (shot?.framingDescription || shot?.name || ''),
      Comments: take.comments ?? '',
      Keywords: (take.keywords ?? []).join(', '),
      'Camera #': overrides.cameraLabel ?? shot?.cameraLabel ?? camera?.cameraLabel ?? '',
      'Camera Type': overrides.cameraType ?? camera?.cameraModel ?? '',
      'Camera FPS': numberOrBlank(frameRate),
      'Shutter Speed': shutterSpeed,
      ISO: numberOrBlank(overrides.iso ?? camera?.iso),
      'White Point (Kelvin)': numberOrBlank(overrides.whitePointKelvin),
      'Focal Point (mm)': (() => {
        const mm = overrides.focalMm ?? shot?.lensMm;
        return mm === undefined ? '' : `${mm}mm`;
      })(),
      Filter: overrides.filter ?? camera?.ndFilter ?? '',
      'Camera Aperture': overrides.aperture ?? camera?.aperture ?? '',
      'Camera Notes': overrides.cameraNotes ?? shot?.equipmentNotes ?? '',
    };
  });
};

/**
 * RFC 4180 quoting: a field is quoted when it contains a comma, a quote, or a
 * newline, and embedded quotes are doubled.
 *
 * Hand-rolling this is a mistake worth naming — `Keywords` is a comma-separated
 * list inside one field ("Laptop, John"), so the very first real export
 * exercises the path, and an unquoted comma there shifts every later column by
 * one without any error anywhere.
 */
export const escapeCsvField = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * Serialise rows to the exact bytes Resolve expects: the template's header row,
 * CRLF line endings (the template's own), and a trailing CRLF.
 */
export const serialiseResolveCsv = (rows: readonly ResolveMetadataRow[]): string => {
  const lines = [RESOLVE_METADATA_COLUMNS.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(
      RESOLVE_METADATA_COLUMNS.map((column) => escapeCsvField(row[column] ?? '')).join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
};

/** Build and serialise in one step — what the export button calls. */
export const exportResolveCsv = (
  takes: readonly Take[],
  sources: ContinuitySources,
): string => serialiseResolveCsv(buildResolveRows(takes, sources));
