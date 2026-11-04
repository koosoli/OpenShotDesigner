/**
 * Furniture and casework geometry adapted from the pinned ConstructCAD catalog.
 * Credit: ConstructCAD Components contributors, CC BY 4.0.
 * https://github.com/francisreboucas/constructcad-components/tree/968ba12e91188de2f0a3567772d6c4eccb072f7f/sources/furniture
 * https://github.com/francisreboucas/constructcad-components/tree/968ba12e91188de2f0a3567772d6c4eccb072f7f/sources/casework
 * https://creativecommons.org/licenses/by/4.0/
 * Source dimensions converted to mm, with Y flipped to match Cineplan's plan.
 * The renderer scales the footprint to the placed object and keeps the source height.
 */
export interface FurnitureBox {
  width: number;
  depth: number;
  bottom: number;
  top: number;
  offsetX: number;
  offsetY: number;
  round?: boolean;
  color?: string;
}

interface FurnitureModel {
  width: number;
  depth: number;
  boxes: FurnitureBox[];
}

function fourLegs(offsetX: number, offsetY: number, size: number, top: number): FurnitureBox[] {
  return [-offsetX, offsetX].flatMap((x) =>
    [-offsetY, offsetY].map((y) => ({ width: size, depth: size, bottom: 0, top, offsetX: x, offsetY: y })),
  );
}

function box(width: number, depth: number, bottom: number, top: number, offsetX = 0, offsetY = 0): FurnitureBox {
  return { width, depth, bottom, top, offsetX, offsetY };
}

function sofa(width: number): FurnitureModel {
  const armCenter = width / 2 - 90;
  return {
    width,
    depth: 900,
    boxes: [
      box(width, 900, 0, 420),
      box(width, 200, 420, 850, 0, -350),
      box(180, 700, 420, 640, -armCenter, 100),
      box(180, 700, 420, 640, armCenter, 100),
    ],
  };
}

export const FURNITURE_MODELS = {
  table_rect: {
    width: 1200,
    depth: 800,
    boxes: [
      { width: 1200, depth: 800, bottom: 720, top: 750, offsetX: 0, offsetY: 0 },
      ...fourLegs(545, 345, 50, 720),
    ],
  },
  chair: {
    width: 450,
    depth: 500,
    boxes: [
      { width: 450, depth: 500, bottom: 400, top: 450, offsetX: 0, offsetY: 0 },
      { width: 450, depth: 30, bottom: 450, top: 900, offsetX: 0, offsetY: -235 },
      ...fourLegs(185, 210, 40, 400),
    ],
  },
  sofa: sofa(2100),
  armchair: sofa(850),
  bed: {
    width: 1440,
    depth: 1930,
    boxes: [
      box(1380, 1880, 0, 300, 0, 25),
      { ...box(1360, 1860, 300, 550, 0, 25), color: '#e2e8f0' },
      box(1440, 50, 0, 1100, 0, -940),
    ],
  },
  nightstand: {
    width: 450,
    depth: 400,
    boxes: [box(450, 400, 100, 550), ...fourLegs(190, 165, 30, 100)],
  },
  desk: {
    width: 1200,
    depth: 600,
    boxes: [box(1200, 600, 725, 750), box(25, 600, 0, 725, -587.5), box(400, 600, 0, 725, 400)],
  },
  table_round: {
    width: 1000,
    depth: 1000,
    boxes: [
      { ...box(1000, 1000, 720, 750), round: true },
      { ...box(100, 100, 30, 720), round: true },
      { ...box(500, 500, 0, 30), round: true },
    ],
  },
  wardrobe: {
    width: 1500,
    depth: 600,
    boxes: [box(1500, 550, 0, 80, 0, -25), box(1500, 600, 80, 2300)],
  },
  bookshelf: {
    width: 800,
    depth: 300,
    boxes: [
      box(20, 300, 0, 1800, -390),
      box(20, 300, 0, 1800, 390),
      box(800, 6, 0, 1800, 0, -147),
      ...[50, 482.5, 915, 1347.5, 1780].map((height) => box(760, 294, height, height + 20, 0, 3)),
    ],
  },
  kitchen_counter: {
    width: 800,
    depth: 620,
    boxes: [box(800, 550, 0, 100, 0, -35), box(800, 600, 100, 870, 0, -10), box(800, 620, 870, 900)],
  },
  wall_cabinet: {
    width: 800,
    depth: 350,
    boxes: [box(800, 350, 1500, 2200)],
  },
} satisfies Record<string, FurnitureModel>;

