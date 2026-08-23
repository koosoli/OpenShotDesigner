/**
 * Script breakdown tagging (plan §9).
 *
 * A breakdown is the list of everything a scene needs that is not a person or a
 * place: props, wardrobe, vehicles, effects, animals, stunts, extras. The model,
 * the migrations and the reports have carried `breakdownItems` from the start,
 * but nothing could create one — so the element half of the breakdown was always
 * empty. These are the operations the tagging UI is built from.
 *
 * An item remembers which script lines it was tagged from
 * (`sourceScriptLineIds`), which is what lets a report say which scenes need it
 * without storing a second copy of that relationship (rule 37).
 */

import { createId } from '../ids';
import type {
  BreakdownCategory,
  BreakdownItem,
  BreakdownSourceRange,
  ScriptScene,
} from './types';

/** Display order and labels. `other` is deliberately last. */
export const BREAKDOWN_CATEGORIES: Array<{ value: BreakdownCategory; label: string; tint: string }> = [
  { value: 'prop', label: 'Props', tint: '#f59e0b' },
  { value: 'wardrobe', label: 'Wardrobe', tint: '#ec4899' },
  { value: 'makeup', label: 'Hair & make-up', tint: '#a855f7' },
  { value: 'vehicle', label: 'Vehicles', tint: '#0ea5e9' },
  { value: 'animal', label: 'Animals', tint: '#84cc16' },
  { value: 'stunt', label: 'Stunts', tint: '#ef4444' },
  { value: 'sfx', label: 'Special effects', tint: '#f97316' },
  { value: 'vfx', label: 'Visual effects', tint: '#6366f1' },
  { value: 'sound', label: 'Sound', tint: '#14b8a6' },
  { value: 'music', label: 'Music', tint: '#8b5cf6' },
  { value: 'extras', label: 'Extras / atmos', tint: '#64748b' },
  { value: 'special_equipment', label: 'Special equipment', tint: '#0891b2' },
  { value: 'other', label: 'Other', tint: '#94a3b8' },
];

export const breakdownCategoryLabel = (category: BreakdownCategory): string =>
  BREAKDOWN_CATEGORIES.find((entry) => entry.value === category)?.label ?? category;

export const breakdownCategoryTint = (category: BreakdownCategory): string =>
  BREAKDOWN_CATEGORIES.find((entry) => entry.value === category)?.tint ?? '#94a3b8';

/** Same name and category = the same element, however it was capitalised. */
export const breakdownItemKey = (item: Pick<BreakdownItem, 'category' | 'name'>): string =>
  `${item.category}::${item.name.trim().toLowerCase()}`;

/** Identity of a range, so tagging the same words twice does not stack them. */
const rangeKey = (range: BreakdownSourceRange): string =>
  `${range.lineId}:${range.startOffset ?? ''}:${range.endOffset ?? ''}`;

/**
 * Merge two range lists, keeping the first occurrence of each.
 *
 * A range that covers a whole line swallows the partial ranges on that line:
 * once an element is tagged across the entire line, tinting a few words inside
 * it as well would draw the same tag twice on top of itself.
 */
const mergeRanges = (
  existing: readonly BreakdownSourceRange[],
  incoming: readonly BreakdownSourceRange[],
): BreakdownSourceRange[] => {
  const all = [...existing, ...incoming];
  const wholeLineIds = new Set(
    all.filter((r) => r.startOffset === undefined && r.endOffset === undefined).map((r) => r.lineId),
  );
  const seen = new Set<string>();
  const out: BreakdownSourceRange[] = [];
  for (const range of all) {
    const isWhole = range.startOffset === undefined && range.endOffset === undefined;
    if (!isWhole && wholeLineIds.has(range.lineId)) continue;
    const key = rangeKey(range);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(range);
  }
  return out;
};

/**
 * Tag a stretch of script as a breakdown element.
 *
 * Tagging the same element again from a different part of the script does NOT
 * create a duplicate: the existing item gains the new source lines. That is
 * what makes "this prop appears in scenes 4, 9 and 12" derivable rather than
 * something the user has to maintain by hand.
 *
 * A blank name is rejected — an unnamed element cannot be found on a report or
 * bought by an art department.
 */
