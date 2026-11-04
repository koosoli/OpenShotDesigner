import type { FloorPlanElement, GridSettings, PlanLayer } from '../../types';
import { getSymbolById } from '../assets';
import { diningFurnitureLayout, FURNITURE_MODELS, getFurnitureModel } from '../assets/furnitureModels';
import { convertLength } from '../units';

export interface PreviewSolid {
  wallId: string;
  color: string;
  corners: { x: number; y: number; z: number }[];
}

const BOX_RIM = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const ROUND_RIM = Array.from({ length: 24 }, (_, index) => {
  const angle = index * 2 * Math.PI / 24;
  return [Math.cos(angle), Math.sin(angle)];
});

/** Simple massing models. Vertical sizes without source data are illustrative. */
export function buildAssetPreview(elements: FloorPlanElement[], layers: PlanLayer[] | undefined, grid: GridSettings): PreviewSolid[] {
  const scale = convertLength(1, grid.unit, 'mm') / grid.pixelsPerUnit;
  if (!Number.isFinite(scale) || scale <= 0) return [];
  const hidden = new Set(layers?.filter((layer) => !layer.visible).map((layer) => layer.id));
  return elements.flatMap((element) => {
    if (element.visible === false || hidden.has(element.layerId ?? '') || ![element.x, element.y, element.rotation].every(Number.isFinite)) return [];
    const angle = element.rotation * Math.PI / 180;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const box = (
      width: number, depth: number, bottom: number, top: number, color: string,
      offsetX = 0, offsetY = 0, round = false, heading = 0,
    ): PreviewSolid => {
      const rim = round ? ROUND_RIM : BOX_RIM;
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      return {
        wallId: element.id,
        color,
        corners: [bottom, top].flatMap((z) =>
          rim.map(([a, b]) => {
            const localX = a * width / 2;
            const localY = b * depth / 2;
            const u = localX * cos - localY * sin + offsetX;
            const v = localX * sin + localY * cos + offsetY;
            return { x: element.x * scale + u * c - v * s, y: element.y * scale + u * s + v * c, z };
          })),
      };
    };
    switch (element.type) {
      case 'actor': {
        const sourceHeight = element.heightCm;
        const height = sourceHeight && Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight * 10 : 1750;
        const hip = height * (element.isStanding ? .49 : .27);
        const shoulder = hip + height * .35;
        return [
          box(140, 180, 0, hip, '#334155', -85),
          box(140, 180, 0, hip, '#334155', 85),
          box(390, 230, hip, shoulder, element.color || '#38bdf8'),
          box(200, 205, shoulder, shoulder + height * .16, '#e0ac86'),
        ];
      }
      case 'prop':
      case 'shape': {
        const symbol = element.type === 'shape' && element.symbolId ? getSymbolById(element.symbolId) : undefined;
        const width = Math.max(20, (element.width || 20) * scale);
        const depth = Math.max(20, (element.height || 20) * scale);
        const color = element.color || '#818cf8';
        const propType = element.type === 'prop' ? element.propType : undefined;
        const diningKind = propType ?? symbol?.id;
        if (diningKind === 'table_round' || diningKind === 'dining_set' ||
          diningKind === 'arch.dining-table' || diningKind === 'arch.conference-table') {
          return diningFurnitureLayout(diningKind, width, depth, scale).flatMap((placement) => {
            const model = FURNITURE_MODELS[placement.model];
            const scaleX = placement.width / model.width;
            const scaleY = placement.depth / model.depth;
            const heading = placement.rotation * Math.PI / 180;
            const cos = Math.cos(heading);
            const sin = Math.sin(heading);
            return model.boxes.map((piece) => {
              const x = piece.offsetX * scaleX;
              const y = piece.offsetY * scaleY;
              return box(
                piece.width * scaleX, piece.depth * scaleY, piece.bottom, piece.top,
                piece.color ?? placement.color ?? color,
                placement.x + x * cos - y * sin, placement.y + x * sin + y * cos, piece.round, heading,
              );
            });
          });
        }
        const model = getFurnitureModel(propType, symbol?.id);
        if (model) {
          const scaleX = width / model.width;
          const scaleY = depth / model.depth;
          return model.boxes.map((piece) => box(
            piece.width * scaleX, piece.depth * scaleY, piece.bottom, piece.top, piece.color ?? color,
            piece.offsetX * scaleX, piece.offsetY * scaleY, piece.round,
          ));
        }
        return [box(width, depth, 0, element.type === 'shape' && !symbol ? 30 : 720, color)];
      }
      case 'camera':
        return [box(490, 430, 0, 1300, '#334155'), box(360, 250, 1300, 1550, '#38bdf8')];
      case 'light':
        return [box(330, 330, 0, 1550, '#475569'), box(420, 310, 1550, 1860, element.rgbColor || '#fbbf24')];
      default:
        return [];
    }
  });
}
