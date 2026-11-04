import type { CameraElement } from '../../types';
import { block, equipmentFinish, prism, rod, stand, type EquipmentPart, type EquipmentSymbol } from './equipmentPreviewGeometry';

const { shell, trim, metal, grip } = equipmentFinish;
const lensGlass = '#4e9aaf';
const rigHeight: Partial<Record<CameraElement['cameraHeight'], number>> = { Ground: 165, Knee: 540, Waist: 950, High: 1900 };

/** Generic cinema camera, with illustrative placement for the selected rig. */
export function cameraPreview(camera: Pick<CameraElement, 'rigType' | 'cameraHeight' | 'color'>): EquipmentPart[] {
  const rig = camera.rigType;
  const height = rigHeight[camera.cameraHeight] ?? (rig === 'Drone' ? 2050 : 1450);
  if (rig === 'Drone') {
    return [
      block(0, 0, height, 220, 125, 85, shell),
      block(90, 0, height - 65, 90, 90, 70, grip),
      rod([132, 0, height - 30], [154, 0, height - 30], 48, lensGlass),
      ...[-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [
        rod([0, 0, height + 30], [x * 165, y * 180, height + 30], 28, trim),
        rod([x * 165, y * 180, height + 28], [x * 165, y * 180, height + 60], 50, shell),
        block(x * 165, y * 180, height + 60, 180, 24, 10, metal),
      ])),
    ];
  }

  const pedestal = rig === 'Broadcast Pedestal';
  const matteBox = rig !== 'Handheld' && rig !== 'Gimbal' && rig !== 'Steadicam';
  const floating = rig === 'Handheld' || rig === 'Gimbal' || rig === 'Steadicam' || rig === 'Cable Cam' || rig === 'Car Mount';
  const front = pedestal ? 305 : 240;
  const axis = height + 86;
  const accent = /^#[\da-f]{6}$/i.test(camera.color) ? camera.color : '#38bdf8';
  const support = pedestal ? [
    block(0, 0, 55, 520, 480, 90, shell),
    rod([0, 0, 145], [0, 0, height], 118, trim),
    ...[-175, 175].flatMap((x) => [-165, 165].map((y) => rod([x, y, 0], [x, y, 66], 87, grip))),
  ] : floating ? [] : stand(height - 24, height < 300 ? 240 : 410, true);

  return [
    ...support,
    block(0, 0, height - 25, 270, 145, 25, trim),
    block(-35, 0, height, pedestal ? 420 : 290, pedestal ? 240 : 176, 177, shell),
    block(-210, 0, height + 12, 100, 145, 128, grip),
    block(-25, -89, height + 50, 145, 18, 75, trim),
    block(-55, 92, height + 75, 78, 12, 36, accent),
    block(-89, 0, height + 172, 36, 35, 52, trim),
    block(10, 0, height + 172, 36, 35, 52, trim),
    block(-38, 0, height + 220, 144, 36, 27, grip),
    block(-120, -64, height + 247, 62, 152, 80, grip),
    block(-152, -64, height + 257, 8, 125, 59, '#526f84'),
    rod([105, 0, axis], [front - 30, 0, axis], 132, grip),
    rod([front - 75, 0, axis], [front - 43, 0, axis], 144, trim),
    ...(matteBox ? [prism([front - 39, 0, axis], [front, 0, axis], [142, 126], [216, 162], grip)] : []),
    rod([front - 39, 0, axis], [front + 4, 0, axis], 99, '#244353'),
    rod([front + 4, 0, axis], [front + 8, 0, axis], 73, lensGlass),
  ];
}

export function cameraSymbolPreview(symbolId: string): EquipmentSymbol | undefined {
  if (symbolId === 'broadcast.studio-camera-pedestal') {
    return {
      parts: cameraPreview({ rigType: 'Broadcast Pedestal', cameraHeight: 'Eye Level', color: '#64748b' }),
      footprint: [600, 480],
      facingUp: true,
    };
  }
  if (symbolId === 'broadcast.ptz-camera') {
    return {
      parts: [
        rod([0, 0, 0], [0, 0, 58], 182, shell),
        rod([0, 0, 58], [0, 0, 104], 122, trim),
        block(0, 0, 100, 115, 182, 40, grip),
        ...[-1, 1].map((side) => block(0, side * 77, 135, 88, 28, 79, grip)),
        rod([-54, 0, 205], [68, 0, 205], 130, shell),
        rod([68, 0, 205], [77, 0, 205], 70, lensGlass),
      ],
      footprint: [182, 182],
      facingUp: true,
    };
  }
  return undefined;
}
