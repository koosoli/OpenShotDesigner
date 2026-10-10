import { describe, expect, it } from 'vitest';
import {
  setCharacterColorCommand,
  setDoodCellCommand,
  setDoodDropAfterDaysCommand,
  updatePerformerTimeReportCommand,
} from '../commands';
import type { Project } from '../../types';

const base = (): Project => ({
  id: 'p',
  title: 'T',
  activeSetupId: 's',
  setups: [],
  productionDays: [{ id: 'd1', name: 'Day 1', scheduleBlockIds: [] }],
  characters: [{ id: 'c1', canonicalName: 'ADA', aliases: [] }],
} as unknown as Project);

describe('paperwork commands', () => {
  it('sets and clears one DOOD cell', () => {
    const set = setDoodCellCommand(base(), { rowId: 'c1', dayId: 'd1', status: 'travel', label: 'ADA' });
    expect(set.project.doodOverrides).toEqual([{ rowId: 'c1', dayId: 'd1', status: 'travel' }]);
    expect(set.meta.description).toBe('Mark ADA travel on Day 1');
    const cleared = setDoodCellCommand(set.project, { rowId: 'c1', dayId: 'd1', status: null });
    expect(cleared.project.doodOverrides).toEqual([]);
  });

  it('normalises the drop threshold', () => {
    expect(setDoodDropAfterDaysCommand(base(), { days: 7.6 }).project.doodDropAfterDays).toBe(8);
    expect(setDoodDropAfterDaysCommand(base(), { days: -1 }).project.doodDropAfterDays).toBeUndefined();
  });

  it('colours a character, falling back to the derived catalog', () => {
    expect(setCharacterColorCommand(base(), { characterId: 'c1', color: '#112233' }).project.characters?.[0].color).toBe('#112233');
    const empty = { ...base(), characters: [] } as Project;
    const result = setCharacterColorCommand(empty, {
      characterId: 'c9',
      color: '#abcdef',
      fallbackCharacters: [{ id: 'c9', canonicalName: 'BEA', aliases: [] }],
    });
    expect(result.project.characters).toEqual([{ id: 'c9', canonicalName: 'BEA', aliases: [], color: '#abcdef' }]);
    expect(() => setCharacterColorCommand(base(), { characterId: 'c1', color: 'red' })).toThrow();
  });

  it('keeps one time sheet per day', () => {
    const first = updatePerformerTimeReportCommand(base(), {
      dayId: 'd1',
      update: (report) => ({ ...report, entries: [{ id: 'e1', name: 'ADA' }] }),
    });
    const second = updatePerformerTimeReportCommand(first.project, {
      dayId: 'd1',
      update: (report) => ({ ...report, preparedBy: '2nd AD' }),
    });
    expect(second.project.performerTimeReports).toHaveLength(1);
    expect(second.project.performerTimeReports?.[0]).toMatchObject({ dayId: 'd1', preparedBy: '2nd AD', entries: [{ id: 'e1' }] });
    expect(() => updatePerformerTimeReportCommand(base(), { dayId: 'nope', update: (r) => r })).toThrow();
  });
});