export const tagBreakdownItem = (
  items: readonly BreakdownItem[],
  input: {
    category: BreakdownCategory;
    name: string;
    notes?: string;
    scriptLineIds?: string[];
    /**
     * Where on each line the words sit. Supplying these also supplies the
     * lines, so the page can tint exactly what was highlighted without the
     * caller having to pass the same relationship twice.
     */
    scriptRanges?: BreakdownSourceRange[];
  },
): BreakdownItem[] => {
  const name = input.name.trim();
  if (!name) return [...items];

  const key = breakdownItemKey({ category: input.category, name });
  const ranges = input.scriptRanges ?? [];
  // Ranges imply their lines, so a caller never has to keep the two in step.
  const lineIds = [...new Set([...(input.scriptLineIds ?? []), ...ranges.map((r) => r.lineId)])];
  const existing = items.find((item) => breakdownItemKey(item) === key);

  if (existing) {
    const mergedLines = new Set([...(existing.sourceScriptLineIds ?? []), ...lineIds]);
    const mergedRanges = mergeRanges(existing.sourceRanges ?? [], ranges);
    return items.map((item) =>
      item.id === existing.id
        ? {
            ...item,
            ...(input.notes ? { notes: input.notes } : {}),
            ...(mergedLines.size > 0 ? { sourceScriptLineIds: [...mergedLines] } : {}),
            ...(mergedRanges.length > 0 ? { sourceRanges: mergedRanges } : {}),
          }
        : item,
    );
  }

  return [
    ...items,
    {
      id: createId('bditem'),
      category: input.category,
      name,
      ...(input.notes ? { notes: input.notes } : {}),
      ...(lineIds.length > 0 ? { sourceScriptLineIds: lineIds } : {}),
      ...(ranges.length > 0 ? { sourceRanges: mergeRanges([], ranges) } : {}),
    },
  ];
};

export const updateBreakdownItem = (
  items: readonly BreakdownItem[],
  itemId: string,
  updates: Partial<Omit<BreakdownItem, 'id'>>,
): BreakdownItem[] =>
  items.map((item) => (item.id === itemId ? { ...item, ...updates } : item));

export const removeBreakdownItem = (
  items: readonly BreakdownItem[],
  itemId: string,
): BreakdownItem[] => items.filter((item) => item.id !== itemId);

/**
 * Drop one script line from an item's sources; an item with none left stays.
 *
 * The element itself survives on purpose. Untagging says "these words are not
 * where this prop comes from", not "the production no longer needs the prop" —
 * that is what deleting the element is for.
 */
export const untagScriptLine = (
  items: readonly BreakdownItem[],
  itemId: string,
  lineId: string,
): BreakdownItem[] =>
  items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          sourceScriptLineIds: (item.sourceScriptLineIds ?? []).filter((id) => id !== lineId),
          sourceRanges: (item.sourceRanges ?? []).filter((range) => range.lineId !== lineId),
        }
      : item,
  );

/** One element's claim on one line, which is what the page draws. */
export interface BreakdownLineTag {
  item: BreakdownItem;
  /** Absent when the item was tagged before ranges existed: tint the whole line. */
  range?: BreakdownSourceRange;
}

/**
 * Every element tagged on one script line, so the page can tint the words.
 *
 * An item that claims the line but has no range for it (anything tagged before
 * ranges existed, or added by hand and pointed at a line) yields a tag with no
 * range, which the page renders as a whole-line mark rather than dropping.
 */
export const breakdownTagsForLine = (
  items: readonly BreakdownItem[],
  lineId: string,
): BreakdownLineTag[] => {
  const tags: BreakdownLineTag[] = [];
  for (const item of items) {
    const ranges = (item.sourceRanges ?? []).filter((range) => range.lineId === lineId);
    if (ranges.length > 0) {
      for (const range of ranges) tags.push({ item, range });
    } else if ((item.sourceScriptLineIds ?? []).includes(lineId)) {
      tags.push({ item });
    }
  }
  return tags;
};

/** Every element tagged anywhere in a set of lines, each listed once. */
export const breakdownItemsForLines = (
  items: readonly BreakdownItem[],
  lineIds: readonly string[],
): BreakdownItem[] => {
  const wanted = new Set(lineIds);
  return items.filter((item) => (item.sourceScriptLineIds ?? []).some((id) => wanted.has(id)));
};

/**
 * Drop every pointer into script lines that no longer exist.
 *
 * Deleting a line (or a whole omitted scene) used to leave elements claiming
 * it, which is invisible until a report tries to say which scenes need the
 * prop and silently finds none. The element survives the loss of its source —
 * the art department still has to find the ashtray — but the dead pointer goes
 * (see `domain/integrity.ts` for the same rule applied to shots and trusses).
 */
export const pruneBreakdownScriptLines = (
  items: readonly BreakdownItem[],
  liveLineIds: ReadonlySet<string> | readonly string[],
): BreakdownItem[] => {
  const live = liveLineIds instanceof Set ? liveLineIds : new Set(liveLineIds);
  let changed = false;
  const next = items.map((item) => {
    const lineIds = item.sourceScriptLineIds ?? [];
    const ranges = item.sourceRanges ?? [];
    const keptLines = lineIds.filter((id) => live.has(id));
    const keptRanges = ranges.filter((range) => live.has(range.lineId));
    if (keptLines.length === lineIds.length && keptRanges.length === ranges.length) return item;
    changed = true;
    return {
      ...item,
      ...(lineIds.length > 0 ? { sourceScriptLineIds: keptLines } : {}),
      ...(ranges.length > 0 ? { sourceRanges: keptRanges } : {}),
    };
  });
  return changed ? next : [...items];
};

