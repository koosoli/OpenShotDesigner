/**
 * Everything the newer features save survives every way a project leaves and
 * comes back: the .osd package (v1 and v2), plain JSON, migration and
 * validation on open, and the browser library.
 */
import { describe, expect, it } from 'vitest';
import { migrateProject } from '../../domain/migrations';
import { NOT_IN_SCRIPT } from '../../domain/script/setupLink';
import { validateProject } from '../../domain/validation/project';
import type { Project, SceneSetup, ScriptLine } from '../../types';
import { parseProjectFileBytes } from '../nativeProjectFile';
import { exportProjectPackage } from '../projectPackage';
import { exportProjectPackageV2 } from '../projectPackageV2';
import { createProject, readProject, writeProject } from '../projectLibrary';

const withNewFeatures = (): Project => {
  const base = createProject({ title: 'Round trip' });
  const first = base.setups[0];
  const second: SceneSetup = { ...first, id: 'setup-two', name: 'Kitchen master', sceneNumber: '7', scriptSceneId: NOT_IN_SCRIPT, elements: [], shots: [] };
  const scriptLines: ScriptLine[] = [
    { id: 'h1', lineNumber: 1, text: 'INT. HALL - DAY', type: 'scene', isSceneHeading: true, sceneNumber: '1' },
    { id: 'c1', lineNumber: 2, text: 'ANA', type: 'character' },
    { id: 'd1', lineNumber: 3, text: 'Hi.', type: 'dialogue' },
    { id: 'c2', lineNumber: 4, text: 'BEN', type: 'character', dual: true },
    { id: 'd2', lineNumber: 5, text: 'Hello.', type: 'dialogue' },
  ];
  return {
    ...base,
    scriptLines,
    setups: [
      {
        ...first,
        // Split screen: each scene keeps its own pan and zoom.
        canvasScale: 0.73,
        canvasOffset: { x: 120, y: -40 },
        // The scene ↔ plan link.
        scriptSceneId: 'h1',
        elements: [
          ...first.elements,
          // Brought forward over the walls.
          { id: 'rug', type: 'prop', name: 'Rug', x: 10, y: 20, rotation: 90, width: 100, height: 60, aboveWalls: true } as unknown as SceneSetup['elements'][number],
          { id: 'wall', type: 'wall', name: 'Wall', x: 0, y: 0, x2: 200, y2: 0, rotation: 0, thickness: 10 } as unknown as SceneSetup['elements'][number],
        ],
      },
      second,
    ],
  };
};

const expectFeatures = (project: Project) => {
  const [first, second] = project.setups;
  expect(first.canvasScale).toBe(0.73);
  expect(first.canvasOffset).toEqual({ x: 120, y: -40 });
  expect(first.scriptSceneId).toBe('h1');
  expect(first.elements.find((el) => el.id === 'rug')).toMatchObject({ aboveWalls: true, rotation: 90 });
  expect(first.elements.find((el) => el.id === 'wall')).toMatchObject({ x2: 200, y2: 0 });
  expect(second.scriptSceneId).toBe(NOT_IN_SCRIPT);
  expect(project.scriptLines?.find((line) => line.id === 'c2')?.dual).toBe(true);
};

/** What opening a project file does: parse, migrate, validate, store, read back. */
const open = async (bytes: ArrayBuffer): Promise<Project> => {
  const parsed = await parseProjectFileBytes(bytes);
  const migrated = migrateProject(parsed.project).project;
  expect(validateProject(migrated).filter((issue) => issue.severity === 'error')).toEqual([]);
  writeProject(migrated);
  const stored = readProject(migrated.id);
  if (!stored) throw new Error('not stored');
  return stored;
};

describe('new features survive save and open', () => {
  it('in an .osd package (v2)', async () => {
    const blob = await exportProjectPackageV2(withNewFeatures());
    expectFeatures(await open(await blob.arrayBuffer()));
  });

  it('in an .osd package (v1)', async () => {
    const blob = await exportProjectPackage(withNewFeatures());
    expectFeatures(await open(await blob.arrayBuffer()));
  });

  it('as plain JSON', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(withNewFeatures()));
    expectFeatures(await open(bytes.buffer as ArrayBuffer));
  });
});
