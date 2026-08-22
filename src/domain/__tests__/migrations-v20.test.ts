import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV19ToV20, normalizePlanNorth, normalizeTimeMinutes } from '../migrations/v19-to-v20';

const v19Fixture = () => ({
  schemaVersion: 19,
  title: 'Sun & calls test',
  director: '',
  cinematographer: '',
  date: '2026-08-22',
  activeSetupId: 'setup-1',
  setups: [{ id: 'setup-1', name: 'S', sceneNumber: '1', elements: [] as unknown[] }],
  productionDays: [
    { id: 'd1', name: 'Day 1', scheduleBlockIds: [], callSheet: { type: 'shoot' } },
  ],
});

const setupOf = (project: unknown) =>
  (project as { setups: Array<Record<string, unknown>> }).setups[0];
const callSheetOf = (project: unknown) =>
  (project as { productionDays: Array<{ callSheet: Record<string, unknown> }> }).productionDays[0].callSheet;

describe('normalizePlanNorth', () => {
  it('wraps any bearing into 0..359', () => {
    expect(normalizePlanNorth(0)).toBe(0);
    expect(normalizePlanNorth(359)).toBe(359);
    expect(normalizePlanNorth(360)).toBe(0);
    expect(normalizePlanNorth(450)).toBe(90);
    expect(normalizePlanNorth(-90)).toBe(270);
  });

  it('rejects anything that is not a number', () => {
    expect(normalizePlanNorth('north')).toBeUndefined();
    expect(normalizePlanNorth(NaN)).toBeUndefined();
  });
});

describe('normalizeTimeMinutes', () => {
  it('clamps to a real minute of the day', () => {
    expect(normalizeTimeMinutes(0)).toBe(0);
    expect(normalizeTimeMinutes(1439)).toBe(1439);
    expect(normalizeTimeMinutes(5000)).toBe(1439);
    expect(normalizeTimeMinutes(-10)).toBe(0);
  });
});

describe('v19 → v20 migration', () => {
  it('stamps the version and changes nothing else', () => {
    const before = v19Fixture();
    const after = migrateV19ToV20(JSON.parse(JSON.stringify(before)));
    expect(after.schemaVersion).toBe(20);
    expect({ ...after, schemaVersion: 19 }).toEqual(before);
  });

  it('backfills neither sun settings nor individual calls', () => {
    const after = migrateV19ToV20(v19Fixture());
    expect('sunSettings' in setupOf(after)).toBe(false);
    expect('personCalls' in callSheetOf(after)).toBe(false);
  });

  it('keeps well-formed sun settings', () => {
    const raw = v19Fixture() as unknown as Record<string, any>;
    raw.setups[0].sunSettings = { enabled: true, planNorthDeg: 45, timeMinutes: 630, date: '2026-09-01' };
    expect(setupOf(migrateV19ToV20(raw)).sunSettings).toEqual({
      enabled: true, planNorthDeg: 45, timeMinutes: 630, date: '2026-09-01',
    });
  });

  it('normalises a wrapped bearing and an out-of-range time', () => {
    const raw = v19Fixture() as unknown as Record<string, any>;
    raw.setups[0].sunSettings = { planNorthDeg: 450, timeMinutes: 9999 };
    expect(setupOf(migrateV19ToV20(raw)).sunSettings).toEqual({ planNorthDeg: 90, timeMinutes: 1439 });
  });

  it('drops a malformed date so the project date is used instead', () => {
    const raw = v19Fixture() as unknown as Record<string, any>;
    raw.setups[0].sunSettings = { enabled: true, date: 'next tuesday' };
    expect(setupOf(migrateV19ToV20(raw)).sunSettings).toEqual({ enabled: true });
  });

  it('removes sun settings that hold nothing usable', () => {
    const raw = v19Fixture() as unknown as Record<string, any>;
    raw.setups[0].sunSettings = { planNorthDeg: 'north' };
    expect('sunSettings' in setupOf(migrateV19ToV20(raw))).toBe(false);
  });

  it('keeps well-formed individual calls', () => {
    const raw = v19Fixture() as unknown as Record<string, any>;
    raw.productionDays[0].callSheet.personCalls = [
      { id: 'k1', personId: 'p1', time: '07:30', note: 'Make-up' },
    ];
    expect(callSheetOf(migrateV19ToV20(raw)).personCalls).toEqual([
      { id: 'k1', personId: 'p1', time: '07:30', note: 'Make-up' },
    ]);
  });

  it('drops calls that name nobody and mints ids deterministically', () => {
    const build = () => {
      const raw = v19Fixture() as unknown as Record<string, any>;
      raw.productionDays[0].callSheet.personCalls = [
        { personId: 'p1', time: '07:30' },
        { personId: '  ' },
        { time: '09:00' },
      ];
      return raw;
    };
    expect(callSheetOf(migrateV19ToV20(build())).personCalls).toEqual([
      { id: 'call-migrated-0', personId: 'p1', time: '07:30' },
    ]);
    expect(migrateV19ToV20(build())).toEqual(migrateV19ToV20(build()));
  });

  it('removes a personCalls field that is not an array', () => {
    const raw = v19Fixture() as unknown as Record<string, any>;
    raw.productionDays[0].callSheet.personCalls = 'nope';
    expect('personCalls' in callSheetOf(migrateV19ToV20(raw))).toBe(false);
  });

  it('is idempotent through the full chain', () => {
    const first = migrateProject(v19Fixture()).project;
    const second = migrateProject(JSON.parse(JSON.stringify(first))).project;
    expect(first.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(second).toEqual(first);
  });
});
