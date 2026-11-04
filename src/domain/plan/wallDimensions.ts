import type { GridSettings, WallElement } from '../../types';

export function wallAxis(wall: WallElement) {
  const dx = (wall.x2 ?? wall.x + 200) - wall.x;
  const dy = (wall.y2 ?? wall.y) - wall.y;
  return { dx, dy, length: Math.hypot(dx, dy) };
}

export function resizeWallToLength(wall: WallElement, grid: GridSettings, length: number) {
  const { dx, dy, length: currentLength } = wallAxis(wall);
  const targetLength = length * grid.pixelsPerUnit;
  if (!Number.isFinite(targetLength) || targetLength <= 0 || currentLength <= 0) return null;
  const factor = targetLength / currentLength;
  const x2 = wall.x + dx * factor;
  const y2 = wall.y + dy * factor;
  return Number.isFinite(x2) && Number.isFinite(y2) ? { x2, y2 } : null;
}

/** Snap a new wall endpoint to the interior axis of an existing wall. */
export function snapWallJunction(
  point: { x: number; y: number }, walls: WallElement[], threshold: number,
) {
  let nearest: { x: number; y: number } | null = null;
  let distance = threshold;
  for (const wall of walls) {
    const { dx, dy, length } = wallAxis(wall);
    if (length <= 0) continue;
    const t = ((point.x - wall.x) * dx + (point.y - wall.y) * dy) / (length * length);
    if (t <= 0 || t >= 1) continue;
    const projected = { x: wall.x + t * dx, y: wall.y + t * dy };
    const offset = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (offset < distance) {
      nearest = projected;
      distance = offset;
    }
  }
  return nearest;
}

/** Apply a typed length along the current wall cursor direction. */
export function wallEndpointAtLength(
  start: { x: number; y: number }, cursor: { x: number; y: number }, length: number, unitsPerDisplayUnit: number,
) {
  const dx = cursor.x - start.x;
  const dy = cursor.y - start.y;
  const distance = Math.hypot(dx, dy);
  const target = length * unitsPerDisplayUnit;
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(distance) || distance <= 0) return null;
  return { x: start.x + dx * target / distance, y: start.y + dy * target / distance };
}
