import { describe, expect, it } from 'vitest';
import { buildReadinessItems } from './index';
import { createProject } from '../../utils/projectLibrary';
import type { LightElement, Project, Shot } from '../../types';

// Blank preset: one setup with no elements and no shots, so each test only
// sees the findings its own fixtures produce.
const blankProject = (): Project => createProject({ workspacePreset: 'blank' });

const makeLight = (overrides: Partial<LightElement> & { id: string; name: string }): LightElement => ({
  type: 'light',
  x: 0,
  y: 0,
  rotation: 0,
  fixtureType: 'fresnel',
  colorTemp: 5600,
  intensity: 100,
  beamAngle: 30,
  throwDistance: 500,
  ...overrides,
});

const makeShot = (id: string, shotNumber: string, extra?: Partial<Shot>): Shot => ({
  id,
  sceneNumber: '1',
  shotNumber,
  name: `Shot ${shotNumber}`,
  cameraId: 'cam-a',
  cameraLabel: 'A',
  shotSize: 'WS',
  lensMm: 35,
  cameraAngle: 'Eye Level',
  movement: 'Static',
  aspectRatio: '16:9',
  frameRate: 24,
  subjectActorIds: [],
  framingDescription: 'Wide',
  takesCount: 0,
  estDurationSeconds: 5,
  order: 1,
  status: 'planned',
  ...extra,
});

const idsWithPrefix = (project: Project, prefix: string): string[] =>
  buildReadinessItems(project).filter((item) => item.id.startsWith(prefix)).map((item) => item.id);

describe('dmx readiness detectors', () => {
  it('flags overlapping footprints as blockers on the equipment tab', () => {
    const project = blankProject();
    project.setups[0].elements = [
      makeLight({ id: 'l1', name: 'Key', dmxUniverse: 1, dmxAddress: 10, dmxChannelCount: 8 }),
      makeLight({ id: 'l2', name: 'Fill', dmxUniverse: 1, dmxAddress: 15, dmxChannelCount: 8 }),
    ];
    expect(buildReadinessItems(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dmx-overlap-l1-l2', severity: 'blocker', tab: 'equipment' }),
    ]));
  });

  it('stays silent when patched footprints do not touch', () => {
    const project = blankProject();
    project.setups[0].elements = [
      makeLight({ id: 'l1', name: 'Key', dmxUniverse: 1, dmxAddress: 10, dmxChannelCount: 8 }),
      makeLight({ id: 'l2', name: 'Fill', dmxUniverse: 1, dmxAddress: 30, dmxChannelCount: 8 }),
    ];
    expect(idsWithPrefix(project, 'dmx-')).toEqual([]);
  });

  it('flags an out-of-range address as invalid rather than as an overlap', () => {
    const project = blankProject();
    project.setups[0].elements = [
      makeLight({ id: 'l1', name: 'Rim', dmxUniverse: 1, dmxAddress: 600, dmxChannelCount: 4 }),
    ];
    expect(buildReadinessItems(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dmx-invalid-l1', severity: 'blocker', tab: 'equipment' }),
    ]));
    expect(idsWithPrefix(project, 'dmx-overlap-')).toEqual([]);
  });

  it('flags a half-patched fixture as invalid', () => {
    const project = blankProject();
    project.setups[0].elements = [
      makeLight({ id: 'l1', name: 'Practical', dmxUniverse: 2, dmxChannelCount: 3 }),
    ];
    expect(idsWithPrefix(project, 'dmx-invalid-')).toEqual(['dmx-invalid-l1']);
  });

  it('flags a patched fixture with unknown footprint, and never as invalid too', () => {
    const project = blankProject();
    project.setups[0].elements = [
      makeLight({ id: 'l1', name: 'Key', dmxUniverse: 1, dmxAddress: 10 }),
    ];
    expect(buildReadinessItems(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dmx-footprint-l1', severity: 'warning', tab: 'equipment' }),
    ]));
    expect(idsWithPrefix(project, 'dmx-invalid-')).toEqual([]);
  });

  it('ignores unpatched fixtures and passive modifiers with a patch', () => {
    const project = blankProject();
    project.setups[0].elements = [
      makeLight({ id: 'l1', name: 'Unpatched' }),
      makeLight({ id: 'l2', name: 'Bounce', fixtureType: 'reflector', dmxUniverse: 1, dmxAddress: 10 }),
    ];
    expect(idsWithPrefix(project, 'dmx-')).toEqual([]);
  });
});

describe('power phase imbalance detector', () => {
  const phasedPlan = (wattsPerLeg: [number, number, number]): Project['powerPlan'] => ({
    sources: [{ id: 's1', name: 'Genny', kind: 'three_phase_400v_32a', voltageV: 400, phases: 3 }],
    circuits: ([1, 2, 3] as const).map((leg) => ({
      id: `c${leg}`,
      name: `Leg L${leg}`,
      sourceId: 's1',
      maxAmperesA: 32,
      consumerIds: [`k${leg}`],
      phaseLeg: leg,
    })),
    consumers: ([1, 2, 3] as const).map((leg) => ({
      id: `k${leg}`,
      name: `Load L${leg}`,
      powerWattsOverride: wattsPerLeg[leg - 1],
      quantity: 1,
      circuitId: `c${leg}`,
    })),
  });

  it('warns when one leg carries nearly all known load', () => {
    const project = blankProject();
    project.powerPlan = phasedPlan([6000, 100, 100]);
    expect(buildReadinessItems(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'power-phase-s1', severity: 'warning', tab: 'power' }),
    ]));
  });

  it('stays silent on balanced legs and on single-phase supplies', () => {
    const balanced = blankProject();
    balanced.powerPlan = phasedPlan([2000, 2000, 2000]);
    expect(idsWithPrefix(balanced, 'power-phase-')).toEqual([]);

    const singlePhase = blankProject();
    singlePhase.powerPlan = {
      sources: [{ id: 's1', name: 'Wall', kind: 'mains_230v_16a', voltageV: 230, phases: 1 }],
      circuits: [{ id: 'c1', name: 'Wall', sourceId: 's1', maxAmperesA: 16, consumerIds: ['k1'] }],
      consumers: [{ id: 'k1', name: 'Load', powerWattsOverride: 2000, quantity: 1, circuitId: 'c1' }],
    };
    expect(idsWithPrefix(singlePhase, 'power-phase-')).toEqual([]);
  });
});

