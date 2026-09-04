import { describe, expect, it } from 'vitest';
import {
  hasChangedSinceIssue,
  issueCallSheetRevision,
  snapshotCallSheet,
} from '../reports';
import type { CallSheetData } from '../reports';
import type { ProductionDay } from '../scheduling';

const doc = (crewCall: string): CallSheetData => ({
  productionTitle: 'Feature',
  dayName: 'Day 1',
  type: 'shoot',
  isDraft: true,
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

const day = (): ProductionDay => ({
  id: 'day-1',
  name: 'Day 1',
  date: '2026-09-01',
  crewCall: '07:00',
  scheduleBlockIds: [],
});

describe('callSheetRevisions', () => {
  it('produces stable snapshots regardless of key order', () => {
    const first = { b: 1, a: { y: 2, x: 1 } };
    const second = { a: { x: 1, y: 2 }, b: 1 };
    expect(snapshotCallSheet(first)).toBe(snapshotCallSheet(second));
  });

  it('freezes the issued snapshot and reports later edits as changed', () => {
    const source = day();
    const live = doc('07:00');
    const { day: issued, revision } = issueCallSheetRevision(source, live, '2026-09-01T06:00:00.000Z');

    // The input day is untouched; the revision lives only on the result.
    expect(source.callSheet?.issues).toBeUndefined();
    expect(issued.callSheet?.issues).toHaveLength(1);

    // Editing the live document after issue leaves the snapshot frozen.
    const edited = doc('06:30');
    expect(JSON.parse(revision.snapshotJson) as unknown).toMatchObject({ crewCall: '07:00' });
    expect(hasChangedSinceIssue(edited, revision)).toBe(true);
  });

  it('reports no change for identical content and ignores volatile fields', () => {
    const { revision } = issueCallSheetRevision(day(), doc('07:00'), '2026-09-01T06:00:00.000Z');
    const sameDifferentOrder = { ...doc('07:00'), productionTitle: 'Feature' };
    expect(hasChangedSinceIssue(sameDifferentOrder, revision)).toBe(false);

    // Issuance stamps alone are not content changes.
    const stamped: CallSheetData = {
      ...doc('07:00'),
      isDraft: false,
      revision: 1,
      issuedAt: '2026-09-01T06:00:00.000Z',
    };
    expect(hasChangedSinceIssue(stamped, revision)).toBe(false);
  });

  it('increments revisions and preserves earlier entries verbatim', () => {
    const first = issueCallSheetRevision(day(), doc('07:00'), '2026-09-01T06:00:00.000Z');
    const second = issueCallSheetRevision(first.day, doc('06:30'), '2026-09-02T06:00:00.000Z');

    expect(second.revision.revision).toBe(2);
    const issues = second.day.callSheet?.issues ?? [];
    expect(issues.map((issue) => issue.revision)).toEqual([1, 2]);
    expect(issues[0]?.snapshotJson).toBe(first.revision.snapshotJson);
    expect(first.day.callSheet?.issues).toHaveLength(1);
  });

  it('throws when existing history is tampered with instead of rewriting it', () => {
    const tampered = day();
    tampered.callSheet = {
      issues: [
        {
          id: 'issue-1',
          revision: 1,
          issuedAt: '2026-09-01T06:00:00.000Z',
          snapshotJson: '{broken',
          acknowledgements: [],
        },
      ],
    };
    expect(() => issueCallSheetRevision(tampered, doc('07:00'))).toThrow(/unreadable snapshot/);
  });
});
