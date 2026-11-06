import type { CableElement, RoadElement, TrackElement } from '../../types';
import { prism, rod, type EquipmentPart } from './equipmentPreviewGeometry';
import { DOLLY_TRACK, dollyTrackGaugeMm } from './dollyTrackDimensions';

interface Sample { x: number; y: number; nx: number; ny: number }

/** Match the plan's quadratic centre line; dimensions and output are in mm. */
export function samplePreviewPath(element: TrackElement | RoadElement, scale: number): Sample[] {
  const dx = element.x2 - element.x;
  const dy = element.y2 - element.y;
  const length = Math.hypot(dx, dy);
  if (![length, scale].every(Number.isFinite) || length < .001 || scale <= 0) return [];
  const offset = element.isCurved ? element.curveOffset || 60 : 0;
  const cx = (element.x + element.x2) / 2 - dy / length * offset;
  const cy = (element.y + element.y2) / 2 + dx / length * offset;
  const steps = Math.max(1, Math.min(96, Math.ceil((length + Math.abs(offset)) * scale / 300)));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const tx = 2 * (1 - t) * (cx - element.x) + 2 * t * (element.x2 - cx);
    const ty = 2 * (1 - t) * (cy - element.y) + 2 * t * (element.y2 - cy);
    const tangent = Math.hypot(tx, ty);
    return {
      x: ((1 - t) ** 2 * element.x + 2 * (1 - t) * t * cx + t * t * element.x2) * scale,
      y: ((1 - t) ** 2 * element.y + 2 * (1 - t) * t * cy + t * t * element.y2) * scale,
      nx: -ty / tangent, ny: tx / tangent,
    };
  });
}

export function pathAssetPreview(element: TrackElement | RoadElement | CableElement, scale: number): EquipmentPart[] {
  if (element.type === 'cable') {
    const points = [{ x: element.x, y: element.y }, ...(element.path ?? []), { x: element.x2, y: element.y2 }];
    return points.slice(1).flatMap((to, i) => {
      const from = points[i];
      if (![from.x, from.y, to.x, to.y].every(Number.isFinite) || Math.hypot(to.x - from.x, to.y - from.y) < .001) return [];
      return [rod([from.x * scale, from.y * scale, 12], [to.x * scale, to.y * scale, 12], 24, element.color ?? '#d7a348')];
    });
  }
  const samples = samplePreviewPath(element, scale);
  const track = element.type === 'track' || element.surface === 'rail';
  const gauge = element.type === 'track' ? dollyTrackGaugeMm(scale) : element.width * scale * .65;
  const parts: EquipmentPart[] = [];
  if (track) {
    for (const p of samples) parts.push(rod([p.x - p.nx * (gauge / 2 + 100), p.y - p.ny * (gauge / 2 + 100), 25],
      [p.x + p.nx * (gauge / 2 + 100), p.y + p.ny * (gauge / 2 + 100), 25], 50, '#6b6257'));
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      for (const side of [-1, 1]) parts.push(rod([a.x + a.nx * gauge / 2 * side, a.y + a.ny * gauge / 2 * side, DOLLY_TRACK.railCentreHeightMm],
        [b.x + b.nx * gauge / 2 * side, b.y + b.ny * gauge / 2 * side, DOLLY_TRACK.railCentreHeightMm], DOLLY_TRACK.railDiameterMm, '#a2adb6'));
    }
  }
  if (element.type === 'road') {
    const width = element.width * scale;
    if (!Number.isFinite(width) || width <= 0) return [];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      // Explicit rings keep curved strips joined without gaps or overlapping kerbs.
      const band = (inner: number, outer: number, bottom: number, top: number, color: string): EquipmentPart => ({
        color, corners: [bottom, top].flatMap(z => [
          { x: a.x + a.nx * inner, y: a.y + a.ny * inner, z },
          { x: b.x + b.nx * inner, y: b.y + b.ny * inner, z },
          { x: b.x + b.nx * outer, y: b.y + b.ny * outer, z },
          { x: a.x + a.nx * outer, y: a.y + a.ny * outer, z },
        ]),
      });
      parts.push(band(-width / 2, width / 2, -40, -5, element.color ?? (element.surface === 'dirt' ? '#77634b' : '#515761')));
      if (element.sidewalks) {
        const pavement = (element.sidewalkWidth ?? element.width * .15) * scale;
        parts.push(band(-width / 2 - pavement, -width / 2, -40, 100, '#a7adb3'), band(width / 2, width / 2 + pavement, -40, 100, '#a7adb3'));
      }
      if (element.marking && element.marking !== 'none' && (!track)) {
        if (element.marking !== 'dashed' || i % 2) parts.push(prism([a.x, a.y, 0], [b.x, b.y, 0], [70, 3], [70, 3], '#e7dfbf'));
      }
    }
  }
  return parts;
}
