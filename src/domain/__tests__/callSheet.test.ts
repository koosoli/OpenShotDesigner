import { describe, it, expect } from 'vitest';
import {
  applyOverrides,
  deriveCallSheet,
  publishSheet,
  type CallSheetData,
} from '../reports';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import type { Person } from '../people';

const day: ProductionDay = {
  id: 'day-1',
  name: 'Day 1',
  date: '2026-09-01',
  crewCall: '08:00',
  scheduleBlockIds: ['b-scene', 'b-setup', 'b-meal'],
};

const blocks: ScheduleBlock[] = [
  { id: 'b-scene', kind: 'scene', scriptSceneId: 'scene-17', estimatedMinutes: 120 },
  { id: 'b-setup', kind: 'setup', setupId: 'setup-3' },
  { id: 'b-meal', kind: 'manual', label: 'Lunch', manualType: 'meal', estimatedMinutes: 45 },
];

const people: Person[] = [
  { id: 'p1', displayName: 'Jane Doe', kind: 'cast', role: 'Lead' },
  { id: 'p2', displayName: 'Crew One', kind: 'crew', department: 'Camera', role: 'Operator' },
];

describe('deriveCallSheet', () => {
  it('derives schedule entries with resolved labels and estimates', () => {
    const sheet = deriveCallSheet({
      day,
      blocks,
      productionTitle: 'My Film',
      people,
      resolveSceneLabel: (id) => (id === 'scene-17' ? 'Scene 17 — Kitchen' : undefined),
      resolveSetupLabel: (id) => (id === 'setup-3' ? 'Setup 3 — CU' : undefined),
    });

    expect(sheet.schedule.map((e) => e.label)).toEqual([
      'Scene 17 — Kitchen',
      'Setup 3 — CU',
      'Lunch',
    ]);
    expect(sheet.cast.map((c) => c.displayName)).toEqual(['Jane Doe']);
    expect(sheet.crew.map((c) => c.displayName)).toEqual(['Crew One']);
    expect(sheet.crewCall).toBe('08:00');
    expect(sheet.schedule.map((entry) => entry.scheduledStart)).toEqual(['08:00', '10:00', undefined]);
  });

  it('includes only cast assigned to characters scheduled for the day', () => {
    const sheet = deriveCallSheet({
      day,
      blocks,
      productionTitle: 'My Film',
      people: [
        ...people,
        { id: 'p3', displayName: 'Day Player', kind: 'cast', role: 'Neighbor' },
      ],
      castPersonIds: ['p1'],
      resolveSceneLabel: () => 'S',
      resolveSetupLabel: () => 'U',
    });
    expect(sheet.cast.map((person) => person.displayName)).toEqual(['Jane Doe']);
  });

  it('warns on unresolved references and missing estimates', () => {
    const sheet = deriveCallSheet({ day, blocks, productionTitle: 'My Film' });
    expect(sheet.warnings.some((w) => w.includes('Scene scene-17'))).toBe(true);
    expect(sheet.warnings.some((w) => w.toLowerCase().includes('estimate'))).toBe(true);
    expect(sheet.schedule[0].unresolved).toBe(true);
  });

  it('returns null total when any block lacks an estimate', () => {
    const sheet = deriveCallSheet({
      day,
      blocks,
      productionTitle: 'My Film',
      resolveSceneLabel: () => 'S',
      resolveSetupLabel: () => 'SU',
    });
    expect(sheet.totalEstimatedMinutes).toBeNull();
  });

  it('totals when every block is estimated', () => {
    const fullBlocks: ScheduleBlock[] = [
      { id: 'b-scene', kind: 'scene', scriptSceneId: 's1', estimatedMinutes: 60 },
      { id: 'b-setup', kind: 'setup', setupId: 'u1', estimatedMinutes: 30 },
      { id: 'b-meal', kind: 'manual', label: 'Lunch', estimatedMinutes: 45 },
    ];
    const sheet = deriveCallSheet({
      day,
      blocks: fullBlocks,
      productionTitle: 'My Film',
      resolveSceneLabel: () => 'S',
      resolveSetupLabel: () => 'U',
    });
    expect(sheet.totalEstimatedMinutes).toBe(135);
  });

  it('uses resolved shot names for individually scheduled shot groups', () => {
    const shotDay: ProductionDay = {
      ...day,
      scheduleBlockIds: ['b-shots'],
    };
    const sheet = deriveCallSheet({
      day: shotDay,
      blocks: [{ id: 'b-shots', kind: 'shots', shotIds: ['shot-1', 'shot-2'], estimatedMinutes: 25 }],
      productionTitle: 'My Film',
      resolveShotLabel: (ids) => ids.map((id) => id === 'shot-1' ? 'Shot 1A — Master' : 'Shot 1B — Close-up').join(' + '),
    });

    expect(sheet.schedule[0]).toMatchObject({
      label: 'Shot 1A — Master + Shot 1B — Close-up',
      kind: 'shots',
      estimatedMinutes: 25,
      unresolved: false,
    });
  });
});

