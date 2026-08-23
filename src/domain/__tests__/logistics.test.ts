import { describe, it, expect } from 'vitest';
import { createId } from '../ids';
import type { FixtureProfile } from '../fixtures/types';
import type { LogisticsContainer, PackedItem } from '../logistics/types';
import {
  calculateContainerLoad,
  containerBelongsToDay,
  listContainerContents,
  resolveContainerAssignments,
  SAFETY_NOTE,
} from '../logistics/logic';
import {
  catalogueUnitWeightKg,
  packEquipmentIntoContainer,
  type PackableEquipment,
} from '../logistics/packEquipment';

const case1 = (): LogisticsContainer => ({
  id: 'case-1',
  kind: 'case',
  name: 'Cable case',
  tareWeightKg: 8,
  usableVolumeLiters: 120,
  maxPayloadKg: 40,
});

describe('calculateContainerLoad', () => {
  it('computes weight and utilization from known items', () => {
    const container = case1();
    const items: PackedItem[] = [
      {
        id: createId('packed'),
        containerId: 'case-1',
        label: 'Socapex loom',
        quantity: 2,
        unitWeightKg: 6,
        packedVolumeLiters: 15,
      },
      {
        id: createId('packed'),
        containerId: 'case-1',
        label: 'Stinger',
        quantity: 4,
        unitWeightKg: 1.5,
        packedVolumeLiters: 2.5,
      },
    ];
    const result = calculateContainerLoad(container, items);
    expect(result.tareUnknown).toBe(false);
    expect(result.totalWeightKg).toBe(8 + (6 * 2 + 1.5 * 4));
    expect(result.unknownItemCount).toBe(0);
    expect(result.usedVolumeLiters).toBe(15 * 2 + 2.5 * 4);
    expect(result.volumeIsEstimate).toBe(false);
    // payload: (8+18)/40; volume: 40/120
    expect(result.payloadUtilization).toBeCloseTo(26 / 40, 10);
    expect(result.volumeUtilization).toBeCloseTo(40 / 120, 10);
  });

  it('returns null total when any item weight is unknown, but still counts it', () => {
    const container = case1();
    const items: PackedItem[] = [
      {
        id: createId('packed'),
        containerId: 'case-1',
        label: 'Known amp',
        quantity: 1,
        unitWeightKg: 12,
      },
      {
        id: createId('packed'),
        containerId: 'case-1',
        label: 'Mystery gaffer box',
        quantity: 3,
      },
    ];
    const result = calculateContainerLoad(container, items);
    expect(result.totalWeightKg).toBeNull();
    expect(result.unknownItemCount).toBe(1);
    expect(result.payloadUtilization).toBeNull();
  });

  it('treats absent tare as 0 but reports tareUnknown', () => {
    const container: LogisticsContainer = { id: 'cart-1', kind: 'cart', name: 'Cart' };
    const items: PackedItem[] = [
      {
        id: createId('packed'),
        containerId: 'cart-1',
        label: 'Monitor',
        quantity: 1,
        unitWeightKg: 9,
      },
    ];
    const result = calculateContainerLoad(container, items);
    expect(result.tareUnknown).toBe(true);
    expect(result.totalWeightKg).toBe(9);
  });

  it('propagates null volume when any packed volume is unknown', () => {
    const container = case1();
    const items: PackedItem[] = [
      {
        id: createId('packed'),
        containerId: 'case-1',
        label: 'Known case insert',
        quantity: 1,
        unitWeightKg: 2,
        packedVolumeLiters: 10,
      },
      {
        id: createId('packed'),
        containerId: 'case-1',
        label: 'Odd-shaped prop',
        quantity: 1,
        unitWeightKg: 2,
      },
    ];
    const result = calculateContainerLoad(container, items);
    expect(result.usedVolumeLiters).toBeNull();
    expect(result.volumeUtilization).toBeNull();
  });

  it('propagates the estimate flag when any known volume is an estimate', () => {
    const container = case1();
    const items: PackedItem[] = [
      {
        id: createId('packed'),
        containerId: 'case-1',
        label: 'Packed dims item',
        quantity: 1,
        unitWeightKg: 2,
        packedVolumeLiters: 10,
      },
      {
        id: createId('packed'),
        containerId: 'case-1',
        label: 'Bounding-dims item',
        quantity: 1,
        unitWeightKg: 2,
        packedVolumeLiters: 20,
        volumeIsEstimate: true,
      },
    ];
    const result = calculateContainerLoad(container, items);
    expect(result.usedVolumeLiters).toBe(30);
    expect(result.volumeIsEstimate).toBe(true);
  });

  it('returns null utilizations when limits are unknown', () => {
    const container: LogisticsContainer = { id: 'pallet-1', kind: 'pallet', name: 'Pallet' };
    const items: PackedItem[] = [
      {
        id: createId('packed'),
        containerId: 'pallet-1',
        label: 'Sandbag',
        quantity: 1,
        unitWeightKg: 10,
        packedVolumeLiters: 8,
      },
    ];
    const result = calculateContainerLoad(container, items);
    expect(result.payloadUtilization).toBeNull();
    expect(result.volumeUtilization).toBeNull();
    expect(result.totalWeightKg).toBe(10);
    expect(result.usedVolumeLiters).toBe(8);
  });
});

