import type { FloorPlanElement, GridSettings, PlanLayer } from '../../types';
import { buildPlanArchitecture, PREVIEW_DIMENSIONS_MM } from './planArchitecture';
import { previewOpening } from './openingPreview';
import type { PreviewSolid } from './assetPreview';
import { resolveStraightWallJoins, wallSpanCorners } from './straightWallJoins';
import { solidWallSpans } from './wallOpenings';

export function buildWallPreview(
  elements: readonly FloorPlanElement[],
  layers: readonly PlanLayer[] | undefined,
  grid: GridSettings,
  includeOpeningPanels = false,
): PreviewSolid[] {
  const architecture = buildPlanArchitecture(elements, layers, grid);
  const { wallHeight, doorHeight, windowSill, windowHead } = PREVIEW_DIMENSIONS_MM;

  const walls = architecture?.walls ?? [];
  const lines = walls.map(({ id, start, end, lengthMm, thicknessMm }) => ({
    id, start, end, length: lengthMm, half: thicknessMm / 2,
    dir: { x: (end.x - start.x) / lengthMm, y: (end.y - start.y) / lengthMm },
  }));
  const joins = resolveStraightWallJoins(lines);
  return walls.flatMap((wall, wallIndex) => {
    const cuts = wall.openings;
    const stops = [...new Set([0, 1, ...cuts.flatMap(({ start, end }) => [start, end])])].sort((a, b) => a - b);

    const solids = stops.slice(1).flatMap((end, index) => {
      const start = stops[index];
      const verticalCuts = cuts.filter((cut) => cut.start < end && cut.end > start).map((cut) => ({
        start: cut.kind === 'door' ? 0 : windowSill / wallHeight,
        end: (cut.kind === 'door' ? doorHeight : windowHead) / wallHeight,
      }));
      const corners = wallSpanCorners(lines[wallIndex], start, end, joins.get(wall.id));
      return solidWallSpans(verticalCuts).map(({ start: bottom, end: top }) => ({
        wallId: wall.id,
        color: wall.color,
        corners: [bottom, top].flatMap((height) => corners.map(({ x, y }) => ({ x, y, z: height * wallHeight }))),
      }));
    });
    return includeOpeningPanels
      ? [...solids, ...cuts.flatMap((opening) => previewOpening(wall, opening, architecture?.doorsById.get(opening.elementId)))]
      : solids;
  });
}

function prismFaces(sides: number): number[][] {
  const top = Array.from({ length: sides }, (_, index) => sides + index);
  const walls = top.map((_, index) => {
    const next = (index + 1) % sides;
    return [index, next, sides + next, sides + index];
  });
  // Equipment prisms can face sideways or slope, exposing either cap.
  return [top, ...walls, top.map((index) => index - sides).reverse()];
}

export function projectWallPreview(solids: readonly PreviewSolid[], angleDegrees: number, tiltDegrees = 36) {
  if (solids.length === 0) return null;
  const angle = angleDegrees * Math.PI / 180;
  const tilt = tiltDegrees * Math.PI / 180;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const faces = solids.flatMap(({ wallId, corners, color }, solidIndex) => {
    const projected = corners.map(({ x, y, z }) => {
      const along = x * Math.sin(angle) + y * Math.cos(angle);
      const px = x * Math.cos(angle) - y * Math.sin(angle);
      const py = along * Math.sin(tilt) - z * Math.cos(tilt);
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
      return { x: px, y: py, depth: along * Math.cos(tilt) + z * Math.sin(tilt) };
    });
    return prismFaces(corners.length / 2).flatMap((indices, faceIndex) => {
      const points = indices.map((index) => projected[index]);
      const area = points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + point.x * next.y - point.y * next.x;
      }, 0);
      if (area <= 0) return [];
      return [{
        key: `${wallId}-${solidIndex}-${faceIndex}`,
        points: points.map(({ x, y }) => `${x},${y}`).join(' '),
        depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length,
        color,
        shade: faceIndex === 0 ? 0 : faceIndex % 2 ? 0.24 : 0.11,
      }];
    });
  });
  const padding = Math.max(maxX - minX, maxY - minY) * 0.09;
  const viewBox = [minX - padding, minY - padding, maxX - minX + 2 * padding, maxY - minY + 2 * padding].join(' ');
  return { faces: faces.sort((a, b) => a.depth - b.depth), viewBox };
}
