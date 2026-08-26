import { describe, expect, it } from 'vitest';
import { countNeedDays, deriveDayNeeds, equipmentKey, setupIdsScheduledOn } from '../reports';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import type { Person } from '../people';

const people: Person[] = [
  { id: 'dop', displayName: 'Ines', kind: 'crew' },
  { id: 'gaffer', displayName: 'Tom', kind: 'crew' },
  { id: 'mara', displayName: 'Mara', kind: 'cast' },
  { id: 'ola', displayName: 'Ola', kind: 'cast' },
  { id: 'client', displayName: 'Agency', kind: 'client' },
];

const setups = [
  { id: 'u1', sceneNumber: '1', elements: [{ id: 'a1', type: 'actor', characterId: 'c-sarah' }], shots: [{ id: 's1a' }] },
  { id: 'u2', sceneNumber: '2', elements: [], shots: [{ id: 's2a' }] },
];
const scriptScenes = [
  { id: 'sc1', sceneNumber: '1', characterIds: ['c-sarah'] },
  { id: 'sc2', sceneNumber: '2', characterIds: [] },
];
const blocks: ScheduleBlock[] = [
  { id: 'b-sc1', kind: 'scene', scriptSceneId: 'sc1' },
  { id: 'b-shot', kind: 'shots', shotIds: ['s2a'] },
  { id: 'b-setup', kind: 'setup', setupId: 'u2' },
  { id: 'b-lunch', kind: 'manual', label: 'Lunch' },
];
const days: ProductionDay[] = [
  { id: 'd1', name: 'Day 1', scheduleBlockIds: ['b-sc1', 'b-lunch'] },
  { id: 'd2', name: 'Day 2', scheduleBlockIds: ['b-shot', 'b-setup'] },
  { id: 'scout', name: 'Scout', scheduleBlockIds: [], callSheet: { type: 'scout' } },
];
const gear = {
  u1: [{ category: 'lighting', name: 'LS 1200d Pro', brand: 'Aputure', quantity: 2 }, { category: 'camera', name: 'Camera A', quantity: 1 }],
  u2: [{ category: 'lighting', name: 'LS 1200d Pro', brand: 'Aputure', quantity: 1 }],
} as Record<string, Array<{ category: string; name: string; brand?: string; quantity: number }>>;

describe('setupIdsScheduledOn', () => {
  it('resolves setups through setup, shots and scene-number blocks', () => {
    expect(setupIdsScheduledOn(days[0], blocks, setups, scriptScenes)).toEqual(['u1']);
    expect(setupIdsScheduledOn(days[1], blocks, setups, scriptScenes)).toEqual(['u2']);
  });
});

describe('deriveDayNeeds', () => {
  const needs = deriveDayNeeds({
    days,
    blocks,
    people,
    setups,
    scriptScenes,
    castAssignments: [{ id: 'ca', characterId: 'c-sarah', personId: 'mara', castNumber: 1 }],
    equipmentForSetup: (id) => gear[id] ?? [],
  });

  it('calls the cast the schedule resolves to, and every crew member on a shooting day', () => {
    expect(needs[0].castPersonIds).toEqual(['mara']);
    expect(needs[0].crewPersonIds).toEqual(['dop', 'gaffer']);
    expect(needs[1].castPersonIds).toEqual([]);
    expect(needs[2].crewPersonIds).toEqual([]);
    expect(needs[2].kind).toBe('scout');
  });

  it('lists scene numbers and the gear the day needs, at the peak per setup', () => {
    expect(needs[0].sceneNumbers).toEqual(['1']);
    expect(needs[0].equipment).toEqual([
      { key: 'lighting:aputure:ls 1200d pro', label: 'Aputure LS 1200d Pro', category: 'lighting', quantity: 2 },
      { key: 'camera::camera a', label: 'Camera A', category: 'camera', quantity: 1 },
    ]);
    expect(needs[1].equipment[0].quantity).toBe(1);
  });

  it('calls every performer when the production has no cast model', () => {
    const loose = deriveDayNeeds({ days, blocks, people, setups, scriptScenes, equipmentForSetup: () => [] });
    expect(loose[1].castPersonIds).toEqual(['mara', 'ola']);
  });

  it('counts the days each person and item is needed', () => {
    const counts = countNeedDays(needs);
    expect(counts.shootDays).toBe(2);
    expect(counts.personDays.get('dop')).toBe(2);
    expect(counts.personDays.get('mara')).toBe(1);
    expect(counts.personDays.get('ola')).toBeUndefined();
    expect(counts.equipmentDays.get('lighting:aputure:ls 1200d pro')).toBe(2);
    expect(counts.equipmentDays.get('camera::camera a')).toBe(1);
  });
});

describe('equipmentKey', () => {
  it('matches the master equipment list grouping', () => {
    expect(equipmentKey({ category: 'grip', name: 'Dolly', brand: ' Panther ', model: 'Classic' })).toBe('grip:panther:classic');
    expect(equipmentKey({ category: 'grip', name: 'C-Stand' })).toBe('grip::c-stand');
  });
});
