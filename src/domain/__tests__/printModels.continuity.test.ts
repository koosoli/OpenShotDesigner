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

describe('buildContinuityPrintModel take detail', () => {
  it('carries every filled panel field into takeRows[0].detail', () => {
    const project = baseProject({
      takes: [
        take({
          id: 't1',
          shotId: 'shot1',
          productionDayId: 'day1',
          soundRoll: 'S01',
          soundFileName: 'S01_001.wav',
          soundNotes: 'Boom rustle on the turn',
          mos: true,
          slateOverrides: {
            dateRecorded: '2024_05_22',
            location: 'ROOFTOP',
            environment: 'EXT',
            dayNight: 'NIGHT',
          },
          cameraOverrides: {
            cameraLabel: 'A',
            shutterSpeed: '1/50',
            whitePointKelvin: 5600,
            filter: 'ND 0.6',
            cameraNotes: 'Flare on the pan',
          },
        }),
      ],
    });
    const [row] = buildContinuityPrintModel(project).takeRows;
    // Overrides win over the plan (OFFICE / Day INT / day1 date), so these
    // values prove the override path, not the plan fallback.
    expect(row.detail).toEqual({
      soundRoll: 'S01',
      soundFileName: 'S01_001.wav',
      soundNotes: 'Boom rustle on the turn',
      mos: true,
      slateDate: '2024_05_22',
      slateLocation: 'ROOFTOP',
      slateEnvironment: 'EXT',
      slateDayNight: 'NIGHT',
      cameraLabel: 'A',
      shutterSpeed: '1/50',
      whitePointKelvin: '5600',
      filter: 'ND 0.6',
      cameraNotes: 'Flare on the pan',
    });
  });

  it('carries a wild track into detail without a camera take', () => {
    const project = baseProject({
      takes: [take({ id: 't1', shotId: 'shot1', productionDayId: 'day1', wildTrack: true })],
    });
    const [row] = buildContinuityPrintModel(project).takeRows;
    expect(row.detail).toMatchObject({ wildTrack: true });
    expect(row.detail).not.toHaveProperty('mos');
  });

  it('leaves the detail key off a bare take entirely', () => {
    const project = baseProject({
      setups: [
        {
          id: 'setup1',
          name: 'Void',
          elements: [],
          shots: [{ id: 'shot9', shotNumber: '9A', name: 'Void' }],
        },
      ] as unknown as Project['setups'],
      productionDays: [],
      continuityDayFilterId: undefined,
      takes: [take({ id: 't1', shotId: 'shot9' })],
    });
    const [row] = buildContinuityPrintModel(project).takeRows;
    expect('detail' in row).toBe(false);
    expect(row).not.toHaveProperty('detail');
  });
});

describe('buildContinuityPrintModel binder notes', () => {
  it('resolves subjects, labels, scene passthrough and photo counts', () => {
    const project = baseProject({
      characters: [{ id: 'c1', canonicalName: 'JOHN', aliases: [] }],
      continuityNotes: [
        {
          id: 'n1',
          department: 'wardrobe',
          characterId: 'c1',
          sceneNumber: '2',
          scriptDay: 'D1',
          description: 'Navy overcoat',
          notes: 'Top button undone',
          photoAssetIds: ['a1', 'a2'],
        },
        {
          id: 'n2',
          department: 'props',
          characterName: 'Stand-in',
          description: 'Glass half full',
        },
        {
          id: 'n3',
          department: 'makeup',
          characterId: 'gone',
          characterName: 'Fallback Name',
          description: 'Powdered down',
          photoAssetIds: ['a3'],
        },
      ],
    });
    const { notes } = buildContinuityPrintModel(project);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toEqual({
      department: 'Wardrobe',
      subject: 'JOHN',
      sceneNumber: '2',
      scriptDay: 'D1',
      description: 'Navy overcoat',
      notes: 'Top button undone',
      photoCount: 2,
    });
    // Free text subject, no scene/day keys, no photo ids: nothing invented.
    expect(notes[1]).toEqual({
      department: 'Props',
      subject: 'Stand-in',
      description: 'Glass half full',
      photoCount: 0,
    });
    // A linked character that no longer exists falls back to the free text.
    expect(notes[2]).toMatchObject({
      department: 'Make-up',
      subject: 'Fallback Name',
      photoCount: 1,
    });
    expect(notes[2]).not.toHaveProperty('sceneNumber');
    expect(notes[2]).not.toHaveProperty('scriptDay');
  });
});

describe('buildContinuityPrintModel rule 13', () => {
  it('never invents detail values from empty or blank fields', () => {
    const project = baseProject({
      setups: [
        {
          id: 'setup1',
          name: 'Void',
          elements: [],
          shots: [{ id: 'shot9', shotNumber: '9A', name: 'Void' }],
        },
      ] as unknown as Project['setups'],
      productionDays: [],
      continuityDayFilterId: undefined,
      takes: [
        take({
          id: 't1',
          shotId: 'shot9',
          soundRoll: '   ',
          soundFileName: '',
          soundNotes: '  ',
          mos: false,
          wildTrack: false,
          slateOverrides: { dateRecorded: '', location: '   ' },
          cameraOverrides: {
            cameraLabel: '  ',
            shutterSpeed: '',
            whitePointKelvin: NaN,
            filter: '   ',
            cameraNotes: '',
          },
        }),
      ],
    });
    const [row] = buildContinuityPrintModel(project).takeRows;
    // Absent keys, not dashes: dashes are the view's job, never the model's.
    expect(row).not.toHaveProperty('detail');
    expect(Object.keys(row).sort()).toEqual(
      [
        'cameraSummary',
        'comments',
        'description',
        'fileName',
        'goodTake',
        'keywords',
        'rollCard',
        'scene',
        'shot',
        'take',
      ].sort(),
    );
    expect(JSON.stringify(row)).not.toContain('—');
    expect(row).not.toHaveProperty('contentHash');
  });
});
