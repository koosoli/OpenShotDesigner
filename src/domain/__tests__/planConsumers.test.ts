import { describe, expect, it } from 'vitest';
import {
  derivePlanConsumers,
  planConsumerId,
  savablePlanConsumers,
  type PlanLight,
  type PlanPowerConsumer,
} from '../power';

const light = (id: string, overrides: Partial<PlanLight> = {}): PlanLight => ({ id, ...overrides });

describe('derivePlanConsumers', () => {
  /**
   * The complaint this exists to answer: lights standing on the floor plan did
   * not appear on the power page at all unless the user found a button, so the
   * page could only report what had been typed into it a second time.
   */
  it('shows every light on the plan without anything being saved first', () => {
    const consumers = derivePlanConsumers(
      [light('el-1', { name: 'Key' }), light('el-2', { name: 'Back' })],
      [],
    );
    expect(consumers.map((c) => c.name)).toEqual(['Key', 'Back']);
    expect(consumers.every((c) => c.derivedFromPlan)).toBe(true);
    expect(consumers.map((c) => c.sourceElementId)).toEqual(['el-1', 'el-2']);
  });

  /**
   * The fixture identity is what lets the load report read a real wattage out
   * of the catalogue instead of "unknown". It was being dropped.
   */
  it('carries the fixture profile through, so the wattage can be resolved', () => {
    const [consumer] = derivePlanConsumers([light('el-1', { fixtureProfileId: 'ofl-skypanel' })], []);
    expect(consumer.equipmentProfileId).toBe('ofl-skypanel');
  });

  it('gives a light with no name something a gaffer can read', () => {
    expect(derivePlanConsumers([light('el-1', { fixtureType: 'led_panel' })], [])[0].name).toBe(
      'led panel',
    );
    expect(
      derivePlanConsumers([light('el-2', { brand: 'ARRI', fixtureModel: 'SkyPanel S60-C' })], [])[0]
        .name,
    ).toBe('ARRI SkyPanel S60-C');
  });

  it('keeps the power decisions the operator made against that light', () => {
    const saved: PlanPowerConsumer[] = [
      {
        id: 'pcons-1',
        name: 'stale name',
        quantity: 3,
        circuitId: 'c1',
        powerWattsOverride: 900,
        trussElementId: 't1',
        distroZone: 'SL',
        sourceElementId: 'el-1',
      },
    ];
    const [consumer] = derivePlanConsumers([light('el-1', { name: 'Key' })], saved);
    expect(consumer.id).toBe('pcons-1');
    expect(consumer.quantity).toBe(3);
    expect(consumer.circuitId).toBe('c1');
    expect(consumer.powerWattsOverride).toBe(900);
    expect(consumer.trussElementId).toBe('t1');
    expect(consumer.distroZone).toBe('SL');
    // …but the name follows the plan, so renaming the fixture in the inspector
    // does not leave a stale label on the distro sheet.
    expect(consumer.name).toBe('Key');
  });

  it('keeps a hand-added consumer that was never on the plan', () => {
    const saved: PlanPowerConsumer[] = [{ id: 'pcons-9', name: 'Practical lamp', quantity: 2 }];
    const consumers = derivePlanConsumers([light('el-1')], saved);
    expect(consumers.map((c) => c.name)).toContain('Practical lamp');
    expect(consumers.find((c) => c.id === 'pcons-9')?.orphanedFromPlan).toBeUndefined();
  });

  /**
   * Deleting the light does not delete the fixture from the truck, so the row
   * stays — but it is flagged rather than left looking like a live plan light.
   */
  it('flags a saved row whose light has been deleted from the plan', () => {
    const saved: PlanPowerConsumer[] = [
      { id: 'pcons-1', name: 'Key', quantity: 1, circuitId: 'c1', sourceElementId: 'el-gone' },
    ];
    const consumers = derivePlanConsumers([light('el-1')], saved);
    const orphan = consumers.find((c) => c.id === 'pcons-1');
    expect(orphan?.orphanedFromPlan).toBe(true);
    expect(orphan?.circuitId).toBe('c1');
  });

  it('gives an untouched light a stable id across reads', () => {
    const first = derivePlanConsumers([light('el-1')], [])[0];
    const second = derivePlanConsumers([light('el-1')], [])[0];
    expect(first.id).toBe(second.id);
    expect(first.id).toBe(planConsumerId('el-1'));
  });
});

describe('savablePlanConsumers', () => {
  /**
   * Writing a row for every light the moment the panel opens would bloat the
   * project with rows that say nothing — and freeze each fixture's name at
   * first render, which is the staleness the derivation exists to avoid.
   */
  it('does not persist a derived row that carries no decision', () => {
    const derived = derivePlanConsumers([light('el-1', { name: 'Key' })], []);
    expect(savablePlanConsumers(derived)).toEqual([]);
  });

  it('persists a derived row once it has been assigned a circuit', () => {
    const derived = derivePlanConsumers([light('el-1', { name: 'Key' })], []);
    const assigned = derived.map((c) => ({ ...c, circuitId: 'c1' }));
    const saved = savablePlanConsumers(assigned);
    expect(saved).toHaveLength(1);
    expect(saved[0].sourceElementId).toBe('el-1');
    expect(saved[0].circuitId).toBe('c1');
    // The derivation markers are working state, not project data.
    expect('derivedFromPlan' in saved[0]).toBe(false);
    expect('orphanedFromPlan' in saved[0]).toBe(false);
  });

  it('persists a wattage override, a truss, a zone or a quantity on their own', () => {
    const base = derivePlanConsumers([light('el-1')], [])[0];
    expect(savablePlanConsumers([{ ...base, powerWattsOverride: 300 }])).toHaveLength(1);
    expect(savablePlanConsumers([{ ...base, trussElementId: 't1' }])).toHaveLength(1);
    expect(savablePlanConsumers([{ ...base, distroZone: 'SL' }])).toHaveLength(1);
    expect(savablePlanConsumers([{ ...base, quantity: 2 }])).toHaveLength(1);
  });

  it('always persists a hand-added consumer', () => {
    const saved: PlanPowerConsumer[] = [{ id: 'pcons-9', name: 'Practical lamp', quantity: 1 }];
    expect(savablePlanConsumers(derivePlanConsumers([], saved))).toHaveLength(1);
  });

  /** A round trip must not multiply rows or lose the decisions on them. */
  it('round-trips: derive, save, derive again', () => {
    const lights = [light('el-1', { name: 'Key' }), light('el-2', { name: 'Back' })];
    const first = derivePlanConsumers(lights, []).map((c) =>
      c.sourceElementId === 'el-1' ? { ...c, circuitId: 'c1' } : c,
    );
    const persisted = savablePlanConsumers(first);
    const second = derivePlanConsumers(lights, persisted);
    expect(second).toHaveLength(2);
    expect(second.find((c) => c.sourceElementId === 'el-1')?.circuitId).toBe('c1');
    expect(second.find((c) => c.sourceElementId === 'el-2')?.circuitId).toBeUndefined();
  });
});
