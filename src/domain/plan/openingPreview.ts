import type { DoorElement } from '../../types';
import type { PreviewSolid } from './assetPreview';
import type { ArchitectureWall } from './planArchitecture';
import type { WallOpening } from './wallOpenings';

/** Schematic panels using the same hosted opening intervals as the wall cut. */
export function previewOpening(wall: ArchitectureWall, opening: WallOpening & { bottom: number; top: number }, door?: DoorElement): PreviewSolid[] {
  const ux = (wall.end.x - wall.start.x) / wall.lengthMm;
  const uy = (wall.end.y - wall.start.y) / wall.lengthMm;
  const width = (opening.end - opening.start) * wall.lengthMm;
  const isDoor = opening.kind === 'door';
  const reversed = door && ux * Math.cos(door.rotation * Math.PI / 180) + uy * Math.sin(door.rotation * Math.PI / 180) < 0;
  const hingeAtEnd = (door?.swingDirection === 'right') !== Boolean(reversed);
  const pivot = (isDoor && hingeAtEnd ? opening.end : opening.start) * wall.lengthMm;
  const angle = door?.isOpen !== false && door
    ? (door.swingAngle || 90) * Math.PI / 180 * (hingeAtEnd ? -1 : 1) * (reversed ? -1 : 1) * (door.flipSide ? -1 : 1)
    : 0;
  const x = wall.start.x + ux * pivot;
  const y = wall.start.y + uy * pivot;
  const dx = ux * Math.cos(angle) - uy * Math.sin(angle);
  const dy = ux * Math.sin(angle) + uy * Math.cos(angle);
  const thickness = isDoor ? 40 : 16;
  const lo = isDoor && hingeAtEnd ? -width : 0;
  const hi = lo + width;
  return [{
    wallId: opening.elementId,
    color: isDoor ? '#a47148' : '#7dd3fc',
    corners: [opening.bottom, opening.top].flatMap((z) =>
      [[lo, -thickness / 2], [hi, -thickness / 2], [hi, thickness / 2], [lo, thickness / 2]].map(([u, v]) =>
        ({ x: x + dx * u - dy * v, y: y + dy * u + dx * v, z }))),
  }];
}
