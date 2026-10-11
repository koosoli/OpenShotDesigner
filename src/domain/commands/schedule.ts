/**
 * The schedule as commands: shooting days, strips and calendar lines.
 *
 * These were free-form patches inside `SchedulePanel`, so the rules — a day
 * takes its hand-entered DOOD cells and time sheet with it, a deleted strip
 * leaves every day, a strip added to a day lands at the drop position — lived
 * in a component and logged as "Update project metadata". Moving them here
 * keeps the rules testable and the undo labels readable.
 */
import type { Project } from '../../types';
import type { ProductionCalendarEvent, ProductionDay, ScheduleBlock } from '../scheduling';
import { removeProductionDayFromTakes } from '../integrity';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

const meta = (type: string, description: string, entityId?: string): CommandResult['meta'] => ({
  type,
  timestamp: commandTimestamp(),
  description,
  ...(entityId ? { entityId } : {}),
});

const daysOf = (project: Project) => project.productionDays ?? [];
const blocksOf = (project: Project) => project.scheduleBlocks ?? [];
const eventsOf = (project: Project) => project.productionCalendarEvents ?? [];

export const addProductionDayCommand = (project: Project, input: { day: ProductionDay }): CommandResult => ({
  project: { ...project, productionDays: [...daysOf(project), input.day] },
  meta: meta('addProductionDay', `Add ${input.day.name}`, input.day.id),
});

export const updateProductionDayCommand = (
  project: Project,
  input: { dayId: string; updates: Partial<ProductionDay> },
): CommandResult => {
  const day = daysOf(project).find((candidate) => candidate.id === input.dayId);
  return {
    project: { ...project, productionDays: daysOf(project).map((d) => (d.id === input.dayId ? { ...d, ...input.updates } : d)) },
    meta: meta('updateProductionDay', `Edit ${day?.name ?? 'shooting day'}`, input.dayId),
  };
};

/**
 * Remove a shooting day. Its strips return to the pool (they simply stop
 * being referenced); continuity takes keep everything but the day they
 * pointed at; hand-entered DOOD cells and the day's time sheet go with it.
 */
export const removeProductionDayCommand = (project: Project, input: { dayId: string }): CommandResult => {
  const day = daysOf(project).find((candidate) => candidate.id === input.dayId);
  return {
    project: {
      ...project,
      productionDays: daysOf(project).filter((d) => d.id !== input.dayId),
      ...(project.takes ? { takes: removeProductionDayFromTakes(project.takes, input.dayId) } : {}),
      ...(project.continuityDayFilterId === input.dayId ? { continuityDayFilterId: undefined } : {}),
      ...(project.doodOverrides ? { doodOverrides: project.doodOverrides.filter((entry) => entry.dayId !== input.dayId) } : {}),
      ...(project.performerTimeReports ? { performerTimeReports: project.performerTimeReports.filter((entry) => entry.dayId !== input.dayId) } : {}),
    },
    meta: meta('removeProductionDay', `Remove ${day?.name ?? 'shooting day'}`, input.dayId),
  };
};

/** Add a strip, optionally straight onto a day at `index` (end of day when absent). */
export const addScheduleBlockCommand = (
  project: Project,
  input: { block: ScheduleBlock; dayId?: string | null; index?: number },
): CommandResult => {
  const productionDays = input.dayId
    ? daysOf(project).map((day) => {
      if (day.id !== input.dayId) return day;
      const ids = [...day.scheduleBlockIds];
      const at = input.index === undefined ? ids.length : Math.max(0, Math.min(input.index, ids.length));
      ids.splice(at, 0, input.block.id);
      return { ...day, scheduleBlockIds: ids };
    })
    : daysOf(project);
  const dayName = input.dayId ? daysOf(project).find((day) => day.id === input.dayId)?.name : undefined;
  return {
    project: { ...project, scheduleBlocks: [...blocksOf(project), input.block], productionDays },
    meta: meta('addScheduleBlock', dayName ? `Add a strip to ${dayName}` : 'Add a strip', input.block.id),
  };
};

export const updateScheduleBlockCommand = (
  project: Project,
  input: { blockId: string; updates: Partial<ScheduleBlock> },
): CommandResult => ({
  project: {
    ...project,
    scheduleBlocks: blocksOf(project).map((block) => (block.id === input.blockId ? ({ ...block, ...input.updates } as ScheduleBlock) : block)),
  },
  meta: meta('updateScheduleBlock', 'Edit strip', input.blockId),
});

/** Delete a strip and take it off every day it was on. */
export const removeScheduleBlockCommand = (project: Project, input: { blockId: string }): CommandResult => ({
  project: {
    ...project,
    scheduleBlocks: blocksOf(project).filter((block) => block.id !== input.blockId),
    productionDays: daysOf(project).map((day) => ({ ...day, scheduleBlockIds: day.scheduleBlockIds.filter((id) => id !== input.blockId) })),
  },
  meta: meta('removeScheduleBlock', 'Delete strip', input.blockId),
});

export const addCalendarEventCommand = (project: Project, input: { event: ProductionCalendarEvent }): CommandResult => ({
  project: { ...project, productionCalendarEvents: [...eventsOf(project), input.event] },
  meta: meta('addCalendarEvent', `Add “${input.event.title}” to the calendar`, input.event.id),
});

export const updateCalendarEventCommand = (
  project: Project,
  input: { eventId: string; updates: Partial<ProductionCalendarEvent> },
): CommandResult => {
  const event = eventsOf(project).find((candidate) => candidate.id === input.eventId);
  return {
    project: { ...project, productionCalendarEvents: eventsOf(project).map((e) => (e.id === input.eventId ? { ...e, ...input.updates } : e)) },
    meta: meta('updateCalendarEvent', `Edit “${event?.title ?? 'calendar line'}”`, input.eventId),
  };
};

export const removeCalendarEventCommand = (project: Project, input: { eventId: string }): CommandResult => {
  const event = eventsOf(project).find((candidate) => candidate.id === input.eventId);
  return {
    project: { ...project, productionCalendarEvents: eventsOf(project).filter((e) => e.id !== input.eventId) },
    meta: meta('removeCalendarEvent', `Remove “${event?.title ?? 'calendar line'}”`, input.eventId),
  };
};

/** Append days and strips imported from another tool's schedule (CSV). */
export const importScheduleCommand = (
  project: Project,
  input: { days: ProductionDay[]; blocks: ScheduleBlock[]; source?: string },
): CommandResult => {
  if (input.days.length === 0) throw new Error('importSchedule: nothing to import.');
  return {
    project: {
      ...project,
      productionDays: [...daysOf(project), ...input.days],
      scheduleBlocks: [...(project.scheduleBlocks ?? []), ...input.blocks],
    },
    meta: meta('importSchedule', `Import ${input.days.length} shooting day${input.days.length === 1 ? '' : 's'}${input.source ? ` from ${input.source}` : ''}`),
  };
};
