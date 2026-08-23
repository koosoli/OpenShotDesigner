import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RIGGING_ASSUMPTIONS,
  calculateTrussLoad,
  detachLoadFromProfile,
  planLightIsOnRun,
  resolveSuspendedLoadWeights,
  riggingLoadOptions,
  suspendedLoadFromFixtureProfile,
  suspendedLoadFromPlanLight,
  type FixtureWeightProfile,
  type RiggablePlanLight,
  type SuspendedLoad,
  type TrussElement,
} from '../rigging';

const truss = (id: string): TrussElement => ({ id, profileId: 'p1', x: 0, y: 0, rotation: 0 });

const CATALOGUE: FixtureWeightProfile[] = [
  { id: 'prof-600d', manufacturer: 'Aputure', model: 'LS 600c Pro', weightKg: 6.2 },
  // A real catalogue entry that simply has no published mass.
  { id: 'prof-mystery', manufacturer: 'Nobody', model: 'Unweighed 1K' },
];
const lookup = (id: string) => CATALOGUE.find((profile) => profile.id === id);

const light = (overrides: Partial<RiggablePlanLight> = {}): RiggablePlanLight => ({
  id: 'el-1',
  ...overrides,
});

describe('suspendedLoadFromPlanLight', () => {
  it("marks a catalogue-linked light as 'profile' and keeps the link, not a copied weight", () => {
    const load = suspendedLoadFromPlanLight(
      light({ name: 'Key', fixtureProfileId: 'prof-600d' }),
      'truss-1',
      'load-1',
    );
    expect(load).toMatchObject({
      id: 'load-1',
      trussElementId: 'truss-1',
      label: 'Key',
      quantity: 1,
      source: 'profile',
      fixtureProfileId: 'prof-600d',
      sourceElementId: 'el-1',
    });
    // The kilograms belong to the catalogue, so they are not frozen into the save.
    expect(load.weightKg).toBeUndefined();
  });

  it("calls a light with no catalogue fixture 'unknown' rather than claiming a profile", () => {
    const load = suspendedLoadFromPlanLight(light({ brand: 'ARRI', fixtureModel: 'M18' }), 't', 'l');
    expect(load.source).toBe('unknown');
    expect(load.fixtureProfileId).toBeUndefined();
    expect(load.label).toBe('ARRI M18');
  });

  it('names an unnamed light from its fixture type', () => {
    expect(suspendedLoadFromPlanLight(light({ fixtureType: 'led_panel' }), 't', 'l').label).toBe(
      'led panel',
    );
  });
});

describe('suspendedLoadFromFixtureProfile', () => {
  it('labels the load from the catalogue and links it', () => {
    const load = suspendedLoadFromFixtureProfile(CATALOGUE[0], 'truss-1', 'load-2');
    expect(load.label).toBe('Aputure LS 600c Pro');
    expect(load.source).toBe('profile');
    expect(load.fixtureProfileId).toBe('prof-600d');
    expect(load.sourceElementId).toBeUndefined();
  });
});

describe('resolveSuspendedLoadWeights', () => {
  const loads: SuspendedLoad[] = [
    { id: 'a', trussElementId: 't', label: 'Key', quantity: 2, source: 'profile', fixtureProfileId: 'prof-600d' },
    { id: 'b', trussElementId: 't', label: 'Odd', quantity: 1, source: 'profile', fixtureProfileId: 'prof-mystery' },
    { id: 'c', trussElementId: 't', label: 'Gone', quantity: 1, source: 'profile', fixtureProfileId: 'prof-deleted' },
    { id: 'd', trussElementId: 't', label: 'Hand', quantity: 1, source: 'manual', weightKg: 3 },
  ];

  it('reads the weight of a linked fixture out of the catalogue', () => {
    expect(resolveSuspendedLoadWeights(loads, lookup)[0].weightKg).toBe(6.2);
  });

  it('leaves a fixture with no published mass, or a vanished profile, explicitly unknown', () => {
    const resolved = resolveSuspendedLoadWeights(loads, lookup);
    expect(resolved[1].weightKg).toBeUndefined();
    expect(resolved[2].weightKg).toBeUndefined();
  });

  it('never touches a hand-entered weight', () => {
    expect(resolveSuspendedLoadWeights(loads, lookup)[3]).toBe(loads[3]);
  });

  it('feeds calculateTrussLoad, so an unweighed fixture counts as unknown and not as zero', () => {
    const t = truss('t');
    const breakdown = calculateTrussLoad(
      t,
      { id: 'p1', geometry: 'box', selfWeightKg: 10 },
      resolveSuspendedLoadWeights(loads, lookup),
      [],
    );
    expect(breakdown.loadsKg).toBe(6.2 * 2 + 3);
    expect(breakdown.unknownLoadCount).toBe(2);
  });
});

