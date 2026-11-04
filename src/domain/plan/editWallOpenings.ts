import type { DoorElement, FloorPlanElement, GridSettings, PlanLayer, WallElement, WindowElement } from '../../types';
import { findNearestWall } from '../../utils/geometry';
import { planUnitsPerMm } from './straightWallJoins';
import { wallAxis } from './wallDimensions';
import { resolveWallOpenings } from './wallOpenings';

type Opening = DoorElement | WindowElement;

// Port of ConstructCAD place_hosted's end clearance (10 mm per jamb).
// cc_engine/src/commands/create.rs at e9978dd4d9a5158c1ae4bd2b237a0a48df657aea.
export const HOST_CLEARANCE_MM = 10;

export function fitOpeningOnWall(wall: WallElement, kind: Opening['type'], width: number, center: number, reversed = false, margin = 0) {
  const { dx, dy, length } = wallAxis(wall);
  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(center) || width <= 0 || length < width + 2 * margin) return null;
  const half = width / 2;
  const clamped = Math.max(half + margin, Math.min(center, length - half - margin));
  const along = kind === 'door' ? clamped + (reversed ? half : -half) : clamped;
  return {
    x: wall.x + dx * along / length,
    y: wall.y + dy * along / length,
    rotation: ((Math.atan2(dy, dx) * 180 / Math.PI) + (reversed ? 180 : 0) + 360) % 360,
  };
}

export function snapOpeningToWall(
  point: { x: number; y: number },
  walls: WallElement[],
  kind: Opening['type'],
  threshold: number,
  existing?: Opening,
  grid?: GridSettings,
) {
  const width = existing?.width || (kind === 'door' ? 60 : 100);
  const margin = grid ? HOST_CLEARANCE_MM * planUnitsPerMm(grid) : 0;
  const candidates = walls.filter((wall) => wallAxis(wall).length >= width + 2 * margin);
  // Keep the saved wall when two wall axes are equally close.
  const currentHost = candidates.findIndex((wall) => wall.id === existing?.hostWallId);
  if (currentHost > 0) candidates.unshift(...candidates.splice(currentHost, 1));
  const match = findNearestWall(point, candidates, threshold);
  const wall = candidates.find((candidate) => candidate.id === match?.wallId);
  if (!match || !wall) return null;

  const { dx, dy } = wallAxis(wall);
  const radians = (existing?.rotation ?? match.angle) * Math.PI / 180;
  const reversed = dx * Math.cos(radians) + dy * Math.sin(radians) < 0;
  const offset = Math.hypot(match.point.x - wall.x, match.point.y - wall.y);
  const center = offset + (existing && kind === 'door' ? width / 2 * (reversed ? -1 : 1) : 0);
  const pose = fitOpeningOnWall(wall, kind, width, center, reversed, margin);
  return pose ? { ...match, point: { x: pose.x, y: pose.y }, angle: pose.rotation } : null;
}

/** Keep inferred hosts together through a wall edit, in the same undo step. */
export function moveWallOpenings(
  before: FloorPlanElement[], after: FloorPlanElement[], layers?: PlanLayer[],
): FloorPlanElement[] {
  const nextWalls = new Map(after.filter((element) => element.type === 'wall').map((wall) => [wall.id, wall]));
  const walls = before.filter((element) => element.type === 'wall');
  const movedWalls = walls.filter((wall) => {
    const next = nextWalls.get(wall.id);
    return next && (next.x !== wall.x || next.y !== wall.y || next.x2 !== wall.x2 || next.y2 !== wall.y2);
  });
  if (!movedWalls.length) return after;

  const lockedLayers = new Set(layers?.filter((layer) => layer.locked).map((layer) => layer.id));
  const openings = before.filter((element) => element.type === 'door' || element.type === 'window');
  const byWall = resolveWallOpenings(walls, openings);
  const originals = new Map(openings.map((opening) => [opening.id, opening]));
  const moved = new Map<string, ReturnType<typeof fitOpeningOnWall>>();
  for (const wall of movedWalls) {
    const next = nextWalls.get(wall.id);
    if (!next) continue;
    const { dx, dy, length } = wallAxis(wall);
    for (const cut of byWall.get(wall.id) ?? []) {
      const opening = originals.get(cut.elementId);
      if (!opening || opening.locked || lockedLayers.has(opening.layerId ?? '')) continue;
      const radians = opening.rotation * Math.PI / 180;
      const reversed = dx * Math.cos(radians) + dy * Math.sin(radians) < 0;
      const width = opening.width || (opening.type === 'door' ? 60 : 100);
      moved.set(opening.id, fitOpeningOnWall(next, opening.type, width, (cut.start + cut.end) * length / 2, reversed));
    }
  }
  return after.map((element) => {
    const pose = moved.get(element.id);
    return pose && originals.get(element.id) === element ? { ...element, ...pose } : element;
  });
}

/** Deleting a wall leaves its openings on the plan as free-standing items. */
export function clearMissingWallHosts(elements: FloorPlanElement[]): FloorPlanElement[] {
  const walls = new Set(elements.filter((element) => element.type === 'wall').map((wall) => wall.id));
  return elements.map((element) =>
    (element.type === 'door' || element.type === 'window') && element.hostWallId && !walls.has(element.hostWallId)
      ? { ...element, hostWallId: null }
      : element,
  );
}

/** Copies retain an attachment only when the host is copied with them. */
export function remapCopiedWallHosts(elements: FloorPlanElement[], ids: ReadonlyMap<string, string>): FloorPlanElement[] {
  return elements.map((element) => {
    if ((element.type === 'door' || element.type === 'window') && element.hostWallId) {
      return { ...element, hostWallId: ids.get(element.hostWallId) ?? null };
    }
    return element;
  });
}
