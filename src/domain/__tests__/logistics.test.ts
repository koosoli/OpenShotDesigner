import { describe, it, expect } from 'vitest';
import { createId } from '../ids';
import type { LogisticsContainer, PackedItem } from '../logistics/types';
import {
  calculateContainerLoad,
  listContainerContents,
  SAFETY_NOTE,
} from '../logistics/logic';

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