describe('detachLoadFromProfile', () => {
  it('seeds the hand-entered weight with whatever the catalogue last said', () => {
    const load = suspendedLoadFromFixtureProfile(CATALOGUE[0], 't', 'l');
    const detached = detachLoadFromProfile(load, lookup);
    expect(detached.source).toBe('manual');
    expect(detached.weightKg).toBe(6.2);
    expect(detached.fixtureProfileId).toBeUndefined();
  });

  it('leaves the box blank when the catalogue had no weight to hand over', () => {
    const detached = detachLoadFromProfile(
      suspendedLoadFromFixtureProfile(CATALOGUE[1], 't', 'l'),
      lookup,
    );
    expect(detached.weightKg).toBeUndefined();
  });
});

describe('planLightIsOnRun', () => {
  const loads: SuspendedLoad[] = [
    { id: 'a', trussElementId: 't1', label: 'Key', quantity: 1, source: 'unknown', sourceElementId: 'el-1' },
  ];

  it('spots a plan light already hanging on the same run', () => {
    expect(planLightIsOnRun(loads, 'el-1', 't1')).toBe(true);
  });

  it('lets the same light hang on a different run', () => {
    expect(planLightIsOnRun(loads, 'el-1', 't2')).toBe(false);
  });
});

describe('riggingLoadOptions', () => {
  it('falls back to the figures the panel used before they were stored', () => {
    expect(riggingLoadOptions(undefined)).toEqual(DEFAULT_RIGGING_ASSUMPTIONS);
    expect(DEFAULT_RIGGING_ASSUMPTIONS.clampWeightKg).toBe(0.5);
    expect(DEFAULT_RIGGING_ASSUMPTIONS.safetyWeightKg).toBe(0.15);
    expect(DEFAULT_RIGGING_ASSUMPTIONS.cableAllowanceKg).toBeUndefined();
  });

  it('takes a stored object literally, so a cleared box stays cleared', () => {
    expect(riggingLoadOptions({ safetyWeightKg: 0.2 })).toEqual({ safetyWeightKg: 0.2 });
  });
});

describe('calculateTrussLoad hardware reporting', () => {
  it('reports the clamp and safety counts and the cable allowance behind the total', () => {
    const t = truss('t');
    const breakdown = calculateTrussLoad(
      t,
      { id: 'p1', geometry: 'box', selfWeightKg: 10 },
      [],
      [
        { id: 'i1', kind: 'clamp', trussElementId: 't' },
        { id: 'i2', kind: 'clamp', trussElementId: 't' },
        { id: 'i3', kind: 'safety', trussElementId: 't' },
        { id: 'i4', kind: 'clamp', trussElementId: 'other' },
      ],
      { ...DEFAULT_RIGGING_ASSUMPTIONS, cableAllowanceKg: 2 },
    );
    expect(breakdown.clampCount).toBe(2);
    expect(breakdown.safetyCount).toBe(1);
    expect(breakdown.clampsKg).toBeCloseTo(1.15, 5);
    expect(breakdown.cableAllowanceKg).toBe(2);
    expect(breakdown.totalKg).toBeCloseTo(13.15, 5);
  });

  it('leaves the cable allowance undefined when none is set', () => {
    expect(calculateTrussLoad(truss('t'), undefined, [], []).cableAllowanceKg).toBeUndefined();
  });
});
