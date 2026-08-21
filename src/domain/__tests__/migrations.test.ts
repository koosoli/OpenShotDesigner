import { describe, it, expect } from 'vitest';
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  MigrationError,
  detectSchemaVersion,
  migrateProject,
} from '../index';
import { makeShot } from '../../utils/__tests__/fixtures';

/** A structurally valid v1 (schemaVersion-less) project with several missing ids. */
const buildLegacyRaw = (): Record<string, unknown> => {
  const shotWithId = { ...makeShot({ id: 'shot-keep', name: 'Kept shot' }) };
  const shotMissingId = { ...makeShot({ id: undefined as unknown as string, name: 'Backfilled shot' }) };
  return {
    id: 'legacy-1',
    title: 'Legacy Production',
    director: 'Legacy Director',
    cinematographer: '',
    date: '2025-01-01',
    activeSetupId: 'setup-2',
    setups: [
      {
        // no id -> must be backfilled as 'setup-migrated-0'
        name: 'Setup One',
        sceneNumber: '1',
        location: 'INT. ROOM - DAY',
        timeOfDay: 'Day INT',
        elements: [
          // actor without an id -> backfilled
          { type: 'actor', name: 'Alice', characterLetter: 'A', color: '#3b82f6', x: 1, y: 2, rotation: 0, isStanding: true, path: [] },
          // wall keeps its existing id
          { id: 'wall-keep', type: 'wall', name: 'Wall', x: 0, y: 0, rotation: 0, x2: 10, y2: 0, thickness: 4 },
        ],
        shots: [],
        currentBeat: 1,
        totalBeats: 1,
        gridSettings: { size: 30, snap: true, showGrid: false, unit: 'm', pixelsPerUnit: 30 },
        canvasScale: 1,
        canvasOffset: { x: 0, y: 0 },
      },
      {
        id: 'setup-2',
        name: 'Setup Two',
        sceneNumber: '1',
        location: 'INT. ROOM - DAY',
        timeOfDay: 'Day INT',
        elements: [],
        shots: [shotWithId, shotMissingId],
        currentBeat: 1,
        totalBeats: 1,
        gridSettings: { size: 30, snap: true, showGrid: false, unit: 'm', pixelsPerUnit: 30 },
        canvasScale: 1,
        canvasOffset: { x: 0, y: 0 },
      },
    ],
  };
};

const buildCurrentRaw = (): Record<string, unknown> => ({
  ...buildLegacyRaw(),
  schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
});