export type FurnitureModelId = keyof typeof FURNITURE_MODELS;

type FurniturePlacement = {
  model: FurnitureModelId;
  width: number;
  depth: number;
  x: number;
  y: number;
  rotation: number;
  color?: string;
};

/** Table and seat footprints match the corresponding 2D dining symbols. */
export function diningFurnitureLayout(
  kind: 'table_round' | 'dining_set' | 'arch.dining-table' | 'arch.conference-table',
  width: number,
  depth: number,
  scale: number,
): FurniturePlacement[] {
  const chair = (w: number, d: number, x: number, y: number, rotation: number): FurniturePlacement =>
    ({ model: 'chair', width: w, depth: d, x, y, rotation, color: '#475569' });
  const table = (w: number, d: number, model: 'table_round' | 'table_rect' = 'table_rect'): FurniturePlacement =>
    ({ model, width: w, depth: d, x: 0, y: 0, rotation: 0 });

  switch (kind) {
    case 'table_round': {
      const diameter = Math.min(width, depth) * .58;
      const w = width * .2;
      const d = depth * .15;
      return [
        table(diameter, diameter, 'table_round'),
        chair(w, d, 0, -depth * .4, 0),
        chair(w, d, width * .4, 0, 90),
        chair(w, d, 0, depth * .4, 180),
        chair(w, d, -width * .4, 0, 270),
      ];
    }
    case 'arch.dining-table':
      return [
        table(width * .6, depth * .5),
        ...[-.12, .12].flatMap((offset) => [
          chair(depth * .16, width * .08, -width * .38, depth * offset, 270),
          chair(depth * .16, width * .08, width * .38, depth * offset, 90),
        ]),
      ];
    case 'arch.conference-table':
      return [
        table(width * .7, depth * .5),
        ...[-.19, .19].flatMap((offset) => [
          chair(width * .12, depth * .08, width * offset, -depth * .34, 0),
          chair(width * .12, depth * .08, width * offset, depth * .34, 180),
        ]),
      ];
    case 'dining_set': {
      const sideDepth = Math.min(width / 2, 12 * scale);
      const endDepth = Math.min(depth / 2, 10 * scale);
      return [
        table(Math.max(width * .2, width - 30 * scale), Math.max(depth * .2, depth - 20 * scale)),
        chair(depth * .5, sideDepth, -(width - sideDepth) / 2, 0, 270),
        chair(depth * .5, sideDepth, (width - sideDepth) / 2, 0, 90),
        chair(width * .5, endDepth, 0, -(depth - endDepth) / 2, 0),
        chair(width * .5, endDepth, 0, (depth - endDepth) / 2, 180),
      ];
    }
  }
}

const SYMBOL_MODELS: Partial<Record<string, FurnitureModelId>> = {
  'arch.sofa': 'sofa',
  'arch.bed': 'bed',
  'arch.wardrobe': 'wardrobe',
  'arch.office-desk': 'desk',
  'arch.wall-cabinet': 'wall_cabinet',
  'arch.round-table': 'table_round',
};

export function getFurnitureModel(propType?: string, symbolId?: string): FurnitureModel | undefined {
  const alias = propType === 'bed_king' ? 'bed'
    : propType === 'kitchen_island' ? 'kitchen_counter'
    : propType;
  const key = symbolId ? SYMBOL_MODELS[symbolId] : alias;
  return key && Object.hasOwn(FURNITURE_MODELS, key) ? FURNITURE_MODELS[key as FurnitureModelId] : undefined;
}
