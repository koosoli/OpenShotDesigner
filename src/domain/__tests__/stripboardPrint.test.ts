import { describe, expect, it } from 'vitest';
import {
  blockLabel,
  blockPrintTone,
  buildPrintableCoverageRows,
  buildPrintableStripboardDays,
  buildStripboardLabelContext,
  type StripboardProjectLike,
} from '../scheduling/stripboardPrint';

const project: StripboardProjectLike = {
  scriptScenes: [{ id: 'sc1', sceneNumber: '4', heading: 'INT. BAR — NIGHT', pageLengthEighths: 12 }],
  setups: [
    {
      id: 'su1',
      name: 'Booth wide',
      sceneNumber: '4',
      shots: [
        { id: 'sh1', shotNumber: '4A', name: 'Wide' },
        { id: 'sh2', shotNumber: '4B', name: 'CU whiskey' },
      ],
    },
  ],
  productionSegments: [{ id: 'sg1', name: 'Interview block' }],
  productionDays: [
    { id: 'd1', name: 'Day 1', date: '2026-09-01', crewCall: '07:00', scheduleBlockIds: ['b1', 'b2', 'gone'] },
  ],
  scheduleBlocks: [
    { id: 'b1', kind: 'scene', scriptSceneId: 'sc1', estimatedMinutes: 90 },
    { id: 'b2', kind: 'manual', label: '', manualType: 'meal', estimatedMinutes: 30 },
  ],
};

describe('blockLabel', () => {
  const ctx = buildStripboardLabelContext(project);

  it('names scenes, setups, segments and single shots from the project', () => {
    expect(blockLabel({ id: 'x', kind: 'scene', scriptSceneId: 'sc1' }, ctx)).toBe('Scene 4 — INT. BAR — NIGHT');
    expect(blockLabel({ id: 'x', kind: 'setup', setupId: 'su1' }, ctx)).toBe('Booth wide');
    expect(blockLabel({ id: 'x', kind: 'segment', segmentId: 'sg1' }, ctx)).toBe('Interview block');
    expect(blockLabel({ id: 'x', kind: 'shots', shotIds: ['sh1'] }, ctx)).toBe('Shot 4A — Wide');
  });

  it('summarises a multi-shot strip', () => {
    expect(blockLabel({ id: 'x', kind: 'shots', shotIds: ['sh1', 'sh2'] }, ctx)).toBe(
      '2 shots · Shot 4A, Shot 4B',
    );
  });

  it('degrades gracefully when a referenced entity is gone', () => {
    expect(blockLabel({ id: 'x', kind: 'scene', scriptSceneId: 'deadbeef-1' }, ctx)).toBe('Scene deadbe');
    expect(blockLabel({ id: 'x', kind: 'shots', shotIds: ['nope'] }, ctx)).toBe('Unresolved shot');
  });

  it('falls back to the banner type when a manual strip has no label', () => {
    expect(blockLabel({ id: 'x', kind: 'manual', label: '', manualType: 'move' }, ctx)).toBe('Move');
    expect(blockLabel({ id: 'x', kind: 'manual', label: 'Company move' }, ctx)).toBe('Company move');
  });

  it('tones banners by their manual type and everything else by kind', () => {
    expect(blockPrintTone({ id: 'x', kind: 'manual', label: '', manualType: 'meal' })).not.toBe(
      blockPrintTone({ id: 'x', kind: 'manual', label: '', manualType: 'strike' }),
    );
    expect(blockPrintTone({ id: 'x', kind: 'scene', scriptSceneId: 'sc1' })).toBe(
      blockPrintTone({ id: 'y', kind: 'scene', scriptSceneId: 'sc1' }),
    );
  });
});

describe('buildPrintableStripboardDays', () => {
  it('builds each day in stored order and totals only known estimates', () => {
    const [day] = buildPrintableStripboardDays(project);
    expect(day.name).toBe('Day 1');
    expect(day.crewCall).toBe('07:00');
    expect(day.items.map((item) => item.label)).toEqual(['Scene 4 — INT. BAR — NIGHT', 'Meal']);
    expect(day.items.map((item) => item.pageEighths)).toEqual([12, undefined]);
    expect(day.totalMinutes).toBe(120);
  });

  it('skips block ids that no longer exist rather than printing blank strips', () => {
    const [day] = buildPrintableStripboardDays(project);
    expect(day.items).toHaveLength(2);
  });

  it('carries resolved cast numbers into printable strips when supplied', () => {
    const [day] = buildPrintableStripboardDays(project, undefined, (block) =>
      block.kind === 'scene' ? [1, 4] : [],
    );
    expect(day.items[0].castNumbers).toEqual([1, 4]);
    expect(day.items[1].castNumbers).toEqual([]);
  });

  it('carries screenplay pages onto setup and shot strips through their scene number', () => {
    const setupProject: StripboardProjectLike = {
      ...project,
      productionDays: [{ id: 'd', name: 'Day 1', scheduleBlockIds: ['setup', 'shots'] }],
      scheduleBlocks: [
        { id: 'setup', kind: 'setup', setupId: 'su1' },
        { id: 'shots', kind: 'shots', shotIds: ['sh1'] },
      ],
    };
    const [day] = buildPrintableStripboardDays(setupProject);
    expect(day.items.map((item) => item.pageEighths)).toEqual([12, 12]);
  });

  it('returns an empty board for a project with no schedule at all', () => {
    expect(buildPrintableStripboardDays({})).toEqual([]);
  });

  it('leaves a strip with no estimate out of the total instead of counting zero', () => {
    const [day] = buildPrintableStripboardDays({
      productionDays: [{ id: 'd', name: 'D', scheduleBlockIds: ['a', 'b'] }],
      scheduleBlocks: [
        { id: 'a', kind: 'manual', label: 'A', estimatedMinutes: 45 },
        { id: 'b', kind: 'manual', label: 'B' },
      ],
    });
    expect(day.totalMinutes).toBe(45);
    expect(day.items[1].minutes).toBeUndefined();
  });
});

describe('buildPrintableCoverageRows', () => {
  it('returns rows in matrix order with a cell per camera column', () => {
    const rows = buildPrintableCoverageRows({
      coverageMatrix: {
        cameraIds: ['A', 'B'],
        rowKeys: ['r1'],
        rowLabels: { r1: 'Opening number' },
        cells: { r1: { A: 'Wide' } },
      },
    });
    expect(rows).toEqual([{ label: 'Opening number', cells: ['Wide', ''] }]);
  });

  it('labels a row from its run-of-show cue when there is no custom label', () => {
    const rows = buildPrintableCoverageRows({
      runOfShowCues: [{ id: 'cue1', label: 'Song 2' }],
      coverageMatrix: { cameraIds: ['A'], rowKeys: ['cue1'], cells: {} },
    });
    expect(rows[0].label).toBe('Song 2');
  });

  it('keeps a row whose cue was deleted, with a readable stub label', () => {
    const rows = buildPrintableCoverageRows({
      coverageMatrix: { cameraIds: ['A'], rowKeys: ['abcdef123'], cells: { abcdef123: { A: 'Handheld' } } },
    });
    expect(rows).toEqual([{ label: 'Row abcdef', cells: ['Handheld'] }]);
  });

  it('returns nothing when the project has no coverage matrix', () => {
    expect(buildPrintableCoverageRows({})).toEqual([]);
  });
});
