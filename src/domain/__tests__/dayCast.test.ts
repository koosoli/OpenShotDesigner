import { describe, expect, it } from 'vitest';
import type { ScheduleBlock } from '../scheduling';
import { castNumbersScheduledOn, castPersonIdsForDay, charactersScheduledOn, type DayCastSources } from '../reports/dayCast';

const blocks: ScheduleBlock[] = [
  { id: 'b-scene', kind: 'scene', scriptSceneId: 'sc1' },
  { id: 'b-setup', kind: 'setup', setupId: 'su1' },
  { id: 'b-shots', kind: 'shots', shotIds: ['sh2'] },
  { id: 'b-banner', kind: 'manual', label: 'Lunch', manualType: 'meal' },
  { id: 'b-cue', kind: 'cue', cueId: 'cue1' },
];

const sources: DayCastSources = {
  scriptScenes: [{ id: 'sc1', characterIds: ['ch-sarah'] }],
  setups: [
    {
      id: 'su1',
      elements: [
        { id: 'a1', type: 'actor', characterId: 'ch-alex' },
        { id: 'a2', type: 'actor' }, // on the plan but not linked to a character
        { id: 'c1', type: 'camera' },
      ],
      shots: [{ id: 'sh1' }],
    },
    {
      id: 'su2',
      elements: [{ id: 'a3', type: 'actor', characterId: 'ch-detective' }],
      shots: [{ id: 'sh2' }],
    },
  ],
  castAssignments: [
    { id: 'ca1', characterId: 'ch-sarah', personId: 'p-hunter', castNumber: 1 },
    { id: 'ca2', characterId: 'ch-alex', personId: 'p-lenz', castNumber: 2 },
    { id: 'ca3', characterId: 'ch-detective', personId: 'p-solis', castNumber: 3 },
    { id: 'ca4', characterId: 'ch-uncast', personId: 'p-nobody', castNumber: 4 },
  ],
};

describe('charactersScheduledOn', () => {
  it('collects characters from a scheduled screenplay scene', () => {
    expect([...charactersScheduledOn(['b-scene'], blocks, sources)]).toEqual(['ch-sarah']);
  });

  it('collects characters from the actors on a scheduled SETUP', () => {
    // The regression this fixes: a script-free production schedules setups, and
    // used to get an empty cast list on its call sheets.
    expect([...charactersScheduledOn(['b-setup'], blocks, sources)]).toEqual(['ch-alex']);
  });

  it('collects characters from the setup a scheduled SHOT belongs to', () => {
    expect([...charactersScheduledOn(['b-shots'], blocks, sources)]).toEqual(['ch-detective']);
  });

  it('merges every block kind on the day without duplicates', () => {
    const result = charactersScheduledOn(['b-scene', 'b-setup', 'b-shots', 'b-setup'], blocks, sources);
    expect([...result].sort()).toEqual(['ch-alex', 'ch-detective', 'ch-sarah']);
  });

  it('ignores banners and cues, which carry no cast', () => {
    expect(charactersScheduledOn(['b-banner', 'b-cue'], blocks, sources).size).toBe(0);
  });

  it('ignores actor markers with no linked character rather than inventing one', () => {
    const result = charactersScheduledOn(['b-setup'], blocks, sources);
    expect(result.size).toBe(1);
  });

  it('survives block ids and setup ids that no longer resolve', () => {
    expect(charactersScheduledOn(['ghost'], blocks, sources).size).toBe(0);
    expect(
      charactersScheduledOn(['b-setup'], [{ id: 'b-setup', kind: 'setup', setupId: 'gone' }], sources).size,
    ).toBe(0);
  });

  it('returns nothing for a project with no scenes, setups or assignments', () => {
    expect(charactersScheduledOn(['b-setup'], blocks, {}).size).toBe(0);
  });
});

describe('castPersonIdsForDay', () => {
  it('resolves scheduled characters to the performers cast as them', () => {
    expect(castPersonIdsForDay(['b-scene', 'b-setup'], blocks, sources).sort()).toEqual([
      'p-hunter',
      'p-lenz',
    ]);
  });

  it('leaves out performers whose character is not scheduled', () => {
    expect(castPersonIdsForDay(['b-scene'], blocks, sources)).not.toContain('p-nobody');
  });

  it('lists a performer once even when two of their characters are scheduled', () => {
    const doubled: DayCastSources = {
      ...sources,
      castAssignments: [
        { id: 'ca1', characterId: 'ch-sarah', personId: 'p-same', castNumber: 1 },
        { id: 'ca2', characterId: 'ch-alex', personId: 'p-same', castNumber: 2 },
      ],
    };
    expect(castPersonIdsForDay(['b-scene', 'b-setup'], blocks, doubled)).toEqual(['p-same']);
  });

  it('returns nothing when the scheduled characters are uncast', () => {
    expect(castPersonIdsForDay(['b-setup'], blocks, { ...sources, castAssignments: [] })).toEqual([]);
  });

  it('returns nothing for an empty day', () => {
    expect(castPersonIdsForDay([], blocks, sources)).toEqual([]);
  });
});

describe('castNumbersScheduledOn', () => {
  it('returns the numbered roles needed by a scene, setup, or shot in numeric order', () => {
    expect(castNumbersScheduledOn(['b-shots', 'b-scene', 'b-setup'], blocks, sources)).toEqual([1, 2, 3]);
    expect(castNumbersScheduledOn(['b-shots'], blocks, sources)).toEqual([3]);
  });

  it('does not invent a number for an unassigned character', () => {
    expect(castNumbersScheduledOn(['b-scene'], blocks, { ...sources, castAssignments: [] })).toEqual([]);
  });
});
