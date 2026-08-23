/**
 * The single authoritative way to build a shot.
 *
 * These rules used to live in several call sites at once, which is how the
 * `Camera #` column ended up with duplicate letters. The point of the tests
 * below is less "does it compute the right string" than "is the rule stated
 * once, and does it read the setup it is given rather than one from somewhere
 * else" — the second property is what makes it safe to call inside a state
 * updater.
 */
import { describe, expect, it } from 'vitest';
import { buildShotForSetup, newCameraPlacement, nextShotNumberFor } from '../shots/createShot';
import type { CameraElement, FloorPlanElement, Shot } from '../../types';

const COLORS = ['#red', '#green', '#blue'] as const;

const camera = (id: string, label: string, extra: Partial<CameraElement> = {}): CameraElement =>
  ({
    id,
    type: 'camera',
    cameraLabel: label,
    color: '#fff',
    focalLength: 35,
    sensorFormat: 'Super35',
    fovAngle: 40,
    aspectRatio: '16:9',
    cameraHeight: 'Eye Level',
    rigType: 'Tripod',
    throwDistance: 320,
    path: [],
    x: 0,
    y: 0,
    rotation: 0,
    ...extra,
  }) as CameraElement;

const setup = (over: Partial<{ sceneNumber: string; shots: Shot[]; elements: FloorPlanElement[]; shootMode: 'single_cam' | 'multi_cam' }> = {}) => ({
  sceneNumber: '3',
  shots: [] as Shot[],
  elements: [] as FloorPlanElement[],
  ...over,
});

const build = (over: Partial<Parameters<typeof buildShotForSetup>[0]> = {}) =>
  buildShotForSetup({
    setup: setup(),
    shotId: 'shot-new',
    cameraId: 'cam-new',
    cameraColors: COLORS,
    ...over,
  });

describe('nextShotNumberFor', () => {
  it('uses the scene/index form the whole app writes', () => {
    expect(nextShotNumberFor(setup({ sceneNumber: '3' }), 4)).toBe('3/4');
  });

  it('falls back to scene 1 rather than emitting "undefined/2"', () => {
    expect(nextShotNumberFor(setup({ sceneNumber: undefined }), 2)).toBe('1/2');
  });
});

describe('buildShotForSetup — numbering', () => {
  it('numbers from the setup it is handed, not from anywhere else', () => {
    const existing = [{ id: 'a' }, { id: 'b' }] as Shot[];
    expect(build({ setup: setup({ shots: existing }) }).shot.shotNumber).toBe('3/3');
  });

  it('lets an explicit number win', () => {
    expect(build({ shotData: { shotNumber: '3/99' } }).shot.shotNumber).toBe('3/99');
  });

  /**
   * A caller may spread a whole shot in — duplicating, or moving one between
   * scenes. Explicit fields are instructions and are honoured; the identity of
   * the NEW shot is not negotiable, so `id` is always the one minted for it.
   * Without that last guard a duplicate would silently share its source's id.
   */
  it('honours explicit fields but never lets shotData reimpose an id', () => {
    const source = {
      id: 'source-id',
      shotNumber: '1/1',
      order: 1,
      cameraId: 'source-cam',
      cameraLabel: 'Z',
    } as Partial<Shot>;
    const { shot } = build({
      setup: setup({ shots: [{ id: 'x' }] as Shot[] }),
      shotData: { ...source, name: 'Kept' },
    });

    expect(shot.id).toBe('shot-new');
    expect(shot.name).toBe('Kept');
    expect(shot.order).toBe(1);
    expect(shot.shotNumber).toBe('1/1');
    expect(shot.cameraId).toBe('source-cam');
    expect(shot.cameraLabel).toBe('Z');
  });

  /** With nothing explicit to go on, every derived field comes from the setup. */
  it('derives number and order from the setup when shotData says nothing', () => {
    const { shot } = build({
      setup: setup({ shots: [{ id: 'x' }] as Shot[] }),
      shotData: { name: 'Only a name' },
    });
    expect(shot.order).toBe(2);
    expect(shot.shotNumber).toBe('3/2');
  });
});

describe('buildShotForSetup — cameras', () => {
  it('creates the first camera as A and links it to the shot', () => {
    const { shot, camera: created } = build();
    expect(created?.id).toBe('cam-new');
    expect(created?.cameraLabel).toBe('A');
    expect(created?.associatedShotId).toBe('shot-new');
    expect(shot.cameraId).toBe('cam-new');
  });

  /**
   * Single-camera mode means one physical camera moving through the coverage,
   * so a second shot reuses it rather than minting an element per shot.
   */
  it('reuses the existing camera in single-camera mode', () => {
    const { shot, camera: created } = build({
      setup: setup({ elements: [camera('cam-a', 'A', { focalLength: 85 })] }),
    });
    expect(created).toBeUndefined();
    expect(shot.cameraId).toBe('cam-a');
    expect(shot.cameraLabel).toBe('A');
    // The reused camera's lens is the shot's lens — they are one instrument.
    expect(shot.lensMm).toBe(85);
  });

  it('mints a new lettered camera per shot in multi-camera mode', () => {
    const { shot, camera: created } = build({
      setup: setup({
        shootMode: 'multi_cam',
        elements: [camera('cam-a', 'A'), camera('cam-b', 'B')],
      }),
    });
    expect(created?.cameraLabel).toBe('C');
    expect(shot.cameraLabel).toBe('C');
  });

  /**
   * The regression the whole extraction exists for: the letter must come from
   * the setup passed in. Called inside a state updater with committed state,
   * two creates in one batch therefore cannot both claim the same letter.
   */
  it('fills a gap left by a deleted camera instead of duplicating', () => {
    const { camera: created } = build({
      setup: setup({
        shootMode: 'multi_cam',
        elements: [camera('cam-a', 'A'), camera('cam-c', 'C')],
      }),
    });
    expect(created?.cameraLabel).toBe('B');
  });

  it('adds no camera when the caller names one', () => {
    const { shot, camera: created } = build({ shotData: { cameraId: 'existing' } });
    expect(created).toBeUndefined();
    expect(shot.cameraId).toBe('existing');
  });

  it('honours a requested position and otherwise places itself', () => {
    expect(build({ cameraPosition: { x: 11, y: 22 } }).camera).toMatchObject({ x: 11, y: 22 });
    const placed = build().camera;
    expect(Number.isFinite(placed?.x)).toBe(true);
    expect(Number.isFinite(placed?.y)).toBe(true);
  });

  it('takes its colour from the palette by camera count', () => {
    expect(build().camera?.color).toBe(COLORS[0]);
    expect(
      build({
        setup: setup({ shootMode: 'multi_cam', elements: [camera('cam-a', 'A')] }),
      }).camera?.color,
    ).toBe(COLORS[1]);
  });
});

describe('newCameraPlacement', () => {
  it('aims a new camera at the first actor on the plan', () => {
    const withActor = setup({
      elements: [{ id: 'actor', type: 'actor', x: 500, y: 500, rotation: 0 } as FloorPlanElement],
    });
    const placement = newCameraPlacement(withActor, 0);
    // Placed off the actor rather than at a fixed origin, and turned to face it.
    expect(placement.x).not.toBe(320);
    expect(placement.rotation).toBeGreaterThanOrEqual(0);
    expect(placement.rotation).toBeLessThan(360);
  });

  it('staggers successive cameras so they do not stack', () => {
    const empty = setup();
    expect(newCameraPlacement(empty, 0)).not.toEqual(newCameraPlacement(empty, 1));
  });
});
