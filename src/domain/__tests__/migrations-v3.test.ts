import { describe, it, expect } from 'vitest';
import { migrateProject, detectSchemaVersion, CURRENT_PROJECT_SCHEMA_VERSION } from '../index';
import { DEFAULT_LAYERS } from '../migrations/v2-to-v3';

/** A v2 project (has schemaVersion: 2) with one setup and no layers/groups. */
const buildV2Raw = (): Record<string, unknown> => ({
  id: 'v2-project',
  title: 'V2 Production',
  schemaVersion: 2,
  activeSetupId: 'setup-1',
  setups: [
    {
      id: 'setup-1',
      name: 'Setup One',
      sceneNumber: '1',
      location: 'INT. ROOM - DAY',
      timeOfDay: 'Day INT',
      elements: [
        { id: 'wall-1', type: 'wall', name: 'Wall', x: 0, y: 0, rotation: 0, x2: 10, y2: 0, thickness: 4 },
      ],
      shots: [],
      currentBeat: 1,
      totalBeats: 1,
      gridSettings: { size: 30, snap: true, showGrid: false, unit: 'm', pixelsPerUnit: 30 },
      canvasScale: 1,
      canvasOffset: { x: 0, y: 0 },
    },
  ],
});

describe('v2-to-v3 migration (layers + groups)', () => {
  it('detects v2 projects', () => {
    expect(detectSchemaVersion(buildV2Raw())).toBe(2);
  });

  it('adds the default layer stack with stable deterministic ids', () => {
    const { project, migratedFrom } = migrateProject(buildV2Raw());
    expect(migratedFrom).toBe(2);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    const layers = project.setups[0].layers!;
    expect(layers.map((l) => l.id)).toEqual(DEFAULT_LAYERS.map((l) => l.id));
    expect(layers.map((l) => l.order)).toEqual([...layers.keys()]);
  });

  it('initializes groups to an empty array', () => {
    const { project } = migrateProject(buildV2Raw());
    expect(project.setups[0].groups).toEqual([]);
  });

  it('never assigns layerIds to existing elements (no visual change)', () => {
    const { project } = migrateProject(buildV2Raw());
    const element = project.setups[0].elements[0] as { layerId?: string };
    expect(element.layerId).toBeUndefined();
  });

  it('preserves layers that already exist', () => {
    const raw = buildV2Raw();
    const setup = (raw.setups as Array<Record<string, unknown>>)[0];
    setup.layers = [{ id: 'layer-custom', name: 'Custom', visible: false, locked: true, order: 0 }];
    const { project } = migrateProject(raw);
    expect(project.setups[0].layers).toEqual([
      { id: 'layer-custom', name: 'Custom', visible: false, locked: true, order: 0 },
    ]);
  });

  it('is deterministic', () => {
    const a = migrateProject(structuredClone(buildV2Raw())).project;
    const b = migrateProject(structuredClone(buildV2Raw())).project;
    expect(a).toEqual(b);
  });
});
