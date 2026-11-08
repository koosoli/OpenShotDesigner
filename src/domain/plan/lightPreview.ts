import type { LightElement } from '../../types';
import { kelvinToHex } from '../../utils/geometry';
import { deriveEffectiveLightAppearance } from '../lighting/modifiers';
import { block, equipmentFinish, headParts, prism, rod, stand, type EquipmentPart, type EquipmentSymbol } from './equipmentPreviewGeometry';

const { shell, trim, metal, grip } = equipmentFinish;
const daylight = '#dbeafe';

export function roundHead(height: number, length: number, diameter: number, lens: string, barns = false): EquipmentPart[] {
  const front = length * .52;
  const edge = diameter * .48;
  const yoke = diameter * .59;
  return [
    rod([-length * .52, 0, height], [front, 0, height], diameter, shell),
    rod([-length * .58, 0, height], [-length * .47, 0, height], diameter * .85, trim),
    rod([front - 32, 0, height], [front + 12, 0, height], diameter * 1.07, grip),
    rod([front + 12, 0, height], [front + 20, 0, height], diameter * .83, lens),
    block(0, 0, height - yoke - 24, 70, 2 * yoke + 32, 30, trim),
    ...[-1, 1].flatMap((side) => [
      block(0, side * yoke, height - yoke, 63, 28, yoke + 22, trim),
      rod([0, side * (yoke - 13), height], [0, side * (yoke + 21), height], 61, metal),
    ]),
    ...(barns ? [-1, 1].flatMap((side) => [
      prism([front + 10, 0, height + side * edge], [front + 160, 0, height + side * edge * 1.55],
        [diameter * .94, 20], [diameter * 1.36, 20], grip),
      prism([front + 10, side * edge, height], [front + 130, side * edge * 1.47, height],
        [20, diameter * .86], [20, diameter * 1.2], grip),
    ]) : []),
  ];
}

export function panel(height: number, width: number, faceHeight: number, lens: string): EquipmentPart[] {
  return [
    block(0, 0, height - faceHeight / 2 - 65, 70, 85, 75, trim),
    block(0, 0, height - faceHeight / 2, 104, width, faceHeight, shell),
    block(53, 0, height - faceHeight / 2 + 23, 12, width - 48, faceHeight - 46, lens),
    block(-61, 0, height - faceHeight * .30, 35, width * .43, faceHeight * .60, trim),
  ];
}

function lantern(bottom: number, radius: number, color: string): EquipmentPart[] {
  const rings = [
    [0, .23], [.30, .72], [.66, .95], [1, 1], [1.34, .95], [1.70, .72], [2, .23],
  ];
  return rings.slice(1).map(([end, endRadius], index) => {
    const [start, startRadius] = rings[index];
    return prism([0, 0, bottom + start * radius], [0, 0, bottom + end * radius],
      [2 * radius * startRadius, 2 * radius * startRadius], [2 * radius * endRadius, 2 * radius * endRadius], color, true);
  });
}

function diodeFace(height: number, length: number, diameter: number) {
  const front = length * .52 + 20;
  const radius = diameter * .25;
  const diode = (y: number, z: number) => rod([front, y, height + z], [front + 4, y, height + z], diameter * .19, daylight);
  return [diode(0, 0), ...Array.from({ length: 6 }, (_, index) => {
    const angle = index * Math.PI / 3;
    return diode(radius * Math.cos(angle), radius * Math.sin(angle));
  })];
}

