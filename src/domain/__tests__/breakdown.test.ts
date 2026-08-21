import { describe, it, expect } from 'vitest';
import {
  BREAKDOWN_CATEGORY_ORDER,
  compareSceneNumbers,
  deriveCharacterReport,
  deriveDepartmentReport,
  deriveLocationReport,
  deriveSceneReport,
} from '../reports/breakdown';
import type { BreakdownItem, ScriptScene } from '../script/types';
import type { CastAssignment, Person } from '../people';

const scene = (overrides: Partial<ScriptScene> & Pick<ScriptScene, 'id' | 'sceneNumber'>): ScriptScene => ({
  heading: `Heading ${overrides.sceneNumber}`,
  characterIds: [],
  breakdownItemIds: [],
  ...overrides,
});

const characters = [
  { id: 'c-alice', canonicalName: 'ALICE', aliases: [] },
  { id: 'c-bob', canonicalName: 'BOB', aliases: ['Bobby'] },
];

const breakdownItems: BreakdownItem[] = [
  { id: 'i1', category: 'prop', name: 'Revolver' },
  { id: 'i2', category: 'vehicle', name: 'Black Sedan' },
  { id: 'i3', category: 'prop', name: 'Briefcase' },
  { id: 'i4', category: 'sfx', name: 'Squib' },
];

describe('deriveSceneReport', () => {
  const s = scene({
    id: 's-8',
    sceneNumber: '8',
    heading: 'INT. WAREHOUSE — NIGHT',
    locationId: 'loc-warehouse',
    pageLengthEighths: 5,
    characterIds: ['c-bob', 'c-alice'],
    breakdownItemIds: ['i2', 'i1', 'i3', 'i-missing'],
  });

  it('groups item names by category in canonical order and resolves cast/location', () => {
    const report = deriveSceneReport(s, {
      characters,
      breakdownItems: [...breakdownItems, { id: 'i5', category: 'other', name: 'Odds & Ends' }],
      locations: [{ id: 'loc-warehouse', name: 'Warehouse' }],
      shotsPerScene: () => 12,
    });

    expect(report.heading).toBe('INT. WAREHOUSE — NIGHT');
    expect(report.locationName).toBe('Warehouse');
    expect(report.pageLengthEighths).toBe(5);
    // cast names follow the scene's characterIds order, not the characters array
    expect(report.castNames).toEqual(['BOB', 'ALICE']);
    expect(report.shotCount).toBe(12);
    // categories appear in canonical order; unknown item ids are dropped
    expect(Object.keys(report.breakdownByCategory)).toEqual(['prop', 'vehicle']);
    expect(report.breakdownByCategory.prop).toEqual(['Revolver', 'Briefcase']);
    expect(report.breakdownByCategory.vehicle).toEqual(['Black Sedan']);
  });

  it('handles missing context gracefully: no pages, no shots, no location', () => {
    const report = deriveSceneReport(scene({ id: 's-9', sceneNumber: '9' }), {});
    expect(report.pageLengthEighths).toBeUndefined();
    expect(report.shotCount).toBe(0);
    expect(report.locationName).toBeUndefined();
    expect(report.castNames).toEqual([]);
    expect(report.breakdownByCategory).toEqual({});
  });
});

describe('deriveDepartmentReport', () => {
  it('returns entries in fixed canonical category order regardless of input order', () => {
    const shuffled: BreakdownItem[] = [
      { id: 'a', category: 'vfx', name: 'Comp' },
      { id: 'b', category: 'prop', name: 'Gun' },
      { id: 'c', category: 'wardrobe', name: 'Hat' },
      { id: 'd', category: 'prop', name: 'Case' },
    ];
    const report = deriveDepartmentReport(shuffled);
    expect(report.map((e) => e.category)).toEqual(['prop', 'wardrobe', 'vfx']);
    expect(report[0].items.map((i) => i.name)).toEqual(['Gun', 'Case']);
    expect(report.every((e) => e.count === e.items.length)).toBe(true);
    // sanity: the exported order matches what the derivation uses
    expect(BREAKDOWN_CATEGORY_ORDER.indexOf('prop')).toBeLessThan(
      BREAKDOWN_CATEGORY_ORDER.indexOf('wardrobe'),
    );
  });

  it('filters to the requested categories but keeps canonical order among them', () => {
    const report = deriveDepartmentReport(breakdownItems, ['sfx', 'prop']);
    expect(report.map((e) => e.category)).toEqual(['prop', 'sfx']);
    expect(report.find((e) => e.category === 'prop')?.count).toBe(2);
  });
});

describe('compareSceneNumbers / numeric ordering', () => {
  it('sorts numerically with letter suffixes handled sanely', () => {
    const input = ['10', '2A', '2', '1', '9B', '9'];
    expect([...input].sort(compareSceneNumbers)).toEqual(['1', '2', '2A', '9', '9B', '10']);
  });
});

