import type { FloorPlanElement, GridSettings, PlanLayer } from '../../types';
import { getSymbolById } from '../assets';
import { diningFurnitureLayout, FURNITURE_MODELS, getFurnitureModel } from '../assets/furnitureModels';
import { convertLength } from '../units';
import { cameraPreview, cameraSymbolPreview } from './cameraPreview';
import type { EquipmentPart } from './equipmentPreviewGeometry';
import { lightPreview, lightingSymbolPreview } from './lightPreview';
import { aimedLightParts } from './lightAim';
import { vehiclePreview } from './vehiclePreview';
import { offerEquipmentPreview } from './offerEquipmentPreview';
import { productionAssetPreview } from './productionAssetPreview';
import { elementElevationMm } from './elevation';
import { pathAssetPreview } from './pathAssetPreview';
import { buildPlanArchitecture } from './planArchitecture';
import { dollyTrackGaugeMm } from './dollyTrackDimensions';

export interface PreviewSolid {
  wallId: string;
  emitting?: boolean;
  reflecting?: boolean;
  reflectingWall?: boolean;
  color: string;
  corners: { x: number; y: number; z: number }[];
}

const BOX_RIM = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const ROUND_RIM = Array.from({ length: 24 }, (_, index) => {
  const angle = index * 2 * Math.PI / 24;
  return [Math.cos(angle), Math.sin(angle)];
});

/**
 * Simple massing models. Vertical sizes without source data are illustrative.
 * `lightTiltDeg` is the scene's default beam tilt for lights with no stored tilt, so lamp heads
 * sit where their beams point.
 */
export function buildAssetPreview(elements: FloorPlanElement[], layers: PlanLayer[] | undefined, grid: GridSettings,
  options: { lightTiltDeg?: number } = {}): PreviewSolid[] {
  const scale = convertLength(1, grid.unit, 'mm') / grid.pixelsPerUnit;
  if (!Number.isFinite(scale) || scale <= 0) return [];
  const hidden = new Set(layers?.filter((layer) => !layer.visible).map((layer) => layer.id));
  const hostedOpenings = new Set(elements.some(e => e.type === 'door' || e.type === 'window')
    ? buildPlanArchitecture(elements, layers, grid)?.walls.flatMap(w => w.openings.map(o => o.elementId)) : []);
  return elements.flatMap((element) => {
    if (element.visible === false || hidden.has(element.layerId ?? '') || ![element.x, element.y, element.rotation].every(Number.isFinite)) return [];
    const angle = element.rotation * Math.PI / 180;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const place = (u: number, v: number, z: number) => ({
      x: element.x * scale + u * c - v * s, y: element.y * scale + u * s + v * c, z: z + elementElevationMm(element),
    });
    const placeEquipment = (parts: EquipmentPart[], scaleX = 1, scaleY = 1, facingUp = false): PreviewSolid[] => parts.map(({ color, corners, emitting, reflecting }) => ({
      emitting,
      reflecting,
      wallId: element.id,
      color,
      corners: corners.map(({ x, y, z }) => facingUp ? place(y * scaleX, -x * scaleY, z) : place(x * scaleX, y * scaleY, z)),
    }));
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
            return place(u, v, z);
          })),
      };
    };
    switch (element.type) {
      case 'door':
      case 'window': {
        // Hosted panels are already emitted by buildWallPreview. Detached ones
        // still need a model, rather than disappearing outside a wall.
        if (hostedOpenings.has(element.id)) return [];
        const model = productionAssetPreview(undefined, element.type === 'door' ? 'arch.single-door' : 'arch.window', '#a5b4c3');
        return model ? placeEquipment(model.parts, element.width * scale / model.footprint[0]) : [];
      }
      case 'track':
      case 'road':
      case 'cable':
        // Endpoint paths already use world coordinates, unlike local asset models.
        return pathAssetPreview(element, scale).map(part => ({ ...part, wallId: element.id,
          corners: part.corners.map(p => ({ ...p, z: p.z + elementElevationMm(element) })),
        }));
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
        const equipment = (symbol && (offerEquipmentPreview(symbol.id) ?? lightingSymbolPreview(symbol.id) ?? cameraSymbolPreview(symbol.id)))
          ?? vehiclePreview(propType, symbol?.id, color)
          ?? productionAssetPreview(propType, symbol?.id, color);
        if (equipment) {
          const { parts, footprint: [length, breadth], facingUp } = equipment;
          return placeEquipment(parts, width / (facingUp ? breadth : length), depth / (facingUp ? length : breadth), facingUp);
        }
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
        return placeEquipment(cameraPreview(element, dollyTrackGaugeMm(scale)));
      case 'light':
        return placeEquipment(aimedLightParts(element, lightPreview(element), options.lightTiltDeg ?? 0));
      default:
        return [];
    }
  });
}
