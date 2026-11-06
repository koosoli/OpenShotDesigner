import { block, prism, rod, type EquipmentPart, type EquipmentSymbol } from './equipmentPreviewGeometry';

const metal = '#8895a4';
const shell = '#354151';
const screen = '#497e9b';

function truss(x: number, y: number, z: number, length: number, top = true): EquipmentPart[] {
  return [
    ...[-140, 140].flatMap((dy) => [rod([x, y + dy, z], [x + length, y + dy, z], 36, metal),
      ...(top ? [rod([x, y + dy, z + 280], [x + length, y + dy, z + 280], 36, metal)] : [])]),
    ...Array.from({ length: 6 }, (_, i) => [-140, 140].map((dy) =>
      rod([x + i * length / 6, y + dy, z], [x + (i + 1) * length / 6, top ? y + dy : y - dy, top ? z + 280 : z], 22, metal))),
  ].flat();
}

export function stageAssetPreview(kind: string, paint: string): EquipmentSymbol | undefined {
  let parts: EquipmentPart[];
  let footprint: readonly [number, number] = [1000, 600];
  switch (kind) {
    case 'stage':
    case 'riser':
      parts = [block(0, 0, 400, 1000, 600, 100, paint),
        ...[-430, 430].flatMap((x) => [-230, 230].map((y) => block(x, y, 0, 65, 65, 400, metal)))];
      break;
    case 'barrier':
      parts = [-420, 420].flatMap((x) => [block(x, 0, 0, 130, 500, 35, shell), rod([x, 0, 35], [x, 0, 1100], 48, metal)]);
      parts.push(rod([-470, 0, 1100], [470, 0, 1100], 45, metal), rod([-470, 0, 200], [470, 0, 200], 35, metal));
      for (let x = -350; x <= 350; x += 140) parts.push(rod([x, 0, 200], [x, 0, 1100], 25, metal));
      break;
    case 'truss':
    case 'ladder':
      parts = truss(-500, 0, 0, 1000);
      if (kind === 'ladder') parts = truss(-500, 0, 25, 1000, false);
      footprint = [1000, 320];
      break;
    case 'truss-corner':
    case 'truss-t':
    case 'truss-cross': {
      parts = truss(-500, 0, 0, kind === 'truss-corner' ? 500 : 1000);
      const perpendicular = truss(kind === 'truss-cross' ? -500 : 0, 0, 0, kind === 'truss-cross' ? 1000 : 500);
      parts.push(...perpendicular.map((part) => ({ ...part, corners: part.corners.map(({ x, y, z }) => ({ x: -y, y: x, z })) })));
      footprint = [1000, 1000];
      break;
    }
    case 'triangle':
      parts = [...truss(-500, 0, 25, 1000, false), rod([-500, 0, 300], [500, 0, 300], 36, metal),
        ...Array.from({ length: 6 }, (_, i) => [-140, 140].map((y) => rod([-500 + i * 166, y, 25], [-334 + i * 166, 0, 300], 22, metal))).flat()];
      footprint = [1000, 320];
      break;
    case 'baseplate':
      parts = [block(0, 0, 0, 800, 800, 45, metal), block(0, 0, 45, 300, 300, 60, shell)];
      footprint = [800, 800];
      break;
    case 'tower':
    case 'goalpost': {
      const xs = kind === 'tower' ? [0] : [-420, 420];
      parts = xs.flatMap((x) => [block(x, 0, 0, 340, 340, 30, shell),
        ...[-100, 100].flatMap((dx) => [-100, 100].map((dy) => rod([x + dx, dy, 30], [x + dx, dy, 3000], 42, metal))),
        ...Array.from({ length: 6 }, (_, i) => rod([x - 100, -100, 50 + i * 480], [x + 100, -100, 530 + i * 480], 24, metal))]);
      if (kind === 'goalpost') parts.push(...truss(-420, 0, 2800, 840));
      footprint = kind === 'tower' ? [340, 340] : [1180, 340];
      break;
    }
    case 'truss-ring':
      parts = Array.from({ length: 16 }, (_, i) => [0, 250].flatMap((z) => [850, 1000].map((r) => {
        const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8;
        return rod([Math.cos(a) * r, Math.sin(a) * r, z + 25], [Math.cos(b) * r, Math.sin(b) * r, z + 25], 36, metal);
      }))).flat();
      footprint = [2040, 2040];
      break;
    case 'speaker':
    case 'sub':
    case 'array':
    case 'delay': {
      const count = kind === 'array' ? 4 : kind === 'sub' ? 2 : 1;
      const height = kind === 'array' ? 300 : kind === 'sub' ? 500 : 1100;
      const base = kind === 'array' || kind === 'delay' ? 1800 : 0;
      parts = Array.from({ length: count }, (_, i) => [block(0, 0, base + i * (height + 15), 700, 550, height, shell),
        rod([0, -278, base + i * (height + 15) + height * .42], [0, -292, base + i * (height + 15) + height * .42], Math.min(height * .65, 400), '#1e2631')]).flat();
      if (kind === 'delay') parts.push(block(0, 0, 0, 700, 550, 50, metal), rod([0, 0, 50], [0, 0, base], 100, metal));
      footprint = [700, 600];
      break;
    }
    case 'wedge':
      parts = [prism([0, -250, 180], [0, 250, 270], [650, 300], [650, 70], shell)];
      break;
    case 'console':
    case 'dj':
      parts = [block(0, 0, 0, 1000, 600, 800, shell), block(0, 0, 800, 1040, 640, 45, paint),
        ...[-270, 270].map((x) => block(x, 0, 845, 350, 360, 20, '#1a2433')),
        ...[-360, -180, 0, 180, 360].map((x) => rod([x, 130, 860], [x, 130, 900], 25, metal))];
      if (kind === 'dj') parts.push(...[-270, 270].map((x) => rod([x, -20, 865], [x, -20, 880], 260, metal)));
      break;
    case 'screen':
    case 'monitor-wall':
      parts = [block(0, 0, 100, 1000, 90, 1800, shell), block(0, -49, 130, 940, 12, 1740, screen),
        ...[-380, 380].map((x) => block(x, 0, 0, 90, 600, 100, metal))];
      if (kind === 'monitor-wall') parts.push(block(0, -60, 130, 20, 15, 1740, shell), block(0, -60, 990, 940, 15, 20, shell));
      break;
    case 'keyboard':
      parts = [block(0, 0, 900, 1000, 450, 95, shell), block(0, -100, 995, 920, 180, 12, '#e1e6ea'),
        rod([-400, -160, 0], [350, 160, 900], 40, metal), rod([400, -160, 0], [-350, 160, 900], 40, metal)];
      break;
    case 'drums':
      parts = [block(0, 0, 0, 1000, 800, 150, paint), rod([0, -200, 480], [0, 200, 480], 600, '#764b3b'),
        ...[-300, 300].flatMap((x) => [rod([x, 100, 400], [x, 100, 800], 260, '#764b3b'),
          rod([x, 220, 150], [x, 220, 1300], 25, metal), rod([x, 220, 1300], [x, 220, 1315], 450, '#c4a764')])];
      footprint = [1000, 800];
      break;
    default:
      return undefined;
  }
  return { parts, footprint };
}
