import { describe, expect, it } from 'vitest';
import { callSheetPdfInputFromData } from '../callSheetData';
import { buildCallSheetPdfFilename, createCallSheetPdf } from '../callSheetPdf';
import type { CallSheetData } from '../../../domain/reports/callSheet';

const minimalSheet = (overrides: Partial<CallSheetData> = {}): CallSheetData => ({
  productionTitle: 'Test Film',
  dayName: 'Day 4',
  date: '2026-09-04',
  crewCall: '07:00',
  type: 'shoot',
  isDraft: true,
  castContactsHidden: false,
  daylight: {},
  pickups: [],
  locations: [],
  maps: [],
  schedule: [],
  cast: [],
  crew: [],
  departmentHeads: [],
  totalEstimatedMinutes: null,
  warnings: [],
  ...overrides,
} as CallSheetData);

describe('callSheetPdfInputFromData', () => {
  it('carries header, revision and people into the document input', () => {
    const input = callSheetPdfInputFromData(
      minimalSheet({
        revision: 2,
        issuedAt: '2026-09-03T10:00:00.000Z',
        isDraft: false,
        cast: [{ displayName: 'Alex', role: 'Lead', callTime: '06:30' }],
      }),
    );
    expect(input.revision).toBe(2);
    expect(input.isDraft).toBe(false);
    expect(input.cast).toHaveLength(1);
    expect(input.cast?.[0]).toMatchObject({ name: 'Alex', callTime: '06:30' });
  });

  it('renders an issued snapshot deterministically', async () => {
    const base = callSheetPdfInputFromData(
      minimalSheet({
        revision: 1,
        isDraft: false,
        schedule: [{ label: 'Sc 1 - Diner', kind: 'scene', sceneNumber: '1' }],
      }),
    );
    // The footer carries a generated timestamp, so pin it: same logical
    // document in, byte-identical PDF out — the REV-immutability contract.
    const first = await createCallSheetPdf({ ...base, generatedAt: new Date('2026-09-04T07:00:00.000Z') });
    const second = await createCallSheetPdf({ ...base, generatedAt: new Date('2026-09-04T07:00:00.000Z') });
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(buildCallSheetPdfFilename({ productionTitle: 'Test Film', dayName: 'Day 4', revision: 1 })).toMatch(
      /call-sheet.*rev-?1/i,
    );
  });
});
