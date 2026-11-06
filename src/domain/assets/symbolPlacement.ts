import type { GridSettings } from '../../types';
import { convertLength } from '../units';
import type { PlanSymbolDefinition } from './symbolTypes';

/** Convert the library's physical footprint to the calibrated plan coordinates. */
export function symbolPlacementSize(symbol: PlanSymbolDefinition, grid: GridSettings) {
  const { widthMm, depthMm } = symbol.defaultPhysicalSize ?? {};
  const mmPerUnit = convertLength(1, grid.unit, 'mm');
  if (![grid.pixelsPerUnit, mmPerUnit].every((value) => Number.isFinite(value) && value > 0)) return null;
  if (widthMm === undefined || depthMm === undefined || ![widthMm, depthMm].every((value) => Number.isFinite(value) && value > 0)) return null;
  return { width: widthMm / mmPerUnit * grid.pixelsPerUnit, height: depthMm / mmPerUnit * grid.pixelsPerUnit };
}
