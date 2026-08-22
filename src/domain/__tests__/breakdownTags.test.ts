import { describe, expect, it } from 'vitest';
import type { BreakdownItem, ScriptScene } from '../script/types';
import {
  BREAKDOWN_CATEGORIES,
  breakdownCategoryLabel,
  breakdownForScene,
  breakdownItemKey,
  groupBreakdownItems,
  removeBreakdownItem,
  sceneNumbersForBreakdownItem,
  scenesForBreakdownItem,
  tagBreakdownItem,
  untagScriptLine,
  updateBreakdownItem,
} from '../script/breakdownTags';

const lines = [
  { id: 'l1', sceneNumber: '4' },
  { id: 'l2', sceneNumber: '4' },
  { id: 'l3', sceneNumber: '9' },
  { id: 'l4' }, // before the first slugline: belongs to no scene
];

const scenes: ScriptScene[] = [
  { id: 's4', sceneNumber: '4', heading: 'INT. BAR — NIGHT', characterIds: [], breakdownItemIds: [] },
  { id: 's9', sceneNumber: '9', heading: 'EXT. STREET — DAY', characterIds: [], breakdownItemIds: [] },
];

describe('categories', () => {
  it('lists every category exactly once and puts "other" last', () => {
    const values = BREAKDOWN_CATEGORIES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values[values.length - 1]).toBe('other');
  });

  it('labels a category, falling back to its raw value', () => {
    expect(breakdownCategoryLabel('prop')).toBe('Props');
    expect(breakdownCategoryLabel('nonsense' as never)).toBe('nonsense');
  });
});

describe('tagBreakdownItem', () => {
  it('creates an item with the lines it was tagged from', () => {
    const items = tagBreakdownItem([], { category: 'prop', name: 'Whiskey glass', scriptLineIds: ['l1'] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ category: 'prop', name: 'Whiskey glass', sourceScriptLineIds: ['l1'] });
  });

  it('trims the name and rejects a blank one', () => {
    expect(tagBreakdownItem([], { category: 'prop', name: '  Ledger  ' })[0].name).toBe('Ledger');
    expect(tagBreakdownItem([], { category: 'prop', name: '   ' })).toEqual([]);
  });

  it('merges a repeat tag into the existing item instead of duplicating it', () => {
    // This is what makes "appears in scenes 4 and 9" derivable rather than
    // something anyone has to maintain by hand.
    let items = tagBreakdownItem([], { category: 'prop', name: 'Ledger', scriptLineIds: ['l1'] });
    items = tagBreakdownItem(items, { category: 'prop', name: 'ledger', scriptLineIds: ['l3'] });
    expect(items).toHaveLength(1);
    expect(items[0].sourceScriptLineIds!.sort()).toEqual(['l1', 'l3']);
  });

  it('treats the same name in a different category as a different element', () => {
    let items = tagBreakdownItem([], { category: 'prop', name: 'Coat' });
    items = tagBreakdownItem(items, { category: 'wardrobe', name: 'Coat' });
    expect(items).toHaveLength(2);
  });

  it('does not duplicate a line id that was already recorded', () => {
    let items = tagBreakdownItem([], { category: 'prop', name: 'Ledger', scriptLineIds: ['l1'] });
    items = tagBreakdownItem(items, { category: 'prop', name: 'Ledger', scriptLineIds: ['l1'] });
    expect(items[0].sourceScriptLineIds).toEqual(['l1']);
  });

  it('never mutates the input list', () => {
    const original: BreakdownItem[] = [];
    tagBreakdownItem(original, { category: 'prop', name: 'Ledger' });
    expect(original).toHaveLength(0);
  });
});

describe('editing and removal', () => {
  const items = tagBreakdownItem([], { category: 'prop', name: 'Ledger', scriptLineIds: ['l1', 'l3'] });

  it('updates a field without touching the others', () => {
    const next = updateBreakdownItem(items, items[0].id, { notes: 'Period-correct' });
    expect(next[0].notes).toBe('Period-correct');
    expect(next[0].name).toBe('Ledger');
  });

  it('removes an item', () => {
    expect(removeBreakdownItem(items, items[0].id)).toEqual([]);
    expect(removeBreakdownItem(items, 'ghost')).toHaveLength(1);
  });

  it('untags one line and keeps the item', () => {
    const next = untagScriptLine(items, items[0].id, 'l1');
    expect(next[0].sourceScriptLineIds).toEqual(['l3']);
  });

  it('keeps an item that has been untagged everywhere — it is still needed', () => {
    let next = untagScriptLine(items, items[0].id, 'l1');
    next = untagScriptLine(next, items[0].id, 'l3');
    expect(next).toHaveLength(1);
    expect(next[0].sourceScriptLineIds).toEqual([]);
  });
});

describe('grouping and scene resolution', () => {
  const items = [
    ...tagBreakdownItem([], { category: 'prop', name: 'Ledger', scriptLineIds: ['l1'] }),
    ...tagBreakdownItem([], { category: 'prop', name: 'Ashtray', scriptLineIds: ['l3'] }),
    ...tagBreakdownItem([], { category: 'vehicle', name: 'Taxi', scriptLineIds: ['l3'] }),
    ...tagBreakdownItem([], { category: 'stunt', name: 'Fall', scriptLineIds: ['gone'] }),
  ];

  it('groups by category in display order and sorts names inside a group', () => {
    const groups = groupBreakdownItems(items);
    expect(groups.map((g) => g.category)).toEqual(['prop', 'vehicle', 'stunt']);
    expect(groups[0].items.map((i) => i.name)).toEqual(['Ashtray', 'Ledger']);
  });

  it('omits categories with nothing in them', () => {
    expect(groupBreakdownItems(items).some((g) => g.category === 'wardrobe')).toBe(false);
  });

  it('resolves the scene numbers an item was tagged from', () => {
    const ledger = items.find((i) => i.name === 'Ledger')!;
    expect(sceneNumbersForBreakdownItem(ledger, lines)).toEqual(['4']);
  });

  it('resolves the scenes themselves', () => {
    const taxi = items.find((i) => i.name === 'Taxi')!;
    expect(scenesForBreakdownItem(taxi, lines, scenes).map((s) => s.sceneNumber)).toEqual(['9']);
  });

  it('reports no scenes for an item whose lines are gone, rather than dropping it', () => {
    const fall = items.find((i) => i.name === 'Fall')!;
    expect(scenesForBreakdownItem(fall, lines, scenes)).toEqual([]);
    expect(groupBreakdownItems(items).some((g) => g.category === 'stunt')).toBe(true);
  });

  it('ignores a source line that belongs to no scene', () => {
    const orphan = tagBreakdownItem([], { category: 'prop', name: 'Cup', scriptLineIds: ['l4'] })[0];
    expect(sceneNumbersForBreakdownItem(orphan, lines)).toEqual([]);
  });

  it('lists what one scene needs', () => {
    const scene9 = breakdownForScene(items, lines, '9');
    expect(scene9.map((g) => g.category)).toEqual(['prop', 'vehicle']);
    expect(scene9[0].items.map((i) => i.name)).toEqual(['Ashtray']);
  });

  it('returns nothing for a scene with no tagged elements', () => {
    expect(breakdownForScene(items, lines, '99')).toEqual([]);
  });
});

describe('breakdownItemKey', () => {
  it('is case- and whitespace-insensitive within a category', () => {
    expect(breakdownItemKey({ category: 'prop', name: ' Ledger ' })).toBe(
      breakdownItemKey({ category: 'prop', name: 'ledger' }),
    );
  });
});
