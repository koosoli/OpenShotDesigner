import type { PreviewSolid } from './assetPreview';
import { faceNormal, previewRgb, samplePreviewLighting, type LightBlocker, type PreviewLight, type Vec3 } from './sceneLighting';
import { prismFaces } from './wallPreview';

const BOARD_BUDGET = 4;
const SOURCE_BUDGET = 64;
const BOUNCE_GAIN = 0.35;
const WALL_SAMPLE_BUDGET = 16;
type Corner = PreviewSolid['corners'][number];

function patch(solid: PreviewSolid, corners: readonly Corner[]) {
  if (corners.length !== 4 || !corners.every(p => [p.x, p.y, p.z].every(Number.isFinite))) return [];
  const [a, b, c, d] = corners;
  const normal = faceNormal([a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z]);
  const position: Vec3 = [(a.x + b.x + c.x + d.x) / 4, (a.y + b.y + c.y + d.y) / 4, (a.z + b.z + c.z + d.z) / 4];
  const area = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    * Math.hypot(a.x - d.x, a.y - d.y, a.z - d.z);
  return [{ solid, corners, position, normal, area }];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function beamHit(light: PreviewLight, face: ReturnType<typeof patch>[number]): Vec3 | undefined {
  if (light.omni) return;
  const denominator = dot(light.direction, face.normal);
  if (denominator >= -1e-6) return;
  const delta = face.position.map((value, i) => value - light.position[i]) as Vec3;
  const distance = dot(delta, face.normal) / denominator;
  if (distance <= 0) return;
  const hit = light.position.map((value, i) => value + distance * light.direction[i]) as Vec3;
  // Each edge of the convex face must have the hit on its inward side.
  const inside = face.corners.every((corner, i) => {
    const next = face.corners[(i + 1) % face.corners.length];
    const [x, y, z] = [next.x - corner.x, next.y - corner.y, next.z - corner.z];
    const [u, v, w] = [hit[0] - corner.x, hit[1] - corner.y, hit[2] - corner.z];
    return dot([y * w - z * v, z * u - x * w, x * v - y * u], face.normal) >= -1e-3;
  });
  return inside ? hit : undefined;
}

/** Approximate one diffuse bounce from boards and the strongest lit wall patches. */
export function previewReflectorBounces(
  solids: readonly PreviewSolid[], lights: readonly PreviewLight[], blockers: readonly LightBlocker[],
): PreviewLight[] {
  if (!lights.length) return [];
  const sources = lights.slice(0, SOURCE_BUDGET);
  const boards = solids.filter(solid => solid.reflecting).slice(0, BOARD_BUDGET)
    .flatMap(solid => patch(solid, solid.corners.slice(4)));
  const walls = solids.filter(solid => solid.reflectingWall).flatMap(solid =>
    prismFaces(4).slice(1, -1).flatMap(face => patch(solid, face.map(index => solid.corners[index]))))
    .filter(face => face.area >= 250_000).sort((a, b) => b.area - a.area).slice(0, WALL_SAMPLE_BUDGET);
  const emit = (face: (typeof boards)[number]): PreviewLight[] => {
    const { solid, normal, area } = face;
    let position = face.position;
    let incident = samplePreviewLighting(position, normal, sources, blockers, 0, solid.wallId);
    if (solid.reflectingWall) {
      let strongest = Math.max(...incident);
      for (const source of sources) {
        const hit = beamHit(source, face);
        if (!hit) continue;
        const energy = Math.max(...samplePreviewLighting(hit, normal, [source], blockers, 0, solid.wallId));
        if (energy <= strongest) continue;
        strongest = energy;
        position = hit;
      }
      if (position !== face.position) incident = samplePreviewLighting(position, normal, sources, blockers, 0, solid.wallId);
    }
    const tint = solid.reflectingWall ? previewRgb(solid.color) : [1, 1, 1];
    const color = incident.map((value, i) => value * tint[i]) as Vec3;
    if (Math.max(...color) < .01) return [];
    return [{
      id: solid.wallId, position, direction: normal, color,
      intensity: BOUNCE_GAIN * Math.min(1, area / 500_000) / 6,
      outerCos: 0, innerCos: 1, omni: false, assumed: true,
    }];
  };
  const boardLights = boards.flatMap(emit);
  const wallLights = walls.flatMap(emit).sort((a, b) =>
    Math.max(...b.color) * b.intensity - Math.max(...a.color) * a.intensity);
  return [...boardLights, ...wallLights].slice(0, BOARD_BUDGET);
}
