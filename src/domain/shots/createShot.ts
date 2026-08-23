/**
 * Building a shot — and, when one is needed, the camera that films it.
 *
 * ## Why this is one function
 *
 * Creating a shot happened in several places, each with its own copy of the
 * rules: the shot number, the camera letter, the camera colour, the lens
 * default, where a new camera lands on the plan, what it is called. Copies
 * drift. The camera-letter duplication that reached the `Camera #` column of
 * the Resolve export was exactly that — nine call sites, three different
 * rules — and the fix was pointless until there was one place for the rule to
 * live.
 *
 * ## Why it is pure, and why it takes the setup as an argument
 *
 * Both derived values here are read off the setup, and reading them from a
 * React render closure is a bug generator: two creates in the same batch both
 * see the pre-batch setup, so both claim the same shot number and the same
 * camera letter. The shot-number half of that was already fixed in the context
 * by numbering inside the state updater; the camera-letter half was not, and
 * still read the render-time element list.
 *
 * Taking `setup` as a plain argument means the caller can invoke this INSIDE
 * the updater, against the committed state, and neither value can go stale.
 * Ids are minted by the caller and passed in, so the action can return them
 * synchronously without this function needing a clock or a counter.
 */

import { calculateFovAngle } from '../../utils/geometry';
import { nextCameraLabel } from '../plan/cameraLabels';
import type { CameraElement, FloorPlanElement, Shot } from '../../types';

/** The slice of a setup this needs. Keeps it callable from inside an updater. */
export interface ShotHostSetup {
  sceneNumber?: string;
  shots: Shot[];
  elements: FloorPlanElement[];
  shootMode?: 'single_cam' | 'multi_cam';
}

export interface BuildShotOptions {
  setup: ShotHostSetup;
  /** Pre-minted so the caller can return it synchronously. */
  shotId: string;
  /** Pre-minted; used only if a camera is actually created. */
  cameraId: string;
  /** Field overrides from the caller; anything set here wins. */
  shotData?: Partial<Shot>;
  /** Where a newly created camera lands, if the caller has a position in mind. */
  cameraPosition?: { x: number; y: number; rotation?: number };
  /** Palette to pick the new camera's colour from, in order. */
  cameraColors: readonly string[];
  /**
   * Fields merged onto a newly created camera, applied last so a caller's
   * explicit value wins. Exists so the floor-plan "add a camera" path — which
   * carries its own rig type, model and any user-supplied fields — can share
   * this builder instead of keeping a second copy of the letter and colour
   * rules.
   */
  cameraOverrides?: Partial<CameraElement>;
  /**
   * Always mint a camera, even in single-camera mode with one already on the
   * plan. Placing a camera on the floor plan, or inserting a shot, IS the act
   * of adding one — those are new positions, not a second use of a neighbour's
   * camera. Plain `addShot` leaves this off, so single-camera coverage keeps
   * reusing the one camera it has.
   */
  forceNewCamera?: boolean;
  /**
   * Names the shot from the resolved number and camera. Defaults to
   * "Shot 1/2 - Coverage"; the floor-plan path names it after the camera.
   */
  shotName?: (context: { shotNumber: string; cameraName?: string }) => string;
}

export interface BuiltShot {
  shot: Shot;
  /** Present only when a camera was created; reusing one adds no element. */
  camera?: CameraElement;
}

const DEFAULT_LENS_MM = 35;

/**
 * Where a new camera goes: swung round the first actor so it points at
 * somebody, or on a diagonal from a fixed origin when the plan is empty.
 * Offsetting by the camera count keeps successive cameras from stacking.
 */
export const newCameraPlacement = (
  setup: ShotHostSetup,
  cameraCount: number,
): { x: number; y: number; rotation: number } => {
  const actors = setup.elements.filter((element) => element.type === 'actor');
  if (actors.length === 0) {
    return { x: 320 + cameraCount * 60, y: 380 + cameraCount * 40, rotation: 0 };
  }
  const subject = actors[0];
  const angleOffset = (cameraCount * 45) % 360;
  const radians = ((225 + angleOffset) * Math.PI) / 180;
  const x = Math.round(subject.x + Math.cos(radians) * 180);
  const y = Math.round(subject.y + Math.sin(radians) * 180);
  const degrees = (Math.atan2(subject.y - y, subject.x - x) * 180) / Math.PI;
  return { x, y, rotation: Math.round((degrees + 360) % 360) };
};

