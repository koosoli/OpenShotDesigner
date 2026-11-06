import type { CameraRigType } from '../../types';
import { block, rod, stand, type EquipmentPart } from './equipmentPreviewGeometry';
import { DOLLY_TRACK } from './dollyTrackDimensions';

/** Generic rig silhouettes in mm; camera height continues to set the lens placement. */
export function cameraRigPreview(rig: CameraRigType | undefined, height: number, trackGaugeMm = 600): EquipmentPart[] | undefined {
  const metal = '#8795a4';
  const dark = '#35414f';
  if (rig === 'Dana Dolly') {
    const halfGauge = trackGaugeMm / 2;
    const wheelZ = DOLLY_TRACK.railCentreHeightMm + DOLLY_TRACK.railDiameterMm / 2 + DOLLY_TRACK.wheelRadiusMm;
    return [
      // Eight track wheels in four bogies: tread centres align with the two
      // separately drawn rails. The dolly carries no elevated slider rails.
      ...[-280, 280].flatMap(x => [-1, 1].flatMap(side => [-50, 50].map(offset =>
        rod([x + offset, side * halfGauge - 35, wheelZ], [x + offset, side * halfGauge + 35, wheelZ],
          DOLLY_TRACK.wheelRadiusMm * 2, '#252c35')))),
      ...[-280, 280].flatMap(x => [-1, 1].map(side => block(x, side * halfGauge, wheelZ + 55, 220, 95, 70, metal))),
      block(0, 0, wheelZ + 110, 850, trackGaugeMm + 180, 65, dark),
      block(0, 0, wheelZ + 175, 360, 300, 30, metal),
      rod([0, 0, wheelZ + 205], [0, 0, Math.max(wheelZ + 206, height - 25)], 120, metal),
      ...[-1, 1].map(side => rod([-360, side * (halfGauge + 25), wheelZ + 175], [-430, side * (halfGauge + 25), 850], 30, metal)),
      rod([-430, -halfGauge - 25, 850], [-430, halfGauge + 25, 850], 35, dark),
    ];
  }
  if (rig === 'Slider') {
    const length = 1200;
    const railHeight = Math.max(100, height - 300);
    return [
      ...[-length / 2 + 80, length / 2 - 80].flatMap(x => stand(railHeight - 35, 300, true).map(part => ({
        ...part, corners: part.corners.map(p => ({ ...p, x: p.x + x })),
      }))),
      ...[-180, 180].map(y => rod([-length / 2, y, railHeight], [length / 2, y, railHeight], 50, metal)),
      block(0, 0, railHeight + 25, 420, 460, 45, dark),
      ...[-140, 140].flatMap(x => [-180, 180].map(y => rod([x, y - 25, railHeight + 20], [x, y + 25, railHeight + 20], 80, '#252c35'))),
      rod([0, 0, railHeight + 70], [0, 0, height - 25], 90, metal),
    ];
  }
  if (rig === 'Jib / Crane' || rig === 'TechnoCrane') {
    const reach = rig === 'TechnoCrane' ? 3200 : 1900;
    const pivot = Math.max(400, height * .7);
    return [block(-reach * .5, 0, 120, 1000, 1000, 120, dark),
      ...[-reach * .5 - 400, -reach * .5 + 400].flatMap(x => [-400, 400].map(y => rod([x, y - 40, 100], [x, y + 40, 100], 200, '#252c35'))),
      rod([-reach * .5, 0, 240], [-reach * .5, 0, pivot], 180, metal),
      rod([-reach, 0, pivot * .75], [0, 0, height - 25], rig === 'TechnoCrane' ? 180 : 90, metal),
      block(-reach, 0, pivot * .75, 350, 450, 250, dark)];
  }
  return undefined;
}
