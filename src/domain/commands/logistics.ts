/**
 * Logistics — cases, what is packed in them, and the day filter — as commands.
 *
 * The panel works in whole-list updates (pack a kit, re-sort a case), so the
 * commands take an updater over the current list. It runs against the
 * committed project, never a render-time copy, so two writes in one tick both
 * land.
 */
import type { Project } from '../../types';
import type { LogisticsContainer, PackedItem } from '../logistics';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

export interface UpdateLogisticsInput {
  containers?: (current: LogisticsContainer[]) => LogisticsContainer[];
  packedItems?: (current: PackedItem[]) => PackedItem[];
  /** Undo label, e.g. "Pack Camera case". */
  description?: string;
}

export const updateLogisticsCommand = (project: Project, input: UpdateLogisticsInput): CommandResult => {
  if (!input.containers && !input.packedItems) throw new Error('updateLogistics: nothing to update.');
  return {
    project: {
      ...project,
      ...(input.containers ? { logisticsContainers: input.containers(project.logisticsContainers ?? []) } : {}),
      ...(input.packedItems ? { packedItems: input.packedItems(project.packedItems ?? []) } : {}),
    },
    meta: { type: 'updateLogistics', timestamp: commandTimestamp(), description: input.description ?? 'Edit logistics' },
  };
};

export interface SetLogisticsDayFilterInput {
  /** Absent means "whole production". */
  productionDayId?: string;
}

/** Which shooting day the logistics view is filtered to. */
export const setLogisticsDayFilterCommand = (project: Project, input: SetLogisticsDayFilterInput): CommandResult => {
  const day = (project.productionDays ?? []).find((candidate) => candidate.id === input.productionDayId);
  if (input.productionDayId !== undefined && !day) {
    throw new Error(`setLogisticsDayFilter: unknown production day id "${input.productionDayId}".`);
  }
  return {
    project: { ...project, logisticsDayFilterId: input.productionDayId },
    meta: {
      type: 'setLogisticsDayFilter',
      timestamp: commandTimestamp(),
      description: day ? `Show logistics for ${day.name}` : 'Show logistics for the whole production',
    },
  };
};
