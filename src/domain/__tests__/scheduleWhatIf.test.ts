import { describe, expect, it } from 'vitest';
import { scheduleWhatIf } from '../reports/scheduleWhatIf';
import type { Project } from '../../types';

const project = {
  id: 'p',
  title: 'T',
  activeSetupId: 's',
  setups: [],
  characters: [{ id: 'c1', canonicalName: 'ALEX', aliases: [] }],
  scriptScenes: [
    { id: 's1', sceneNumber: '1', heading: 'INT. A - DAY', characterIds: ['c1'], breakdownItemIds: [], pageLengthEighths: 8 },
    { id: 's2', sceneNumber: '2', heading: 'INT. B - DAY', characterIds: ['c1'], breakdownItemIds: [], pageLengthEighths: 4 },
  ],
  productionDays: [
    { id: 'd1', name: 'Day 1', date: '2026-10-01', scheduleBlockIds: ['b1'] },
    { id: 'd2', name: 'Day 2', date: '2026-10-02', scheduleBlockIds: [] },
    { id: 'd3', name: 'Day 3', date: '2026-10-03', scheduleBlockIds: ['b2'] },
  ],
  scheduleBlocks: [
    { id: 'b1', kind: 'scene', scriptSceneId: 's1', estimatedMinutes: 120 },
    { id: 'b2', kind: 'scene', scriptSceneId: 's2', estimatedMinutes: 60 },
  ],
} as unknown as Project;

describe('scheduleWhatIf', () => {
  it('shows page, time and paid-day changes for a move', () => {
    const result = scheduleWhatIf(project, 'b2', 'd1')!;
    expect(result.days).toEqual([
      expect.objectContaining({ dayId: 'd3', pagesBefore: 4, pagesAfter: 0, minutesBefore: 60, minutesAfter: 0 }),
      expect.objectContaining({ dayId: 'd1', pagesBefore: 8, pagesAfter: 12, minutesBefore: 120, minutesAfter: 180 }),
    ]);
    // ALEX worked d1 + held d2 + worked d3 = 3 paid days; after the move only d1.
    expect(result.performers).toEqual([expect.objectContaining({ name: 'ALEX', paidBefore: 3, paidAfter: 1, holdBefore: 1, holdAfter: 0 })]);
    expect(result.paidDaysDelta).toBe(-2);
  });

  it('is nothing for a drop on the same day', () => {
    expect(scheduleWhatIf(project, 'b1', 'd1')).toBeUndefined();
  });
});