describe('calculateContainerLoad rollup', () => {
  const truck = (): LogisticsContainer => ({
    id: 'truck-1',
    kind: 'truck',
    name: 'Grip truck',
    tareWeightKg: 100,
    maxPayloadKg: 200,
  });
  const nestedCase = (): LogisticsContainer => ({
    id: 'case-1',
    kind: 'case',
    name: 'Lens case',
    parentContainerId: 'truck-1',
    tareWeightKg: 8,
  });

  it('adds nested containers and their contents to the rolled-up total', () => {
    const containers = [truck(), nestedCase()];
    const items: PackedItem[] = [
      { id: 'i1', containerId: 'truck-1', label: 'Straps', quantity: 2, unitWeightKg: 1 },
      { id: 'i2', containerId: 'case-1', label: 'Lens', quantity: 4, unitWeightKg: 2.5 },
    ];
    const load = calculateContainerLoad(containers[0], items, containers);
    // Direct: 100 tare + 2 kg of straps.
    expect(load.totalWeightKg).toBe(102);
    // Rolled up: + the case's own 8 kg tare + 10 kg of glass.
    expect(load.rolledUpWeightKg).toBe(120);
    expect(load.nestedContainerCount).toBe(1);
    expect(load.rolledUpTareUnknown).toBe(false);
    expect(load.rolledUpPayloadUtilization).toBeCloseTo(120 / 200, 10);
    // The direct utilization still describes only what is loose in the truck.
    expect(load.payloadUtilization).toBeCloseTo(102 / 200, 10);
  });

  it('leaves the rolled-up total unknown when a nested item has no weight', () => {
    const containers = [truck(), nestedCase()];
    const items: PackedItem[] = [
      { id: 'i1', containerId: 'truck-1', label: 'Straps', quantity: 2, unitWeightKg: 1 },
      { id: 'i2', containerId: 'case-1', label: 'Mystery box', quantity: 1 },
    ];
    const load = calculateContainerLoad(containers[0], items, containers);
    // The truck's own contents are all known...
    expect(load.totalWeightKg).toBe(102);
    // ...but a truck total that silently omits the case is the dangerous one.
    expect(load.rolledUpWeightKg).toBeNull();
    expect(load.rolledUpUnknownItemCount).toBe(1);
    expect(load.rolledUpPayloadUtilization).toBeNull();
  });

  it('flags an unknown tare anywhere in the tree without zeroing the total', () => {
    const containers: LogisticsContainer[] = [
      truck(),
      { id: 'case-1', kind: 'case', name: 'Untared case', parentContainerId: 'truck-1' },
    ];
    const items: PackedItem[] = [
      { id: 'i1', containerId: 'case-1', label: 'Sandbag', quantity: 1, unitWeightKg: 9 },
    ];
    const load = calculateContainerLoad(containers[0], items, containers);
    expect(load.tareUnknown).toBe(false);
    expect(load.rolledUpTareUnknown).toBe(true);
    expect(load.rolledUpWeightKg).toBe(109);
  });

  it('rolls up through several levels of nesting', () => {
    const containers: LogisticsContainer[] = [
      truck(),
      nestedCase(),
      { id: 'pouch-1', kind: 'case', name: 'Filter pouch', parentContainerId: 'case-1', tareWeightKg: 1 },
    ];
    const items: PackedItem[] = [
      { id: 'i1', containerId: 'pouch-1', label: 'Filter', quantity: 3, unitWeightKg: 0.5 },
    ];
    const load = calculateContainerLoad(containers[0], items, containers);
    expect(load.nestedContainerCount).toBe(2);
    expect(load.rolledUpWeightKg).toBe(100 + 8 + 1 + 1.5);
  });

  it('survives a container that is its own ancestor', () => {
    // Corrupt data: the truck claims to be packed inside the case it holds.
    const containers: LogisticsContainer[] = [
      { ...truck(), parentContainerId: 'case-1' },
      nestedCase(),
    ];
    const items: PackedItem[] = [
      { id: 'i1', containerId: 'case-1', label: 'Lens', quantity: 1, unitWeightKg: 2 },
    ];
    const load = calculateContainerLoad(containers[0], items, containers);
    expect(load.rolledUpWeightKg).toBe(100 + 8 + 2);
    expect(load.nestedContainerCount).toBe(1);
  });

  it('reports the direct figures as the rolled-up ones when no containers are supplied', () => {
    const load = calculateContainerLoad(case1(), [
      { id: 'i', containerId: 'case-1', label: 'Loom', quantity: 1, unitWeightKg: 6 },
    ]);
    expect(load.totalWeightKg).toBe(14);
    expect(load.rolledUpWeightKg).toBe(14);
    expect(load.nestedContainerCount).toBe(0);
  });
});

