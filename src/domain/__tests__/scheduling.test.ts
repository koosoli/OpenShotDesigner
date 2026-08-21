import { describe, it, expect } from 'vitest';
import {
  totalEstimatedMinutes,
  deriveDaySummary,
  findScheduleConflicts,
} from '../scheduling';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import { createId } from '../ids';

const scene = (estimatedMinutes?: number): ScheduleBlock => ({
  id: createId('block'),
  kind: 'scene',
  scriptSceneId: createId('char'),
  ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
});

const manual = (
  label: string,
  manualType?: 'meal' | 'move' | 'rehearsal' | 'load_in' | 'strike' | 'other',
  estimatedMinutes?: number,
): ScheduleBlock => ({
  id: createId('block'),
  kind: 'manual',
  label,
  ...(manualType !== undefined ? { manualType } : {}),
  ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
});

describe('totalEstimatedMinutes', () => {
  it('returns 0 for an empty list', () => {
    expect(totalEstimatedMinutes([])).toBe(0);
  });

  it('sums estimatedMinutes across block kinds', () => {
    const blocks: ScheduleBlock[] = [
      scene(30),
      { id: createId('block'), kind: 'cue', cueId: createId('cue'), estimatedMinutes: 15 },
      manual('Lunch', 'meal', 45),
    ];
    expect(totalEstimatedMinutes(blocks)).toBe(90);
  });

  it('treats blocks without an estimate as contributing 0', () => {
    const blocks: ScheduleBlock[] = [scene(20), scene(), manual('Move', 'move')];
    expect(totalEstimatedMinutes(blocks)).toBe(20);
  });

  it('returns 0 when no block has an estimate', () => {
    expect(totalEstimatedMinutes([scene(), manual('Strike', 'strike')])).toBe(0);
  });
});

describe('deriveDaySummary', () => {
  it('returns a zeroed summary for a day with no blocks', () => {
    const day: ProductionDay = { id: createId('day'), name: 'Day 1', scheduleBlockIds: [] };
    expect(deriveDaySummary(day, [])).toEqual({
      totalEstimatedMinutes: 0,
      hasUnestimatedBlocks: false,
      sceneCount: 0,
      setupCount: 0,
      shotBlockCount: 0,
      cueCount: 0,
      segmentCount: 0,
      manualCount: 0,
      mealCount: 0,
      moveCount: 0,
    });
  });

  it('only considers blocks referenced by day.scheduleBlockIds', () => {
    const included = [scene(30), scene(60)];
    const excluded = [scene(999)];
    const day: ProductionDay = {
      id: createId('day'),
      name: 'Day 2',
      scheduleBlockIds: included.map((b) => b.id),
    };
    const summary = deriveDaySummary(day, [...included, ...excluded]);
    expect(summary.totalEstimatedMinutes).toBe(90);
    expect(summary.sceneCount).toBe(2);
  });

  it('ignores scheduleBlockIds that reference unknown blocks', () => {
    const block = scene(10);
    const day: ProductionDay = {
      id: createId('day'),
      name: 'Day 3',
      scheduleBlockIds: [block.id, createId('block')],
    };
    const summary = deriveDaySummary(day, [block]);
    expect(summary.sceneCount).toBe(1);
    expect(summary.totalEstimatedMinutes).toBe(10);
  });

  it('counts each block kind and flags unestimated blocks', () => {
    const blocks: ScheduleBlock[] = [
      scene(),
      { id: createId('block'), kind: 'setup', setupId: createId('setup'), estimatedMinutes: 40 },
      { id: createId('block'), kind: 'shots', shotIds: [createId('shot')], estimatedMinutes: 25 },
      { id: createId('block'), kind: 'cue', cueId: createId('cue'), estimatedMinutes: 5 },
      { id: createId('block'), kind: 'segment', segmentId: createId('seg') },
      manual('Lunch', 'meal', 60),
      manual('Company move', 'move', 45),
      manual('Notes', 'other', 10),
    ];
    const day: ProductionDay = {
      id: createId('day'),
      name: 'Day 4',
      scheduleBlockIds: blocks.map((b) => b.id),
    };
    const summary = deriveDaySummary(day, blocks);
    expect(summary.sceneCount).toBe(1);
    expect(summary.setupCount).toBe(1);
    expect(summary.shotBlockCount).toBe(1);
    expect(summary.cueCount).toBe(1);
    expect(summary.segmentCount).toBe(1);
    expect(summary.manualCount).toBe(3);
    expect(summary.mealCount).toBe(1);
    expect(summary.moveCount).toBe(1);
    expect(summary.totalEstimatedMinutes).toBe(40 + 25 + 5 + 60 + 45 + 10);
    expect(summary.hasUnestimatedBlocks).toBe(true);
  });

  it('reports hasUnestimatedBlocks=false when every block has an estimate', () => {
    const blocks = [scene(30), manual('Load in', 'load_in', 90)];
    const day: ProductionDay = {
      id: createId('day'),
      name: 'Day 5',
      scheduleBlockIds: blocks.map((b) => b.id),
    };
    expect(deriveDaySummary(day, blocks).hasUnestimatedBlocks).toBe(false);
  });
});

describe('findScheduleConflicts', () => {
  it('returns no issues for clean blocks', () => {
    const blocks: ScheduleBlock[] = [
      scene(30),
      { id: createId('block'), kind: 'shots', shotIds: [createId('shot'), createId('shot')] },
    ];
    expect(findScheduleConflicts(blocks)).toEqual([]);
  });

  it('detects duplicate block ids', () => {
    const blocks: ScheduleBlock[] = [scene(10)];
    const duplicate = { ...scene(20), id: blocks[0].id };
    blocks.push(duplicate);
    const issues = findScheduleConflicts(blocks);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('DUPLICATE_BLOCK_ID');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].entityId).toBe(blocks[0].id);
  });

  it('detects empty shots blocks', () => {
    const shotsBlock: ScheduleBlock = { id: createId('block'), kind: 'shots', shotIds: [] };
    const issues = findScheduleConflicts([shotsBlock]);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('EMPTY_SHOTS_BLOCK');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].entityId).toBe(shotsBlock.id);
  });

  it('reports both duplicate ids and empty shots blocks in one pass', () => {
    const sharedId = createId('block');
    const emptyShots: ScheduleBlock = { id: sharedId, kind: 'shots', shotIds: [] };
    const issues = findScheduleConflicts([emptyShots, emptyShots]);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('DUPLICATE_BLOCK_ID');
    expect(codes).toContain('EMPTY_SHOTS_BLOCK');
    expect(issues.find((i) => i.code === 'DUPLICATE_BLOCK_ID')?.entityId).toBe(sharedId);
  });
});
