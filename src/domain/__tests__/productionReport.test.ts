/**
 * Daily production report additions (to date, cast from Exhibit G, notes),
 * the on-set take command, per-performer sides and the one-liner cast list —
 * all checked on the bundled example production.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../../utils/projectLibrary';
import { buildExampleProductionFill } from '../../utils/sampleContent';
import { castSidesForDay, deriveOneLiner, productionReportCast, productionReportNotesFor, productionReportToDate } from '../reports';
import { recordOnSetTakeCommand, updateProductionReportNotesCommand } from '../commands';
import type { Project } from '../../types';

const example = (): Project => {
  const project = createProject({ title: 'Report', withSampleScenes: true });
  return { ...project, ...buildExampleProductionFill(project).patch };
};

describe('production report', () => {
  it('counts days and totals up to the chosen day', () => {
    const project = example();
    const [first, second] = project.productionDays ?? [];
    const one = productionReportToDate(project, first.id);
    const two = productionReportToDate(project, second.id);
    expect(one).toMatchObject({ dayNumber: 1, daysTotal: project.productionDays!.length });
    expect(two!.dayNumber).toBe(2);
    expect(two!.takesLogged).toBeGreaterThanOrEqual(one!.takesLogged);
    expect(two!.scenesCompleted).toBeGreaterThanOrEqual(one!.scenesCompleted);
    expect(productionReportToDate(project, 'nope')).toBeNull();
  });

  it('takes cast times from the day’s Exhibit G sheet', () => {
    const project = example();
    const cast = productionReportCast(project, project.productionDays![0].id);
    expect(cast.length).toBeGreaterThan(0);
    expect(cast[0]).toMatchObject({ reportOnSet: '08:00', meal1: '13:00–13:30', dismissOnSet: '18:30' });
    expect(cast[0].worked).not.toBe('—');
    expect(productionReportCast(project, project.productionDays![1].id)).toEqual([]);
  });

  it('stores notes per day and drops empty fields', () => {
    const project = example();
    const dayId = project.productionDays![1].id;
    const next = updateProductionReportNotesCommand(project, { dayId, patch: { delays: 'Rain 10:40–11:25' } }).project;
    expect(productionReportNotesFor(next, dayId)).toEqual({ dayId, delays: 'Rain 10:40–11:25' });
    const cleared = updateProductionReportNotesCommand(next, { dayId, patch: { delays: '' } }).project;
    expect((cleared.productionReportNotes ?? []).some((entry) => entry.dayId === dayId)).toBe(false);
    expect(() => updateProductionReportNotesCommand(project, { dayId: 'nope', patch: {} })).toThrow(/no production day/);
  });
});

describe('recordOnSetTakeCommand', () => {
  it('logs a take, then judges it, and marks the shot taken', () => {
    const project = { ...example(), takes: [] };
    const shot = project.setups[0].shots[0];
    const dayId = project.productionDays![0].id;
    const logged = recordOnSetTakeCommand(project, { id: 't1', shotId: shot.id, productionDayId: dayId, loggedAt: '2026-10-11T09:00:00.000Z' });
    expect(logged.project.takes).toHaveLength(1);
    expect(logged.meta.description).toMatch(/new take/);
    const judged = recordOnSetTakeCommand(logged.project, { id: 't2', shotId: shot.id, productionDayId: dayId, loggedAt: '2026-10-11T09:01:00.000Z', judgement: true });
    expect(judged.project.takes).toHaveLength(1);
    expect(judged.project.takes![0].isGoodTake).toBe(true);
    expect(judged.project.setups[0].shots[0].status).toBe('taken');
    expect(() => recordOnSetTakeCommand(project, { id: 't3', shotId: 'nope', loggedAt: '2026-10-11T09:00:00.000Z' })).toThrow(/unknown shot/);
  });
});

describe('castSidesForDay', () => {
  it('gives each performer with dialogue the day’s scenes they speak in', () => {
    const project = example();
    const day = project.productionDays![0];
    const entries = castSidesForDay(day.scheduleBlockIds, project.scheduleBlocks ?? [], {
      scriptScenes: project.scriptScenes,
      setups: project.setups,
      scriptLines: project.scriptLines ?? [],
      characters: project.characters ?? [],
      castAssignments: project.castAssignments,
      people: project.people,
    });
    expect(entries.map((entry) => entry.character)).toEqual(['ALEX', 'SARAH']);
    expect(entries[0].sceneIds.length).toBeGreaterThan(0);
    expect(entries[0].performer).toBeTruthy();
  });
});

describe('one-liner cast names', () => {
  it('lists the cast by number and name when characters are given', () => {
    const project = example();
    const days = deriveOneLiner({
      days: project.productionDays ?? [],
      blocks: project.scheduleBlocks ?? [],
      scenes: project.scriptScenes ?? [],
      setups: project.setups,
      castAssignments: project.castAssignments,
      characters: project.characters ?? [],
    });
    const scene = days[0].entries.find((entry) => entry.kind === 'scene');
    expect(scene && scene.kind === 'scene' ? scene.cast : undefined).toEqual(['1. ALEX', '2. SARAH']);
  });
});
