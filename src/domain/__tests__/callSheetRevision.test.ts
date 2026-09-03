import { describe, expect, it } from 'vitest';
import { diffCallSheetSnapshots, parseIssuedCallSheet } from '../reports/callSheetRevision';
import type { CallSheetData } from '../reports/callSheet';

const sheet = (crewCall: string): CallSheetData => ({
  productionTitle: 'Feature',
  dayName: 'Day 1',
  type: 'shoot',
  isDraft: false,
  castContactsHidden: false,
  crewCall,
  daylight: {
    sunriseOrigin: 'unknown',
    sunsetOrigin: 'unknown',
    timeZone: 'UTC',
    timeZoneOrigin: 'machine',
  },
  pickups: [],
  locations: [],
  maps: [],
  schedule: [],
  cast: [],
  crew: [],
  departmentHeads: [],
  totalEstimatedMinutes: 0,
  warnings: [],
});

describe('call sheet revisions', () => {
  it('reports meaningful changed fields', () => {
    expect(diffCallSheetSnapshots(sheet('07:00'), sheet('06:30'))).toEqual([
      { field: 'Crew call', before: '07:00', after: '06:30' },
    ]);
  });

  it('does not crash on an unreadable legacy snapshot', () => {
    expect(parseIssuedCallSheet('{broken')).toBeNull();
  });
});
