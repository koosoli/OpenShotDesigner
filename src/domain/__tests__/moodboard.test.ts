import { describe, it, expect } from 'vitest';
import { createBoard, addSection, addCard, moveCard, findCardsByEntity } from '../moodboard';
import type { MoodBoard, MoodBoardCard } from '../moodboard';
import { createId } from '../ids';

const card = (sectionId: string, order: number, extra?: Partial<MoodBoardCard>): MoodBoardCard => ({
  id: createId('card'),
  tags: [],
  sectionId,
  order,
  ...extra,
});

const boardWithCards = (): { board: MoodBoard; s0: string; s1: string; cards: MoodBoardCard[] } => {
  let board = createBoard(createId('board'), 'Look');
  const s0 = board.sections[0].id;
  board = addSection(board, 'Lighting');
  const s1 = board.sections[1].id;
  const c0 = card(s0, 0);
  const c1 = card(s0, 1);
  const c2 = card(s0, 2);
  const c3 = card(s1, 0);
  board = { ...board, cards: [c0, c1, c2, c3] };
  return { board, s0, s1, cards: [c0, c1, c2, c3] };
};

describe('createBoard', () => {
  it('creates a board with one default section', () => {
    const board = createBoard(createId('board'), 'Mood');
    expect(board.title).toBe('Mood');
    expect(board.sections).toHaveLength(1);
    expect(board.sections[0].order).toBe(0);
    expect(board.cards).toEqual([]);
  });
});

describe('addSection', () => {
  it('appends a section with max order + 1 without mutating the input', () => {
    const board = createBoard(createId('board'), 'Mood');
    const next = addSection(board, 'Second');
    expect(next.sections).toHaveLength(2);
    expect(next.sections[1].title).toBe('Second');
    expect(next.sections[1].order).toBe(1);
    expect(board.sections).toHaveLength(1);
  });

  it('continues ordering after gaps in section orders', () => {
    const board = createBoard(createId('board'), 'Mood');
    const gapped: MoodBoard = {
      ...board,
      sections: [{ id: createId('section'), title: 'A', order: 5 }],
    };
    expect(addSection(gapped, 'B').sections[1].order).toBe(6);
  });
});

describe('addCard', () => {
  it('appends to the given section with max order + 1', () => {
    const { board, s0 } = boardWithCards();
    const next = addCard(board, { id: createId('card'), tags: [], sectionId: s0 });
    const inSection = next.cards.filter((c) => c.sectionId === s0);
    expect(inSection).toHaveLength(4);
    expect(inSection.map((c) => c.order)).toEqual([0, 1, 2, 3]);
  });

  it('throws for an unknown section', () => {
    const { board } = boardWithCards();
    expect(() =>
      addCard(board, { id: createId('card'), tags: [], sectionId: 'nope' }),
    ).toThrow('Unknown section');
  });
});

describe('moveCard — within a section', () => {
  it('moves a card forward and compacts order 0..n-1', () => {
    const { board, s0, cards } = boardWithCards();
    const [c0, c1, c2] = cards;
    const next = moveCard(board, c0.id, s0, 2);
    const ordered = next.cards
      .filter((c) => c.sectionId === s0)
      .sort((a, b) => a.order - b.order);
    expect(ordered.map((c) => c.id)).toEqual([c1.id, c2.id, c0.id]);
    expect(ordered.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it('moves a card backward and compacts order 0..n-1', () => {
    const { board, s0, cards } = boardWithCards();
    const [c0, c1, c2] = cards;
    const next = moveCard(board, c2.id, s0, 0);
    const ordered = next.cards
      .filter((c) => c.sectionId === s0)
      .sort((a, b) => a.order - b.order);
    expect(ordered.map((c) => c.id)).toEqual([c2.id, c0.id, c1.id]);
    expect(ordered.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it('clamps out-of-range indices', () => {
    const { board, s0, cards } = boardWithCards();
    const [c0] = cards;
    const next = moveCard(board, c0.id, s0, 99);
    const ordered = next.cards.filter((c) => c.sectionId === s0).sort((a, b) => a.order - b.order);
    expect(ordered.map((c) => c.id)).toEqual([cards[1].id, cards[2].id, c0.id]);
  });
});

describe('moveCard — across sections', () => {
  it('moves into the target section at position and renumbers both sections', () => {
    const { board, s0, s1, cards } = boardWithCards();
    const [c0, , , c3] = cards;
    const next = moveCard(board, c0.id, s1, 0);

    const target = next.cards.filter((c) => c.sectionId === s1).sort((a, b) => a.order - b.order);
    expect(target.map((c) => c.id)).toEqual([c0.id, c3.id]);
    expect(target.map((c) => c.order)).toEqual([0, 1]);

    const source = next.cards.filter((c) => c.sectionId === s0).sort((a, b) => a.order - b.order);
    expect(source.map((c) => c.order)).toEqual([0, 1]);
  });

  it('throws when the target section does not exist', () => {
    const { board, cards } = boardWithCards();
    expect(() => moveCard(board, cards[0].id, 'nope', 0)).toThrow('Unknown section');
  });

  it('does not mutate the original board', () => {
    const { board, s1, cards } = boardWithCards();
    const snapshot = board.cards.map((c) => ({ id: c.id, sectionId: c.sectionId, order: c.order }));
    moveCard(board, cards[0].id, s1, 0);
    expect(board.cards.map((c) => ({ id: c.id, sectionId: c.sectionId, order: c.order }))).toEqual(
      snapshot,
    );
  });
});

describe('findCardsByEntity', () => {
  it('returns linked cards sorted by section order then card order', () => {
    const { board, s0, s1 } = boardWithCards();
    const locationId = createId('loc');
    // Later section (s1) but lower card order must come after earlier section.
    const lateSectionCard = card(s1, 9, { linkedEntity: { kind: 'location', id: locationId } });
    const earlySectionLow = card(s0, 0, { linkedEntity: { kind: 'location', id: locationId } });
    const earlySectionHigh = card(s0, 5, { linkedEntity: { kind: 'location', id: locationId } });
    const unlinked = card(s0, 1);
    const otherEntity = card(s0, 2, {
      linkedEntity: { kind: 'location', id: createId('loc') },
    });
    const full: MoodBoard = {
      ...board,
      cards: [...board.cards, lateSectionCard, earlySectionHigh, unlinked, otherEntity],
    };
    // Insert earlySectionLow with order 0 in s0 via moveCard for realism.
    const withAll = moveCard(
      { ...full, cards: [...full.cards, earlySectionLow] },
      earlySectionLow.id,
      s0,
      0,
    );

    const found = findCardsByEntity(withAll, 'location', locationId);
    expect(found.map((c) => c.id)).toEqual([
      earlySectionLow.id,
      earlySectionHigh.id,
      lateSectionCard.id,
    ]);
  });

  it('matches on both kind and id', () => {
    const board = createBoard(createId('board'), 'Mood');
    const shotId = createId('shot');
    const withCards: MoodBoard = {
      ...board,
      cards: [
        card(board.sections[0].id, 0, { linkedEntity: { kind: 'shot', id: shotId } }),
        card(board.sections[0].id, 1, { linkedEntity: { kind: 'setup', id: shotId } }),
        card(board.sections[0].id, 2, { linkedEntity: { kind: 'shot', id: createId('shot') } }),
      ],
    };
    expect(findCardsByEntity(withCards, 'shot', shotId)).toHaveLength(1);
  });
});
