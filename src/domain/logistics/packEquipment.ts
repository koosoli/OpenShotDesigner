/**
 * Turning the derived equipment manifest into packed items (plan §24).
 *
 * The load list used to be typed out a second time by hand, which meant the
 * truck and the equipment list disagreed the moment a scene changed. This
 * module takes manifest rows the equipment module already derived, looks their
 * weight up in the fixture catalogue, and produces packed items that stay
 * linked to the row they came from via `PackedItem.sourceEquipmentKey`.
 *
 * Rule 13 governs the weights: a unit the catalogue does not know is packed
 * with no weight at all, so the container total reads "unknown" rather than a
 * flattering figure that leaves gear out.
 */

// Imported from the modules themselves rather than through the domain
// barrels: the fixtures barrel also pulls in the catalogue store and its
// bundled snapshot loader, which a pure packing calculation has no use for.
import { equipmentKey } from '../reports/dayNeeds';
import { findProfileForModel } from '../fixtures/brandCatalog';
import type { FixtureProfile } from '../fixtures/types';
import type { PackedItem } from './types';

/**
 * A manifest row worth packing. Structural on purpose: both `EquipmentItem`
 * (one scene) and `MasterEquipmentItem` (the whole production) satisfy it, so
 * the caller picks the scope without this module knowing which it got.
 */
export interface PackableEquipment {
  category: string;
  name: string;
  brand?: string;
  model?: string;
  /** How many units travel — for a whole production that is the peak a single setup needs, not the sum over the shoot. */
  quantity: number;
  /**
   * The catalogue fixture this row came from, when the plan named one.
   * Preferred over the brand/model strings for the weight lookup.
   */
  fixtureProfileId?: string;
}

export interface PackEquipmentOptions {
  equipment: readonly PackableEquipment[];
  /** Container the newly created items land in. */
  containerId: string;
  existingItems: readonly PackedItem[];
  /** Per-unit weight where it is known; undefined stays unknown (rule 13). */
  unitWeightKg: (item: PackableEquipment) => number | undefined;
  newId: () => string;
}

export interface PackEquipmentResult {
  /** The complete replacement `packedItems` collection. */
  items: PackedItem[];
  /** Manifest rows that became new packed items. */
  added: number;
  /** Previously generated rows this run rewrote. */
  updated: number;
  /** Generated rows the catalogue has no weight for — somebody has to weigh them. */
  unknownWeightCount: number;
}

/** How a packed item is labelled: "ARRI SkyPanel S60-C", or the plain name when the brand adds nothing. */
export const packedLabelFor = (item: PackableEquipment): string => {
  const model = (item.model || item.name).trim();
  const brand = (item.brand || '').trim();
  if (!brand || /^generic$/i.test(brand) || model.toLowerCase().startsWith(brand.toLowerCase())) {
    return model || item.name;
  }
  return `${brand} ${model}`;
};

/**
 * Per-unit weight for a manifest row, from the fixture catalogue.
 *
 * By id when the row carries one: the plan element that produced it already
 * knew exactly which profile it was, and matching on brand-and-model strings
 * throws that away — it fails when two profiles share a model name, when a
 * user renames a custom profile, and whenever the manifest's display name
 * drifts from the catalogue's.
 *
 * Falling back to the name match keeps rows that predate the id, and rows the
 * user typed by hand. That match is deliberately conservative —
 * `findProfileForModel` returns nothing for an uncertain name — and a row with
 * no brand is never matched at all, because "Custom Lighting Fixture" must not
 * inherit the weight of whatever profile happens to share a word with it.
 * Anything unmatched stays unknown rather than becoming zero.
 */
export const catalogueUnitWeightKg = (
  profiles: readonly FixtureProfile[],
  item: PackableEquipment,
): number | undefined => {
  if (item.fixtureProfileId) {
    const byId = profiles.find((profile) => profile.id === item.fixtureProfileId);
    // An id that matches nothing means the profile was deleted; fall through to
    // the name match rather than reporting the fixture as weightless.
    if (byId?.weightKg !== undefined) return byId.weightKg;
  }
  if (!item.brand?.trim()) return undefined;
  return findProfileForModel(profiles, item.brand, item.model || item.name)?.weightKg;
};

/**
 * Pack a manifest into a container, updating what a previous run created.
 *
 * Matching is by `sourceEquipmentKey` across the whole project, not per
 * container: once a case has been moved onto the right truck, re-running must
 * update it where it now sits rather than pull it back or add a twin. Items
 * with no `sourceEquipmentKey` were typed by a human and are never touched,
 * and a generated row whose manifest entry has since disappeared is left in
 * place too — gear that dropped out of a scene is often still on the vehicle,
 * and deleting it silently is how a case goes missing.
 */
export const packEquipmentIntoContainer = ({
  equipment,
  containerId,
  existingItems,
  unitWeightKg,
  newId,
}: PackEquipmentOptions): PackEquipmentResult => {
  const generated = new Map<string, PackedItem>();
  for (const item of existingItems) {
    if (item.sourceEquipmentKey && !generated.has(item.sourceEquipmentKey)) {
      generated.set(item.sourceEquipmentKey, item);
    }
  }

  const updates = new Map<string, PackedItem>();
  const additions: PackedItem[] = [];
  let unknownWeightCount = 0;

  for (const row of equipment) {
    const key = equipmentKey(row);
    if (updates.has(key)) continue; // The manifest already merged duplicates; trust the first row.
    const weight = unitWeightKg(row);
    if (weight === undefined) unknownWeightCount += 1;
    const quantity = Math.max(1, Math.round(row.quantity));
    const existing = generated.get(key);
    if (existing) {
      updates.set(key, {
        ...existing,
        label: packedLabelFor(row),
        quantity,
        // A weight the catalogue does not know must not wipe out one a user
        // typed after the last run — unknown means "no news", not "zero".
        unitWeightKg: weight ?? existing.unitWeightKg,
      });
    } else {
      additions.push({
        id: newId(),
        containerId,
        label: packedLabelFor(row),
        quantity,
        unitWeightKg: weight,
        sourceEquipmentKey: key,
      });
    }
  }

  const items = existingItems.map((item) => {
    const replacement = item.sourceEquipmentKey ? updates.get(item.sourceEquipmentKey) : undefined;
    return replacement && replacement.id === item.id ? replacement : item;
  });

  return {
    items: [...items, ...additions],
    added: additions.length,
    updated: updates.size,
    unknownWeightCount,
  };
};