describe('look-ahead', () => {
  it('summarises the following day with labels, locations and its own cast filter', () => {
    const nextDay: ProductionDay = { id: 'day-2', name: 'Day 2', date: '2026-09-02', crewCall: '07:30', scheduleBlockIds: ['b-scene', 'b-omit', 'b-meal'] };
    const sheet = deriveCallSheet({
      day,
      blocks: [...blocks, { id: 'b-omit', kind: 'scene', scriptSceneId: 'gone', omittedLabel: '4 · EXT. ROAD' }],
      productionTitle: 'My Film',
      people: [...people, { id: 'p3', displayName: 'Sam Day2', kind: 'cast' }],
      castPersonIds: ['p1'],
      resolveSceneLabel: (id) => (id === 'scene-17' ? 'Scene 17 — Kitchen' : undefined),
      nextDay: { day: nextDay, locations: [{ name: 'Warehouse' }], castPersonIds: ['p3'] },
    });
    expect(sheet.lookAhead).toBeDefined();
    expect(sheet.lookAhead?.dayName).toBe('Day 2');
    expect(sheet.lookAhead?.crewCall).toBe('07:30');
    expect(sheet.lookAhead?.items.map((item) => item.label)).toEqual(['Scene 17 — Kitchen', 'Omitted — 4 · EXT. ROAD', 'Lunch']);
    expect(sheet.lookAhead?.items[1].omitted).toBe(true);
    expect(sheet.lookAhead?.locations).toEqual([{ name: 'Warehouse' }]);
    expect(sheet.lookAhead?.cast.map((p) => p.displayName)).toEqual(['Sam Day2']);
    // The main sheet's cast filter is untouched.
    expect(sheet.cast.map((p) => p.displayName)).toEqual(['Jane Doe']);
  });

  it('is absent on the last shooting day', () => {
    const sheet = deriveCallSheet({ day, blocks, productionTitle: 'My Film' });
    expect(sheet.lookAhead).toBeUndefined();
  });
});

describe('overrides & publishing', () => {
  const base: CallSheetData = deriveCallSheet({
    day,
    blocks,
    productionTitle: 'My Film',
    resolveSceneLabel: () => 'S',
    resolveSetupLabel: () => 'U',
  });

  it('applies only known fields as explicit overrides', () => {
    const overridden = applyOverrides(base, [
      { field: 'crewCall', value: '07:30' },
      { field: 'nonexistentField', value: 'ignored' },
    ]);
    expect(overridden.crewCall).toBe('07:30');
    expect(overridden.schedule).toEqual(base.schedule);
  });

  it('publishes a frozen revision with lifecycle metadata', () => {
    const sheet = publishSheet(base, [{ field: 'crewCall', value: '07:30' }]);
    expect(sheet.lifecycle).toBe('published');
    expect(sheet.overrides).toHaveLength(1);
    expect(typeof sheet.generatedAt).toBe('string');
  });
});

/**
 * A pick-up belongs on the person's own row as well as in the transport table:
 * a performer reads their own line, not a list at the foot of the sheet.
 */
