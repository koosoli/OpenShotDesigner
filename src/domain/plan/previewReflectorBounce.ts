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
  return [{ solid, position, normal, area }];
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
  const emit = ({ solid, position, normal, area }: (typeof boards)[number]): PreviewLight[] => {
    const incident = samplePreviewLighting(position, normal, sources, blockers, 0, solid.wallId);
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
