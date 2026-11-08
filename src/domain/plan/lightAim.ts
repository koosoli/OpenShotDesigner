import type { FloorPlanElement, GridSettings, LightElement, PlanLayer } from '../../types';
import type { ViewfinderPose } from '../camera/viewfinderScene';
import { resolveBeamAim, clampBeamPan, clampBeamTilt } from '../lighting/beamAim';
import { convertLength } from '../units';
import { elementElevationMm } from './elevation';
import type { EquipmentPart } from './equipmentPreviewGeometry';
import { lightPreview } from './lightPreview';

type Vec3 = [number, number, number];
const DEG = Math.PI / 180;

/** Length of the drawn beam handle in millimetres. Only the direction it implies is stored. */
export const AIM_HANDLE_LENGTH_MM = 1500;

const round1 = (value: number) => Math.round(value * 10) / 10;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Centre of the head parts in local millimetres, or undefined when a fixture has no head. */
export function headPivot(parts: EquipmentPart[]): Vec3 | undefined {
  const points = parts.filter(part => part.head).flatMap(part => part.corners);
  if (points.length === 0) return undefined;
  const sum = points.reduce<Vec3>((total, p) => [total[0] + p.x, total[1] + p.y, total[2] + p.z], [0, 0, 0]);
  return sum.map(value => value / points.length) as Vec3;
}

/**
 * Turns the head parts about their pivot: tilt about the horizontal side axis, then pan about the
 * vertical axis. Local +X is forward, so a head at zero tilt and pan is unchanged, and a
 * forward vector becomes exactly the direction resolveBeamAim gives for the same pan and tilt.
 * Stands and bases are returned as they are.
 */
export function aimHeadParts(parts: EquipmentPart[], pivot: Vec3, panDeg: number, tiltDeg: number): EquipmentPart[] {
  const cosT = Math.cos(tiltDeg * DEG), sinT = Math.sin(tiltDeg * DEG);
  const cosP = Math.cos(panDeg * DEG), sinP = Math.sin(panDeg * DEG);
  const rotate = ({ x, y, z }: { x: number; y: number; z: number }) => {
    const dx = x - pivot[0], dy = y - pivot[1], dz = z - pivot[2];
    // Ry(tilt): forward (1, 0, 0) goes to (cos t, 0, -sin t), so positive tilt aims down.
    const tx = dx * cosT + dz * sinT;
    const tz = -dx * sinT + dz * cosT;
    // Rz(pan), applied after the tilt.
    return {
      x: pivot[0] + tx * cosP - dy * sinP,
      y: pivot[1] + tx * sinP + dy * cosP,
      z: pivot[2] + tz,
    };
  };
  return parts.map(part => part.head ? { ...part, corners: part.corners.map(rotate) } : part);
}

/** Lamp parts of a light element, aimed by its stored pan and tilt. */
export function aimedLightParts(element: LightElement, parts: EquipmentPart[], inheritedTiltDeg: number): EquipmentPart[] {
  const pivot = headPivot(parts);
  if (!pivot) return parts;
  const { panOffsetDeg, tiltDeg } = resolveBeamAim(element, inheritedTiltDeg);
  return aimHeadParts(parts, pivot, panOffsetDeg, tiltDeg);
}

/** Local light point to world millimetres, matching the placement used for every asset. */
export function placeLightPoint(element: Pick<LightElement, 'x' | 'y' | 'rotation' | 'elevationMm'>, scale: number, local: Vec3): Vec3 {
  const angle = element.rotation * DEG;
  const c = Math.cos(angle), s = Math.sin(angle);
  return [element.x * scale + local[0] * c - local[1] * s, element.y * scale + local[0] * s + local[1] * c,
    local[2] + elementElevationMm(element)];
}

/** Stored pan and tilt for a world beam direction. Positive tilt aims down, as in resolveBeamAim. */
export function aimFromDirection(direction: Vec3, rotationDeg: number): { beamPanDeg: number; beamTiltDeg: number } {
  const tilt = -Math.asin(Math.max(-1, Math.min(1, direction[2]))) / DEG;
  const yaw = Math.atan2(direction[1], direction[0]) / DEG;
  const pan = ((yaw - rotationDeg + 540) % 360 + 360) % 360 - 180;
  return { beamPanDeg: round1(clampBeamPan(pan)), beamTiltDeg: round1(clampBeamTilt(tilt)) };
}

/** Pixel position of a world point under the orthographic orbit view, matching the renderer's projection. */
export function projectOrthographic(pose: ViewfinderPose, width: number, height: number, point: Vec3): [number, number] {
  const span = pose.orthographicSpan || 1; // always set by sceneOrbitPose
  const aspect = width / height;
  const offset: Vec3 = [point[0] - pose.eye[0], point[1] - pose.eye[1], point[2] - pose.eye[2]];
  const x = dot(offset, pose.right) * 2 / span;
  const y = dot(offset, pose.up) * 2 * aspect / span;
  return [(x + 1) / 2 * width, (1 - y) / 2 * height];
}

/**
 * World direction of a beam whose handle, `length` millimetres from the pivot, lands under a pixel.
 * In orthographic projection the screen fixes two components of the direction; the third (depth)
 * takes the sign that the previous direction had, so the beam does not flip behind the pivot.
 */
export function directionFromScreen(pose: ViewfinderPose, width: number, height: number, pivot: Vec3,
  pixel: readonly [number, number], previous: Vec3, length: number): Vec3 {
  const span = pose.orthographicSpan || 1; // always set by sceneOrbitPose
  const aspect = width / height;
  const targetRight = (2 * pixel[0] / width - 1) * span / 2;
  const targetUp = (1 - 2 * pixel[1] / height) * span / (2 * aspect);
  const offset: Vec3 = [pivot[0] - pose.eye[0], pivot[1] - pose.eye[1], pivot[2] - pose.eye[2]];
  let ox = (targetRight - dot(offset, pose.right)) / length;
  let oy = (targetUp - dot(offset, pose.up)) / length;
  const magnitude = Math.hypot(ox, oy);
  if (magnitude > 1) { ox /= magnitude; oy /= magnitude; }
  const depth = Math.sqrt(Math.max(0, 1 - ox * ox - oy * oy)) * (dot(previous, pose.forward) < 0 ? -1 : 1);
  return [0, 1, 2].map(i => ox * pose.right[i] + oy * pose.up[i] + depth * pose.forward[i]) as Vec3;
}

export interface LightAimTarget {
  id: string;
  pivot: Vec3;
  direction: Vec3;
  rotationDeg: number;
}

/** Beam handles for the selected visible light fixtures, in world millimetres. */
export function lightAimTargets(elements: readonly FloorPlanElement[], layers: readonly PlanLayer[] | undefined,
  grid: GridSettings, selectedIds: readonly string[], inheritedTiltDeg: number): LightAimTarget[] {
  const scale = convertLength(1, grid.unit, 'mm') / grid.pixelsPerUnit;
  if (!Number.isFinite(scale) || scale <= 0) return [];
  const hidden = new Set(layers?.filter(layer => !layer.visible).map(layer => layer.id));
  return elements.flatMap((element) => {
    if (element.type !== 'light' || !selectedIds.includes(element.id) || element.visible === false ||
      hidden.has(element.layerId ?? '') || ![element.x, element.y, element.rotation].every(Number.isFinite)) return [];
    const local = headPivot(lightPreview(element));
    if (!local) return [];
    return [{
      id: element.id,
      pivot: placeLightPoint(element, scale, local),
      direction: resolveBeamAim(element, inheritedTiltDeg).direction,
      rotationDeg: element.rotation,
    }];
  });
}
