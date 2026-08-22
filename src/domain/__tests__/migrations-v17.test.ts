import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV16ToV17 } from '../migrations/v16-to-v17';

const v16Fixture = () => ({
  schemaVersion: 16,
  title: 'Lodging test',
  director: '',
  cinematographer: '',
  date: '2026-08-22',
  activeSetupId: 'setup-1',
  setups: [{ id: 'setup-1', name: 'Setup 1', sceneNumber: '1', elements: [] }],
  people: [{ id: 'p1', displayName: 'Mara Vogel', kind: 'crew' }],
  productionDays: [
    { id: 'd1', name: 'Day 1', scheduleBlockIds: [], callSheet: { type: 'shoot', parking: 'Rear lot' } },
  ],
});

describe('v16 → v17 migration', () => {
  it('stamps the new version and changes nothing else', () => {
    const before = v16Fixture();
    const after = migrateV16ToV17(JSON.parse(JSON.stringify(before)));
    expect(after.schemaVersion).toBe(17);
    expect({ ...after, schemaVersion: 16 }).toEqual(before);
  });

  it('backfills no lodging and no pick-ups', () => {
    const after = migrateV16ToV17(v16Fixture()) as unknown as Record<string, any>;
    expect('hotelName' in after.people[0]).toBe(false);
    expect('pickups' in after.productionDays[0].callSheet).toBe(false);
    expect('pickupNotes' in after.productionDays[0].callSheet).toBe(false);
  });

  it('keeps well-formed lodging and trims padded values', () => {
    const raw = v16Fixture() as unknown as Record<string, any>;
    raw.people[0].hotelName = 'Hotel Astoria';
    raw.people[0].hotelAddress = '  1 Market St  ';
    raw.people[0].hotelCheckIn = '2026-09-01';
    const after = migrateV16ToV17(raw) as unknown as Record<string, any>;
    expect(after.people[0].hotelName).toBe('Hotel Astoria');
    expect(after.people[0].hotelAddress).toBe('1 Market St');
    expect(after.people[0].hotelCheckIn).toBe('2026-09-01');
  });

  it('strips blank and non-string lodging values', () => {
    const raw = v16Fixture() as unknown as Record<string, any>;
    raw.people[0].hotelName = '   ';
    raw.people[0].hotelAddress = 42;
    const after = migrateV16ToV17(raw) as unknown as Record<string, any>;
    expect('hotelName' in after.people[0]).toBe(false);
    expect('hotelAddress' in after.people[0]).toBe(false);
  });

  it('keeps well-formed pick-ups', () => {
    const raw = v16Fixture() as unknown as Record<string, any>;
    raw.productionDays[0].callSheet.pickupNotes = 'Shuttle from the hotel';
    raw.productionDays[0].callSheet.pickups = [
      { id: 'pk1', personId: 'p1', time: '06:15', location: 'Hotel lobby' },
    ];
    const after = migrateV16ToV17(raw) as unknown as Record<string, any>;
    expect(after.productionDays[0].callSheet.pickupNotes).toBe('Shuttle from the hotel');
    expect(after.productionDays[0].callSheet.pickups).toEqual([
      { id: 'pk1', personId: 'p1', time: '06:15', location: 'Hotel lobby' },
    ]);
  });

  it('drops pick-ups that name nobody and mints ids for those missing one', () => {
    const raw = v16Fixture() as unknown as Record<string, any>;
    raw.productionDays[0].callSheet.pickups = [
      { personId: 'p1', time: '06:15' },
      { personId: '   ' },
      { time: '07:00' },
    ];
    const after = migrateV16ToV17(raw) as unknown as Record<string, any>;
    expect(after.productionDays[0].callSheet.pickups).toEqual([
      { id: 'pickup-migrated-0', personId: 'p1', time: '06:15' },
    ]);
  });

  it('mints deterministic ids — migrating twice gives the same result', () => {
    const raw = () => {
      const fixture = v16Fixture() as unknown as Record<string, any>;
      fixture.productionDays[0].callSheet.pickups = [{ personId: 'p1' }];
      return fixture;
    };
    expect(migrateV16ToV17(raw())).toEqual(migrateV16ToV17(raw()));
  });

  it('removes a pickups field that is not an array at all', () => {
    const raw = v16Fixture() as unknown as Record<string, any>;
    raw.productionDays[0].callSheet.pickups = 'nope';
    const after = migrateV16ToV17(raw) as unknown as Record<string, any>;
    expect('pickups' in after.productionDays[0].callSheet).toBe(false);
  });

  it('survives a project with no people and no production days', () => {
    const raw = v16Fixture() as unknown as Record<string, any>;
    delete raw.people;
    delete raw.productionDays;
    expect(() => migrateV16ToV17(raw)).not.toThrow();
  });

  it('is idempotent through the full chain', () => {
    const first = migrateProject(v16Fixture()).project;
    const second = migrateProject(JSON.parse(JSON.stringify(first))).project;
    expect(first.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(second).toEqual(first);
  });
});
