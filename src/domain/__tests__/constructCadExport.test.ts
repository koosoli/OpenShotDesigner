import { describe, expect, it } from 'vitest';
import type { DoorElement, GridSettings, WallElement, WindowElement } from '../../types';
import { buildConstructCadMacro } from '../plan/constructCadExport';
import { resizeWallToLength } from '../plan/wallDimensions';

const grid: GridSettings = { unit: 'm', pixelsPerUnit: 100, size: 20, snap: true, showGrid: true };
const wall: WallElement = {
  id: 'wall', type: 'wall', name: 'Wall', x: 0, y: 100, x2: 500, y2: 100, thickness: 20, rotation: 0,
};
const door: DoorElement = {
  id: 'door', type: 'door', name: 'Door', x: 100, y: 100, width: 90, rotation: 0,
  swingAngle: 90, swingDirection: 'right',
};
const window: WindowElement = {
  id: 'window', type: 'window', name: 'Window', x: 350, y: 100, width: 100, depth: 20, rotation: 0,
};

describe('ConstructCAD handoff', () => {
  it('exports the saved wall height and fits an opening to a shorter wall', () => {
    const result = buildConstructCadMacro('Studio', [{ ...wall, heightMm: 1800 }, window], undefined, grid);
    expect(result?.skippedOpenings).toBe(0);
    expect(result?.text).toContain('"height":1.8');
    expect(result?.text).toContain('"name":"Height","value":0.9');
    expect(buildConstructCadMacro('Low wall', [{ ...wall, heightMm: 800 }, window], undefined, grid)?.skippedOpenings).toBe(1);
  });
  it('emits editable wall and hosted opening commands in calibrated meters', () => {
    const result = buildConstructCadMacro('Studio "A"\nStage', [wall, door, window], undefined, grid);
    const commands = result?.text.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
    expect(result?.skippedOpenings).toBe(0);
    expect(commands).toContainEqual({ command: 'project_info_set', args: { name: 'Studio "A"\nStage' } });
    expect(commands).toContainEqual({
      command: 'wall_create', args: { start: [0, -1], end: [5, -1], height: 2.7, type: 'Cineplan wall 1' },
    });
    expect(commands).toContainEqual({
      command: 'component_param_set', args: { type: 'Cineplan door 2', name: 'Width', value: 0.9 },
    });
    expect(commands).toContainEqual({
      command: 'door_create', args: { point: [expect.closeTo(1.45, 10), -1], type: 'Cineplan door 2', sill: 0, flip_hand: true },
    });
    expect(commands).toContainEqual({
      command: 'window_create', args: { point: [3.5, -1], type: 'Cineplan window 3', sill: 0.9 },
    });
  });

  it('counts openings with missing or ambiguous hosts and insufficient end clearance', () => {
    const crossing = { ...wall, id: 'crossing', x: 145, y: 0, x2: 145, y2: 200 };
    const looseWindow = { ...window, y: 10 };
    const edgeDoor = { ...door, id: 'edge', x: 0 };
    const result = buildConstructCadMacro('Studio', [wall, crossing, door, looseWindow, edgeDoor], undefined, grid);
    expect(result?.skippedOpenings).toBe(3);
    expect(result?.text).not.toContain('"door_create"');
    expect(result?.text).not.toContain('"window_create"');
    expect(buildConstructCadMacro('Empty', [door], undefined, grid)).toBeNull();
  });
});

describe('calibrated wall length', () => {
  it('moves the end while preserving the start and direction', () => {
    const diagonal = { ...wall, x: 10, x2: 40, y2: 140 };
    expect(resizeWallToLength(diagonal, grid, 1)).toEqual({ x2: 70, y2: 180 });
    expect(resizeWallToLength(diagonal, grid, -1)).toBeNull();
    expect(resizeWallToLength(diagonal, grid, NaN)).toBeNull();
  });
});
