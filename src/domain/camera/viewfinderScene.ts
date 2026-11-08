import type { CameraElement, GridSettings, SceneSetup } from '../../types';
import { calculateFovAngle, degToRad, getInterpolatedPositionAndRotation } from '../../utils/geometry';
import { buildAssetPreview, type PreviewSolid } from '../plan/assetPreview';
import { buildWallPreview, prismFaces } from '../plan/wallPreview';
import { convertLength } from '../units';
import { elementElevationMm } from '../plan/elevation';
import { buildLightBlockers, buildPreviewLights } from '../plan/sceneLighting';
import { buildScenePreviewMesh, type ScenePreviewMesh } from '../plan/scenePreviewMesh';

type Vec3 = [number, number, number];

export const VIEWFINDER_SKY = [.14, .19, .26] as const;
export const VIEWFINDER_FLOOR = [.10, .135, .175] as const;

export interface ViewfinderPose {
  eye: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  tanHalfHorizontal: number;
  barrelDistortion: number;
  /** Ephemeral orbit-preview projection width in mm; absent for camera optics. */
  orthographicSpan?: number;
}

/** Legacy plans store framing presets. These heights and angles are preview estimates. */
const framing: Record<CameraElement['cameraHeight'], readonly [heightMm: number, pitchDeg: number, rollDeg?: number]> = {
  Ground: [220, 0], Knee: [550, 0], Waist: [1000, 0], 'Eye Level': [1535, 0], High: [1950, 0],
  'Low Angle': [650, 15], 'High Angle': [2350, -24], "Bird's Eye": [3600, -90],
  "Overhead / Bird's Eye": [3600, -90], "Worm's Eye": [220, 35], 'Dutch Angle': [1535, 0, 14],
};

export const MAX_CAMERA_TILT_DEG = 90;

export function getViewfinderTilt(camera: Pick<CameraElement, 'cameraHeight' | 'tiltDeg'>): number {
  const { tiltDeg } = camera;
  if (typeof tiltDeg === 'number' && Number.isFinite(tiltDeg)) {
    return Math.max(-MAX_CAMERA_TILT_DEG, Math.min(MAX_CAMERA_TILT_DEG, tiltDeg));
  }
  return (framing[camera.cameraHeight] ?? framing['Eye Level'])[1];
}

export function getViewfinderPose(camera: CameraElement, grid: GridSettings, slotKey: string): ViewfinderPose | null {
  const scale = convertLength(1, grid.unit, 'mm') / grid.pixelsPerUnit;
  const waypoint = camera.path?.find(({ id }) => id === slotKey);
  const { x, y } = waypoint ?? camera;
  const heading = waypoint?.rotation ?? camera.rotation;
  if (!Number.isFinite(scale) || scale <= 0 || ![x, y, heading].every(Number.isFinite)) return null;
  const [height, , rollDeg = 0] = framing[camera.cameraHeight] ?? framing['Eye Level'];
  const yaw = degToRad(heading);
  const pitch = degToRad(getViewfinderTilt(camera));
  const roll = degToRad(rollDeg);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const forward: Vec3 = [cos * Math.cos(pitch), sin * Math.cos(pitch), Math.sin(pitch)];
  const horizontalRight: Vec3 = [-sin, cos, 0];
  const verticalUp: Vec3 = [-cos * Math.sin(pitch), -sin * Math.sin(pitch), Math.cos(pitch)];
  const rotate = (i: 0 | 1 | 2, angle: number) => horizontalRight[i] * Math.cos(angle) + verticalUp[i] * Math.sin(angle);
  const focal = Number.isFinite(camera.focalLength) && camera.focalLength > 0 ? camera.focalLength : 35;
  const hfov = Math.max(1, Math.min(175, calculateFovAngle(focal, camera.sensorFormat)));
  // Generic preview curve. The field of view includes the selected sensor size.
  const wide = Math.max(0, Math.min(1, (hfov - 39) / 45));
  return {
    eye: [x * scale, y * scale, height + elementElevationMm(camera)], forward,
    right: [rotate(0, roll), rotate(1, roll), rotate(2, roll)],
    up: [rotate(0, roll + Math.PI / 2), rotate(1, roll + Math.PI / 2), rotate(2, roll + Math.PI / 2)],
    tanHalfHorizontal: Math.tan(degToRad(hfov / 2)),
    barrelDistortion: .27 * wide * wide * (3 - 2 * wide),
  };
}

