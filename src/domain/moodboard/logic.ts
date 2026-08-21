/**
 * Pure mood-board logic (plan §25).
 *
 * Immutable operations on boards/sections/cards. No React, no persistence —
 * domain layer only (repo rule: business logic lives in the domain layer
 * with unit tests).
 */

import { createId } from '../ids';
import type { MoodBoard, MoodBoardCard, MoodBoardSection } from './types';

export const createBoard = (id: string, title: string): MoodBoard => ({
  id,
  title,
  sections: [{ id: createId('section'), title: 'Default', order: 0 }],
  cards: [],
});

export const addSection = (board: MoodBoard, title: string): MoodBoard => {
  const maxOrder = board.sections.reduce((max, s) => Math.max(max, s.order), -1);
  const section: MoodBoardSection = { id: createId('section'), title, order: maxOrder + 1 };
  return { ...board, sections: [...board.sections, section] };
};

export const addCard = (board: MoodBoard, card: Omit<MoodBoardCard, 'order'> & { order?: number }): MoodBoard => {
  if (!board.sections.some((s) => s.id === card.sectionId)) {
    throw new Error('Unknown section');
  }
  const sectionCards = board.cards.filter((c) => c.sectionId === card.sectionId);
  const maxOrder = sectionCards.reduce((max, c) => Math.max(max, c.order), -1);
  const fullCard: MoodBoardCard = { ...card, order: card.order ?? maxOrder + 1 };
  return { ...board, cards: [...board.cards, fullCard] };
};

/**
 * Move a card into `sectionId` at position `index` (clamped to valid range),
 * then renumber `order` 0..n-1 within every affected section (source and
 * target) deterministically.
 */
export const moveCard = (board: MoodBoard, cardId: string, sectionId: string, index: number): MoodBoard => {
  const card = board.cards.find((c) => c.id === cardId);
  if (!card) return board;
  if (!board.sections.some((s) => s.id === sectionId)) {
    throw new Error('Unknown section');
  }

  const withoutCard = board.cards.filter((c) => c.id !== cardId);
  const sourceId = card.sectionId;
  const moved: MoodBoardCard = { ...card, sectionId };

  const targetCards = withoutCard
    .filter((c) => c.sectionId === sectionId)
    .sort((a, b) => a.order - b.order);
  const clampedIndex = Math.max(0, Math.min(index, targetCards.length));
  targetCards.splice(clampedIndex, 0, moved);

  const renumberedTarget = new Map<string, MoodBoardCard>(
    targetCards.map((c, i) => [c.id, { ...c, order: i }]),
  );

  let renumberedSource = new Map<string, MoodBoardCard>();
  if (sourceId !== sectionId) {
    const sourceCards = withoutCard
      .filter((c) => c.sectionId === sourceId)
      .sort((a, b) => a.order - b.order);
    renumberedSource = new Map<string, MoodBoardCard>(
      sourceCards.map((c, i) => [c.id, { ...c, order: i }]),
    );
  }

  const cards = withoutCard.map(
    (c) => renumberedTarget.get(c.id) ?? renumberedSource.get(c.id) ?? c,
  );
  cards.push(renumberedTarget.get(moved.id) ?? moved);

  return { ...board, cards };
};

/** Cards linked to a given entity, sorted by section order then card order. */
export const findCardsByEntity = (
  board: MoodBoard,
  kind: NonNullable<MoodBoardCard['linkedEntity']>['kind'],
  id: string,
): MoodBoardCard[] => {
  const sectionOrder = new Map(board.sections.map((s) => [s.id, s.order] as const));
  return board.cards
    .filter((c) => c.linkedEntity?.kind === kind && c.linkedEntity.id === id)
    .sort((a, b) => {
      const sa = sectionOrder.get(a.sectionId) ?? Number.MAX_SAFE_INTEGER;
      const sb = sectionOrder.get(b.sectionId) ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return a.order - b.order;
    });
};
