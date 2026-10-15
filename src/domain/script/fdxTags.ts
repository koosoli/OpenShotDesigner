/**
 * Breakdown tags from a Final Draft file.
 *
 * A script tagged in Final Draft's Tagger carries its breakdown in
 * `<TagData>`: categories ("Props", "Wardrobe"…), definitions (one per
 * element, e.g. "Ledger" in Props), and numbered tags that the tagged words
 * point at with `TagNumber` on their `<Text>` run. Importing it means the
 * breakdown is not re-done by hand after switching tools.
 *
 * Elements are attached to script lines by the tagged paragraph's text, in
 * order — the screenplay importer drops empty and "omitted" paragraphs, so a
 * paragraph index would drift; the text does not.
 *
 * Cast Members are not imported as elements: the cast comes from the
 * dialogue cues already. Categories with no counterpart land in "other" with
 * their Final Draft name kept in the notes.
 */
import type { BreakdownCategory } from './types';
import { fdxBodyParagraphs } from './fdxParagraphs';

export interface FdxTaggedElement {
  category: BreakdownCategory;
  name: string;
  /** Final Draft's own category name, when it had no direct counterpart. */
  sourceCategory?: string;
  /** Text of each paragraph the element is tagged in, in script order. */
  paragraphs: string[];
}

const CATEGORY_MAP: Array<[RegExp, BreakdownCategory | null]> = [
  [/^cast/i, null],
  [/background|extra|atmosphere/i, 'extras'],
  [/stunt/i, 'stunt'],
  [/vehicle|picture car/i, 'vehicle'],
  [/^props?$|hand props?/i, 'prop'],
  [/wardrobe|costume/i, 'wardrobe'],
  [/make.?up|hair/i, 'makeup'],
  [/visual effect|vfx/i, 'vfx'],
  [/special effect|mechanical effect|sfx/i, 'sfx'],
  [/animal|livestock/i, 'animal'],
  [/music/i, 'music'],
  [/sound/i, 'sound'],
  [/special equipment|camera|grip|electric/i, 'special_equipment'],
];

const mapCategory = (name: string): BreakdownCategory | null | undefined => {
  for (const [pattern, category] of CATEGORY_MAP) if (pattern.test(name.trim())) return category;
  return undefined;
};

export const parseFdxTags = (raw: string): FdxTaggedElement[] => {
  if (!/<TagData/i.test(raw)) return [];
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (doc.querySelector('parsererror')) return [];

  const categories = new Map<string, string>();
  doc.querySelectorAll('TagData TagCategories TagCategory').forEach((node) => {
    const id = node.getAttribute('Id');
    if (id) categories.set(id, node.getAttribute('Name') ?? '');
  });

  interface Definition { categoryName: string; label: string }
  const definitions = new Map<string, Definition>();
  doc.querySelectorAll('TagData TagDefinitions TagDefinition').forEach((node) => {
    const id = node.getAttribute('Id');
    const label = (node.getAttribute('Label') ?? '').trim();
    if (!id || !label) return;
    definitions.set(id, { categoryName: categories.get(node.getAttribute('CatId') ?? '') ?? '', label });
  });

  // Tag number -> definition id.
  const tagDefinition = new Map<string, string>();
  doc.querySelectorAll('TagData Tags Tag').forEach((node) => {
    const number = node.getAttribute('Number');
    const defId = node.querySelector('DefId')?.textContent?.trim();
    if (number && defId) tagDefinition.set(number, defId);
  });

  // Paragraphs each definition is tagged in.
  const taggedIn = new Map<string, string[]>();
  fdxBodyParagraphs(doc).forEach(({ element: paragraph, text }) => {
    if (!text) return;
    const defs = new Set<string>();
    paragraph.querySelectorAll(':scope > Text[TagNumber]').forEach((run) => {
      const defId = tagDefinition.get(run.getAttribute('TagNumber') ?? '');
      if (defId) defs.add(defId);
    });
    for (const defId of defs) taggedIn.set(defId, [...(taggedIn.get(defId) ?? []), text]);
  });

  const out: FdxTaggedElement[] = [];
  for (const [id, definition] of definitions) {
    const category = mapCategory(definition.categoryName);
    if (category === null) continue; // cast comes from the dialogue
    out.push({
      category: category ?? 'other',
      name: definition.label,
      ...(category === undefined && definition.categoryName ? { sourceCategory: definition.categoryName } : {}),
      paragraphs: taggedIn.get(id) ?? [],
    });
  }
  return out;
};

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Line ids for each element's paragraphs, matched by text in script order
 * (a repeated line such as "Beat." pairs with successive occurrences).
 */
export const fdxTagLineIds = (
  elements: readonly FdxTaggedElement[],
  lines: ReadonlyArray<{ id: string; text: string }>,
): string[][] => {
  const byText = new Map<string, string[]>();
  for (const line of lines) {
    const key = normalize(line.text);
    byText.set(key, [...(byText.get(key) ?? []), line.id]);
  }
  return elements.map((element) => {
    const used = new Map<string, number>();
    const ids: string[] = [];
    for (const paragraph of element.paragraphs) {
      const key = normalize(paragraph);
      const candidates = byText.get(key) ?? [];
      const next = used.get(key) ?? 0;
      if (candidates[next]) ids.push(candidates[next]);
      used.set(key, next + 1);
    }
    return [...new Set(ids)];
  });
};
