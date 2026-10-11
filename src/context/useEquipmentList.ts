/**
 * The active setup's equipment list edits: custom items, overrides of the
 * items derived from the plan, and package contents. Overrides live in
 * `SceneSetup.customEquipment`; a derived item becomes an override the first
 * time it is edited, keeping every attribute it was derived with.
 * Extracted from `FloorPlanContext`.
 */
import type { EquipmentItem, EquipmentPackageItem, SceneSetup } from '../types';
import { createId } from '../domain/ids';
import { deriveSceneEquipment } from '../utils/equipmentList';

const matches = (item: { id: string; elementId?: string }, id: string) => item.id === id || item.elementId === id;

export const useEquipmentList = (input: {
  activeSetup: SceneSetup;
  updateSetupMeta: (updates: Partial<SceneSetup>) => void;
}) => {
  const { activeSetup, updateSetupMeta } = input;
  const custom = () => activeSetup.customEquipment || [];

  const addCustomEquipmentItem = (item: Omit<EquipmentItem, 'id'>) => {
    const newItem: EquipmentItem = { ...item, id: createId('equip'), isCustom: true };
    updateSetupMeta({ customEquipment: [...custom(), newItem] });
  };

  const updateEquipmentItem = (id: string, updates: Partial<EquipmentItem>) => {
    const current = custom();
    const existingIndex = current.findIndex((item) => matches(item, id));
    if (existingIndex >= 0) {
      const next = [...current];
      next[existingIndex] = { ...next[existingIndex], ...updates };
      updateSetupMeta({ customEquipment: next });
      return;
    }
    // First edit of a derived item: keep all of its auto attributes.
    const baseItem = deriveSceneEquipment(activeSetup).find((item) => matches(item, id));
    const newItem: EquipmentItem = {
      id,
      elementId: id.startsWith('auto-') ? id.replace(/^auto-[a-z]+-/, '') : undefined,
      category: updates.category || baseItem?.category || 'other',
      name: updates.name !== undefined ? updates.name : (baseItem?.name || 'Equipment Item'),
      brand: updates.brand !== undefined ? updates.brand : baseItem?.brand,
      model: updates.model !== undefined ? updates.model : baseItem?.model,
      quantity: updates.quantity !== undefined ? updates.quantity : (baseItem?.quantity || 1),
      roleOrFunction: updates.roleOrFunction !== undefined ? updates.roleOrFunction : baseItem?.roleOrFunction,
      specs: updates.specs !== undefined ? updates.specs : baseItem?.specs,
      notes: updates.notes !== undefined ? updates.notes : baseItem?.notes,
      isCustom: false,
      ...updates,
    };
    updateSetupMeta({ customEquipment: [...current, newItem] });
  };

  const deleteEquipmentItem = (id: string) => {
    updateSetupMeta({ customEquipment: custom().filter((item) => !matches(item, id)) });
  };

  const resetSceneEquipment = () => {
    updateSetupMeta({ customEquipment: [] });
  };

  /** A package's contents: the override's if edited, else what the plan derived. */
  const packageItemsOf = (packageId: string): EquipmentPackageItem[] =>
    custom().find((item) => matches(item, packageId))?.packageItems
    || deriveSceneEquipment(activeSetup).find((item) => matches(item, packageId))?.packageItems
    || [];

  const setPackageItems = (packageId: string, packageItems: EquipmentPackageItem[]) =>
    updateEquipmentItem(packageId, { isPackage: true, packageItems });

  const addPackageItem = (packageId: string, item: Omit<EquipmentPackageItem, 'id'>) =>
    setPackageItems(packageId, [...packageItemsOf(packageId), { ...item, id: createId('pkg-item') }]);

  const updatePackageItem = (packageId: string, itemId: string, updates: Partial<EquipmentPackageItem>) =>
    setPackageItems(packageId, packageItemsOf(packageId).map((item) => (item.id === itemId ? { ...item, ...updates } : item)));

  const deletePackageItem = (packageId: string, itemId: string) =>
    setPackageItems(packageId, packageItemsOf(packageId).filter((item) => item.id !== itemId));

  return {
    addCustomEquipmentItem,
    updateEquipmentItem,
    deleteEquipmentItem,
    resetSceneEquipment,
    addPackageItem,
    updatePackageItem,
    deletePackageItem,
  };
};