export interface BreakdownCategoryGroup {
  category: BreakdownCategory;
  label: string;
  tint: string;
  items: BreakdownItem[];
}

/** Items grouped by category in display order; empty categories are omitted. */
export const groupBreakdownItems = (
  items: readonly BreakdownItem[],
): BreakdownCategoryGroup[] =>
  BREAKDOWN_CATEGORIES.map(({ value, label, tint }) => ({
    category: value,
    label,
    tint,
    items: items
      .filter((item) => item.category === value)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.items.length > 0);

/** The minimum a script line has to expose to place it in a scene. */
export interface BreakdownSourceLine {
  id: string;
  sceneNumber?: string;
}

/** Scene numbers an item was tagged from, via the lines that carry them. */
export const sceneNumbersForBreakdownItem = (
  item: BreakdownItem,
  lines: readonly BreakdownSourceLine[],
): string[] => {
  const lineIds = new Set(item.sourceScriptLineIds ?? []);
  if (lineIds.size === 0) return [];
  const numbers = new Set<string>();
  for (const line of lines) {
    if (lineIds.has(line.id) && line.sceneNumber) numbers.add(line.sceneNumber);
  }
  return [...numbers];
};

/**
 * Which scenes each item appears in, resolved through the script lines it was
 * tagged from. An item whose lines no longer exist reports no scenes rather
 * than disappearing — the element is still needed, the pointer into the script
 * is just stale.
 */
export const scenesForBreakdownItem = (
  item: BreakdownItem,
  lines: readonly BreakdownSourceLine[],
  scenes: readonly ScriptScene[],
): ScriptScene[] => {
  const numbers = new Set(sceneNumbersForBreakdownItem(item, lines));
  if (numbers.size === 0) return [];
  return scenes.filter((scene) => numbers.has(scene.sceneNumber));
};

/** Every element needed by one scene, grouped by category. */
export const breakdownForScene = (
  items: readonly BreakdownItem[],
  lines: readonly BreakdownSourceLine[],
  sceneNumber: string,
): BreakdownCategoryGroup[] => {
  const sceneLineIds = new Set(
    lines.filter((line) => line.sceneNumber === sceneNumber).map((line) => line.id),
  );
  const inScene = items.filter((item) =>
    (item.sourceScriptLineIds ?? []).some((id) => sceneLineIds.has(id)),
  );
  return groupBreakdownItems(inScene);
};

/**
 * Fill each scene's `breakdownItemIds` from the elements tagged inside it.
 *
 * `ScriptScene` has carried `breakdownItemIds` since v1 and every scene report
 * reads it, but `deriveScriptBreakdown` always returns it empty — the scenes
 * are derived from the script, and the script does not know about elements.
 * Rather than storing the scene→element link a second time (it would drift from
 * `sourceScriptLineIds` the moment a scene is renumbered), resolve it here and
 * hand the reports scenes that already know what they need (rule 37).
 *
 * Ids already on a scene are kept and merged, so a scene that acquires its
 * elements some other way is not overwritten.
 */
export const attachBreakdownItemsToScenes = <T extends ScriptScene>(
  scenes: readonly T[],
  lines: readonly BreakdownSourceLine[],
  items: readonly BreakdownItem[],
): T[] => {
  if (items.length === 0) return [...scenes];

  const sceneNumberByLineId = new Map<string, string>();
  for (const line of lines) {
    if (line.sceneNumber) sceneNumberByLineId.set(line.id, line.sceneNumber);
  }

  const itemIdsBySceneNumber = new Map<string, string[]>();
  for (const item of items) {
    for (const lineId of item.sourceScriptLineIds ?? []) {
      const sceneNumber = sceneNumberByLineId.get(lineId);
      if (!sceneNumber) continue;
      const bucket = itemIdsBySceneNumber.get(sceneNumber);
      if (bucket) {
        if (!bucket.includes(item.id)) bucket.push(item.id);
      } else {
        itemIdsBySceneNumber.set(sceneNumber, [item.id]);
      }
    }
  }

  return scenes.map((scene) => {
    const tagged = itemIdsBySceneNumber.get(scene.sceneNumber);
    if (!tagged) return scene;
    const merged = [...scene.breakdownItemIds];
    for (const id of tagged) if (!merged.includes(id)) merged.push(id);
    return merged.length === scene.breakdownItemIds.length ? scene : { ...scene, breakdownItemIds: merged };
  });
};
