import type { SensorFormat } from '../../types';
import { SENSOR_SIZES, calculateFovAngle } from '../../utils/geometry';

export interface OpticalSetting {
  focalLength: number;
  sensorFormat: SensorFormat;
}

export interface OpticalComparison {
  previousFov: number;
  currentFov: number;
  previousWidthPercent: number;
  currentWidthPercent: number;
  /** Current horizontal scene width divided by previous horizontal scene width. */
  fieldWidthRatio: number;
  /** Current subject magnification divided by previous subject magnification. */
  magnificationRatio: number;
  direction: 'wider' | 'tighter' | 'same';
}

export interface LivePreviewFraming {
  /** CSS/source crop scale. One means the complete device feed is visible. */
  scale: number;
  /** A wider virtual lens cannot reveal pixels outside the physical device feed. */
  sourceLimited: boolean;
}

/**
 * Compare framing at the same camera position and focus distance.
 * Horizontal scene width is proportional to sensor width / focal length, so
 * this remains exact for the relative frame without inventing a distance.
 */
export const compareOpticalFraming = (
  previous: OpticalSetting,
  current: OpticalSetting,
): OpticalComparison => {
  const previousSpan = SENSOR_SIZES[previous.sensorFormat].width / Math.max(1, previous.focalLength);
  const currentSpan = SENSOR_SIZES[current.sensorFormat].width / Math.max(1, current.focalLength);
  const widest = Math.max(previousSpan, currentSpan);
  const fieldWidthRatio = currentSpan / previousSpan;
  return {
    previousFov: calculateFovAngle(previous.focalLength, previous.sensorFormat),
    currentFov: calculateFovAngle(current.focalLength, current.sensorFormat),
    previousWidthPercent: (previousSpan / widest) * 100,
    currentWidthPercent: (currentSpan / widest) * 100,
    fieldWidthRatio,
    magnificationRatio: previousSpan / currentSpan,
    direction: Math.abs(fieldWidthRatio - 1) < 0.001 ? 'same' : fieldWidthRatio > 1 ? 'wider' : 'tighter',
  };
};

/**
 * Translate an optical change into a centre crop for a real device feed.
 * The feed at camera start is the calibration reference. Tighter virtual
 * optics can be represented exactly by cropping; wider optics are clamped to
 * the pixels the phone/webcam actually supplies.
 */
export const calculateLivePreviewFraming = (
  reference: OpticalSetting,
  current: OpticalSetting,
): LivePreviewFraming => {
  const magnification = compareOpticalFraming(reference, current).magnificationRatio;
  return {
    scale: Math.max(1, Math.min(8, magnification)),
    sourceLimited: magnification < 1,
  };
};
