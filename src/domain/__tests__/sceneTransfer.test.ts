import { describe, expect, it } from 'vitest';
import { copyElementsToSetupCommand } from '../commands';
import { shownRotation, storedRotation } from '../plan/rotation';
import type { CameraElement, Project, WallElement } from '../../types';

const project = () =>
  ({
    id: 'project-1',
    title: 'Two scenes',
    activeSetupId: 'a',
    setups: [
      {
        id: 'a',
        name: 'Kitchen',
        sceneNumber: '1',
        elements: [
          { id: 'wall-1', type: 'wall', name: 'Wall', x: 0, y: 0, x2: 200, y2: 0, rotation: 0, thickness: 10 },
          { id: 'cam-1', type: 'camera', name: 'A cam', x: 50, y: 80, rotation: 270, associatedShotId: 'shot-1', cameraLabel: 'A' },
        ],
        shots: [{ id: 'shot-1', cameraId: 'cam-1', shotNumber: '1/1', order: 1, sceneNumber: '1', description: 'Wide' }],
      },
      { id: 'b', name: 'Hallway', sceneNumber: '2', elements: [], shots: [] },
    ],
  }) as unknown as Project;

describe('copyElementsToSetupCommand', () => {
  it('copies a wall to another scene as a whole — both ends move together', () => {
    const result = copyElementsToSetupCommand(project(), { fromSetupId: 'a', toSetupId: 'b', elementIds: ['wall-1'], dx: 30, dy: 40 });
    const [wall] = result.project.setups[1].elements as WallElement[];
    expect(wall).toMatchObject({ type: 'wall', x: 30, y: 40, x2: 230, y2: 40 });
    expect(wall.id).not.toBe('wall-1');
    expect(result.newIds).toEqual([wall.id]);
    // The source scene is untouched: removing originals is the caller's delete.
    expect(result.project.setups[0].elements).toHaveLength(2);
  });

  it('brings a camera’s shot along, numbered in the scene it lands in', () => {
    const result = copyElementsToSetupCommand(project(), { fromSetupId: 'a', toSetupId: 'b', elementIds: ['cam-1'], dx: 0, dy: 0 });
    const target = result.project.setups[1];
    const camera = target.elements[0] as CameraElement;
    expect(target.shots).toHaveLength(1);
    expect(target.shots[0]).toMatchObject({ cameraId: camera.id, shotNumber: '2/1', sceneNumber: '2', description: 'Wide' });
    expect(camera.associatedShotId).toBe(target.shots[0].id);
  });

  it('copies from the snapshot it is given rather than the live, mid-drag element', () => {
    const before = project().setups[0].elements[0];
    const live = project();
    (live.setups[0].elements[0] as WallElement).x = 999;
    const result = copyElementsToSetupCommand(live, { fromSetupId: 'a', toSetupId: 'b', elementIds: ['wall-1'], dx: 0, dy: 0, elements: [before] });
    expect(result.project.setups[1].elements[0]).toMatchObject({ x: 0, x2: 200 });
  });
});

describe('rotation shown with 0° = facing down', () => {
  it('shows an actor facing down the plan as 0°, clockwise counting up', () => {
    expect(shownRotation('actor', 90)).toBe(0);
    expect(shownRotation('camera', 180)).toBe(90);
    expect(shownRotation('light', 270)).toBe(180);
    expect(shownRotation('actor', 0)).toBe(270);
  });

  it('round-trips what is typed back to the stored angle', () => {
    for (const shown of [0, 45, 90, 180, 270, 359]) expect(shownRotation('camera', storedRotation('camera', shown))).toBe(shown);
    expect(storedRotation('actor', 0)).toBe(90);
  });

  it('leaves layout objects at 0° = as drawn', () => {
    expect(shownRotation('prop', 0)).toBe(0);
    expect(storedRotation('wall', 90)).toBe(90);
  });
});
