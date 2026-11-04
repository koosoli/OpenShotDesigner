import type { DoorElement, WallElement, WindowElement } from '../../types';
import { wallAxis } from './wallDimensions';

type OpeningElement = DoorElement | WindowElement;

export interface WallOpening {
  elementId: string;
  kind: OpeningElement['type'];
  /** Fractional distances along the wall centerline, from its first endpoint. */
  start: number;
  end: number;
}

interface WallSpan {
  start: number;
  end: number;
}

// The legacy snap tool rounds the wall angle to whole degrees.
const ANGLE_TOLERANCE = Math.sin(Math.PI / 180);
const CENTERLINE_TOLERANCE = 0.5;

/**
 * Derive horizontal openings from the saved, snapped plan positions. Legacy
 * doors are anchored at their first jamb, while windows are centered.
 * Heights and sill elevations are absent from the legacy model.
 */
export function resolveWallOpenings(
  walls: readonly WallElement[],
  elements: readonly OpeningElement[],
  requireUnambiguous = false,
): Map<string, WallOpening[]> {
  const axes = walls.map((wall) => {
    const { dx, dy, length } = wallAxis(wall);
    return { wall, length, ux: dx / length, uy: dy / length };
  }).filter(({ length }) => length > 0);

  const openingsByWall = new Map<string, WallOpening[]>();
  for (const element of elements) {
    if (element.hostWallId === null) continue;
    let ambiguous = false;
    const width = element.width || (element.type === 'door' ? 60 : 100);
    if (!Number.isFinite(width) || width <= 0) continue;

    const radians = (element.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    let closest = CENTERLINE_TOLERANCE;
    let match: { wallId: string; opening: WallOpening } | undefined;

    for (const { wall, length, ux, uy } of axes) {
      if (element.hostWallId !== undefined && wall.id !== element.hostWallId) continue;
      if (Math.abs(ux * sin - uy * cos) > ANGLE_TOLERANCE) continue;
      const dx = element.x - wall.x;
      const dy = element.y - wall.y;
      const distance = Math.abs(dx * uy - dy * ux);
      if (distance >= CENTERLINE_TOLERANCE || (!requireUnambiguous && distance >= closest)) continue;

      const anchor = dx * ux + dy * uy;
      const projectedWidth = width * (ux * cos + uy * sin);
      const first = element.type === 'door' ? anchor : anchor - projectedWidth / 2;
      const last = first + projectedWidth;
      const start = Math.min(first, last);
      const end = Math.max(first, last);
      if (start < -CENTERLINE_TOLERANCE || end > length + CENTERLINE_TOLERANCE) continue;

      if (match && requireUnambiguous) {
        ambiguous = true;
        break;
      }
      closest = distance;
      match = {
        wallId: wall.id,
        opening: {
          elementId: element.id,
          kind: element.type,
          start: Math.max(0, start / length),
          end: Math.min(1, end / length),
        },
      };
    }

    if (match && !ambiguous) {
      const openings = openingsByWall.get(match.wallId) ?? [];
      openings.push(match.opening);
      openingsByWall.set(match.wallId, openings);
    }
  }
  return openingsByWall;
}

/** The complement of the union of the opening intervals. */
export function solidWallSpans(openings: readonly WallSpan[]): WallSpan[] {
  const spans: WallSpan[] = [];
  let cursor = 0;
  for (const { start, end } of [...openings].sort((a, b) => a.start - b.start)) {
    if (start > cursor) spans.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < 1) spans.push({ start: cursor, end: 1 });
  return spans;
}
