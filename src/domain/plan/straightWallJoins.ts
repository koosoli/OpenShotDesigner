// SPDX-License-Identifier: GPL-3.0-only
// Straight-wall adaptation of ConstructCAD's cc_geom/src/wall.rs and
// cc_geom/src/polygon.rs (Francis Rebouças and contributors), revision
// e9978dd4d9a5158c1ae4bd2b237a0a48df657aea.
import type { GridSettings, WallElement } from '../../types';
import { convertLength } from '../units';

type Point = { x: number; y: number };
interface WallLine { id: string; start: Point; end: Point; length: number; half: number; dir: Point }
type End = [number, number];
type WallEnds = { start: End; end: End };

const plus = (a: Point, b: Point, k: number): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const minus = (a: Point, b: Point) => plus(a, b, -1);
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const perp = (a: Point): Point => ({ x: -a.y, y: a.x });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const SQUARE: End = [0, 0];

export function planUnitsPerMm(grid?: GridSettings): number {
  const scale = grid ? grid.pixelsPerUnit / convertLength(1, grid.unit, 'mm') : NaN;
  return Number.isFinite(scale) && scale > 0 ? scale : 0.03;
}

export function wallLines(walls: WallElement[]): WallLine[] {
  return walls.flatMap((wall) => {
    const start = { x: wall.x, y: wall.y };
    const end = { x: wall.x2 ?? wall.x + 200, y: wall.y2 ?? wall.y };
    const length = distance(end, start);
    if (!Number.isFinite(length) || length <= 0) return [];
    const delta = minus(end, start);
    return [{ id: wall.id, start, end, length, half: (wall.thickness || 12) / 2, dir: { x: delta.x / length, y: delta.y / length } }];
  });
}

/** Port of the straight cases of ConstructCAD resolve_join and t_join. */
export function resolveStraightWallJoins(walls: WallLine[], unitsPerMm = 1): Map<string, WallEnds> {
  const tolerance = 10 * unitsPerMm;
  const gap = 50 * unitsPerMm;
  function resolve(a: WallLine, atStart: boolean): End {
    const p = atStart ? a.start : a.end;
    const da = atStart ? a.dir : { x: -a.dir.x, y: -a.dir.y };
    const na = perp(da);
    const maxExt = 10 * Math.max(a.half, 50 * unitsPerMm);
    const others = walls.filter((wall) => wall !== a);
    const ends = others.flatMap((wall) => {
      if (distance(wall.start, p) < tolerance) return [{ wall, dir: wall.dir, point: wall.start }];
      if (distance(wall.end, p) < tolerance) return [{ wall, dir: { x: -wall.dir.x, y: -wall.dir.y }, point: wall.end }];
      return [];
    });
    function cut(b: WallLine, point: Point, db: Point, miter: boolean): End {
      const denominator = cross(da, db);
      if (Math.abs(denominator) < 1e-6) return SQUARE;
      const nb = perp(db);
      const side = dot(da, nb) >= 0 ? 1 : -1;
      const depth = (face: number) => {
        const target = plus(point, nb, (miter ? -face : side) * b.half);
        const t = cross(minus(target, plus(p, na, face * a.half)), db) / denominator;
        return Math.max(-maxExt, Math.min(maxExt, t));
      };
      return [depth(1), depth(-1)];
    }
    if (ends.length === 1) {
      const { wall, point, dir } = ends[0];
      return cut(wall, point, dir, true);
    }
    if (ends.length > 1) {
      const all = [{ wall: a, dir: da }, ...ends];
      let through: [WallLine, WallLine] | undefined;
      let weight = -Infinity;
      all.forEach((first, i) => all.slice(i + 1).forEach((second) => {
        const total = first.wall.half + second.wall.half;
        if (dot(first.dir, second.dir) < -.9999 && total > weight + 1e-9) {
          through = [first.wall, second.wall];
          weight = total;
        }
      }));
      return through && !through.includes(a) ? cut(through[0], through[0].start, through[0].dir, false) : SQUARE;
    }
    let best: WallLine | undefined;
    let bestOffset = Infinity;
    for (const b of others) {
      const delta = minus(p, b.start);
      const along = dot(delta, b.dir);
      const offset = Math.abs(cross(b.dir, delta));
      if (along <= tolerance || along >= b.length - tolerance || offset > b.half + gap || Math.abs(cross(da, b.dir)) < 1e-6) continue;
      if (offset < bestOffset) {
        best = b;
        bestOffset = offset;
      }
    }
    return best ? cut(best, best.start, best.dir, false) : SQUARE;
  }
  return new Map(walls.map((wall) => [wall.id, { start: resolve(wall, true), end: resolve(wall, false) }]));
}

/** Corners in winding order, applying end cuts only at full wall endpoints. */
export function wallSpanCorners(wall: WallLine, start: number, end: number, joins?: WallEnds): Point[] {
  const normal = perp(wall.dir);
  let [sl, sr] = start === 0 ? joins?.start ?? SQUARE : SQUARE;
  let [el, er] = end === 1 ? joins?.end ?? SQUARE : SQUARE;
  const span = (end - start) * wall.length;
  if (sl + er >= span) { sl = 0; er = 0; }
  if (sr + el >= span) { sr = 0; el = 0; }
  const point = (t: number, side: number) => plus(plus(wall.start, wall.dir, t), normal, side * wall.half);
  return [
    point(start * wall.length + sr, -1), point(end * wall.length - el, -1),
    point(end * wall.length - er, 1), point(start * wall.length + sl, 1),
  ];
}
