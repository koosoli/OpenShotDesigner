import type { PreviewSolid } from './assetPreview';
import { prismFaces } from './wallPreview';
import type { ViewfinderPose } from '../camera/viewfinderScene';
import { faceNormal, previewRgb, type LightBlocker, type PreviewLight, type Vec3 } from './sceneLighting';
import { packTiledPreviewLighting, TILED_LIGHTING_LIMITS, type TiledPreviewLighting } from './tiledPreviewLighting';

export interface SceneLightingOptions { lights: PreviewLight[]; blockers: LightBlocker[]; ambient: number }

/**
 * Limits of the per-pixel lighting uniforms. A scene beyond them keeps the first items
 * and reports the rest through `dropped`, so the caller can say so instead of mis-lighting silently.
 */
export const LIT_LIMITS = { lights: 8, blockers: 12, planes: 10 } as const;
/** Lit vertex: position, normal, tint, surface index (floats). */
export const LIT_STRIDE = 10;
/** Unlit vertex: position, pre-shaded tint (floats). */
export const UNLIT_STRIDE = 6;

/** Packed lighting, ready for the fragment shader. Layout is mirrored by viewfinderWebGL.ts. */
export interface LitScene {
  ambient: number;
  lightCount: number;
  blockerCount: number;
  /** Four vec4 per light: origin+outer cosine, aim+inner cosine, emission+omni flag, source surface. */
  lightData: Float32Array;
  /** Twelve vec4 per blocker: min+surface, max+plane count, then up to LIT_LIMITS.planes (normal, distance). */
  blockerData: Float32Array;
  dropped: { lights: number; blockers: number };
  tiled?: TiledPreviewLighting;
}
export interface ScenePreviewMesh { vertices: Float32Array; lit: LitScene | null }

const FLOOR_SURFACE = -1;
const UNKNOWN_SURFACE = -2;
const point = (p: PreviewSolid['corners'][number]): Vec3 => [p.x, p.y, p.z];

export function sceneBounds(solids: readonly PreviewSolid[]) {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const solid of solids) for (const p of solid.corners) {
    const v = point(p);
    if (!v.every(Number.isFinite)) continue;
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], v[i]); max[i] = Math.max(max[i], v[i]); }
  }
  return Number.isFinite(min[0]) ? { min, max } : { min: [-1000, -1000, 0] as Vec3, max: [1000, 1000, 2000] as Vec3 };
}

/** Surfaces are numbered by their wall id so the shader can skip a surface's own box when it casts shadow. */
function surfaceIndices(solids: readonly PreviewSolid[]) {
  const indices = new Map<string, number>();
  for (const solid of solids) if (!indices.has(solid.wallId)) indices.set(solid.wallId, indices.size);
  return indices;
}

/** Lit output keeps position, normal and tint per vertex; light is evaluated per pixel. Unlit output is pre-shaded per face. */
export function buildScenePreviewMesh(solids: readonly PreviewSolid[], lighting?: SceneLightingOptions): ScenePreviewMesh {
  const vertices: number[] = [];
  const surfaces = surfaceIndices(solids);
  const addTriangle = (a: Vec3, b: Vec3, c: Vec3, tint: Vec3, surface: number, normal: Vec3) => {
    const shade = .72 + .28 * Math.max(0, -normal[0] * .36 - normal[1] * .48 + normal[2] * .8);
    for (const vertex of [a, b, c]) {
      if (lighting) vertices.push(...vertex, ...normal, ...tint, surface);
      else vertices.push(...vertex, ...tint.map(v => v * shade));
    }
  };
  for (const solid of solids) {
    if (!solid.corners.every(p => [p.x, p.y, p.z].every(Number.isFinite))) continue;
    const points = solid.corners.map(point);
    const tint = previewRgb(solid.color);
    const surface = surfaces.get(solid.wallId) ?? UNKNOWN_SURFACE;
    for (const face of prismFaces(points.length / 2)) {
      const a = points[face[0]];
      const normal = faceNormal(a, points[face[1]], points[face[2]]);
      for (let i = 1; i < face.length - 1; i++) addTriangle(a, points[face[i]], points[face[i + 1]], tint, surface, normal);
    }
  }
  // A finite floor, tiled so that its per-pixel light pools and any clipping stay local.
  const { min, max } = sceneBounds(solids);
  const width = Math.max(4000, max[0] - min[0] + 4000);
  const depth = Math.max(4000, max[1] - min[1] + 4000);
  const countX = Math.min(64, Math.ceil(width / 500));
  const countY = Math.min(64, Math.ceil(depth / 500));
  const x0 = (min[0] + max[0] - width) / 2, y0 = (min[1] + max[1] - depth) / 2;
  for (let x = 0; x < countX; x++) for (let y = 0; y < countY; y++) {
    const a: Vec3 = [x0 + x * width / countX, y0 + y * depth / countY, -5];
    const b: Vec3 = [a[0] + width / countX, a[1], -5];
    const c: Vec3 = [b[0], a[1] + depth / countY, -5];
    const d: Vec3 = [a[0], c[1], -5];
    addTriangle(a, b, c, [.55, .58, .62], FLOOR_SURFACE, [0, 0, 1]);
    addTriangle(a, c, d, [.55, .58, .62], FLOOR_SURFACE, [0, 0, 1]);
  }
  const lit = lighting ? packLighting(lighting, surfaces) : null;
  if (lighting && lit && (lit.dropped.lights || lit.dropped.blockers)) {
    lit.tiled = packTiledPreviewLighting(lighting.lights, lighting.blockers, surfaces, {
      min: [x0, y0, Math.min(min[2], -5)],
      max: [x0 + width, y0 + depth, Math.max(max[2], -5)],
    });
  }
  return {
    vertices: new Float32Array(vertices),
    lit,
  };
}