describe('resolveContainerAssignments', () => {
  const containers: LogisticsContainer[] = [
    { id: 'truck', kind: 'truck', name: 'Truck', productionDayId: 'day-1', locationId: 'loc-1' },
    { id: 'case', kind: 'case', name: 'Case', parentContainerId: 'truck' },
    { id: 'cart', kind: 'cart', name: 'Cart', productionDayId: 'day-2' },
    { id: 'loose', kind: 'case', name: 'Loose case' },
  ];

  it('inherits day and location from the container a box is packed inside', () => {
    const assignments = resolveContainerAssignments(containers);
    expect(assignments.get('case')).toEqual({
      productionDayId: 'day-1',
      locationId: 'loc-1',
      dayInherited: true,
      locationInherited: true,
    });
    expect(assignments.get('truck')?.dayInherited).toBe(false);
    expect(assignments.get('loose')?.productionDayId).toBeUndefined();
  });

  it('lets a container override the day it inherits', () => {
    const assignments = resolveContainerAssignments([
      ...containers,
      { id: 'pickup', kind: 'case', name: 'Pickup case', parentContainerId: 'truck', productionDayId: 'day-3' },
    ]);
    expect(assignments.get('pickup')?.productionDayId).toBe('day-3');
    expect(assignments.get('pickup')?.dayInherited).toBe(false);
    // Location still comes down from the truck.
    expect(assignments.get('pickup')?.locationId).toBe('loc-1');
  });

  it('does not loop on a parent cycle', () => {
    const assignments = resolveContainerAssignments([
      { id: 'a', kind: 'case', name: 'A', parentContainerId: 'b' },
      { id: 'b', kind: 'case', name: 'B', parentContainerId: 'a', productionDayId: 'day-9' },
    ]);
    expect(assignments.get('a')?.productionDayId).toBe('day-9');
    expect(assignments.get('b')?.productionDayId).toBe('day-9');
  });

  it('keeps unrouted containers on every day, and hides other days', () => {
    const assignments = resolveContainerAssignments(containers);
    expect(containerBelongsToDay(assignments.get('truck'), 'day-1')).toBe(true);
    expect(containerBelongsToDay(assignments.get('case'), 'day-1')).toBe(true);
    expect(containerBelongsToDay(assignments.get('cart'), 'day-1')).toBe(false);
    expect(containerBelongsToDay(assignments.get('loose'), 'day-1')).toBe(true);
    // No day asked for means the whole production.
    expect(containerBelongsToDay(assignments.get('cart'), undefined)).toBe(true);
  });
});

