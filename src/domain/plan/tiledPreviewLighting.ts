import type { LightBlocker, PreviewLight, Vec3 } from './sceneLighting';

export const TILED_LIGHTING_LIMITS = { lights: 64, blockers: 96, planes: 32 } as const;
export const LIGHT_GRID_SIZE = 8;
export const LIGHT_TEXTURE_WIDTH = 256;

interface Bounds { min: Vec3; max: Vec3 }

export interface TiledPreviewLighting {
  data: Float32Array<ArrayBuffer>;
  textureHeight: number;
  grid: [number, number, number, number];
  blockerStart: number;
  blockerCount: number;
  dropped: { lights: number; blockers: number };
}

/** Reject a tile only if its entire box is outside the fixture's forward cone. */
function reachesTile(light: PreviewLight, min: Vec3, max: Vec3): boolean {
  if (light.omni || light.outerCos < 0) return true;
  let projection = 0;
  let distanceSquared = 0;
  for (let axis = 0; axis < 3; axis++) {
    const low = min[axis] - light.position[axis];
    const high = max[axis] - light.position[axis];
    const direction = light.direction[axis];
    projection += direction * (direction < 0 ? low : high);
    distanceSquared += Math.max(0, low, -high) ** 2;
  }
  // A small tolerance protects grazing rays and Float32 packing boundaries.
  return projection + 0.1 >= light.outerCos * Math.sqrt(distanceSquared);
}

export function packTiledPreviewLighting(
  lights: readonly PreviewLight[],
  blockers: readonly LightBlocker[],
  surfaces: ReadonlyMap<string, number>,
  bounds: Bounds,
): TiledPreviewLighting {
  const selectedLights = lights.slice(0, TILED_LIGHTING_LIMITS.lights);
  const selectedBlockers = blockers
    .filter(blocker => blocker.planes.length <= TILED_LIGHTING_LIMITS.planes)
    .slice(0, TILED_LIGHTING_LIMITS.blockers);
  const stepX = (bounds.max[0] - bounds.min[0]) / LIGHT_GRID_SIZE;
  const stepY = (bounds.max[1] - bounds.min[1]) / LIGHT_GRID_SIZE;
  const tileCount = LIGHT_GRID_SIZE ** 2;
  // Each tile header stores the offset and count for its light and blocker lists.
  const records = new Array<number>(tileCount * 4).fill(0);
  for (const light of selectedLights) {
    records.push(...light.position, light.outerCos, ...light.direction, light.innerCos,
      ...light.color.map(channel => channel * light.intensity * 6), Number(light.omni),
      surfaces.get(light.id) ?? -2, 0, 0, 0);
  }
  const blockerStart = records.length / 4;
  // Store variable-length plane records so complex convex blockers can cast shadows.
  for (const blocker of selectedBlockers) {
    records.push(...blocker.min, surfaces.get(blocker.id) ?? -2,
      ...blocker.max, blocker.planes.length);
  }
  // Plane offsets follow the bounds table, one texel per blocker.
  const planeTable = records.length / 4;
  for (let i = 0; i < selectedBlockers.length * 4; i++) records.push(0);
  selectedBlockers.forEach((blocker, index) => {
    records[(planeTable + index) * 4] = records.length / 4;
    for (const plane of blocker.planes) records.push(...plane.normal, plane.distance);
  });
  for (let y = 0; y < LIGHT_GRID_SIZE; y++) {
    for (let x = 0; x < LIGHT_GRID_SIZE; x++) {
      const min: Vec3 = [bounds.min[0] + x * stepX, bounds.min[1] + y * stepY, bounds.min[2]];
      const max: Vec3 = [min[0] + stepX, min[1] + stepY, bounds.max[2]];
      const rayMin: Vec3 = [...min];
      const rayMax: Vec3 = [...max];
      const header = (y * LIGHT_GRID_SIZE + x) * 4;
      records[header] = records.length / 4;
      selectedLights.forEach((light, index) => {
        if (!reachesTile(light, min, max)) return;
        records.push(tileCount + index * 4, 0, 0, 0);
        records[header + 1]++;
        for (let axis = 0; axis < 3; axis++) {
          rayMin[axis] = Math.min(rayMin[axis], light.position[axis]);
          rayMax[axis] = Math.max(rayMax[axis], light.position[axis]);
        }
      });
      if (!records[header + 1]) continue;
      records[header + 2] = records.length / 4;
      // Every shadow ray stays inside the box enclosing the tile and its lights.
      selectedBlockers.forEach((blocker, index) => {
        if (rayMin.some((low, axis) => low - 0.1 > blocker.max[axis] || rayMax[axis] + 0.1 < blocker.min[axis])) return;
        records.push(index, 0, 0, 0);
        records[header + 3]++;
      });
    }
  }
  const textureHeight = Math.ceil(records.length / (LIGHT_TEXTURE_WIDTH * 4));
  const data = new Float32Array(textureHeight * LIGHT_TEXTURE_WIDTH * 4);
  data.set(records);
  return {
    data, textureHeight, grid: [bounds.min[0], bounds.min[1], stepX, stepY],
    blockerStart, blockerCount: selectedBlockers.length,
    dropped: { lights: lights.length - selectedLights.length, blockers: blockers.length - selectedBlockers.length },
  };
}
