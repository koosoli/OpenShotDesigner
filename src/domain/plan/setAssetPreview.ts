import { block, prism, rod, stand, type EquipmentPart, type EquipmentSymbol } from './equipmentPreviewGeometry';

const metal = '#8995a2';
const dark = '#374352';

export function setAssetPreview(kind: string, paint: string): EquipmentSymbol | undefined {
  let parts: EquipmentPart[];
  let footprint: readonly [number, number] = [1000, 600];
  switch (kind) {
    case 'mic':
    case 'boom':
    case 'cstand':
    case 'flag':
    case 'tripod':
      parts = stand(kind === 'boom' ? 1800 : 1500, 350, kind === 'tripod');
      if (kind !== 'tripod') parts.push(rod([0, 0, 1500], [700, 0, kind === 'boom' ? 2200 : 1550], 28, metal));
      if (kind === 'mic' || kind === 'boom') parts.push(rod([650, 0, kind === 'boom' ? 2200 : 1550], [850, 0, kind === 'boom' ? 2200 : 1550], 65, '#252e39'));
      if (kind === 'flag') parts.push(block(450, 0, 1500, 700, 30, 700, '#29313b'));
      footprint = [1000, 750];
      break;
    case 'cart':
      parts = [block(0, 0, 200, 1000, 600, 60, dark), block(0, 0, 850, 1000, 600, 60, dark),
        ...[-450, 450].flatMap((x) => [-250, 250].flatMap((y) => [rod([x, y, 100], [x, y, 1050], 35, metal),
          rod([x, y - 30, 100], [x, y + 30, 100], 190, '#202630')]))];
      break;
    case 'backdrop':
      parts = [block(0, 0, 0, 1000, 35, 2400, '#198348'),
        ...[-480, 480].flatMap((x) => [rod([x, 0, 0], [x, 0, 2450], 35, metal), block(x, 0, 0, 90, 600, 30, dark)])];
      break;
    case 'apple':
    case 'sandbag':
      parts = [block(0, 0, 0, 1000, 600, kind === 'apple' ? 300 : 150, kind === 'apple' ? '#ae8251' : '#4d4639'),
        block(0, -305, 90, 240, 8, 55, '#302b26')];
      break;
    case 'plant':
    case 'tree': {
      const base = kind === 'plant' ? 450 : 0;
      const height = kind === 'plant' ? 1500 : 3500;
      parts = [rod([0, 0, base], [0, 0, height * .75], 85, '#77583b'),
        ...[0, 1, 2].map((i) => prism([0, 0, height * (.35 + i * .17)], [0, 0, height * (.70 + i * .15)],
          [1000 - i * 180, 1000 - i * 180], [220, 220], '#38724c', true))];
      if (base) parts.push(prism([0, 0, 0], [0, 0, base], [330, 330], [550, 550], '#987151', true));
      footprint = [1000, 1000];
      break;
    }
    case 'stairs':
      parts = Array.from({ length: 6 }, (_, i) => block(0, -500 + i * 200, 0, 1000, 200, (i + 1) * 180, paint));
      footprint = [1000, 1200];
      break;
    case 'stool':
    case 'director-chair':
      parts = [block(0, 0, 750, 500, 450, 60, paint),
        ...[-200, 200].flatMap((x) => [-175, 175].map((y) => rod([x, y, 0], [x, y, 750], 45, metal)))];
      if (kind === 'director-chair') parts.push(block(0, 200, 1000, 500, 35, 300, paint),
        ...[-230, 230].map((x) => rod([x, 190, 750], [x, 190, 1300], 35, metal)));
      footprint = [500, 450];
      break;
    case 'counter':
    case 'desk':
      parts = [block(0, 0, 1000, 1000, 600, 60, paint), ...[-420, 420].map((x) => block(x, 0, 0, 100, 550, 1000, dark))];
      break;
    case 'sectional':
      parts = [block(0, 0, 100, 1000, 500, 300, paint), block(-350, 250, 100, 300, 500, 300, paint),
        block(0, -230, 400, 1000, 80, 450, paint), block(-460, 220, 400, 80, 500, 450, paint),
        block(460, 0, 400, 80, 500, 220, paint)];
      footprint = [1000, 1000];
      break;
    case 'stove':
      parts = [block(0, 0, 0, 600, 600, 850, '#aab2ba'), block(0, 0, 850, 620, 620, 35, dark),
        block(0, -305, 150, 450, 15, 500, '#293643'),
        ...[-160, 160].flatMap((x) => [-160, 160].map((y) => rod([x, y, 885], [x, y, 900], 180, metal)))];
      footprint = [620, 620];
      break;
    case 'hob':
      parts = [block(0, 0, 0, 600, 600, 45, dark), ...[-160, 160].flatMap((x) => [-160, 160].map((y) => rod([x, y, 45], [x, y, 65], 180, metal)))];
      footprint = [600, 600];
      break;
    case 'washer':
    case 'dishwasher':
      parts = [block(0, 0, 0, 600, 600, 850, '#c6cdd1'), block(0, -305, 710, 550, 12, 80, dark)];
      if (kind === 'washer') parts.push(rod([0, -305, 390], [0, -335, 390], 380, metal), rod([0, -335, 390], [0, -340, 390], 290, '#43667c'));
      else parts.push(block(0, -320, 640, 360, 25, 30, metal));
      footprint = [600, 600];
      break;
    case 'coffee':
      parts = [block(0, 0, 420, 1000, 600, 60, paint), ...[-420, 420].flatMap((x) => [-220, 220].map((y) => block(x, y, 0, 60, 60, 420, paint)))];
      break;
    case 'tv':
      parts = [block(0, 0, 0, 1000, 500, 450, paint), block(0, 0, 450, 100, 100, 250, metal),
        block(0, 0, 650, 1000, 60, 650, dark), block(0, -35, 680, 940, 8, 590, '#426d88')];
      break;
    case 'fridge':
      parts = [block(0, 0, 0, 700, 700, 1900, '#b6bec5'), block(0, -355, 1350, 680, 15, 12, dark),
        block(260, -370, 950, 25, 30, 280, metal)];
      footprint = [700, 700];
      break;
    case 'sink':
    case 'toilet':
    case 'bathtub':
    case 'shower': {
      const height = kind === 'sink' ? 850 : kind === 'toilet' ? 430 : kind === 'shower' ? 90 : 550;
      parts = [block(0, 0, 0, 1000, 600, height * .6, '#c6cdd1'),
        block(0, 0, height * .6, 1000, 80, height * .4, '#e3e7e9'),
        ...[-460, 460].map((x) => block(x, 0, height * .6, 80, 600, height * .4, '#e3e7e9')),
        block(0, -260, height * .6, 1000, 80, height * .4, '#e3e7e9')];
      if (kind === 'toilet') parts.push(block(0, 230, 400, 700, 140, 400, '#e3e7e9'));
      if (kind === 'sink') parts.push(rod([0, 180, height], [0, 180, height + 200], 35, metal), rod([0, 180, height + 200], [0, 30, height + 200], 35, metal));
      break;
    }
    case 'radiator':
      parts = Array.from({ length: 8 }, (_, i) => block(-437 + i * 125, 0, 100, 95, 160, 700, '#d6dce1'));
      footprint = [1000, 160];
      break;
    case 'column':
      parts = [block(0, 0, 0, 600, 600, 120, paint), rod([0, 0, 120], [0, 0, 2700], 450, paint)];
      footprint = [600, 600];
      break;
    default:
      return undefined;
  }
  return { parts, footprint };
}