describe('deriveCharacterReport', () => {
  const scriptScenes: ScriptScene[] = [
    scene({ id: 'sc-3', sceneNumber: '3', characterIds: ['c-alice'] }),
    scene({ id: 'sc-1', sceneNumber: '1', characterIds: ['c-bob'] }),
    scene({ id: 'sc-10', sceneNumber: '10', characterIds: ['c-alice'] }),
    scene({ id: 'sc-2a', sceneNumber: '2A', characterIds: ['c-alice', 'c-bob'] }),
    scene({ id: 'sc-2', sceneNumber: '2', characterIds: [] }),
  ];

  const people: Person[] = [{ id: 'p-lena', displayName: 'Lena Ray', kind: 'cast' }];
  const castAssignments: CastAssignment[] = [
    { id: 'ca-1', characterId: 'c-alice', personId: 'p-lena' },
  ];

  it('orders scenes numerically ("2A" after "2") and derives first/last scene numbers', () => {
    const report = deriveCharacterReport('c-alice', { scriptScenes, characters });
    expect(report.character?.canonicalName).toBe('ALICE');
    expect(report.scenes.map((s) => s.sceneNumber)).toEqual(['2A', '3', '10']);
    expect(report.firstSceneNumber).toBe('2A');
    expect(report.lastSceneNumber).toBe('10');
  });

  it('resolves the cast Person via CastAssignment and lists scheduled days in input order', () => {
    const scheduledSceneIdsByDay = [
      { dayId: 'd2', dayName: 'Day 2', sceneIds: ['sc-10'] },
      { dayId: 'd1', dayName: 'Day 1', sceneIds: ['sc-3', 'sc-unrelated'] },
      { dayId: 'd0', dayName: 'Day 0', sceneIds: ['sc-other-char'] },
      { dayId: 'd3', dayName: 'Day 3', sceneIds: ['sc-2a'] },
    ];
    const report = deriveCharacterReport('c-alice', {
      scriptScenes,
      characters,
      people,
      castAssignments,
      scheduledSceneIdsByDay,
    });
    expect(report.castPerson?.displayName).toBe('Lena Ray');
    expect(report.scheduledDays).toEqual([
      { dayId: 'd2', dayName: 'Day 2' },
      { dayId: 'd1', dayName: 'Day 1' },
      { dayId: 'd3', dayName: 'Day 3' },
    ]);
  });

  it('returns undefined character/castPerson and empty scenes for an unknown id', () => {
    const report = deriveCharacterReport('nobody', { scriptScenes, people });
    expect(report.character).toBeUndefined();
    expect(report.castPerson).toBeUndefined();
    expect(report.scenes).toEqual([]);
    expect(report.firstSceneNumber).toBeUndefined();
    expect(report.scheduledDays).toEqual([]);
  });
});

describe('deriveLocationReport', () => {
  const scriptScenes: ScriptScene[] = [
    scene({
      id: 'l-s1', sceneNumber: '1', intExt: 'INT', timeOfDay: 'DAY',
      locationId: 'loc-w', pageLengthEighths: 4,
    }),
    scene({
      id: 'l-s2', sceneNumber: '2', intExt: 'EXT', timeOfDay: 'NIGHT',
      locationId: 'loc-w', pageLengthEighths: 3,
    }),
    scene({
      id: 'l-s3', sceneNumber: '3', intExt: 'INT_EXT', timeOfDay: 'DAY',
      locationId: 'loc-w', pageLengthEighths: 2,
    }),
    scene({ id: 'l-s4', sceneNumber: '4', intExt: 'OTHER', locationId: 'loc-x' }),
  ];

  it('counts INT/EXT/timeOfDay across the location\'s scenes and totals pages', () => {
    const report = deriveLocationReport('loc-w', {
      scriptScenes,
      locations: [{ id: 'loc-w', name: 'Warehouse', type: 'location', referenceAssetIds: [] }],
    });
    expect(report.location?.name).toBe('Warehouse');
    expect(report.scenes.map((s) => s.id)).toEqual(['l-s1', 'l-s2', 'l-s3']);
    expect(report.intExtCounts).toEqual({ INT: 1, EXT: 1, INT_EXT: 1, OTHER: 0 });
    expect(report.dayNightCounts).toEqual({ DAY: 2, NIGHT: 1 });
    expect(report.totalPagesEighths).toBe(9);
  });

  it('returns null totals when ANY scene lacks pageLengthEighths', () => {
    const withGap = [
      ...scriptScenes.filter((s) => s.locationId === 'loc-w'),
      scene({ id: 'l-s5', sceneNumber: '5', locationId: 'loc-w' }),
    ];
    const report = deriveLocationReport('loc-w', { scriptScenes: withGap });
    expect(report.scenes).toHaveLength(4);
    expect(report.totalPagesEighths).toBeNull();
  });

  it('reports unknown location and empty counts for an unmatched id', () => {
    const report = deriveLocationReport('nope', { scriptScenes, locations: [] });
    expect(report.location).toBeUndefined();
    expect(report.scenes).toEqual([]);
    expect(report.intExtCounts).toEqual({ INT: 0, EXT: 0, INT_EXT: 0, OTHER: 0 });
    expect(report.dayNightCounts).toEqual({});
    // zero scenes: vacuously all have pages → sum is 0, not null
    expect(report.totalPagesEighths).toBe(0);
  });

  it('keys scenes without a timeOfDay under "unknown" instead of guessing', () => {
    const report = deriveLocationReport('loc-w', {
      scriptScenes: [
        scene({ id: 'u1', sceneNumber: '1', intExt: 'INT', locationId: 'loc-w', pageLengthEighths: 1 }),
        scene({ id: 'u2', sceneNumber: '2', intExt: 'EXT', locationId: 'loc-w', pageLengthEighths: 1 }),
      ],
    });
    expect(report.dayNightCounts).toEqual({ unknown: 2 });
  });
});
