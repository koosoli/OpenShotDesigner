/** Match the existing 2D rails, whose centre lines are 24 plan pixels apart. */
export const DOLLY_TRACK = {
  gaugePlanPixels: 24,
  railCentreHeightMm: 65,
  railDiameterMm: 50,
  wheelRadiusMm: 80,
};

export function dollyTrackGaugeMm(mmPerPlanPixel: number): number {
  return DOLLY_TRACK.gaugePlanPixels * mmPerPlanPixel;
}