function rgb(color: string): Vec3 {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color)?.[1] ?? '64748b';
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255) as Vec3;
}

function wallTint(tint: Vec3): Vec3 {
  const [r, g, b] = tint;
  const luma = .2126 * r + .7152 * g + .0722 * b;
  // Reserve enough brightness for shadowed faces against both sky and floor.
  const minimum = .73;
  if (luma >= minimum) return tint;
  const lift = (minimum - luma) / (1 - luma);
  return [r + (1 - r) * lift, g + (1 - g) * lift, b + (1 - b) * lift];
}

/** Lit meshes carry per-vertex normals for the per-pixel lighting; unlit ones carry pre-shaded colour. */
export interface ViewfinderLightingOptions { ambient: number; lightTilt: number }

export function buildViewfinderMesh(setup: Pick<SceneSetup, 'elements' | 'layers' | 'gridSettings'>, cameraId: string, beat = 1,
  lighting?: ViewfinderLightingOptions): ScenePreviewMesh {
  const { elements, layers, gridSettings } = setup;
  const walls = new Set(elements.filter(({ type }) => type === 'wall').map(({ id }) => id));
  const windows = new Set(elements.filter(({ type }) => type === 'window').map(({ id }) => id));
  const placed = elements.filter(({ id }) => id !== cameraId).map((element) => {
    if (beat <= 1 || (element.type !== 'actor' && element.type !== 'camera' && element.type !== 'light' && element.type !== 'prop') || !element.path?.length) return element;
    const { position, rotation } = getInterpolatedPositionAndRotation(element, element.rotation, element.path, beat);
    return { ...element, ...position, rotation };
  });
  const solids = [
    ...buildWallPreview(elements, layers, gridSettings, true).filter(({ wallId }) => !windows.has(wallId)),
    ...buildAssetPreview(placed, layers, gridSettings),
  ];
  if (lighting) return buildScenePreviewMesh(solids, {
    lights: buildPreviewLights(placed, layers, gridSettings, lighting.lightTilt),
    blockers: buildLightBlockers(solids, placed), ambient: lighting.ambient,
  });
  const mesh: number[] = [];
  const faces = new Map<number, number[][]>();
  for (const { wallId, color, corners } of solids) {
    if (!corners.every(({ x, y, z }) => [x, y, z].every(Number.isFinite))) continue;
    const sides = corners.length / 2;
    let polygons = faces.get(sides);
    if (!polygons) faces.set(sides, polygons = prismFaces(sides));
    const base = rgb(color);
    const tint = walls.has(wallId) ? wallTint(base) : base;
    for (const face of polygons) {
      const a = corners[face[0]];
      const shade = faceShade(a, corners[face[1]], corners[face[2]]);
      const [red, green, blue] = tint.map((channel) => channel * shade);
      for (let index = 1; index < face.length - 1; index++) {
        for (const vertex of [a, corners[face[index]], corners[face[index + 1]]]) {
          mesh.push(vertex.x, vertex.y, vertex.z, red, green, blue);
        }
      }
    }
  }
  return { vertices: new Float32Array(mesh), lit: null };
}

type Point = PreviewSolid['corners'][number];
function faceShade(a: Point, b: Point, c: Point): number {
  const [ux, uy, uz] = [b.x - a.x, b.y - a.y, b.z - a.z];
  const [vx, vy, vz] = [c.x - a.x, c.y - a.y, c.z - a.z];
  const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const length = Math.hypot(nx, ny, nz) || 1;
  return .72 + .28 * Math.max(0, (-nx * .36 - ny * .48 + nz * .80) / length);
}
