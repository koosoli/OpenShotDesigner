/**
 * A shooting schedule from a spreadsheet: the one-liner or stripboard export
 * of another scheduling tool (Movie Magic, StudioBinder, Gorilla) or a
 * schedule kept in Excel, saved as CSV.
 *
 * Exports differ, so the reader looks for meaning rather than a fixed layout:
 *
 *  - The header row is the first row with a scene column ("Scene", "Sc",
 *    "Scene #", "Scenes").
 *  - Days come from a day column ("Day", "Shoot day") or a date column when
 *    there is one; otherwise from day rows in the list itself — "Day 3",
 *    "End of Day 2", "End of Shooting Day 2" — the way a one-liner prints them.
 *    No day information at all means one day.
 *  - A row with scene numbers ("12", "12A, 13") becomes scene strips, matched
 *    to the screenplay by number. Numbers the screenplay does not have are
 *    reported, never invented.
 *  - A row without scenes is a banner when it reads like one: meals, company
 *    moves, rehearsals; anything else becomes an "other" banner.
 *
 * Pure: it plans, the command applies.
 */
import { parseCsvRows } from '../csv';
import type { ProductionDay, ScheduleBlock } from './types';

export type ImportedEntry =
  | { kind: 'scene'; sceneId: string; sceneNumber: string; estimatedMinutes?: number }
  | { kind: 'banner'; label: string; manualType: 'meal' | 'move' | 'rehearsal' | 'other' };

export interface ImportedDay {
  name: string;
  date?: string;
  crewCall?: string;
  entries: ImportedEntry[];
}

export interface ScheduleImportPlan {
  days: ImportedDay[];
  /** Scene numbers in the file that the screenplay does not have. */
  unmatchedScenes: string[];
  /** Scenes placed, for the confirmation. */
  sceneCount: number;
}

