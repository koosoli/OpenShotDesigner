import type { DoorElement, FloorPlanElement, GridSettings, PlanLayer } from '../../types';
import { convertLength } from '../units';
import { resolveWallOpenings, type WallOpening } from './wallOpenings';

type PlanPointMm = { x: number; y: number };
export interface ArchitectureWall {
  id: string;
  start: PlanPointMm;
  end: PlanPointMm;
  lengthMm: number;
  thicknessMm: number;
  color: string;
  openings: WallOpening[];
}

export function buildPlanArchitecture(
  elements: readonly FloorPlanElement[],
  layers: readonly PlanLayer[] | undefined,
  grid: GridSettings,
) {
  if (!Number.isFinite(grid.pixelsPerUnit) || grid.pixelsPerUnit <= 0) return null;
  const hiddenLayers = new Set(layers?.filter((layer) => !layer.visible).map((layer) => layer.id));
  const visible = elements.filter((element) => element.visible !== false && !hiddenLayers.has(element.layerId ?? ''));
  const walls = visible.filter((element) => element.type === 'wall');
  const openings = visible.filter((element) => element.type === 'door' || element.type === 'window');
  const doorsById = new Map<string, DoorElement>(openings.filter((element) => element.type === 'door').map((door) => [door.id, door]));
  const openingsByWall = resolveWallOpenings(walls, openings);
  const mmPerPlanUnit = convertLength(1, grid.unit, 'mm') / grid.pixelsPerUnit;

  const architectureWalls: ArchitectureWall[] = walls.flatMap((wall) => {
    const start = { x: wall.x * mmPerPlanUnit, y: wall.y * mmPerPlanUnit };
    const end = { x: (wall.x2 ?? wall.x + 200) * mmPerPlanUnit, y: (wall.y2 ?? wall.y) * mmPerPlanUnit };
    const lengthMm = Math.hypot(end.x - start.x, end.y - start.y);
    const thicknessMm = (wall.thickness || 12) * mmPerPlanUnit;
    if (!Number.isFinite(lengthMm) || lengthMm <= 0 || !Number.isFinite(thicknessMm) || thicknessMm <= 0) return [];
    return [{ id: wall.id, start, end, lengthMm, thicknessMm, color: wall.wallColor || '#64748b', openings: openingsByWall.get(wall.id) ?? [] }];
  });
  return { walls: architectureWalls, doorsById, openingCount: openings.length };
}

// Saved legacy plans omit elevation. These are assumptions for preview and CAD handoff only.
export const PREVIEW_DIMENSIONS_MM = {
  wallHeight: 2700,
  doorHeight: 2100,
  windowSill: 900,
  windowHead: 2100,
};
