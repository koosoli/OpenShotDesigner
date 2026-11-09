import { describe, expect, it } from 'vitest';
import type { LightBlocker, PreviewLight, Vec3 } from '../plan/sceneLighting';
import { LIGHT_GRID_SIZE, packTiledPreviewLighting, TILED_LIGHTING_LIMITS } from '../plan/tiledPreviewLighting';

const bounds = { min: [-4000, -4000, -5] as Vec3, max: [4000, 4000, 3000] as Vec3 };
const light: PreviewLight = {
  id: 'beam', position: [0, 0, 1800], direction: [1, 0, 0], color: [1, 1, 1],
  outerCos: .9, innerCos: .95, intensity: 1, omni: false, assumed: false,
};

function tileLights(data: Float32Array, x: number, y: number): number[] {
  const header = 4 * (y * LIGHT_GRID_SIZE + x);
  return Array.from({ length: data[header + 1] }, (_, i) => data[(data[header] + i) * 4]);
}

describe('preview lighting tile packing', () => {
  it('culls directional fixtures conservatively and keeps practicals in every tile', () => {
    const lights = [light, { ...light, id: 'practical', omni: true }];
    const { data } = packTiledPreviewLighting(lights, [], new Map(), bounds);
    const first = LIGHT_GRID_SIZE ** 2;
    expect(tileLights(data, 0, 4)).toEqual([first + 4]);
    expect(tileLights(data, 7, 4)).toEqual([first, first + 4]);
    for (const x of [-3999, -2010, -1001, -999, 1, 500, 999, 1001, 3999]) {
      for (const y of [-3999, -1001, -999, -1, 1, 999, 1001, 3999]) {
        for (const z of [-5, 100, 1600, 1800, 2300, 3000]) {
          const tile = tileLights(data, Math.floor((x + 4000) / 1000), Math.floor((y + 4000) / 1000));
          expect(tile).toContain(first + 4);
          if (x / Math.hypot(x, y, z - 1800) > light.outerCos) expect(tile).toContain(first);
        }
      }
    }
  });

  it('packs late fixtures and complex blockers and reports actual overflow', () => {
    const lights = Array.from({ length: 65 }, (_, i) => ({ ...light, id: `lamp${i}` }));
    const plane = { normal: [0, 0, 1] as Vec3, distance: 120 };
    const blocker: LightBlocker = {
      id: 'wall', min: [-100, -200, 0], max: [100, 200, 3000],
      planes: Array.from({ length: 14 }, () => plane),
    };
    const tiled = packTiledPreviewLighting(lights, [blocker, {
      ...blocker, planes: Array.from({ length: TILED_LIGHTING_LIMITS.planes + 1 }, () => plane),
    }], new Map([['wall', 7]]), bounds);
    expect(tiled.dropped).toEqual({ lights: 1, blockers: 1 });
    expect(tileLights(tiled.data, 7, 4)).toHaveLength(64);
    const start = tiled.blockerStart * 4;
    expect(Array.from(tiled.data.slice(start, start + 8))).toEqual([-100, -200, 0, 7, 100, 200, 3000, 14]);
    const planes = tiled.data[start + 8] * 4;
    expect(Array.from(tiled.data.slice(planes, planes + 4))).toEqual([0, 0, 1, 120]);
  });

  it('keeps blockers between a tile and its lights while dropping unrelated blockers', () => {
    const wall: LightBlocker = { id: 'wall', min: [1900, -100, 0], max: [2100, 100, 2500], planes: [] };
    const distant: LightBlocker = { ...wall, id: 'distant', min: [-2500, -500, 0], max: [-2000, 500, 2500] };
    const { data } = packTiledPreviewLighting([light], [distant, wall], new Map(), bounds);
    const header = (4 * LIGHT_GRID_SIZE + 7) * 4;
    expect(data[header + 3]).toBe(1);
    expect(data[data[header + 2] * 4]).toBe(1);
  });
});