/** Packs lights and blockers into the layout read by the lit fragment shader. */
export function packLighting(lighting: SceneLightingOptions, surfaces: ReadonlyMap<string, number>): LitScene {
  const lights = lighting.lights.slice(0, LIT_LIMITS.lights);
  const blockers = lighting.blockers.filter(({ planes }) => planes.length <= LIT_LIMITS.planes).slice(0, LIT_LIMITS.blockers);
  const lightData = new Float32Array(LIT_LIMITS.lights * 16);
  lights.forEach((light, i) => {
    const o = i * 16;
    lightData.set([...light.position, light.outerCos], o);
    lightData.set([...light.direction, light.innerCos], o + 4);
    // The 6x factor matches the reference model in sceneLighting.ts.
    lightData.set([...light.color.map(channel => channel * light.intensity * 6), light.omni ? 1 : 0], o + 8);
    lightData[o + 12] = surfaces.get(light.id) ?? UNKNOWN_SURFACE;
  });
  const blockerData = new Float32Array(LIT_LIMITS.blockers * 48);
  blockers.forEach((blocker, j) => {
    const o = j * 48;
    blockerData.set([...blocker.min, surfaces.get(blocker.id) ?? UNKNOWN_SURFACE], o);
    blockerData.set([...blocker.max, blocker.planes.length], o + 4);
    blocker.planes.forEach((plane, k) => blockerData.set([...plane.normal, plane.distance], o + 8 + k * 4));
  });
  const ambient = Number.isFinite(lighting.ambient) ? Math.max(0, Math.min(1, lighting.ambient)) : .15;
  return {
    ambient, lightCount: lights.length, blockerCount: blockers.length, lightData, blockerData,
    dropped: { lights: lighting.lights.length - lights.length, blockers: lighting.blockers.length - blockers.length },
  };
}

/** Text for the preview caption when the lighting limits dropped anything; empty otherwise. */
export function litLimitNote(lit: LitScene | null, tiledSupported = false): string {
  const tiled = tiledSupported ? lit?.tiled : undefined;
  const dropped = tiled?.dropped ?? lit?.dropped;
  if (!dropped || (!dropped.lights && !dropped.blockers)) return '';
  const limits = tiled ? TILED_LIGHTING_LIMITS : LIT_LIMITS;
  return ` · preview limit: first ${limits.lights} lights, up to ${limits.blockers} shadow casters`;
}

export interface OrbitView { angle: number; tilt: number; zoom: number; panX: number; panY: number }
export function sceneFallbackViewBox(base: string, view: OrbitView, aspect: number): string {
  const [x, y, width, height] = base.split(/\s+/).map(Number);
  const fittedWidth = Math.max(width, height * aspect) / view.zoom;
  const fittedHeight = fittedWidth / aspect;
  return [x + (width - fittedWidth) / 2 - view.panX * fittedWidth,
    y + (height - fittedHeight) / 2 - view.panY * fittedHeight, fittedWidth, fittedHeight].join(' ');
}
export function sceneOrbitPose(solids: readonly PreviewSolid[], view: OrbitView, aspect: number): ViewfinderPose {
  const yaw = view.angle * Math.PI / 180, tilt = view.tilt * Math.PI / 180;
  const right: Vec3 = [Math.cos(yaw), -Math.sin(yaw), 0];
  const up: Vec3 = [-Math.sin(yaw) * Math.sin(tilt), -Math.cos(yaw) * Math.sin(tilt), Math.cos(tilt)];
  const forward: Vec3 = [-Math.sin(yaw) * Math.cos(tilt), -Math.cos(yaw) * Math.cos(tilt), -Math.sin(tilt)];
  const { min, max } = sceneBounds(solids);
  const centre = min.map((v, i) => (v + max[i]) / 2) as Vec3;
  const extents = [right, up].map(axis => Math.abs(axis[0]) * (max[0] - min[0]) + Math.abs(axis[1]) * (max[1] - min[1]) + Math.abs(axis[2]) * (max[2] - min[2]));
  const span = Math.max(1500, extents[0], extents[1] * aspect) * 1.15 / view.zoom;
  const eye = centre.map((v, i) => v - forward[i] * 150000 - right[i] * view.panX * span + up[i] * view.panY * span / aspect) as Vec3;
  // Keep all projection axes finite even for a single point or empty scene.
  return { eye, right, up, forward, tanHalfHorizontal: 1, barrelDistortion: 0, orthographicSpan: span };
}