describe('budget unpriced detectors', () => {
  const budgetProject = (): Project => {
    const project = blankProject();
    project.setups[0].customEquipment = [
      { id: 'eq-cam', category: 'camera', name: 'Test Camera', brand: 'Sony', model: 'FX6', quantity: 1 },
    ];
    project.budget = {
      settings: { currency: 'EUR', defaultVatPercent: 17, weekDays: 5 },
      lines: [],
      equipmentRates: [],
    };
    return project;
  };

  it('flags gear on the plan that has no equipment rate', () => {
    const items = buildReadinessItems(budgetProject());
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'budget-unpriced-equipment', severity: 'warning', tab: 'budget' }),
    ]));
  });

  it('clears the equipment finding once every item has a rate', () => {
    const project = budgetProject();
    project.budget = {
      settings: { currency: 'EUR', defaultVatPercent: 17, weekDays: 5 },
      lines: [],
      equipmentRates: [
        { id: 'rate-cam', key: 'camera:sony:fx6', label: 'Sony FX6', amount: 100, basis: 'day' },
      ],
    };
    expect(idsWithPrefix(project, 'budget-unpriced-equipment')).toEqual([]);
  });

  it('keeps flagging crew without a rate card, and clears with one', () => {
    const project = blankProject();
    project.people = [{ id: 'p1', displayName: 'Alex Director', kind: 'crew' }];
    expect(idsWithPrefix(project, 'budget-unpriced-people')).toEqual(['budget-unpriced-people']);
    project.people = [{ id: 'p1', displayName: 'Alex Director', kind: 'crew', rateCard: { amount: 450, basis: 'day' } }];
    expect(idsWithPrefix(project, 'budget-unpriced-people')).toEqual([]);
  });
});

describe('schedule and coverage detectors', () => {
  const scheduledDay = (project: Project, date: string): void => {
    project.scheduleBlocks = [{ id: 'b1', kind: 'setup', setupId: project.setups[0].id }];
    project.productionDays = [{
      id: 'd1',
      name: 'Day 1',
      date,
      crewCall: '07:00',
      scheduleBlockIds: ['b1'],
      callSheet: { nearestHospital: 'Central Hospital' },
    }];
  };

  it('flags shots that appear on no shooting day', () => {
    const project = blankProject();
    project.setups[0].shots = [makeShot('sh1', '1/1')];
    expect(buildReadinessItems(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'shot-unscheduled-sh1', severity: 'warning', tab: 'schedule' }),
    ]));
  });

  it('does not flag scheduled shots or deliberate pickups', () => {
    const project = blankProject();
    project.setups[0].shots = [makeShot('sh1', '1/1'), makeShot('sh2', '1/2', { unplanned: true })];
    scheduledDay(project, '2026-09-10');
    expect(idsWithPrefix(project, 'shot-unscheduled-')).toEqual([]);
  });

  it('flags a past day whose scheduled shots have no takes at all', () => {
    const project = blankProject();
    project.setups[0].shots = [makeShot('sh1', '1/1')];
    scheduledDay(project, '2020-01-01');
    expect(buildReadinessItems(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'day-coverage-d1', severity: 'blocker', tab: 'continuity' }),
    ]));
  });

  it('leaves future days and logged days alone', () => {
    const future = blankProject();
    future.setups[0].shots = [makeShot('sh1', '1/1')];
    scheduledDay(future, '2099-01-01');
    expect(idsWithPrefix(future, 'day-coverage-')).toEqual([]);

    const logged = blankProject();
    logged.setups[0].shots = [makeShot('sh1', '1/1')];
    scheduledDay(logged, '2020-01-01');
    logged.takes = [{ id: 't1', shotId: 'sh1', productionDayId: 'd1', takeNumber: 1, isGoodTake: true }];
    expect(idsWithPrefix(logged, 'day-coverage-')).toEqual([]);
  });

  it('flags a day whose strips resolve to no shooting location', () => {
    const project = blankProject();
    project.scheduleBlocks = [{ id: 'b1', kind: 'manual', label: 'Company move', manualType: 'move' }];
    project.productionDays = [{
      id: 'd1',
      name: 'Day 1',
      date: '2026-09-10',
      crewCall: '07:00',
      scheduleBlockIds: ['b1'],
      callSheet: { nearestHospital: 'Central Hospital' },
    }];
    expect(buildReadinessItems(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'day-location-d1', severity: 'warning', tab: 'schedule' }),
    ]));
  });

  it('resolves the location from the scheduled setup', () => {
    const project = blankProject();
    project.setups[0].shots = [makeShot('sh1', '1/1')];
    scheduledDay(project, '2026-09-10');
    expect(idsWithPrefix(project, 'day-location-')).toEqual([]);
  });
});
