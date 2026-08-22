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

  it('migrates a v12 project to the current version without touching any content', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 12,
      scriptLines: [{ id: 'sl-1', lineNumber: 1, text: 'INT. ROOM - DAY', type: 'scene', sceneNumber: '1', isSceneHeading: true }],
      moodBoards: [{ id: 'mb-1', title: 'Look', sections: [{ id: 's', title: 'Default', order: 0 }], cards: [{ id: 'c', tags: [], sectionId: 's', order: 0 }] }],
    };
    const { project, migratedFrom } = migrateProject(structuredClone(raw));
    expect(migratedFrom).toBe(12);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    const { schemaVersion: _v, ...rest } = project as unknown as Record<string, unknown>;
    const { schemaVersion: _r, ...rawRest } = raw as unknown as Record<string, unknown>;
    expect(rest).toEqual(rawRest);
    expect(project.scriptLines?.[0].omitted).toBeUndefined();
    expect(project.moodBoards?.[0].cards[0].collageLayout).toBeUndefined();
  });

  it('migrates v13 groups to v14 without inventing animation data', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 13,
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        groups: [
          // Valid path: kept verbatim (plus beat coercion); basePivot kept.
          {
            id: 'group-keep',
            childIds: ['a', 'b'],
            path: [
              { x: 10, y: 20, beat: 2 },
              { x: 5, y: 5, beat: 1, rotation: 90, note: 'extra stays' },
              // Junk below is dropped during normalization.
              { x: Number.NaN, y: 3, beat: 3 },
              { x: 7, y: 7, beat: Number.NaN },
            ],
            basePivot: { x: 6.5, y: 12.5 },
          },
          // No animation data: nothing invented.
          { id: 'group-plain', childIds: [] },
          // Invalid path only: both path and basePivot are dropped.
          { id: 'group-invalid', childIds: ['c'], path: [{ x: 'x', y: 1, beat: 1 }], basePivot: { x: 1, y: 2 } },
        ],
      }],
    };
    const { project } = migrateProject(structuredClone(raw));
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);

    const groups = (project.setups[0] as unknown as { groups: Record<string, unknown>[] }).groups;
    expect(groups).toHaveLength(3);

    const [kept, plain, invalid] = groups;
    expect(kept.path).toEqual([
      { x: 5, y: 5, beat: 1, rotation: 90, note: 'extra stays' },
      { x: 10, y: 20, beat: 2 },
    ]);
    expect(kept.basePivot).toEqual({ x: 6.5, y: 12.5 });
    expect('path' in plain).toBe(false);
    expect('basePivot' in plain).toBe(false);
    expect(invalid.id).toBe('group-invalid');
    expect('path' in invalid).toBe(false);
    expect('basePivot' in invalid).toBe(false);
  });

  it('keeps v13 projects without group animation data losslessly unchanged', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 13,
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        groups: [
          { id: 'group-a', name: 'Dining set', childIds: ['a', 'b'] },
          { id: 'group-b', childIds: [] },
        ],
      }],
    };
    const { project } = migrateProject(structuredClone(raw));
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    const { schemaVersion: _v, ...rest } = project as unknown as Record<string, unknown>;
    const { schemaVersion: _r, ...rawRest } = raw as unknown as Record<string, unknown>;
    expect(rest).toEqual(rawRest);
    const groups = (project.setups[0] as unknown as { groups: Record<string, unknown>[] }).groups;
    expect('path' in groups[0]).toBe(false);
    expect('basePivot' in groups[0]).toBe(false);
  });

  it('normalizes messy group paths: coerces beats, dedupes last, strips junk', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 13,
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        groups: [
          {
            id: 'group-messy',
            childIds: ['a'],
            basePivot: { x: 12, y: 34 },
            path: [
              { id: 'w3', x: 30, y: 30, rotation: 90, beat: 3 },
              { id: 'w-nan-x', x: Number.NaN, y: 20, beat: 2 }, // dropped: non-finite x
              { id: 'w-inf-y', x: 1, y: Number.POSITIVE_INFINITY, beat: 9 }, // dropped
              { id: 'w-nobeat', x: 5, y: 5 }, // dropped: un-coercible beat
              'garbage', // dropped: not a waypoint record
              { id: 'w-zero', x: 10, y: 10, beat: 0 }, // beat coerced to 1
              { id: 'w-dup-a', x: 21, y: 21, beat: 2 }, // superseded by w-dup-b
              { id: 'w-dup-b', x: 22, y: 22, rotation: 400, beat: 2 },
              { id: 'w-str-rot', x: 40, y: 40, rotation: 'oops', beat: 4 }, // rotation stripped
            ],
          },
        ],
      }],
    };
    const { project } = migrateProject(structuredClone(raw));
    const groups = (project.setups[0] as unknown as { groups: Array<Record<string, unknown>> }).groups;
    expect(groups).toHaveLength(1);
    const messy = groups[0];
    expect(messy.basePivot).toEqual({ x: 12, y: 34 });
    expect(messy.path).toEqual([
      // Ascending by beat; identical beats keep the LAST occurrence.
      { id: 'w-zero', x: 10, y: 10, beat: 1 },
      { id: 'w-dup-b', x: 22, y: 22, rotation: 400, beat: 2 },
      { id: 'w3', x: 30, y: 30, rotation: 90, beat: 3 },
      // Non-finite optional rotation stripped; the waypoint itself survives.
      { id: 'w-str-rot', x: 40, y: 40, beat: 4 },
    ]);
  });

  it('drops basePivot whenever no usable path remains', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 13,
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        groups: [
          { id: 'g-empty-path', childIds: [], path: [], basePivot: { x: 5, y: 5 } },
          { id: 'g-orphan-pivot', childIds: [], basePivot: { x: 1, y: 2 } },
          { id: 'g-path-not-array', childIds: [], path: 'nope', basePivot: { x: 7, y: 7 } },
          { id: 'g-bad-pivot', childIds: ['c'], path: [{ id: 'w1', x: 1, y: 1, beat: 1 }], basePivot: { x: Number.NaN, y: 0 } },
          { id: 'g-negative-beat', childIds: ['c'], path: [{ id: 'w2', x: 2, y: 2, beat: -7 }] },
        ],
      }],
    };
    const { project } = migrateProject(structuredClone(raw));
    const groups = (project.setups[0] as unknown as { groups: Array<Record<string, unknown>> }).groups;
    expect(groups).toHaveLength(5);
    for (const id of ['g-empty-path', 'g-orphan-pivot', 'g-path-not-array']) {
      const g = groups.find((entry) => entry.id === id)!;
      expect('path' in g).toBe(false);
      expect('basePivot' in g).toBe(false);
    }
    const badPivot = groups.find((entry) => entry.id === 'g-bad-pivot')!;
    expect(badPivot.path).toEqual([{ id: 'w1', x: 1, y: 1, beat: 1 }]);
    expect('basePivot' in badPivot).toBe(false);
    // Negative beats coerce into the >= 1 range.
    const negativeBeat = groups.find((entry) => entry.id === 'g-negative-beat')!;
    expect(negativeBeat.path).toEqual([{ id: 'w2', x: 2, y: 2, beat: 1 }]);
  });

  it('round-trips: migrated v14 group data passes through unchanged', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 13,
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        groups: [{
          id: 'group-rt',
          childIds: ['a'],
          basePivot: { x: 3, y: 4 },
          path: [
            { id: 'w2', x: 8, y: 8, rotation: 45, beat: 2 },
            { id: 'w1', x: 3, y: 4, beat: 1 },
          ],
        }],
      }],
    };
    const first = migrateProject(structuredClone(raw)).project;
    expect(first.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    const second = migrateProject(structuredClone(first));
    expect(second.migratedFrom).toBeNull();
    expect(second.project).toEqual(first);
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

  it('migrates v14 actor character links to v15, stripping junk but keeping valid ids', () => {
    const raw = {
      ...buildLegacyRaw(),
      schemaVersion: 14,
      characters: [{ id: 'char-1', canonicalName: 'SARAH', aliases: [] }],
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        elements: [
          { id: 'actor-keep', type: 'actor', name: 'Linked', characterId: 'char-1' },
          { id: 'actor-blank', type: 'actor', name: 'Blank link', characterId: '   ' },
          { id: 'actor-junk', type: 'actor', name: 'Junk link', characterId: 42 },
          { id: 'actor-unlinked', type: 'actor', name: 'No link' },
        ],
      }],
    };
    const { project } = migrateProject(raw);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    const elements = project.setups[0].elements as Array<{ id: string; characterId?: string }>;
    expect(elements.find((el) => el.id === 'actor-keep')?.characterId).toBe('char-1');
    expect(elements.find((el) => el.id === 'actor-blank')?.characterId).toBeUndefined();
    expect(elements.find((el) => el.id === 'actor-junk')).not.toHaveProperty('characterId');
    expect(elements.find((el) => el.id === 'actor-unlinked')?.characterId).toBeUndefined();
  });

  it('passes projects already at the current version through unchanged (v15 actors)', () => {
    const raw = {
      ...buildCurrentRaw(),
      setups: [{
        ...(buildLegacyRaw().setups as Record<string, unknown>[])[0],
        elements: [
          { id: 'actor-1', type: 'actor', name: 'Alice', characterId: 'char-9' },
        ],
      }],
    };
    const { project, migratedFrom } = migrateProject(raw);
    expect(migratedFrom).toBeNull();
    expect(project).toEqual(raw);
  });

  it.each([
    ['null', null],
    ['a plain object without setups', {}],
    ['a non-array setups field', { setups: 'x' }],
  ])('throws MigrationError for %s', (_label, raw) => {
    expectMigrationError(raw);
  });
});
