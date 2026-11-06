import type { FloorPlanElement, GridSettings, PlanLayer } from '../../types';
import { symbolFixtureKind } from '../assets/fixtureSymbols';
import { resolveBeamAim } from '../lighting/beamAim';
import { convertLength } from '../units';
import { kelvinToHex } from '../../utils/geometry';
import { deriveEffectiveLightAppearance } from '../lighting/modifiers';
import { elementElevationMm } from './elevation';
import { prismFaces } from './wallPreview';
import type { PreviewSolid } from './assetPreview';

export type Vec3 = [number, number, number];
export const PREVIEW_LIGHT_ASSUMPTIONS = { heightMm: 1800, beamAngleDeg: 60 };
export interface PreviewLight {
  id: string; position: Vec3; direction: Vec3; color: Vec3;
  intensity: number; outerCos: number; innerCos: number; omni: boolean;
  assumed: boolean;
}
export interface LightBlocker {
  id: string; min: Vec3; max: Vec3;
  planes: { normal: Vec3; distance: number }[];
}
export const nonEmittingFixture = (kind: string) => kind.startsWith('flag_') ||
  ['tripod', 'c_stand_flag', 'reflector', 'butterfly'].includes(kind);

export function previewRgb(hex: string): Vec3 {
  const match = /^#([a-f\d]{6}|[a-f\d]{3})$/i.exec(hex);
  if (!match) return [1, 1, 1];
  const full = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255) as Vec3;
}

/** Visual relative levels only: never infer output, lux or wattage from a name. */
export function buildPreviewLights(elements: readonly FloorPlanElement[], layers: readonly PlanLayer[] | undefined,
  grid: GridSettings, tiltDeg: number): PreviewLight[] {
  const scale = convertLength(1, grid.unit, 'mm') / grid.pixelsPerUnit;
  if (!Number.isFinite(scale) || scale <= 0) return [];
  const hidden = new Set(layers?.filter(l => !l.visible).map(l => l.id));
  return elements.flatMap(element => {
    if (element.visible === false || hidden.has(element.layerId ?? '') ||
      ![element.x, element.y, element.rotation].every(Number.isFinite)) return [];
    const light = element.type === 'light' ? element : undefined;
    const symbolKind = element.type === 'shape' && element.symbolId ? symbolFixtureKind(element.symbolId) : undefined;
    const kind = light?.fixtureType ?? symbolKind;
    if (!kind || nonEmittingFixture(kind)) return [];
    if (light && (!Number.isFinite(light.intensity) || !Number.isFinite(light.beamAngle))) return [];
    const appearance = deriveEffectiveLightAppearance(light?.beamAngle ?? PREVIEW_LIGHT_ASSUMPTIONS.beamAngleDeg, light?.modifiers);
    if (appearance.beamAngleDeg <= 0 && kind !== 'practical' && !appearance.omni) return [];
    let intensity = light ? Math.max(0, Math.min(100, light.intensity)) / 100 : 1;
    for (const modifier of light?.modifiers ?? []) {
      if (modifier.enabled && typeof modifier.transmissionPercent === 'number' && Number.isFinite(modifier.transmissionPercent)) {
        intensity *= Math.max(0, Math.min(100, modifier.transmissionPercent)) / 100;
      }
    }
    if (!intensity) return [];
    const aim = resolveBeamAim(element.type === 'light' || element.type === 'shape' ? element : { rotation: element.rotation }, tiltDeg);
    const omni = kind === 'practical' || appearance.omni || appearance.beamAngleDeg >= 350;
    const angle = Math.max(1, Math.min(179, appearance.beamAngleDeg)) * Math.PI / 360;
    const tint = appearance.colorHex ?? light?.rgbColor ??
      (light && Number.isFinite(light.colorTemp) && light.colorTemp > 0 ? kelvinToHex(light.colorTemp) : '#ffffff');
    return [{ id: element.id, position: [element.x * scale, element.y * scale,
      PREVIEW_LIGHT_ASSUMPTIONS.heightMm + elementElevationMm(element)] as Vec3,
    direction: aim.direction,
    color: previewRgb(tint), intensity, outerCos: Math.cos(angle),
    innerCos: Math.cos(angle * (appearance.beamEdge === 'soft' ? .55 : .85)), omni,
    assumed: !light }];
  });
}

