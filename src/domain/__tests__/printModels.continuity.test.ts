/**
 * The print-model builder behind the paper continuity report and wrap
 * checklist.
 *
 * A pure `Project` → props mapping, so it is tested here next to the domain it
 * leans on rather than through a rendered component. What matters is that the
 * paper and the exported CSV describe the same takes, that unknowns survive
 * the trip to paper as unknowns (rule 13), and that the plan-versus-actual
 * split does not blur on the way.
 */
import { describe, it, expect } from 'vitest';
import { buildContinuityPrintModel } from '../../components/reports/ContinuityPrintView';
import type { Project } from '../../types';
import type { Take } from '../continuity';

const take = (overrides: Partial<Take> & Pick<Take, 'id' | 'shotId'>): Take => ({
  takeNumber: 1,
  ...overrides,
});

const baseProject = (overrides: Partial<Project>): Project =>
  ({
    title: 'Test Production',
    productionCompany: 'Test Co',
    director: 'ERIC',
    cinematographer: 'PETER',
    date: '2026-01-01',
    setups: [
      {
        id: 'setup1',
        name: 'Office',
        sceneNumber: '2',
        location: 'OFFICE',
        timeOfDay: 'Day INT',
        elements: [],
        shots: [
          { id: 'shot1', shotNumber: '2A', name: 'Master', framingDescription: 'Wide' },
          { id: 'shot2', shotNumber: '2B', name: 'Single' },
          { id: 'shot3', shotNumber: '2C', name: 'Insert' },
        ],
      },
    ],
    activeSetupId: 'setup1',
    productionDays: [{ id: 'day1', name: 'Day 1', date: '2024-05-21', scheduleBlockIds: ['b1'] }],
    scheduleBlocks: [{ id: 'b1', kind: 'shots', shotIds: ['shot1', 'shot2', 'shot3'] }],
    continuityDayFilterId: 'day1',
    ...overrides,
  }) as Project;

describe('buildContinuityPrintModel', () => {
  it('prints the checklist, the gaps and the log for the scoped day', () => {
    const project = baseProject({
      takes: [
        take({ id: 't1', shotId: 'shot1', productionDayId: 'day1', isGoodTake: true, fileName: '1.MTS' }),
        take({ id: 't2', shotId: 'shot2', productionDayId: 'day1', isGoodTake: false }),
      ],
    });
    const model = buildContinuityPrintModel(project);

    expect(model.scopeLabel).toBe('Day 1 · 2024-05-21');
    expect(model.checklist.map((row) => row.shot)).toEqual(['2A', '2B', '2C']);
    expect(model.checklist[0].covered).toBe(true);
    expect(model.gaps.noGoodTake.map((row) => row.shot)).toEqual(['2B']);
    expect(model.gaps.notShot.map((row) => row.shot)).toEqual(['2C']);
    expect(model.totals).toMatchObject({
      takes: 2,
      goodTakes: 1,
      plannedShots: 3,
      coveredShots: 1,
      withoutFileName: 1,
    });
  });

  it('keeps unplanned work out of the plan on paper too', () => {
    const project = baseProject({
      setups: [
        {
          id: 'setup1',
          name: 'Office',
          sceneNumber: '2',
          location: 'OFFICE',
          timeOfDay: 'Day INT',
          elements: [],
          shots: [
            { id: 'shot1', shotNumber: '2A', name: 'Master' },
            { id: 'pickup', shotNumber: '2B', name: 'Pickup', unplanned: true },
          ],
        },
      ] as unknown as Project['setups'],
      scheduleBlocks: [{ id: 'b1', kind: 'shots', shotIds: ['shot1'] }],
      takes: [
        take({ id: 't1', shotId: 'pickup', productionDayId: 'day1', isGoodTake: true }),
      ],
    });
    const model = buildContinuityPrintModel(project);

    expect(model.checklist.map((row) => row.shot)).toEqual(['2A']);
    expect(model.unscheduled.map((row) => row.shot)).toEqual(['2B']);
    expect(model.unscheduled[0].unplanned).toBe(true);
    // The pickup being covered must not hide that 2A was never shot.
    expect(model.gaps.notShot.map((row) => row.shot)).toEqual(['2A']);
  });

  it('prints the same rows the CSV exports', () => {
    const project = baseProject({
      takes: [
        take({
          id: 't1',
          shotId: 'shot1',
          productionDayId: 'day1',
          takeNumber: 3,
          fileName: '1.MTS',
          isGoodTake: true,
          comments: 'Laptop needs CGI',
          keywords: ['Laptop', 'John'],
          rollCard: '1',
        }),
      ],
    });
    const [row] = buildContinuityPrintModel(project).takeRows;
    expect(row).toMatchObject({
      scene: '2',
      shot: '2A',
      take: '3',
      goodTake: '1',
      fileName: '1.MTS',
      rollCard: '1',
      description: 'Wide',
      comments: 'Laptop needs CGI',
      keywords: 'Laptop, John',
    });
  });

  /**
   * A filter pointing at a deleted day must not silently print another day's
   * work as if it were that day.
   */
  it('drops the scope when the day it points at is gone', () => {
    const project = baseProject({
      continuityDayFilterId: 'deleted-day',
      takes: [take({ id: 't1', shotId: 'shot1', productionDayId: 'day1' })],
    });
    const model = buildContinuityPrintModel(project);
    expect(model.scopeLabel).toBeUndefined();
    expect(model.checklist).toEqual([]);
    // The log still prints everything, which is the honest unscoped reading.
    expect(model.takeRows).toHaveLength(1);
  });

  it('leaves unknown camera values off the paper rather than guessing', () => {
    const project = baseProject({
      takes: [take({ id: 't1', shotId: 'shot2', productionDayId: 'day1' })],
    });
    const [row] = buildContinuityPrintModel(project).takeRows;
    expect(row.fileName).toBe('');
    expect(row.goodTake).toBe('');
    expect(row.cameraSummary).not.toContain('undefined');
  });
});