describe('packEquipmentIntoContainer', () => {
  const skyPanel: PackableEquipment = {
    category: 'lighting',
    name: 'SkyPanel S60-C',
    brand: 'ARRI',
    model: 'SkyPanel S60-C',
    quantity: 2,
  };
  const mysteryGrip: PackableEquipment = {
    category: 'grip',
    name: 'Menace arm rig',
    brand: 'Modern Studio',
    model: 'Menace Arm Rigging Kit',
    quantity: 1,
  };

  let counter = 0;
  const newId = () => `packed-${(counter += 1)}`;

  it('creates one packed item per manifest row, carrying known weights and leaving the rest unknown', () => {
    counter = 0;
    const result = packEquipmentIntoContainer({
      equipment: [skyPanel, mysteryGrip],
      containerId: 'truck-1',
      existingItems: [],
      unitWeightKg: (item) => (item.model === 'SkyPanel S60-C' ? 12.5 : undefined),
      newId,
    });
    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.unknownWeightCount).toBe(1);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      containerId: 'truck-1',
      label: 'ARRI SkyPanel S60-C',
      quantity: 2,
      unitWeightKg: 12.5,
      sourceEquipmentKey: 'lighting:arri:skypanel s60-c',
    });
    // An unknown weight is absent, never 0.
    expect(result.items[1].unitWeightKg).toBeUndefined();
    expect('unitWeightKg' in result.items[1]).toBe(true);
  });

  it('updates the rows it created before instead of duplicating them, wherever they now sit', () => {
    counter = 0;
    const first = packEquipmentIntoContainer({
      equipment: [skyPanel],
      containerId: 'truck-1',
      existingItems: [],
      unitWeightKg: () => 12.5,
      newId,
    });
    // The user moved it into a case and packed something by hand next to it.
    const moved: PackedItem[] = [
      { ...first.items[0], containerId: 'case-9' },
      { id: 'hand-1', containerId: 'case-9', label: 'Gaffer tape', quantity: 3 },
    ];
    const second = packEquipmentIntoContainer({
      equipment: [{ ...skyPanel, quantity: 3 }],
      containerId: 'truck-1',
      existingItems: moved,
      unitWeightKg: () => 12.5,
      newId,
    });
    expect(second.added).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.items).toHaveLength(2);
    expect(second.items[0]).toMatchObject({ containerId: 'case-9', quantity: 3 });
    // The hand-packed item is untouched.
    expect(second.items[1]).toEqual(moved[1]);
  });

  it('keeps a weight the user typed when the catalogue still knows none', () => {
    counter = 0;
    const existing: PackedItem[] = [
      {
        id: 'p1',
        containerId: 'truck-1',
        label: 'Modern Studio Menace Arm Rigging Kit',
        quantity: 1,
        unitWeightKg: 31,
        sourceEquipmentKey: 'grip:modern studio:menace arm rigging kit',
      },
    ];
    const result = packEquipmentIntoContainer({
      equipment: [mysteryGrip],
      containerId: 'truck-1',
      existingItems: existing,
      unitWeightKg: () => undefined,
      newId,
    });
    expect(result.items[0].unitWeightKg).toBe(31);
  });

  it('leaves a generated row whose manifest entry disappeared on the list', () => {
    counter = 0;
    const existing: PackedItem[] = [
      {
        id: 'p1',
        containerId: 'truck-1',
        label: 'ARRI SkyPanel S60-C',
        quantity: 1,
        sourceEquipmentKey: 'lighting:arri:skypanel s60-c',
      },
    ];
    const result = packEquipmentIntoContainer({
      equipment: [mysteryGrip],
      containerId: 'truck-1',
      existingItems: existing,
      unitWeightKg: () => undefined,
      newId,
    });
    expect(result.items.map((item) => item.id)).toEqual(['p1', 'packed-1']);
  });
});

