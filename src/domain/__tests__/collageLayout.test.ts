import { describe, it, expect } from 'vitest';
import {
  COLLAGE_CANVAS_WIDTH,
  DEFAULT_COLLAGE_CANVAS_HEIGHT,
  MIN_CARD_EDGE,
  autoArrangeCollage,
  bringCardToFront,
  clampCardLayout,
  collageCanvasHeight,
  collagePaintOrder,
  createBoard,
  resolveCollageLayouts,
  seedCollageLayouts,
  setCardLayout,
} from '../moodboard';
import type { MoodBoard, MoodBoardCard } from '../moodboard';

const makeBoard = (count: number): MoodBoard => {
  const board = createBoard('board', 'Look');
  const sectionId = board.sections[0].id;
  const cards: MoodBoardCard[] = Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    tags: [],
    sectionId,
    order: i,
  }));
  return { ...board, cards };
};

describe('clampCardLayout', () => {
  it('keeps cards inside the canvas and above the minimum size', () => {
    expect(clampCardLayout({ x: -50, y: -10, w: 10, h: 10 }, 700)).toEqual({ x: 0, y: 0, w: MIN_CARD_EDGE, h: MIN_CARD_EDGE });
    expect(clampCardLayout({ x: 990, y: 690, w: 300, h: 300 }, 700)).toEqual({ x: 700, y: 400, w: 300, h: 300 });
    expect(clampCardLayout({ x: 0, y: 0, w: 5000, h: 5000 }, 700)).toEqual({ x: 0, y: 0, w: COLLAGE_CANVAS_WIDTH, h: 700 });
  });

  it('preserves z when present', () => {
    expect(clampCardLayout({ x: 1, y: 1, w: 100, h: 100, z: 4 }, 700).z).toBe(4);
    expect('z' in clampCardLayout({ x: 1, y: 1, w: 100, h: 100 }, 700)).toBe(false);
  });
});

describe('seedCollageLayouts', () => {
  it('lays cards out row-major in the requested column count', () => {
    const board = makeBoard(5);
    const seeded = seedCollageLayouts(board.cards, { columns: 2, gap: 10 });
    const c0 = seeded.get('c0')!;
    const c1 = seeded.get('c1')!;
    const c2 = seeded.get('c2')!;
    expect(c0.y).toBe(c1.y);
    expect(c1.x).toBeGreaterThan(c0.x);
    expect(c2.x).toBe(c0.x);
    expect(c2.y).toBeGreaterThan(c0.y);
    expect(c0.w).toBe(c1.w);
  });

  it('is deterministic and respects card order', () => {
    const board = makeBoard(3);
    const reversed = { ...board, cards: [...board.cards].reverse() };
    expect(seedCollageLayouts(board.cards)).toEqual(seedCollageLayouts(reversed.cards));
  });
});

describe('resolveCollageLayouts / setCardLayout', () => {
  it('prefers stored layouts and falls back to the seed', () => {
    let board = makeBoard(2);
    board = setCardLayout(board, 'c0', { x: 100, y: 120, w: 200, h: 150 });
    const layouts = resolveCollageLayouts(board);
    expect(layouts.get('c0')).toEqual({ x: 100, y: 120, w: 200, h: 150, z: 0 });
    expect(layouts.get('c1')).toEqual(seedCollageLayouts(board.cards).get('c1'));
  });

  it('clamps stored layouts to the board canvas height', () => {
    let board = makeBoard(1);
    board = { ...board, collage: { canvasHeight: 300 } };
    board = setCardLayout(board, 'c0', { x: 0, y: 900, w: 100, h: 100 });
    expect(board.cards[0].collageLayout).toMatchObject({ x: 0, y: 200, w: 100, h: 100 });
    expect(collageCanvasHeight(board)).toBe(300);
    expect(collageCanvasHeight(makeBoard(0))).toBe(DEFAULT_COLLAGE_CANVAS_HEIGHT);
  });

  it('keeps the current stacking order when a layout arrives without z', () => {
    let board = makeBoard(3);
    board = bringCardToFront(board, 'c0');
    const raisedZ = board.cards[0].collageLayout?.z;
    expect(raisedZ).toBe(3);
    board = setCardLayout(board, 'c0', { x: 10, y: 10, w: 100, h: 100 });
    expect(board.cards[0].collageLayout?.z).toBe(raisedZ);
    board = setCardLayout(board, 'c1', { x: 10, y: 10, w: 100, h: 100 });
    // Never stored before: inherits its seeded z rather than dropping to the bottom.
    expect(board.cards[1].collageLayout?.z).toBe(1);
  });

  it('ignores unknown cards', () => {
    const board = makeBoard(1);
    expect(setCardLayout(board, 'missing', { x: 0, y: 0, w: 50, h: 50 })).toBe(board);
  });
});

describe('bringCardToFront / collagePaintOrder', () => {
  it('raises the card above all others and paints it last', () => {
    let board = makeBoard(3);
    board = bringCardToFront(board, 'c0');
    const order = collagePaintOrder(board).map((card) => card.id);
    expect(order[order.length - 1]).toBe('c0');
    board = bringCardToFront(board, 'c1');
    expect(collagePaintOrder(board).map((card) => card.id).pop()).toBe('c1');
  });
});

describe('autoArrangeCollage', () => {
  it('drops every stored layout', () => {
    let board = makeBoard(2);
    board = setCardLayout(board, 'c0', { x: 5, y: 5, w: 100, h: 100 });
    const reset = autoArrangeCollage(board);
    expect(reset.cards.every((card) => card.collageLayout === undefined)).toBe(true);
  });
});
