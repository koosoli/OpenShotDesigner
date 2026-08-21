import type { BackgroundImage, BackgroundImageCalibration, GridSettings, Vector2D } from '../../types';

export interface BackgroundCalibrationResult {
  updates: Pick<BackgroundImage, 'x' | 'y' | 'width' | 'height' | 'calibration'>;
  desiredCanvasPixels: number;
}

const METERS_PER_FOOT = 0.3048;

export const convertCalibrationLength = (
  length: number,
  from: 'm' | 'ft',
  to: 'm' | 'ft',
): number => {
  if (from === to) return length;
  return from === 'ft' ? length * METERS_PER_FOOT : length / METERS_PER_FOOT;
};

/**
 * Scale a reference image so a marked two-point distance equals a known
 * real-world distance on the current canvas grid. The first mark remains
 * anchored in place so calibration does not make the reference jump away.
 */
export const calibrateBackgroundImage = (
  image: BackgroundImage,
  firstPoint: Vector2D,
  secondPoint: Vector2D,
  realLength: number,
  unit: 'm' | 'ft',
  grid: GridSettings,
  calibratedAt: string,
): BackgroundCalibrationResult | null => {
  const measuredCanvasPixels = Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y);
  if (
    !Number.isFinite(measuredCanvasPixels) || measuredCanvasPixels < 2 ||
    !Number.isFinite(realLength) || realLength <= 0 ||
    !Number.isFinite(grid.pixelsPerUnit) || grid.pixelsPerUnit <= 0 ||
    !Number.isFinite(image.width) || image.width <= 0 ||
    !Number.isFinite(image.height) || image.height <= 0
  ) return null;

  const lengthInGridUnits = convertCalibrationLength(realLength, unit, grid.unit);
  const desiredCanvasPixels = lengthInGridUnits * grid.pixelsPerUnit;
  const appliedScaleFactor = desiredCanvasPixels / measuredCanvasPixels;
  if (!Number.isFinite(appliedScaleFactor) || appliedScaleFactor <= 0) return null;

  const firstPointFractionX = (firstPoint.x - image.x) / image.width;
  const firstPointFractionY = (firstPoint.y - image.y) / image.height;
  const width = image.width * appliedScaleFactor;
  const height = image.height * appliedScaleFactor;
  const calibration: BackgroundImageCalibration = {
    realLength,
    unit,
    measuredCanvasPixels,
    appliedScaleFactor,
    gridUnitAtCalibration: grid.unit,
    pixelsPerUnitAtCalibration: grid.pixelsPerUnit,
    calibratedAt,
  };

  return {
    desiredCanvasPixels,
    updates: {
      x: firstPoint.x - firstPointFractionX * width,
      y: firstPoint.y - firstPointFractionY * height,
      width,
      height,
      calibration,
    },
  };
};