describe('catalogueUnitWeightKg', () => {
  const profile = (manufacturer: string, model: string, weightKg?: number): FixtureProfile => ({
    id: `${manufacturer}-${model}`,
    category: 'lighting',
    manufacturer,
    model,
    categories: ['Film light'],
    modes: [],
    weightKg,
  });
  const profiles = [profile('ARRI', 'SkyPanel S60-C', 12.5), profile('ARRI', 'Orbiter', 10.5)];

  it('reads the weight off a matching profile', () => {
    expect(
      catalogueUnitWeightKg(profiles, {
        category: 'lighting',
        name: 'SkyPanel S60-C',
        brand: 'ARRI',
        model: 'SkyPanel S60-C',
        quantity: 1,
      }),
    ).toBe(12.5);
  });

  it('stays unknown for gear with no brand, or with no profile to match', () => {
    expect(
      catalogueUnitWeightKg(profiles, { category: 'grip', name: 'Sandbag 20lb', quantity: 1 }),
    ).toBeUndefined();
    expect(
      catalogueUnitWeightKg(profiles, {
        category: 'lighting',
        name: 'Nova P600c',
        brand: 'Aputure',
        model: 'Nova P600c',
        quantity: 1,
      }),
    ).toBeUndefined();
  });

  it('stays unknown when the matched profile records no weight', () => {
    expect(
      catalogueUnitWeightKg([profile('ARRI', 'Orbiter')], {
        category: 'lighting',
        name: 'Orbiter',
        brand: 'ARRI',
        model: 'Orbiter',
        quantity: 1,
      }),
    ).toBeUndefined();
  });
});

describe('listContainerContents', () => {
  it('lists direct item labels and one level of nested containers', () => {
    const truck: LogisticsContainer = { id: 'truck-1', kind: 'truck', name: 'Truck' };
    const rack: LogisticsContainer = {
      id: 'rack-1',
      kind: 'rack',
      name: 'Dimmer rack',
      parentContainerId: 'truck-1',
    };
    const cart: LogisticsContainer = {
      id: 'cart-9',
      kind: 'cart',
      name: 'Unrelated cart',
    };
    const containers = [truck, rack, cart];
    const items: PackedItem[] = [
      {
        id: createId('packed'),
        containerId: 'truck-1',
        label: 'Straps',
        quantity: 4,
      },
      {
        id: createId('packed'),
        containerId: 'rack-1',
        label: 'Dimmer',
        quantity: 2,
      },
    ];
    const contents = listContainerContents('truck-1', items, containers);
    expect(contents.itemLabels).toEqual(['Straps']);
    expect(contents.childContainers.map((c) => c.id)).toEqual(['rack-1']);
  });
});

describe('SAFETY_NOTE', () => {
  it('exists and warns about planning estimates', () => {
    expect(typeof SAFETY_NOTE).toBe('string');
    expect(SAFETY_NOTE.length).toBeGreaterThan(0);
    expect(SAFETY_NOTE).toMatch(/planning estimates/i);
  });
});
