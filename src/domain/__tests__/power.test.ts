import { describe, it, expect } from 'vitest';
import { createId } from '../ids';
import type { PowerConsumer, PowerCircuit } from '../power/types';
import {
  estimateConsumerWatts,
  calculatePowerLoad,
  circuitHeadroom,
  circuitPowerFactor,
  phaseBalance,
  sourceLoad,
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
      powerFactor: 1,
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
      powerFactor: 1,
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
    expect(result.powerFactor).toBe(1);
  });

  /**
   * A breaker trips on current, not on watts. 3 kW of magnetic-ballast HMI at
   * pf 0.6 pulls 21.7 A off a 230 V 16 A circuit — dividing by volts alone
   * reported 13 A and "fits", for a circuit that goes on the first take.
   */
  it('divides by the power factor, so a ballast load reads as the amps it really pulls', () => {
    const circuit: PowerCircuit = {
      id: createId('circuit'),
      name: '16A HMI circuit',
      sourceId: createId('source'),
      maxAmperesA: 16,
      consumerIds: [],
      powerFactor: 0.6,
    };
    const result = circuitHeadroom(circuit, 3000, { voltageV: 230 });
    expect(result.usedA).toBeCloseTo(21.74, 2);
    expect(result.overloaded).toBe(true);
    expect(result.powerFactor).toBe(0.6);
    // The same load at unity power factor fits, which is why the old maths lied.
    expect(circuitHeadroom({ ...circuit, powerFactor: undefined }, 3000, { voltageV: 230 }).overloaded).toBe(
      false,
    );
  });

  it('ignores a nonsensical power factor rather than dividing by it', () => {
    const circuit: PowerCircuit = {
      id: createId('circuit'),
      name: 'Circuit',
      sourceId: createId('source'),
      maxAmperesA: 16,
      consumerIds: [],
    };
    for (const pf of [0, -1, 1.4, Number.NaN]) {
      const result = circuitHeadroom(circuit, 2300, { voltageV: 230, powerFactor: pf });
      expect(result.powerFactor).toBe(1);
      expect(result.usedA).toBeCloseTo(10, 6);
    }
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

/**
 * The power factor has to reach every figure on the report, not just the
 * circuit row. The screen that prompted this showed one circuit pulling 21.7 A
 * while the leg it hangs off reported 13 A for the same load.
 */
describe('power factor across the whole report', () => {
  const circuit = (id: string, extra: Partial<PowerCircuit> = {}): PowerCircuit => ({
    id,
    name: id,
    sourceId: 'src',
    consumerIds: [],
    ...extra,
  });

  it('gives a phase leg the same amps its circuit reports', () => {
    const hmi = circuit('hmi', { maxAmperesA: 16, phaseLeg: 1, powerFactor: 0.6 });
    const balance = phaseBalance([{ circuit: hmi, watts: 3000 }], { voltageV: 230 });
    const headroom = circuitHeadroom(hmi, 3000, { voltageV: 230 });
    expect(balance.legs[0].ampsA).toBeCloseTo(21.74, 2);
    expect(balance.legs[0].ampsA).toBeCloseTo(headroom.usedA!, 6);
    // Watts are watts — only the current moves with the power factor.
    expect(balance.legs[0].watts).toBe(3000);
  });

  it('works the power factor per circuit on a leg carrying two of them', () => {
    const balance = phaseBalance(
      [
        { circuit: circuit('tungsten', { phaseLeg: 2 }), watts: 2300 },
        { circuit: circuit('ballast', { phaseLeg: 2, powerFactor: 0.5 }), watts: 2300 },
      ],
      { voltageV: 230 },
    );
    // 10 A + 20 A. Averaging the two power factors to 0.75 would say 26.7 A,
    // and ignoring them 20 A; neither is a current anyone could measure.
    expect(balance.legs[1].ampsA).toBeCloseTo(30, 6);
  });

  it('leaves leg amps unknown without a voltage, power factor or not', () => {
    const balance = phaseBalance([
      { circuit: circuit('ballast', { phaseLeg: 3, powerFactor: 0.6 }), watts: 1000 },
    ]);
    expect(balance.legs.every((leg) => leg.ampsA === null)).toBe(true);
    expect(balance.legs[2].watts).toBe(1000);
  });

  it('sizes a supply in the volt-amps it is rated in, summed per circuit', () => {
    const source = { voltageV: 230, ampsPerPhaseA: 16, phases: 1 as const };
    const load = sourceLoad(source, [
      { circuit: circuit('tungsten'), watts: 1150 },
      { circuit: circuit('ballast', { powerFactor: 0.5 }), watts: 1150 },
    ]);
    expect(load.knownWatts).toBe(2300);
    expect(load.apparentVA).toBeCloseTo(3450, 6);
    expect(load.capacityVA).toBe(3680);
    expect(load.overCapacity).toBe(false);

    // The same watts all on ballasts ask 4600 VA of a 3680 VA supply — the
    // comparison the old panel got right only by accident, comparing W with VA.
    const allBallast = sourceLoad(source, [
      { circuit: circuit('ballast', { powerFactor: 0.5 }), watts: 2300 },
    ]);
    expect(allBallast.knownWatts).toBe(2300);
    expect(allBallast.overCapacity).toBe(true);
  });

  it('leaves a supply verdict unknown when its rating is not fully known', () => {
    const load = sourceLoad({ voltageV: 230 }, [{ circuit: circuit('a'), watts: 1000 }]);
    expect(load.capacityVA).toBeNull();
    expect(load.overCapacity).toBeNull();
    expect(load.apparentVA).toBe(1000);
  });

  it('ignores a stored power factor that is not a power factor', () => {
    // A 0 would divide by zero and report an infinite current; 1.4 cannot be.
    for (const powerFactor of [0, -0.5, 1.4, Number.NaN]) {
      expect(circuitPowerFactor(circuit('a', { powerFactor }))).toBe(1);
      expect(sourceLoad({}, [{ circuit: circuit('a', { powerFactor }), watts: 2300 }]).apparentVA).toBe(
        2300,
      );
    }
  });
});
