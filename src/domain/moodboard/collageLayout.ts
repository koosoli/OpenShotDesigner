/**
 * Free-form collage layout (plan §25).
 *
 * Cards live on a virtual canvas that is always `COLLAGE_CANVAS_WIDTH` units
 * wide; height is a board setting. Positions are stored in those units so the
 * same layout renders identically in the panel preview (any pixel width) and
 * on paper. Pure math only — pointer handling stays in the component.
 */

import type { MoodBoard, MoodBoardCard, MoodBoardCardLayout } from './types';

export const COLLAGE_CANVAS_WIDTH = 1000;
export const DEFAULT_COLLAGE_CANVAS_HEIGHT = 700;
export const MIN_CARD_EDGE = 40;
const MAX_COLLAGE_CANVAS_HEIGHT = 4000;

export const collageCanvasHeight = (board: Pick<MoodBoard, 'collage'>): number => {
  const raw = board.collage?.canvasHeight;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_COLLAGE_CANVAS_HEIGHT;
  return Math.max(200, Math.min(MAX_COLLAGE_CANVAS_HEIGHT, Math.round(raw)));
};

/** Keep a layout inside the canvas and above the minimum size. */
export const clampCardLayout = (layout: MoodBoardCardLayout, canvasHeight: number): MoodBoardCardLayout => {
  const w = Math.max(MIN_CARD_EDGE, Math.min(COLLAGE_CANVAS_WIDTH, Math.round(layout.w)));
  const h = Math.max(MIN_CARD_EDGE, Math.min(canvasHeight, Math.round(layout.h)));
  const x = Math.max(0, Math.min(COLLAGE_CANVAS_WIDTH - w, Math.round(layout.x)));
  const y = Math.max(0, Math.min(canvasHeight - h, Math.round(layout.y)));
  const next: MoodBoardCardLayout = { x, y, w, h };
  if (layout.z !== undefined) next.z = layout.z;
  return next;
};

/**
 * Deterministic grid seed for cards without a stored layout, so switching a
 * board to free-form starts from the same arrangement the grid view showed.
 */
export const seedCollageLayouts = (
  cards: readonly MoodBoardCard[],
  options: { columns?: number; gap?: number; canvasHeight?: number } = {},
): Map<string, MoodBoardCardLayout> => {
  const columns = Math.max(1, Math.min(6, options.columns ?? 3));
  const gap = Math.max(0, Math.min(32, options.gap ?? 8));
  const canvasHeight = options.canvasHeight ?? DEFAULT_COLLAGE_CANVAS_HEIGHT;
  const cellW = (COLLAGE_CANVAS_WIDTH - gap * (columns + 1)) / columns;
  const cellH = cellW * 0.75;
  const ordered = [...cards].sort((a, b) => a.order - b.order);
  const out = new Map<string, MoodBoardCardLayout>();
  ordered.forEach((card, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    out.set(
      card.id,
      clampCardLayout(
        { x: gap + col * (cellW + gap), y: gap + row * (cellH + gap), w: cellW, h: cellH, z: index },
        canvasHeight,
      ),
    );
  });
  return out;
};

/** Effective layout for every card: stored layout when present, otherwise the grid seed. */
export const resolveCollageLayouts = (board: MoodBoard): Map<string, MoodBoardCardLayout> => {
  const canvasHeight = collageCanvasHeight(board);
  const seeded = seedCollageLayouts(board.cards, {
    columns: board.collage?.columns,
    gap: board.collage?.gap,
    canvasHeight,
  });
  const out = new Map<string, MoodBoardCardLayout>();
  for (const card of board.cards) {
    const stored = card.collageLayout;
    const fallback = seeded.get(card.id) ?? { x: 0, y: 0, w: MIN_CARD_EDGE * 4, h: MIN_CARD_EDGE * 3 };
    out.set(card.id, clampCardLayout(stored ?? fallback, canvasHeight));
  }
  return out;
};

/** One above the highest effective z — seeded (unstored) layouts count too. */
const nextZ = (layouts: Map<string, MoodBoardCardLayout>): number => {
  let max = -1;
  for (const layout of layouts.values()) max = Math.max(max, layout.z ?? -1);
  return max + 1;
};

/**
 * Persist a card's free-form layout (clamped). Unknown cards leave the board
 * untouched. A layout without `z` keeps the card's current stacking position
 * so a move/resize never undoes an earlier "bring to front".
 */
export const setCardLayout = (board: MoodBoard, cardId: string, layout: MoodBoardCardLayout): MoodBoard => {
  const existing = board.cards.find((card) => card.id === cardId);
  if (!existing) return board;
  const z = layout.z ?? existing.collageLayout?.z ?? resolveCollageLayouts(board).get(cardId)?.z;
  const clamped = clampCardLayout(z === undefined ? layout : { ...layout, z }, collageCanvasHeight(board));
  return {
    ...board,
    cards: board.cards.map((card) => (card.id === cardId ? { ...card, collageLayout: clamped } : card)),
  };
};

/** Raise a card above every other card in the collage. */
export const bringCardToFront = (board: MoodBoard, cardId: string): MoodBoard => {
  const card = board.cards.find((candidate) => candidate.id === cardId);
  if (!card) return board;
  const layouts = resolveCollageLayouts(board);
  const current = layouts.get(cardId);
  if (!current) return board;
  const z = nextZ(layouts);
  if (current.z === z - 1 && card.collageLayout) return board;
  return setCardLayout(board, cardId, { ...current, z });
};

/** Drop every stored layout so the free-form view falls back to the grid seed. */
export const autoArrangeCollage = (board: MoodBoard): MoodBoard => ({
  ...board,
  cards: board.cards.map((card) => {
    if (!card.collageLayout) return card;
    const { collageLayout: _layout, ...rest } = card;
    return rest;
  }),
});

/** Cards ordered for painting: lowest z first, ties by card order. */
export const collagePaintOrder = (board: MoodBoard): MoodBoardCard[] => {
  const layouts = resolveCollageLayouts(board);
  return [...board.cards].sort((a, b) => {
    const za = layouts.get(a.id)?.z ?? 0;
    const zb = layouts.get(b.id)?.z ?? 0;
    if (za !== zb) return za - zb;
    return a.order - b.order;
  });
};
