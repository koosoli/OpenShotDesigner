import type { PreviewSolid } from './assetPreview';
import { prismFaces } from './wallPreview';
import type { ViewfinderPose } from '../camera/viewfinderScene';
import { faceNormal, previewRgb, samplePreviewLighting, type LightBlocker, type PreviewLight, type Vec3 } from './sceneLighting';

export interface SceneLightingOptions { lights: PreviewLight[]; blockers: LightBlocker[]; ambient: number }
const point = (p: PreviewSolid['corners'][number]): Vec3 => [p.x, p.y, p.z];
const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

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

/** Cached per scene, not per camera move. Subdivision reveals light pools and shadow edges. */
export function buildScenePreviewMesh(solids: readonly PreviewSolid[], lighting?: SceneLightingOptions): Float32Array {
  const vertices: number[] = [];
  const cache = new Map<string, Vec3>();
  const addTriangle = (a: Vec3, b: Vec3, c: Vec3, tint: Vec3, id: string, normal: Vec3, depth = 0) => {
    const edge = Math.max(Math.hypot(...a.map((v, i) => v - b[i])), Math.hypot(...b.map((v, i) => v - c[i])), Math.hypot(...c.map((v, i) => v - a[i])));
    if (lighting && edge > 650 && depth < 5) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      addTriangle(a, ab, ca, tint, id, normal, depth + 1); addTriangle(ab, b, bc, tint, id, normal, depth + 1);
      addTriangle(ca, bc, c, tint, id, normal, depth + 1); addTriangle(ab, bc, ca, tint, id, normal, depth + 1);
      return;
    }
    const shade = .72 + .28 * Math.max(0, -normal[0] * .36 - normal[1] * .48 + normal[2] * .8);
    for (const vertex of [a, b, c]) {
      let color: Vec3;
      if (lighting) {
        const key = `${id}:${vertex.map(v => Math.round(v)).join(',')}:${normal.map(v => v.toFixed(2)).join(',')}`;
        let light = cache.get(key);
        if (!light) {
          light = samplePreviewLighting(vertex, normal, lighting.lights, lighting.blockers, lighting.ambient, id);
          cache.set(key, light);
        }
        color = tint.map((v, i) => 1 - Math.exp(-v * light[i])) as Vec3;
      } else color = tint.map(v => v * shade) as Vec3;
      vertices.push(...vertex, ...color);
    }
  };
  for (const solid of solids) {
    if (!solid.corners.every(p => [p.x, p.y, p.z].every(Number.isFinite))) continue;
    const points = solid.corners.map(point);
    const tint = previewRgb(solid.color);
    for (const face of prismFaces(points.length / 2)) {
      const a = points[face[0]];
      const normal = faceNormal(a, points[face[1]], points[face[2]]);
      for (let i = 1; i < face.length - 1; i++) addTriangle(a, points[face[i]], points[face[i + 1]], tint, solid.wallId, normal);
    }
  }
  // A finite floor, tiled to resolve local illumination instead of one giant triangle.
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
    addTriangle(a, b, c, [.55, .58, .62], '__floor', [0, 0, 1], 5);
    addTriangle(a, c, d, [.55, .58, .62], '__floor', [0, 0, 1], 5);
  }
  return new Float32Array(vertices);
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
