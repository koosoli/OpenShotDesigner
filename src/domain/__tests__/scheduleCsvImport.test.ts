import { describe, expect, it } from 'vitest';
import { materializeScheduleImport, normalizeImportDate, planScheduleCsvImport } from '../scheduling/scheduleCsvImport';
import { importScheduleCommand } from '../commands';
import type { Project } from '../../types';

const scenes = [
  { id: 's1', sceneNumber: '1' },
  { id: 's2', sceneNumber: '2' },
  { id: 's3', sceneNumber: '3A' },
  { id: 's4', sceneNumber: '4', omitted: true },
];

describe('planScheduleCsvImport', () => {
  it('groups by a day column, reads dates and call, and reports unknown scenes', () => {
    const csv = [
      'Day,Date,Call,Scene,Set,Pages',
      '1,2026-11-02,07:00,1,INT. LIVING ROOM,5/8',
      '1,2026-11-02,07:00,"2, 3a",INT. INTERROGATION ROOM,1 6/8',
      '2,2026-11-03,08:30,99,EXT. STREET,1',
      '2,2026-11-03,08:30,4,OMITTED,',
    ].join('\n');
    const plan = planScheduleCsvImport(csv, scenes);
    expect(plan.days.map((day) => [day.name, day.date, day.crewCall, day.entries.length])).toEqual([['Day 1', '2026-11-02', '07:00', 3]]);
    expect(plan.unmatchedScenes).toEqual(['99', '4']);
    expect(plan.sceneCount).toBe(3);
  });

  it('reads one-liner style day rows and banners without a day column', () => {
    const csv = [
      'Scene;Set;D/N;Pages',
      'Day 1 — 02.11.2026;;;',
      '1;INT. LIVING ROOM;N;5/8',
      ';Lunch;;',
      '2;INT. INTERROGATION;N;1 6/8',
      'End of Day 1;;;',
      ';Company move to studio;;',
      '3A;INT. STUDIO;D;1',
    ].join('\n');
    const plan = planScheduleCsvImport(csv, scenes);
    expect(plan.days.map((day) => day.name)).toEqual(['Day 1', 'Day 2']);
    expect(plan.days[0].date).toBe('2026-11-02');
    expect(plan.days[0].entries.map((entry) => (entry.kind === 'scene' ? entry.sceneId : `${entry.manualType}:${entry.label}`))).toEqual(['s1', 'meal:Lunch', 's2']);
    expect(plan.days[1].entries.map((entry) => (entry.kind === 'scene' ? entry.sceneId : entry.manualType))).toEqual(['move', 's3']);
  });

  it('puts everything on one day when the file has no day information', () => {
    const plan = planScheduleCsvImport('Sc,Description\n1,Opening\n2,Talk', scenes);
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].entries).toHaveLength(2);
  });

  it('refuses a file without a scene column', () => {
    expect(() => planScheduleCsvImport('Name,Role\nAna,Gaffer', scenes)).toThrow(/Scene/);
  });

  it('normalizes the common date formats', () => {
    expect(normalizeImportDate('2026-11-2')).toBe('2026-11-02');
    expect(normalizeImportDate('2.11.26')).toBe('2026-11-02');
    expect(normalizeImportDate('11/2/2026')).toBe('2026-11-02');
    expect(normalizeImportDate('Monday')).toBeUndefined();
  });
});

describe('importScheduleCommand', () => {
  it('appends the imported days and strips', () => {
    const plan = planScheduleCsvImport('Day,Scene\n1,1\n1,2\n2,3A', scenes);
    let n = 0;
    const material = materializeScheduleImport(plan, (prefix) => `${prefix}-${(n += 1)}`);
    const project = { id: 'p', title: 'T', setups: [], activeSetupId: '', productionDays: [{ id: 'd0', name: 'Day 0', scheduleBlockIds: [] }] } as unknown as Project;
    const result = importScheduleCommand(project, { ...material, source: 'export.csv' });
    expect(result.project.productionDays?.map((day) => day.name)).toEqual(['Day 0', 'Day 1', 'Day 2']);
    expect(result.project.scheduleBlocks).toHaveLength(3);
    expect(result.meta.description).toBe('Import 2 shooting days from export.csv');
  });
});