/** Generic fixture silhouettes. Dimensions describe the preview geometry only. */
export function lightPreview(light: LightElement): EquipmentPart[] {
  const { fixtureType: kind } = light;
  const finish = deriveEffectiveLightAppearance(light.beamAngle, light.modifiers).colorHex ?? light.rgbColor;
  const lens = finish && /^#[\da-f]{6}$/i.test(finish) ? finish
    : Number.isFinite(light.colorTemp) && light.colorTemp > 0 ? kelvinToHex(light.colorTemp) : daylight;

  if (kind === 'tripod') return stand(1520, 365, false);
  if (kind === 'practical') {
    return [
      rod([0, 0, 0], [0, 0, 45], 365, trim),
      rod([0, 0, 45], [0, 0, 1275], 42, metal),
      ...headParts([prism([0, 0, 1245], [0, 0, 1530], [470, 470], [255, 255], lens, true)]),
    ];
  }
  if (kind === 'china_ball') return [...stand(1390, 380, false), ...headParts(lantern(1375, 280, lens))];
  if (kind === 'tube_light') {
    return [
      ...stand(1520, 330, false),
      ...headParts([
        rod([0, 0, 1510], [0, 0, 2130], 67, lens),
        rod([0, 0, 1480], [0, 0, 1520], 75, grip),
        rod([0, 0, 2120], [0, 0, 2170], 75, grip),
      ]),
    ];
  }
  if (kind === 'led_panel' || kind === 'kino_flo') {
    const kino = kind === 'kino_flo';
    return [
      ...stand(1560, 375, false),
      ...headParts(panel(1720, kino ? 880 : 550, kino ? 240 : 340, kino ? grip : lens)),
      ...headParts(kino ? [-72, 0, 72].map((offset) => rod([65, -395, 1720 + offset], [65, 395, 1720 + offset], 37, lens)) : []),
    ];
  }
  if (kind === 'softbox' || light.modifiers?.some(({ enabled, kind: modifier }) => enabled && modifier === 'softbox')) {
    return [
      ...stand(1610, 430, false),
      ...headParts(roundHead(1760, 295, 228, trim)),
      ...headParts([
        prism([146, 0, 1760], [480, 0, 1760], [225, 225], [790, 645], grip),
        prism([480, 0, 1760], [489, 0, 1760], [744, 599], [744, 599], lens),
      ]),
    ];
  }
  if (kind === 'overhead_diffusion') {
    return [
      ...stand(1930, 430, false),
      ...headParts([
        rod([0, 0, 1915], [730, 0, 1915], 36, metal),
        block(675, 0, 1920, 1190, 1190, 38, trim),
        block(675, 0, 1913, 1110, 1110, 53, '#e1e0d6'),
      ]),
    ];
  }
  if (kind === 'reflector' || kind === 'c_stand_flag' || kind?.startsWith('flag_')) {
    const color = kind === 'reflector' ? '#d9dfe4'
      : kind === 'flag_silk' ? '#e1e0d6' : '#343842';
    const wide = kind === 'flag_cutter';
    return [...stand(1580, 350, false), ...headParts(panel(1800, wide ? 1090 : 710, wide ? 245 : 535, color))];
  }
  const diameter = kind === 'hmi' ? 390 : kind === 'par_can' ? 245 : kind === 'spotlight' ? 275 : 315;
  const length = kind === 'spotlight' || kind === 'par_can' ? 490 : kind === 'hmi' ? 460 : 355;
  const hasBarnDoors = light.hasBarnDoors || light.modifiers?.some(({ enabled, kind: modifier }) => enabled && modifier === 'barn_doors');
  return [
    ...stand(1540, 385, false),
    ...headParts(roundHead(1540 + diameter * .59 + 20, length, diameter, lens, hasBarnDoors)),
  ];
}

/** Library fixtures placed as floor-plan symbols have a compact floor mount. */
export function lightingSymbolPreview(symbolId: string): EquipmentSymbol | undefined {
  switch (symbolId) {
    case 'lighting.led-par':
      return {
        parts: [block(0, 0, 0, 305, 305, 48, shell), ...roundHead(195, 240, 208, '#425263'), ...diodeFace(195, 240, 208)],
        footprint: [305, 305],
      };
    case 'lighting.led-panel':
      return { parts: [...stand(1560, 375, false), ...panel(1720, 550, 340, daylight)], footprint: [750, 750] };
    case 'lighting.fresnel':
      return { parts: [...stand(1540, 385, false), ...roundHead(1746, 355, 315, '#ffc07d', true)], footprint: [770, 770] };
    case 'lighting.follow-spot':
      return { parts: [...stand(1420, 385, true), ...roundHead(1630, 740, 320, daylight)], footprint: [820, 770] };
    case 'lighting.moving-head-wash':
    case 'lighting.moving-head-spot': {
      const wash = symbolId === 'lighting.moving-head-wash';
      const length = wash ? 275 : 375;
      const diameter = wash ? 275 : 240;
      return {
        parts: [
          block(0, 0, 0, 400, 400, 93, shell),
          rod([0, 0, 93], [0, 0, 150], 260, trim),
          block(0, 0, 150, 235, 185, 80, shell),
          ...roundHead(360, length, diameter, wash ? '#425263' : daylight),
          ...(wash ? diodeFace(360, length, diameter) : []),
        ],
        footprint: [400, 400],
        facingUp: true,
      };
    }
    default:
      return undefined;
  }
}