export function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const u = b.map((v, i) => v - a[i]);
  const v = c.map((v, i) => v - a[i]);
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1;
  return n.map(v => v / length) as Vec3;
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Convex prism clipping keeps rotated walls and their opening gaps accurate. */
export function buildLightBlockers(solids: readonly PreviewSolid[], elements: readonly FloorPlanElement[]): LightBlocker[] {
  const opaque = new Set(elements.filter(e => e.type === 'wall' || e.type === 'door' || e.type === 'prop' || e.type === 'shape' ||
    (e.type === 'light' && nonEmittingFixture(e.fixtureType))).map(e => e.id));
  return solids.flatMap(solid => {
    if (!opaque.has(solid.wallId)) return [];
    const points = solid.corners.map(p => [p.x, p.y, p.z] as Vec3);
    const min = [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))) as Vec3;
    const max = [0, 1, 2].map(i => Math.max(...points.map(p => p[i]))) as Vec3;
    // Tiny fittings are not shadow casters in this qualitative preview.
    if (max[2] - min[2] < 1 || max.filter((v, i) => v - min[i] >= 200).length < 2) return [];
    const centre = min.map((v, i) => (v + max[i]) / 2) as Vec3;
    const planes = prismFaces(points.length / 2).map(face => {
      const a = points[face[0]];
      let normal = faceNormal(a, points[face[1]], points[face[2]]);
      if (dot(normal, centre.map((v, i) => v - a[i]) as Vec3) > 0) normal = normal.map(v => -v) as Vec3;
      return { normal, distance: dot(normal, a) };
    });
    return [{ id: solid.wallId, min, max, planes }];
  });
}

export function isLightBlocked(from: Vec3, to: Vec3, blockers: readonly LightBlocker[], sourceId: string, surfaceId: string): boolean {
  const delta = to.map((v, i) => v - from[i]) as Vec3;
  for (const blocker of blockers) {
    if (blocker.id === sourceId || blocker.id === surfaceId) continue;
    if ([0, 1, 2].some(i => Math.max(from[i], to[i]) < blocker.min[i] || Math.min(from[i], to[i]) > blocker.max[i])) continue;
    let near = .001;
    let far = .999;
    for (const plane of blocker.planes) {
      const denominator = dot(plane.normal, delta);
      const distance = plane.distance - dot(plane.normal, from);
      if (Math.abs(denominator) < 1e-9) { if (distance < -.01) { far = -1; break; } continue; }
      const t = distance / denominator;
      if (denominator < 0) near = Math.max(near, t); else far = Math.min(far, t);
      if (near > far) break;
    }
    if (near <= far) return true;
  }
  return false;
}

/** RGB multipliers in relative display units, with inverse-square-like falloff. */
export function samplePreviewLighting(point: Vec3, normal: Vec3, lights: readonly PreviewLight[], blockers: readonly LightBlocker[],
  ambient: number, surfaceId = ''): Vec3 {
  const level = Number.isFinite(ambient) ? Math.max(0, Math.min(1, ambient)) : .15;
  const result: Vec3 = [level, level, level];
  for (const light of lights) {
    const delta = point.map((v, i) => v - light.position[i]) as Vec3;
    const distance = Math.hypot(...delta);
    if (distance < 1) continue;
    const direction = delta.map(v => v / distance) as Vec3;
    const alignment = dot(direction, light.direction);
    const cone = light.omni ? 1 : Math.max(0, Math.min(1, (alignment - light.outerCos) / Math.max(.001, light.innerCos - light.outerCos)));
    const incidence = Math.max(0, -dot(normal, direction));
    if (!cone || !incidence || isLightBlocked(light.position, point, blockers, light.id, surfaceId)) continue;
    const energy = light.intensity * cone * incidence * 6 / (1 + (distance / 2000) ** 2);
    for (let i = 0; i < 3; i++) result[i] += light.color[i] * energy;
  }
  return result;
}

export function previewLightSummary(lights: readonly PreviewLight[]): string {
  return `${lights.length} emitting light${lights.length === 1 ? '' : 's'} · relative brightness, not calibrated lux`;
}