const expectMigrationError = (raw: unknown) => {
  let caught: unknown;
  try {
    migrateProject(raw);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(MigrationError);
  expect((caught as MigrationError).issues).toEqual(expect.any(Array));
  return caught;
};

describe('detectSchemaVersion', () => {
  it('returns the stored version for current projects', () => {
    expect(detectSchemaVersion(buildCurrentRaw())).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
  });

  it('treats valid projects without a schemaVersion field as version 1', () => {
    expect(detectSchemaVersion(buildLegacyRaw())).toBe(1);
  });

  it('returns null for unrecognizable input', () => {
    expect(detectSchemaVersion(null)).toBeNull();
    expect(detectSchemaVersion(undefined)).toBeNull();
    expect(detectSchemaVersion('nope')).toBeNull();
    expect(detectSchemaVersion(42)).toBeNull();
    expect(detectSchemaVersion({})).toBeNull();
    expect(detectSchemaVersion({ setups: 'x' })).toBeNull();
    expect(detectSchemaVersion({ setups: null })).toBeNull();
  });
});

describe('migrateProject', () => {
  it('upgrades a legacy (v1) project to version 2 with data intact', () => {
    const raw = buildLegacyRaw();
    const { project, migratedFrom } = migrateProject(raw);

    expect(migratedFrom).toBe(1);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(project.id).toBe('legacy-1');
    expect(project.title).toBe('Legacy Production');
    expect(project.setups).toHaveLength(2);
    expect(project.activeSetupId).toBe('setup-2');
    const wall = project.setups[0].elements[1] as { id: string; thickness: number };
    expect(wall.id).toBe('wall-keep');
    expect(wall.thickness).toBe(4);
    expect(project.setups[1].shots[0].id).toBe('shot-keep');
  });

  it('backfills missing ids deterministically using <kind>-migrated-<index>', () => {
    const { project } = migrateProject(buildLegacyRaw());
    expect(project.setups[0].id).toBe('setup-migrated-0');
    expect(project.setups[1].shots[1].id).toBe('shot-migrated-1');
    const backfilledElement = project.setups[0].elements[0];
    expect(typeof backfilledElement.id).toBe('string');
    expect(backfilledElement.id).toMatch(/-migrated-\d+$/);
  });

  it('is deterministic: identical input migrates to deep-equal output', () => {
    const a = migrateProject(structuredClone(buildLegacyRaw())).project;
    const b = migrateProject(structuredClone(buildLegacyRaw())).project;
    expect(a).toEqual(b);
  });

  it('leaves optional arrays absent when they were absent in the source', () => {
    const { project } = migrateProject(buildLegacyRaw());
    expect(project.scriptLines).toBeUndefined();
    expect(project.avScriptRows).toBeUndefined();
    expect((project as unknown as Record<string, unknown>).scriptMarks).toBeUndefined();
    expect(project.setups[0].scriptLines).toBeUndefined();
  });

  it('passes projects already at the current version through unchanged', () => {
    const raw = buildCurrentRaw();
    const { project, migratedFrom } = migrateProject(raw);
    expect(project).toEqual(raw);
    expect([null, CURRENT_PROJECT_SCHEMA_VERSION]).toContain(migratedFrom);
  });

  it('migrates v7 without inventing fixture mode footprints', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 7,
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        elements: [{ id: 'light-1', type: 'light', fixtureType: 'spotlight', x: 0, y: 0, rotation: 0 }],
      }],
    };
    const { project } = migrateProject(raw);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(project.productionCalendarEvents).toEqual([]);
    expect((project.setups[0].elements[0] as { dmxChannelCount?: number }).dmxChannelCount).toBeUndefined();
  });

  it('migrates v8 shapes without inventing Asset Library symbol references', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 8,
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        elements: [{ id: 'shape-1', type: 'shape', shapeType: 'rectangle', name: 'Zone', x: 0, y: 0, rotation: 0, width: 100, height: 50, color: '#38bdf8' }],
      }],
    };
    const { project } = migrateProject(raw);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect((project.setups[0].elements[0] as { symbolId?: string }).symbolId).toBeUndefined();
  });

  it('migrates v9 reference images without inventing scale calibration', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 9,
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        backgroundImages: [{ id: 'bg-1', url: 'data:image/png;base64,test', x: 0, y: 0, width: 800, height: 400, opacity: 0.5, locked: false, visible: true }],
      }],
    };
    const { project } = migrateProject(raw);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(project.setups[0].backgroundImages?.[0].calibration).toBeUndefined();
  });

  it('migrates v10 actors to explicit per-beat speech collections', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 10,
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        elements: [
          { id: 'actor-1', type: 'actor', name: 'Alice', speechCues: undefined },
          { id: 'camera-1', type: 'camera', name: 'Camera A' },
        ],
      }],
    };
    const { project } = migrateProject(raw);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect((project.setups[0].elements[0] as { speechCues?: unknown[] }).speechCues).toEqual([]);
    expect((project.setups[0].elements[1] as { speechCues?: unknown[] }).speechCues).toBeUndefined();
  });

  it.each([
    ['null', null],
    ['a plain object without setups', {}],
    ['a non-array setups field', { setups: 'x' }],
  ])('throws MigrationError for %s', (_label, raw) => {
    expectMigrationError(raw);
  });
});
