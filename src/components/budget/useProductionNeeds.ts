import { useMemo } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { countNeedDays, deriveDayNeeds, equipmentKey, equipmentLabel } from '../../domain/reports';
import type { DayNeeds } from '../../domain/reports';
import { deriveAllScenesEquipment, deriveSceneEquipment } from '../../utils/equipmentList';

export interface PricedEquipmentItem {
  key: string;
  label: string;
  category: string;
  /** Peak quantity any single setup needs — what gets rented. */
  quantity: number;
  /** Shooting days on which a setup using it is scheduled. */
  days: number;
  /** Which setups use it, for the reader. */
  setupNames: string[];
}

/**
 * Everything the budget and the day overview share: what each day needs, how
 * many days each person and item works, and the master equipment list with
 * its days on set. One memo, so the two panels never disagree.
 */
export const useProductionNeeds = (): {
  needs: DayNeeds[];
  shootDays: number;
  personDays: Map<string, number>;
  equipment: PricedEquipmentItem[];
} => {
  const { project } = useFloorPlan();
  const days = project.productionDays;
  const blocks = project.scheduleBlocks;
  const { people, setups, scriptScenes, castAssignments } = project;

  return useMemo(() => {
    const needs = deriveDayNeeds({
      days: days ?? [],
      blocks: blocks ?? [],
      people,
      setups,
      scriptScenes,
      castAssignments,
      equipmentForSetup: (setupId) => {
        const setup = setups.find((candidate) => candidate.id === setupId);
        return setup ? deriveSceneEquipment(setup) : [];
      },
    });
    const counts = countNeedDays(needs);
    const equipment: PricedEquipmentItem[] = deriveAllScenesEquipment(setups).map((item) => {
      const key = equipmentKey(item);
      return {
        key,
        label: equipmentLabel(item),
        category: item.category,
        quantity: item.maxConcurrentQuantity,
        days: counts.equipmentDays.get(key) ?? 0,
        setupNames: item.usedInSetups.map((use) => use.name),
      };
    });
    return { needs, shootDays: counts.shootDays, personDays: counts.personDays, equipment };
  }, [days, blocks, people, setups, scriptScenes, castAssignments]);
};
