import { describe, it, expect } from 'vitest';
import { deriveDood } from '../reports/dood';
import type { Character } from '../script/types';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import type { CastAssignment, Person } from '../people';

const characters: Character[] = [
  { id: 'c-hero', canonicalName: 'HERO', aliases: [] },
  { id: 'c-side', canonicalName: 'SIDEKICK', aliases: [] },
  { id: 'c-cameo', canonicalName: 'CAMEO', aliases: [] },
];

const people: Person[] = [{ id: 'p-hero', displayName: 'Ada Star', kind: 'cast' }];
const castAssignments: CastAssignment[] = [
  { id: 'ca-1', characterId: 'c-hero', personId: 'p-hero' },
];

// Scene → characters mapping used by the resolver.
const sceneCast: Record<string, string[]> = {
  'sc-1': ['c-hero'],
  'sc-2': ['c-hero', 'c-side'],
  'sc-3': ['c-side'],
  'sc-4': [], // no characters
};

const days: ProductionDay[] = [
  { id: 'd1', name: 'Day 1', date: '2026-09-01', scheduleBlockIds: ['b1'] },
  { id: 'd2', name: 'Day 2', scheduleBlockIds: ['b2', 'b2b', 'b-meal'] },
  { id: 'd3', name: 'Day 3', scheduleBlockIds: ['b3'] }, // gap day for HERO
  { id: 'd4', name: 'Day 4', scheduleBlockIds: ['b4'] },
];

const blocks: ScheduleBlock[] = [
  { id: 'b1', kind: 'scene', scriptSceneId: 'sc-1' },
  { id: 'b2', kind: 'scene', scriptSceneId: 'sc-2' },
  { id: 'b2b', kind: 'scene', scriptSceneId: 'sc-4' },
  { id: 'b3', kind: 'scene', scriptSceneId: 'sc-3' },
  { id: 'b4', kind: 'scene', scriptSceneId: 'sc-1' },
  { id: 'b-meal', kind: 'manual', label: 'Lunch' },
];

describe('deriveDood', () => {
  it('derives start/work/hold/finish/off across a 4-day schedule with a gap', () => {
    const result = deriveDood({
      days,
      blocks,
      characters,
      getSceneCharacterIds: (id) => sceneCast[id],
    });

    expect(result.columns).toEqual([
      { dayId: 'd1', dayName: 'Day 1', date: '2026-09-01' },
      { dayId: 'd2', dayName: 'Day 2' },
      { dayId: 'd3', dayName: 'Day 3' },
      { dayId: 'd4', dayName: 'Day 4' },
    ]);

    const byCharacter = Object.fromEntries(
      result.rows.map((r) => [r.characterId, r.cells.map((c) => c.status)]),
    );

    // HERO: works d1 (start), d2 (work), gap d3 (hold), d4 (finish).
    expect(byCharacter['c-hero']).toEqual(['start', 'work', 'hold', 'finish']);
    // SIDEKICK: off d1, start d2, finish d3, off d4 (scenes sc-2 and sc-3 only).
    expect(byCharacter['c-side']).toEqual(['off', 'start', 'finish', 'off']);
    // CAMEO never works: all off. Empty range means no hold either.
    expect(byCharacter['c-cameo']).toEqual(['off', 'off', 'off', 'off']);
  });

  it('uses the cast Person display name when linked via CastAssignment', () => {
    const result = deriveDood({
      days,
      blocks,
      characters,
      castAssignments,
      people,
      getSceneCharacterIds: (id) => sceneCast[id],
    });
    expect(result.rows.find((r) => r.characterId === 'c-hero')?.displayName).toBe('Ada Star');
    expect(result.rows.find((r) => r.characterId === 'c-side')?.displayName).toBe('SIDEKICK');
  });

  it('supports the scenesPerCharacter refinement predicate alone', () => {
    const result = deriveDood({
      days,
      blocks,
      characters: [characters[0]],
      scenesPerCharacter: (characterId, sceneId) =>
        characterId === 'c-hero' && (sceneId === 'sc-1' || sceneId === 'sc-3'),
    });
    // HERO's refined scenes: sc-1 (d1, also d4 via b4) and sc-3 (d3)
    // → start d1, hold d2, work d3, finish d4.
    expect(result.rows[0].cells.map((c) => c.status)).toEqual(['start', 'hold', 'work', 'finish']);
  });

  it('marks manual/non-scene blocks as non-working days', () => {
    const single = [
      {
        id: 'only',
        name: 'Only Day',
        scheduleBlockIds: ['meal-only'],
      },
    ];
    const result = deriveDood({
      days: single,
      blocks: [{ id: 'meal-only', kind: 'manual', label: 'Company Move' }],
      characters,
      getSceneCharacterIds: () => [],
    });
    expect(result.rows.every((r) => r.cells[0].status === 'off')).toBe(true);
  });
});
