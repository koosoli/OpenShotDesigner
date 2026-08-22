import { describe, expect, it } from 'vitest';
import type { PowerCircuit, PowerConsumer } from '../power/types';
import { phaseBalance, powerLoadByGroup } from '../power/logic';

const consumer = (id: string, watts: number | undefined, extra: Partial<PowerConsumer> = {}): PowerConsumer => ({
  id,
  name: id,
  quantity: 1,
  ...(watts === undefined ? {} : { powerWattsOverride: watts }),
  ...extra,
});

const circuit = (id: string, phaseLeg?: 1 | 2 | 3): PowerCircuit => ({
  id,
  name: id,
  sourceId: 'src',
  consumerIds: [],
  ...(phaseLeg ? { phaseLeg } : {}),
});

describe('powerLoadByGroup', () => {
  it('sums known load per truss and keeps unknowns countable', () => {
    const consumers = [
      consumer('c1', 600, { trussElementId: 't1' }),
      consumer('c2', 300, { trussElementId: 't1' }),
      consumer('c3', 1200, { trussElementId: 't2' }),
      consumer('c4', undefined, { trussElementId: 't2' }),
    ];
    const { groups, ungrouped } = powerLoadByGroup(consumers, () => undefined, (c) => c.trussElementId);
    const t1 = groups.find((g) => g.key === 't1')!;
    const t2 = groups.find((g) => g.key === 't2')!;
    expect(t1.knownWatts).toBe(900);
    expect(t1.unknownConsumerCount).toBe(0);
    expect(t2.knownWatts).toBe(1200);
    expect(t2.unknownConsumerCount).toBe(1);
    expect(ungrouped.consumerIds).toEqual([]);
  });

  it('multiplies by quantity, like the flat load calculation', () => {
    const { groups } = powerLoadByGroup(
      [consumer('c1', 500, { quantity: 4, trussElementId: 't1' })],
      () => undefined,
      (c) => c.trussElementId,
    );
    expect(groups[0].knownWatts).toBe(2000);
  });

  it('keeps unassigned consumers in ungrouped instead of dropping them', () => {
    const { groups, ungrouped } = powerLoadByGroup(
      [consumer('c1', 100), consumer('c2', 250, { trussElementId: 't1' })],
      () => undefined,
      (c) => c.trussElementId,
    );
    expect(groups).toHaveLength(1);
    expect(ungrouped.knownWatts).toBe(100);
    expect(ungrouped.consumerIds).toEqual(['c1']);
  });

  it('falls back to profile watts through the same estimation path', () => {
    const { groups } = powerLoadByGroup(
      [consumer('c1', undefined, { equipmentProfileId: 'p1', distroZone: 'Stage left' })],
      (id) => (id === 'p1' ? 750 : undefined),
      (c) => c.distroZone,
    );
    expect(groups[0].knownWatts).toBe(750);
    expect(groups[0].unknownConsumerCount).toBe(0);
  });

  it('returns no groups for an empty consumer list', () => {
    const { groups, ungrouped } = powerLoadByGroup([], () => undefined, () => undefined);
    expect(groups).toEqual([]);
    expect(ungrouped.knownWatts).toBe(0);
  });
});

describe('phaseBalance', () => {
  it('reports per-leg watts and amps when the voltage is known', () => {
    const result = phaseBalance(
      [
        { circuit: circuit('a', 1), watts: 2300 },
        { circuit: circuit('b', 2), watts: 1150 },
      ],
      { voltageV: 230 },
    );
    expect(result.legs.find((l) => l.leg === 1)).toEqual({ leg: 1, watts: 2300, ampsA: 10 });
    expect(result.legs.find((l) => l.leg === 2)?.ampsA).toBe(5);
    expect(result.legs.find((l) => l.leg === 3)?.watts).toBe(0);
  });

  it('leaves amps unknown rather than fabricating them without a voltage', () => {
    const result = phaseBalance([{ circuit: circuit('a', 1), watts: 1000 }]);
    expect(result.legs.every((l) => l.ampsA === null)).toBe(true);
  });

  it('excludes circuits with no leg assigned from the balance', () => {
    const result = phaseBalance([
      { circuit: circuit('a', 1), watts: 1000 },
      { circuit: circuit('b'), watts: 400 },
    ]);
    expect(result.unassignedWatts).toBe(400);
    expect(result.legs.reduce((sum, l) => sum + l.watts, 0)).toBe(1000);
  });

  it('measures imbalance and names the busiest leg', () => {
    const even = phaseBalance([
      { circuit: circuit('a', 1), watts: 1000 },
      { circuit: circuit('b', 2), watts: 1000 },
      { circuit: circuit('c', 3), watts: 1000 },
    ]);
    expect(even.imbalanceRatio).toBe(0);
    expect(even.busiestLeg).toBe(1);

    const skewed = phaseBalance([{ circuit: circuit('a', 2), watts: 4000 }]);
    expect(skewed.imbalanceRatio).toBe(1);
    expect(skewed.busiestLeg).toBe(2);
  });

  it('reports unknown imbalance when no leg carries load, never a false "balanced"', () => {
    expect(phaseBalance([]).imbalanceRatio).toBeNull();
    expect(phaseBalance([]).busiestLeg).toBeNull();
    expect(phaseBalance([{ circuit: circuit('a'), watts: 900 }]).imbalanceRatio).toBeNull();
  });
});