describe('pick-ups on the cast and crew rows', () => {
  const people: Person[] = [
    { id: 'p-lead', displayName: 'Mara', kind: 'cast', role: 'SARAH' },
    { id: 'p-dop', displayName: 'Ines', kind: 'crew', department: 'Camera', role: 'DoP' },
    { id: 'p-extra', displayName: 'Ola', kind: 'cast', role: 'Extra' },
  ];
  const day: ProductionDay = {
    id: 'd1',
    name: 'Day 1',
    date: '2026-09-01',
    crewCall: '07:00',
    scheduleBlockIds: [],
    callSheet: {
      pickups: [
        { id: 'pu1', personId: 'p-lead', time: '05:45', location: 'Hotel lobby' },
        { id: 'pu2', personId: 'p-dop', time: '06:10' },
        { id: 'pu3', personId: 'p-lead', time: '09:00', location: 'Second trip' },
      ],
    },
  };

  it('puts the pick-up time and place on the person row', () => {
    const sheet = deriveCallSheet({ day, blocks: [], productionTitle: 'T', people });
    const lead = sheet.cast.find((p) => p.displayName === 'Mara');
    expect(lead?.pickupTime).toBe('05:45');
    expect(lead?.pickupLocation).toBe('Hotel lobby');
    const dop = sheet.crew.find((p) => p.displayName === 'Ines');
    expect(dop?.pickupTime).toBe('06:10');
    expect(dop?.pickupLocation).toBeUndefined();
    expect(sheet.cast.find((p) => p.displayName === 'Ola')?.pickupTime).toBeUndefined();
  });

  it('keeps the earliest row when a person is collected twice; the table still lists both', () => {
    const sheet = deriveCallSheet({ day, blocks: [], productionTitle: 'T', people });
    expect(sheet.cast.find((p) => p.displayName === 'Mara')?.pickupTime).toBe('05:45');
    expect(sheet.pickups).toHaveLength(3);
  });

  it('a pick-up is an explicit call, so it overrides the derived cast filter', () => {
    const sheet = deriveCallSheet({ day, blocks: [], productionTitle: 'T', people, castPersonIds: ['p-extra'] });
    expect(sheet.cast.map((p) => p.displayName)).toEqual(['Mara', 'Ola']);
  });
});

/** One picture per place, each saying which place it shows. */
describe('location maps', () => {
  const locations = [
    { name: 'Kreuzberg Studio', address: 'Kohlfurter Str. 41', lat: 52.5, lng: 13.4 },
    { name: 'Car park' },
  ];
  const dayWith = (callSheet: NonNullable<ProductionDay['callSheet']>): ProductionDay => ({
    id: 'd', name: 'Day', scheduleBlockIds: [], callSheet,
  });

  it('captions each per-location map with its location and address', () => {
    const sheet = deriveCallSheet({
      day: dayWith({ showLocationMap: true, locationMaps: [
        { id: 'm1', locationName: 'kreuzberg studio', lat: 52.5, lng: 13.4, assetId: 'asset-a' },
        { id: 'm2', locationName: 'Old depot', lat: 1, lng: 1, assetId: 'asset-b' },
      ] }),
      blocks: [], productionTitle: 'T', locations,
    });
    expect(sheet.maps).toEqual([
      { assetId: 'asset-a', locationName: 'Kreuzberg Studio', address: 'Kohlfurter Str. 41' },
      { assetId: 'asset-b', locationName: 'Old depot' },
    ]);
  });

  it('reads a pre-v21 single map as the first pinned location', () => {
    const sheet = deriveCallSheet({ day: dayWith({ showLocationMap: true, mapAssetId: 'asset-old' }), blocks: [], productionTitle: 'T', locations });
    expect(sheet.maps).toEqual([{ assetId: 'asset-old', locationName: 'Kreuzberg Studio', address: 'Kohlfurter Str. 41' }]);
  });

  it('prints nothing when the toggle is off', () => {
    const sheet = deriveCallSheet({ day: dayWith({ mapAssetId: 'asset-old' }), blocks: [], productionTitle: 'T', locations });
    expect(sheet.maps).toEqual([]);
  });
});
