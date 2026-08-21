/**
 * Derived paperwork (plan §16, §4.12 derived-view rule).
 *
 * Concert/broadcast crew sheets DERIVE from canonical project data (run-of-show
 * cues + people). Nothing here is persisted — the sheet is rebuilt on demand,
 * mirroring the call-sheet pattern in callSheet.ts.
 */

import type { Person } from '../people';
import { sortCues } from '../scheduling/runOfShow';
import type { RunOfShowCue } from '../scheduling/runOfShow';

export type CrewDepartment =
  | 'camera'
  | 'lighting'
  | 'audio'
  | 'video'
  | 'stage'
  | 'production'
  | 'other';

/** Canonical department buckets, in print order. */
export const CREW_DEPARTMENTS: CrewDepartment[] = [
  'camera',
  'lighting',
  'audio',
  'video',
  'stage',
  'production',
  'other',
];

export interface CrewSheetTimelineEntry {
  /** 'HH:MM' or 'HH:MM:SS' when the cue carries a parseable planned start. */
  start?: string;
  label: string;
}

export interface CrewSheetContact {
  displayName: string;
  department?: string;
  role?: string;
  phone?: string;
  email?: string;
}

export interface CrewSheetData {
  productionTitle: string;
  dayName: string;
  date?: string;
  venue?: string;
  timeline: CrewSheetTimelineEntry[];
  departments: Record<string, Person[]>;
  contacts: CrewSheetContact[];
}

export interface DeriveCrewSheetInput {
  productionTitle: string;
  dayName: string;
  date?: string;
  venue?: string;
  cues?: RunOfShowCue[];
  people?: Person[];
}

/** Printed at the foot of every crew sheet (planning aid, not certification). */
export const CREW_SHEET_NOTE =
  'Derived from project run-of-show and crew data. All times are estimates for planning purposes only and are not a safety or engineering certification.';

/** Map a free-text department onto a canonical bucket (rule 11 spirit: shared vocabulary). */
export const classifyDepartment = (department?: string): CrewDepartment => {
  const d = (department ?? '').trim().toLowerCase();
  if (d === '') return 'other';
  if (d.includes('video')) return 'video';
  if (d.includes('cam')) return 'camera';
  if (d.includes('light') || d.includes('electric') || d.includes('gaffer') || d.includes('lx')) {
    return 'lighting';
  }
  if (d.includes('audio') || d.includes('sound')) return 'audio';
  if (d.includes('stage')) return 'stage';
  if (d.includes('production')) return 'production';
  return 'other';
};

/** Parse 'HH:MM' or 'HH:MM:SS'; returns null when unparseable (never coerced). */
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
 * Build the derived crew sheet. Cues without a usable planned start are placed
 * last (in cue order) rather than silently dropped or given a fake time.
 */
export const deriveCrewSheet = (input: DeriveCrewSheetInput): CrewSheetData => {
  const { productionTitle, dayName, date, venue, cues = [], people = [] } = input;

  const sorted = sortCues(cues);
  const timed: Array<{ entry: CrewSheetTimelineEntry; seconds: number }> = [];
  const untimed: CrewSheetTimelineEntry[] = [];
  for (const cue of sorted) {
    if (cue.plannedStart !== undefined) {
      const seconds = parseTimeToSeconds(cue.plannedStart);
      if (seconds !== null) {
        timed.push({ entry: { start: cue.plannedStart, label: cue.label }, seconds });
        continue;
      }
    }
    untimed.push({ label: cue.label });
  }
  timed.sort((a, b) => a.seconds - b.seconds);
  const timeline: CrewSheetTimelineEntry[] = [
    ...timed.map((t) => t.entry),
    ...untimed,
  ];

  const crew = people.filter((p) => p.kind === 'crew');
  const departments: Record<string, Person[]> = {};
  for (const bucket of CREW_DEPARTMENTS) departments[bucket] = [];
  for (const person of crew) {
    departments[classifyDepartment(person.department)].push(person);
  }

  // Flattened, de-duplicated contact list (same person may appear in several
  // sources later; identity = id when present, else name+contact signature).
  const seen = new Set<string>();
  const contacts: CrewSheetContact[] = [];
  for (const person of crew) {
    const key = person.id ?? `${person.displayName}|${person.phone ?? ''}|${person.email ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push({
      displayName: person.displayName,
      department: person.department,
      role: person.role,
      phone: person.phone,
      email: person.email,
    });
  }

  return {
    productionTitle,
    dayName,
    date,
    venue,
    timeline,
    departments,
    contacts,
  };
};
