import { describe, expect, it } from 'vitest';
import {
  addScheduleBlockCommand,
  removeProductionDayCommand,
  removeScheduleBlockCommand,
  updateProductionDayCommand,
} from '../commands';
import type { Project } from '../../types';

const base = (): Project => ({
  id: 'p',
  title: 'T',
  activeSetupId: 's',
  setups: [],
  productionDays: [
    { id: 'd1', name: 'Day 1', scheduleBlockIds: ['b1'] },
    { id: 'd2', name: 'Day 2', scheduleBlockIds: [] },
  ],
  scheduleBlocks: [{ id: 'b1', kind: 'manual', label: 'Lunch' }],
  doodOverrides: [{ rowId: 'c', dayId: 'd1', status: 'travel' }],
  performerTimeReports: [{ id: 'r', dayId: 'd1', entries: [] }],
} as unknown as Project);

describe('schedule commands', () => {
  it('adds a strip at the drop position on a day', () => {
    const result = addScheduleBlockCommand(base(), { block: { id: 'b2', kind: 'manual', label: 'Move' }, dayId: 'd1', index: 0 });
    expect(result.project.productionDays?.[0].scheduleBlockIds).toEqual(['b2', 'b1']);
    expect(result.meta.description).toBe('Add a strip to Day 1');
  });

  it('removes a strip from every day', () => {
    const result = removeScheduleBlockCommand(base(), { blockId: 'b1' });
    expect(result.project.scheduleBlocks).toEqual([]);
    expect(result.project.productionDays?.[0].scheduleBlockIds).toEqual([]);
  });

  it('removes a day with its DOOD cells and time sheet', () => {
    const result = removeProductionDayCommand(base(), { dayId: 'd1' });
    expect(result.project.productionDays?.map((day) => day.id)).toEqual(['d2']);
    expect(result.project.doodOverrides).toEqual([]);
    expect(result.project.performerTimeReports).toEqual([]);
    expect(result.project.scheduleBlocks).toHaveLength(1);
  });

  it('edits a day by name in the log', () => {
    const result = updateProductionDayCommand(base(), { dayId: 'd2', updates: { crewCall: '07:00' } });
    expect(result.project.productionDays?.[1].crewCall).toBe('07:00');
    expect(result.meta.description).toBe('Edit Day 2');
  });
});
