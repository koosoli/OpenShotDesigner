import type { CallSheetData } from './callSheet';

export interface CallSheetChange {
  field: string;
  before: string;
  after: string;
}

const display = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return 'changed';
  return String(value);
};

const LABELS: Partial<Record<keyof CallSheetData, string>> = {
  date: 'Date',
  crewCall: 'Crew call',
  plannedWrap: 'Planned wrap',
  weatherSummary: 'Weather',
  parking: 'Parking',
  walkieChannels: 'Walkie channels',
  unitBase: 'Unit base',
  nearestHospital: 'Nearest hospital',
  safetyNotes: 'Safety notes',
  generalNotes: 'General notes',
  schedule: 'Schedule',
  cast: 'Cast',
  crew: 'Crew',
  locations: 'Locations',
  pickups: 'Pick-ups',
};

/** Concise, stable top-level diff suitable for an issue log. */
export const diffCallSheetSnapshots = (
  before: CallSheetData | null,
  after: CallSheetData,
): CallSheetChange[] => {
  if (!before) return [];
  return (Object.keys(LABELS) as Array<keyof CallSheetData>).flatMap((key) => {
    const oldValue = before[key];
    const newValue = after[key];
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return [];
    return [{ field: LABELS[key] ?? String(key), before: display(oldValue), after: display(newValue) }];
  });
};

export const parseIssuedCallSheet = (snapshotJson: string): CallSheetData | null => {
  try {
    return JSON.parse(snapshotJson) as CallSheetData;
  } catch {
    return null;
  }
};