const HEADER = {
  scene: /^(scene|scenes|sc\.?|scene ?#|scene ?no\.?|scene number|szene)$/i,
  day: /^(day|shoot ?day|shooting ?day|day ?#|drehtag|tag)$/i,
  date: /^(date|datum|shoot ?date)$/i,
  call: /^(call|crew call|call time)$/i,
  minutes: /^(min|mins|minutes|duration|est\.? ?time|estimate)$/i,
};

const BANNER: Array<[RegExp, 'meal' | 'move' | 'rehearsal']> = [
  [/lunch|meal|breakfast|dinner|mittag|essen/i, 'meal'],
  [/company move|move to|umzug|travel/i, 'move'],
  [/rehears|probe/i, 'rehearsal'],
];

const DAY_HEADING = /^(?:shoot(?:ing)? ?)?day\s*(\d+)\b|^drehtag\s*(\d+)\b/i;
const DAY_END = /^end of (?:shoot(?:ing)? )?day\b|^ende drehtag/i;

/** yyyy-mm-dd from ISO, dd.mm.yyyy or m/d/yyyy; undefined when unreadable. */
export const normalizeImportDate = (raw: string): string | undefined => {
  const text = raw.trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (match) return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  return undefined;
};

const splitSceneNumbers = (cell: string): string[] =>
  cell.split(/[,;/&+]|\s+(?=\d)/).map((part) => part.trim().replace(/^sc\.?\s*/i, '')).filter(Boolean);

export const planScheduleCsvImport = (
  text: string,
  scenes: ReadonlyArray<{ id: string; sceneNumber?: string; omitted?: boolean }>,
): ScheduleImportPlan => {
  const rows = parseCsvRows(text);
  const headerIndex = rows.findIndex((row) => row.some((cell) => HEADER.scene.test(cell.trim())));
  if (headerIndex < 0) throw new Error('No scene column found — the file needs a header row with a “Scene” column.');
  const header = rows[headerIndex].map((cell) => cell.trim());
  const column = (pattern: RegExp) => header.findIndex((cell) => pattern.test(cell));
  const sceneCol = column(HEADER.scene);
  const dayCol = column(HEADER.day);
  const dateCol = column(HEADER.date);
  const callCol = column(HEADER.call);
  const minutesCol = column(HEADER.minutes);

  const byNumber = new Map<string, string>();
  for (const scene of scenes) {
    const number = scene.sceneNumber?.trim().toUpperCase();
    if (number && !scene.omitted && !byNumber.has(number)) byNumber.set(number, scene.id);
  }

  const days: ImportedDay[] = [];
  const unmatched = new Set<string>();
  let current: ImportedDay | null = null;
  let currentKey: string | undefined;
  let startNewDay = false;
  const openDay = (name?: string): ImportedDay => {
    const day: ImportedDay = { name: name ?? `Day ${days.length + 1}`, entries: [] };
    days.push(day);
    current = day;
    startNewDay = false;
    return day;
  };

  for (const row of rows.slice(headerIndex + 1)) {
    const cell = (index: number) => (index >= 0 ? (row[index] ?? '').trim() : '');
    const rowText = row.map((value) => value.trim()).filter(Boolean).join(' ');

    // A day column (or, without one, the date) groups rows into days.
    const key = cell(dayCol) || (dayCol < 0 ? cell(dateCol) : '');
    if (key && key !== currentKey) {
      currentKey = key;
      const dayNumber = key.match(/\d+/)?.[0];
      openDay(dayCol >= 0 && dayNumber ? `Day ${dayNumber}` : undefined);
    }

    // Day rows of a one-liner, wherever the export put their text.
    if (DAY_END.test(rowText)) {
      startNewDay = true;
      continue;
    }
    const heading = rowText.match(DAY_HEADING);
    if (heading && dayCol < 0) {
      const opened = openDay(`Day ${heading[1] ?? heading[2]}`);
      const date = normalizeImportDate(rowText.replace(DAY_HEADING, '').replace(/^[\s—–:-]+/, ''));
      if (date) opened.date = date;
      continue;
    }

    const sceneCell = cell(sceneCol);
    if (!sceneCell) {
      if (!rowText) continue;
      const day: ImportedDay = !current || startNewDay ? openDay() : current;
      const manualType = BANNER.find(([pattern]) => pattern.test(rowText))?.[1] ?? 'other';
      day.entries.push({ kind: 'banner', label: rowText.slice(0, 60), manualType });
      continue;
    }

    const day: ImportedDay = !current || startNewDay ? openDay() : current;
    const date = normalizeImportDate(cell(dateCol));
    if (date && !day.date) day.date = date;
    const call = cell(callCol).match(/^(\d{1,2})[:.](\d{2})/);
    if (call && !day.crewCall) day.crewCall = `${call[1].padStart(2, '0')}:${call[2]}`;
    const minutes = Number(cell(minutesCol).replace(',', '.'));
    for (const number of splitSceneNumbers(sceneCell)) {
      const sceneId = byNumber.get(number.toUpperCase());
      if (!sceneId) {
        unmatched.add(number);
        continue;
      }
      day.entries.push({
        kind: 'scene',
        sceneId,
        sceneNumber: number,
        ...(Number.isFinite(minutes) && minutes > 0 ? { estimatedMinutes: Math.round(minutes) } : {}),
      });
    }
  }

  const kept = days.filter((day) => day.entries.length > 0);
  return {
    days: kept,
    unmatchedScenes: [...unmatched],
    sceneCount: kept.reduce((sum, day) => sum + day.entries.filter((entry) => entry.kind === 'scene').length, 0),
  };
};

/** Days and strips ready to add, with ids from `newId` (kept outside the command so it stays pure). */
export const materializeScheduleImport = (
  plan: ScheduleImportPlan,
  newId: (prefix: string) => string,
): { days: ProductionDay[]; blocks: ScheduleBlock[] } => {
  const blocks: ScheduleBlock[] = [];
  const days = plan.days.map((day): ProductionDay => {
    const ids = day.entries.map((entry) => {
      const id = newId('block');
      blocks.push(entry.kind === 'scene'
        ? { id, kind: 'scene', scriptSceneId: entry.sceneId, ...(entry.estimatedMinutes ? { estimatedMinutes: entry.estimatedMinutes } : {}) }
        : { id, kind: 'manual', label: entry.label, manualType: entry.manualType });
      return id;
    });
    return {
      id: newId('day'),
      name: day.name,
      ...(day.date ? { date: day.date } : {}),
      ...(day.crewCall ? { crewCall: day.crewCall } : {}),
      scheduleBlockIds: ids,
    };
  });
  return { days, blocks };
};
