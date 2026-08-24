/**
 * Telling an all-scenes equipment row from a single-scene one.
 *
 * `deriveAllScenesEquipment` returns `MasterEquipmentItem`s — the same rows
 * plus which scenes need them and the peak concurrent count —
 * `deriveSceneEquipment` returns plain `EquipmentItem`s, and the manifest
 * screen and the CSV export each render whichever they were handed.
 *
 * `MasterEquipmentItem extends EquipmentItem`, so `'usedInSetups' in item`
 * does not narrow: every `EquipmentItem` is a candidate as far as the compiler
 * is concerned. Both call sites reached for `item as any` and then read
 * `usedInSetups` and `maxConcurrentQuantity` off it unchecked — which is fine
 * until a row arrives without them, at which point `.map` on `undefined`
 * throws inside a print view, i.e. while the user is trying to print.
 *
 * A guard that checks the fields are USABLE rather than merely present costs
 * the same and cannot do that.
 */

import type { EquipmentItem, MasterEquipmentItem } from '../../types';

export const isMasterEquipmentItem = (
  item: EquipmentItem,
): item is MasterEquipmentItem => {
  const candidate = item as Partial<MasterEquipmentItem>;
  return (
    Array.isArray(candidate.usedInSetups) &&
    typeof candidate.maxConcurrentQuantity === 'number' &&
    Number.isFinite(candidate.maxConcurrentQuantity)
  );
};

/**
 * Which scenes need this item, as it reads on the manifest and in the CSV.
 *
 * The two used to build the same string with different separators and
 * different multiplication signs, so the printed page and the spreadsheet
 * disagreed about the same row. `sceneLabel` keeps the one real difference —
 * "Sc 4" on paper where space is tight, "Scene 4" in a spreadsheet cell.
 */
export const describeSceneUsage = (
  item: MasterEquipmentItem,
  { sceneLabel = 'Scene', times = '×' }: { sceneLabel?: string; times?: string } = {},
): string[] =>
  item.usedInSetups.map((setup) =>
    setup.sceneNumber
      ? `${sceneLabel} ${setup.sceneNumber} (${times}${setup.quantity})`
      : `${setup.name} (${times}${setup.quantity})`,
  );
