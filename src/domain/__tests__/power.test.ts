import { describe, it, expect } from 'vitest';
import { createId } from '../ids';
import type { PowerConsumer, PowerCircuit } from '../power/types';
import {
  estimateConsumerWatts,
  calculatePowerLoad,
  circuitHeadroom,
} from '../power/logic';

describe('estimateConsumerWatts', () => {
  it('override beats profile', () => {
    const consumer: PowerConsumer = {
      id: createId('consumer'),
      name: 'Key light (metered)',
      equipmentProfileId: 'eq-1',
      powerWattsOverride: 650,
      quantity: 1,
    };
    const result = estimateConsumerWatts(consumer, 720);
    expect(result).toEqual({ watts: 650, source: 'override' });
  });

  it('profile is used when there is no override', () => {
    const consumer: PowerConsumer = {
      id: createId('consumer'),
      name: 'Key light',
      equipmentProfileId: 'eq-1',
      quantity: 1,
    };
    const result = estimateConsumerWatts(consumer, 720);
    expect(result).toEqual({ watts: 720, source: 'profile' });
  });

  it('yields unknown when neither override nor profile data exists', () => {
    const consumer: PowerConsumer = {
      id: createId('consumer'),
      name: 'Mystery prop light',
      quantity: 1,
    };
    const result = estimateConsumerWatts(consumer, undefined);
    expect(result).toEqual({ watts: null, source: 'unknown' });
  });

  it('never parses numbers out of model names (rule 28): model "S60" ≠ 60 W', () => {
    // Profile exists but has no powerWatts — the model string must not be mined.
    const consumer: PowerConsumer = {
      id: createId('consumer'),
      name: 'Fixture S60',
      equipmentProfileId: 'eq-s60',
      quantity: 1,
    };
    const result = estimateConsumerWatts(consumer, undefined);
    expect(result.watts).toBeNull();
    expect(result.source).toBe('unknown');
  });
});

describe('calculatePowerLoad', () => {
  it('aggregates known watts × quantity and counts unknown consumers separately', () => {
    const knownA: PowerConsumer = {
      id: 'c-a',
      name: '600d Pro',
      equipmentProfileId: 'eq-600d',
      quantity: 2,
    };
    const overridden: PowerConsumer = {
      id: 'c-b',
      name: 'LED tube (measured)',
      powerWattsOverride: 90,
      quantity: 3,
    };
    const unknown: PowerConsumer = {
      id: 'c-c',
      name: 'Practical, unknown draw',
      quantity: 4,
    };

    const result = calculatePowerLoad([knownA, overridden, unknown], (id) =>
      id === 'eq-600d' ? 720 : undefined,
    );

    expect(result.knownWatts).toBe(720 * 2 + 90 * 3);
    expect(result.totalWatts).toBe(result.knownWatts);
    expect(result.unknownConsumerCount).toBe(1);
    expect(result.perConsumer.find((p) => p.consumerId === 'c-a')).toEqual({
      consumerId: 'c-a',
      watts: 1440,
      source: 'profile',
    });
    expect(result.perConsumer.find((p) => p.consumerId === 'c-b')).toEqual({
      consumerId: 'c-b',
      watts: 270,
      source: 'override',
    });
    expect(result.perConsumer.find((p) => p.consumerId === 'c-c')).toEqual({
      consumerId: 'c-c',
      watts: null,
      source: 'unknown',
    });
  });

  it('returns zero known load for an empty consumer list', () => {
    const result = calculatePowerLoad([], () => undefined);
    expect(result.totalWatts).toBe(0);
    expect(result.unknownConsumerCount).toBe(0);
    expect(result.perConsumer).toHaveLength(0);
  });
});

describe('circuitHeadroom', () => {
  it('returns nulls when the circuit limit is unknown — never fabricates 0', () => {
    const circuit: PowerCircuit = {
      id: createId('circuit'),
      name: 'Circuit 12',
      sourceId: createId('source'),
      consumerIds: [],
    };
    expect(circuitHeadroom(circuit, 2000)).toEqual({
      usedA: null,
      headroomA: null,
      overloaded: null,
    });
  });

  it('returns nulls when voltage is unknown even if the limit is known', () => {
    const circuit: PowerCircuit = {
      id: createId('circuit'),
      name: 'Circuit 12',
      sourceId: createId('source'),
      maxAmperesA: 16,
      consumerIds: [],
    };
    expect(circuitHeadroom(circuit, 2000)).toEqual({
      usedA: null,
      headroomA: null,
      overloaded: null,
    });
  });

  it('detects overload when data is known', () => {
    const circuit: PowerCircuit = {
      id: createId('circuit'),
      name: '16A house distro',
      sourceId: createId('source'),
      maxAmperesA: 16,
      consumerIds: [],
    };
    const result = circuitHeadroom(circuit, 4000, { voltageV: 230 });
    expect(result.usedA).toBeCloseTo(17.39, 2);
    expect(result.overloaded).toBe(true);
    expect(result.headroomA).toBeLessThan(0);
  });

  it('reports positive headroom when the load fits', () => {
    const circuit: PowerCircuit = {
      id: createId('circuit'),
      name: '20A mains',
      sourceId: createId('source'),
      maxAmperesA: 20,
      consumerIds: [],
    };
    const result = circuitHeadroom(circuit, 2300, { voltageV: 230 });
    expect(result.usedA).toBeCloseTo(10, 5);
    expect(result.headroomA).toBeCloseTo(10, 5);
    expect(result.overloaded).toBe(false);
  });
});
