import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV15ToV16 } from '../migrations/v15-to-v16';

/** Minimal but realistic v15 save: a light, a power plan, one truss. */
const v15Fixture = () => ({
  schemaVersion: 15,
  title: 'Noir test',
  director: 'Jane Doe',
  cinematographer: '',
  date: '2026-08-22',
  activeSetupId: 'setup-1',
  setups: [
    {
      id: 'setup-1',
      name: 'Setup 1',
      sceneNumber: '1',
      elements: [
        { id: 'l1', type: 'light', x: 10, y: 20, fixtureType: 'fresnel', colorTemp: 3200, intensity: 80, beamAngle: 35, throwDistance: 300 },
        { id: 'a1', type: 'actor', x: 0, y: 0, name: 'Actor' },
      ],
    },
  ],
  trussElements: [{ id: 't1', label: 'Upstage run', x: 0, y: 0, rotation: 0 }],
  powerPlan: {
    sources: [{ id: 's1', name: 'Genny', kind: 'generator' }],
    circuits: [{ id: 'c1', name: 'Circuit 1', sourceId: 's1', consumerIds: [] }],
    consumers: [{ id: 'p1', name: 'Key', quantity: 1 }],
  },
});

describe('v15 → v16 migration', () => {
  it('stamps the new version and leaves an untouched v15 project otherwise identical', () => {
    const before = v15Fixture();
    const after = migrateV15ToV16(JSON.parse(JSON.stringify(before)));
    expect(after.schemaVersion).toBe(16);
    expect({ ...after, schemaVersion: 15 }).toEqual(before);
  });

  it('backfills nothing — absent stays absent', () => {
    const after = migrateV15ToV16(v15Fixture()) as unknown as Record<string, any>;
    expect('shutterCutDeg' in after.setups[0].elements[0]).toBe(false);
    expect('trussElementId' in after.powerPlan.consumers[0]).toBe(false);
    expect('distroZone' in after.powerPlan.consumers[0]).toBe(false);
    expect('phaseLeg' in after.powerPlan.circuits[0]).toBe(false);
  });

  it('keeps well-formed values that are already present', () => {
    const raw = v15Fixture() as unknown as Record<string, any>;
    raw.setups[0].elements[0].shutterCutDeg = 42;
    raw.powerPlan.consumers[0].trussElementId = 't1';
    raw.powerPlan.consumers[0].distroZone = 'Stage left';
    raw.powerPlan.circuits[0].phaseLeg = 2;
    const after = migrateV15ToV16(raw) as unknown as Record<string, any>;
    expect(after.setups[0].elements[0].shutterCutDeg).toBe(42);
    expect(after.powerPlan.consumers[0].trussElementId).toBe('t1');
    expect(after.powerPlan.consumers[0].distroZone).toBe('Stage left');
    expect(after.powerPlan.circuits[0].phaseLeg).toBe(2);
  });

  it('strips corrupt values instead of carrying them forward', () => {
    const raw = v15Fixture() as unknown as Record<string, any>;
    raw.setups[0].elements[0].shutterCutDeg = 400; // out of range
    raw.powerPlan.consumers[0].trussElementId = '   ';
    raw.powerPlan.consumers[0].distroZone = '   ';
    raw.powerPlan.circuits[0].phaseLeg = 7;
    const after = migrateV15ToV16(raw) as unknown as Record<string, any>;
    expect('shutterCutDeg' in after.setups[0].elements[0]).toBe(false);
    expect('trussElementId' in after.powerPlan.consumers[0]).toBe(false);
    expect('distroZone' in after.powerPlan.consumers[0]).toBe(false);
    expect('phaseLeg' in after.powerPlan.circuits[0]).toBe(false);
  });

  it('trims a distro zone rather than storing padded text', () => {
    const raw = v15Fixture() as unknown as Record<string, any>;
    raw.powerPlan.consumers[0].distroZone = '  Genny B  ';
    const after = migrateV15ToV16(raw) as unknown as Record<string, any>;
    expect(after.powerPlan.consumers[0].distroZone).toBe('Genny B');
  });

  it('survives a project with no power plan at all', () => {
    const raw = v15Fixture() as unknown as Record<string, any>;
    delete raw.powerPlan;
    expect(() => migrateV15ToV16(raw)).not.toThrow();
  });

  it('is deterministic and idempotent through the full chain', () => {
    const first = migrateProject(v15Fixture()).project;
    const second = migrateProject(JSON.parse(JSON.stringify(first))).project;
    expect(first.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(second).toEqual(first);
  });
});
