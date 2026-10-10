import { describe, expect, it } from 'vitest';
import { deriveBreakdownSheets } from '../reports/breakdownSheet';
import type { ScriptScene } from '../script/types';

describe('deriveBreakdownSheets', () => {
  it('builds one sheet per scene with cast numbers, elements by department and the strip colour', () => {
    const scenes: ScriptScene[] = [
      { id: 's2', sceneNumber: '2', heading: 'EXT. ROAD - NIGHT', intExt: 'EXT', timeOfDay: 'NIGHT', characterIds: ['c1'], breakdownItemIds: ['i2', 'i1'], pageLengthEighths: 11 },
      { id: 's1', sceneNumber: '1', heading: 'INT. DINER - BOOTH - DAY', intExt: 'INT', timeOfDay: 'DAY', characterIds: [], breakdownItemIds: [] },
    ];
    const sheets = deriveBreakdownSheets({
      scenes,
      characters: [{ id: 'c1', canonicalName: 'ALEX', aliases: [] }],
      breakdownItems: [
        { id: 'i1', category: 'prop', name: 'Ledger' },
        { id: 'i2', category: 'vehicle', name: 'Taxi' },
      ],
      castAssignments: [{ id: 'a', characterId: 'c1', personId: 'p1', castNumber: 3 }],
      people: [{ id: 'p1', displayName: 'Marco', kind: 'cast' }],
      days: [{ id: 'd1', name: 'Day 1', scheduleBlockIds: ['b1'] }],
      blocks: [{ id: 'b1', kind: 'scene', scriptSceneId: 's2' }],
    });
    expect(sheets.map((sheet) => sheet.sceneNumber)).toEqual(['1', '2']);
    expect(sheets[0]).toMatchObject({ set: 'DINER - BOOTH', colorKey: 'int_day', shootDays: [] });
    expect(sheets[1]).toMatchObject({
      intExt: 'EXT',
      set: 'ROAD',
      colorKey: 'ext_night',
      shootDays: ['Day 1'],
      cast: [{ castNumber: 3, character: 'ALEX', performer: 'Marco' }],
      elements: [{ category: 'prop', items: ['Ledger'] }, { category: 'vehicle', items: ['Taxi'] }],
    });
  });
});