/**
 * The shot number for the next shot on a setup: `scene/index`, the form the
 * app writes everywhere and the form the Resolve export ships.
 */
export const nextShotNumberFor = (setup: ShotHostSetup, order: number): string =>
  `${setup.sceneNumber || '1'}/${order}`;

/**
 * Build the shot, and the camera if one has to exist.
 *
 * A camera is created when the caller named none AND either the setup has no
 * cameras yet or the production is in multi-camera mode. In single-camera mode
 * with a camera already on the plan the shot reuses it — one physical camera
 * moving through the coverage is the whole point of that mode, and minting a
 * second element per shot would misrepresent the shoot.
 */
export const buildShotForSetup = (options: BuildShotOptions): BuiltShot => {
  const { setup, shotId, cameraId, shotData, cameraPosition, cameraColors } = options;
  const { cameraOverrides, shotName, forceNewCamera } = options;

  const existingCameras = setup.elements.filter(
    (element): element is CameraElement => element.type === 'camera',
  );
  const isMultiCam = setup.shootMode === 'multi_cam';
  const order = shotData?.order ?? setup.shots.length + 1;
  const shotNumber = shotData?.shotNumber ?? nextShotNumberFor(setup, order);

  let resolvedCameraId = shotData?.cameraId ?? '';
  let cameraLabel = shotData?.cameraLabel ?? (isMultiCam ? nextCameraLabel(existingCameras) : 'A');
  let lensMm = shotData?.lensMm ?? DEFAULT_LENS_MM;
  let camera: CameraElement | undefined;

  if (!resolvedCameraId) {
    const reusable = !forceNewCamera && !isMultiCam && existingCameras.length > 0;
    if (reusable) {
      const defaultCamera =
        existingCameras.find((candidate) => candidate.cameraLabel === 'A') ?? existingCameras[0];
      resolvedCameraId = defaultCamera.id;
      cameraLabel = defaultCamera.cameraLabel || 'A';
      lensMm = shotData?.lensMm ?? defaultCamera.focalLength ?? DEFAULT_LENS_MM;
    } else {
      const placement = cameraPosition
        ? { rotation: 0, ...cameraPosition }
        : newCameraPlacement(setup, existingCameras.length);
      camera = {
        name: isMultiCam ? `Camera ${cameraLabel}` : `Camera ${cameraLabel} (Shot ${shotNumber})`,
        color: cameraColors[existingCameras.length % cameraColors.length],
        x: placement.x,
        y: placement.y,
        rotation: placement.rotation,
        locked: false,
        visible: true,
        focalLength: lensMm,
        sensorFormat: 'Super35',
        fovAngle: calculateFovAngle(lensMm, 'Super35'),
        aspectRatio: '16:9',
        cameraHeight: 'Eye Level',
        rigType: 'Tripod',
        throwDistance: 320,
        path: [],
        ...cameraOverrides,
        // After the overrides: identity and linkage are this function's to
        // decide, or a caller could hand the new camera someone else's id.
        id: cameraId,
        type: 'camera',
        cameraLabel,
        associatedShotId: shotId,
      };
      resolvedCameraId = cameraId;
    }
  }

  const shot: Shot = {
    sceneNumber: setup.sceneNumber || '1',
    name:
      shotData?.name ||
      (shotName
        ? shotName({ shotNumber, cameraName: camera?.name })
        : `Shot ${shotNumber} - Coverage`),
    shotSize: shotData?.shotSize || 'MS',
    cameraAngle: shotData?.cameraAngle || 'Eye Level',
    movement: shotData?.movement || 'Static',
    aspectRatio: shotData?.aspectRatio || '16:9',
    frameRate: shotData?.frameRate ?? 24,
    subjectActorIds: shotData?.subjectActorIds ?? [],
    framingDescription: shotData?.framingDescription || '',
    status: shotData?.status || 'planned',
    takesCount: shotData?.takesCount ?? 0,
    estDurationSeconds: shotData?.estDurationSeconds ?? 20,
    ...shotData,
    // After the spread on purpose: a caller passing `shotData` wholesale must
    // not be able to reintroduce a stale number, letter or camera id that this
    // function just resolved against the committed setup.
    id: shotId,
    shotNumber,
    cameraId: resolvedCameraId,
    cameraLabel,
    order,
    lensMm,
  };

  return { shot, ...(camera ? { camera } : {}) };
};
