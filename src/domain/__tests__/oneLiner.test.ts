import { describe, expect, it } from 'vitest';
import { deriveOneLiner } from '../reports/oneLiner';

describe('deriveOneLiner', () => {
  it('lists each scheduled scene once per day with banners, cast numbers and a page total', () => {
    const days = deriveOneLiner({
      days: [{ id: 'd1', name: 'Day 1', date: '2026-10-17', scheduleBlockIds: ['b1', 'b2', 'meal', 'b3'] }],
      blocks: [
        { id: 'b1', kind: 'setup', setupId: 'set1' },
        { id: 'b2', kind: 'shots', shotIds: ['shot1'] },
        { id: 'meal', kind: 'manual', manualType: 'meal', label: 'Lunch' },
        { id: 'b3', kind: 'scene', scriptSceneId: 's2' },
      ],
      scenes: [
        { id: 's1', sceneNumber: '1', heading: 'INT. LIVING ROOM - NIGHT', intExt: 'INT', timeOfDay: 'NIGHT', characterIds: ['c1'], breakdownItemIds: ['i1'], pageLengthEighths: 5 },
        { id: 's2', sceneNumber: '2', heading: 'EXT. ROAD - DAY', intExt: 'EXT', timeOfDay: 'DAY', characterIds: [], breakdownItemIds: [], pageLengthEighths: 8 },
      ],
      setups: [{ id: 'set1', sceneNumber: '1', shots: [{ id: 'shot1' }] }],
      castAssignments: [{ id: 'a', characterId: 'c1', personId: 'p', castNumber: 1 }],
      breakdownItems: [{ id: 'i1', category: 'prop', name: 'Ledger' }],
      withElements: true,
    });
    const entries = days[0].entries;
    expect(entries.map((entry) => (entry.kind === 'scene' ? entry.sceneNumber : entry.label))).toEqual(['1', 'Lunch', '2']);
    expect(entries[0]).toMatchObject({ set: 'LIVING ROOM', castNumbers: [1], colorKey: 'int_night', elements: [{ category: 'prop', items: ['Ledger'] }] });
    expect(entries[1]).toMatchObject({ kind: 'banner', colorKey: 'meal' });
    expect(entries[2]).toMatchObject({ colorKey: 'ext_day' });
    expect(days[0].pageEighths).toBe(13);
  });
});
