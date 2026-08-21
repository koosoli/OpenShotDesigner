/**
 * Pure scheduling calculations (plan §4.7, §14).
 *
 * No React, no component imports — domain logic only (repo rule: business
 * logic lives in the domain layer with unit tests).
 */

import type { ValidationIssue } from '../validation';
import { issue } from '../validation';
import type { ProductionDay, ScheduleBlock } from './types';

/** Sum of estimatedMinutes; blocks without an estimate contribute 0. */
export const totalEstimatedMinutes = (blocks: ScheduleBlock[]): number =>
  blocks.reduce((sum, block) => sum + (block.estimatedMinutes ?? 0), 0);

export interface DayDerivedSummary {
  totalEstimatedMinutes: number;
  hasUnestimatedBlocks: boolean;
  sceneCount: number;
  setupCount: number;
  shotBlockCount: number;
  cueCount: number;
  segmentCount: number;
  manualCount: number;
  mealCount: number;
  moveCount: number;
}

/**
 * Derived summary for a production day. Only considers blocks whose ids
 * appear in `day.scheduleBlockIds` — blocks passed in but not referenced by
 * the day are ignored.
 */
export const deriveDaySummary = (day: ProductionDay, blocks: ScheduleBlock[]): DayDerivedSummary => {
  const byId = new Map(blocks.map((block) => [block.id, block] as const));
  const dayBlocks: ScheduleBlock[] = [];
  for (const id of day.scheduleBlockIds) {
    const block = byId.get(id);
    if (block) dayBlocks.push(block);
  }

  const summary: DayDerivedSummary = {
    totalEstimatedMinutes: totalEstimatedMinutes(dayBlocks),
    hasUnestimatedBlocks: false,
    sceneCount: 0,
    setupCount: 0,
    shotBlockCount: 0,
    cueCount: 0,
    segmentCount: 0,
    manualCount: 0,
    mealCount: 0,
    moveCount: 0,
  };

  for (const block of dayBlocks) {
    if (block.estimatedMinutes === undefined) summary.hasUnestimatedBlocks = true;
    switch (block.kind) {
      case 'scene':
        summary.sceneCount += 1;
        break;
      case 'setup':
        summary.setupCount += 1;
        break;
      case 'shots':
        summary.shotBlockCount += 1;
        break;
      case 'cue':
        summary.cueCount += 1;
        break;
      case 'segment':
        summary.segmentCount += 1;
        break;
      case 'manual':
        summary.manualCount += 1;
        if (block.manualType === 'meal') summary.mealCount += 1;
        if (block.manualType === 'move') summary.moveCount += 1;
        break;
    }
  }

  return summary;
};

/**
 * Block-level consistency checks:
 * - duplicate block ids among `blocks` (`DUPLICATE_BLOCK_ID`)
 * - empty shotIds array in a 'shots' block (`EMPTY_SHOTS_BLOCK`)
 */
export const findScheduleConflicts = (blocks: ScheduleBlock[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const block of blocks) {
    if (seenIds.has(block.id)) {
      issues.push(
        issue(
          'error',
          'DUPLICATE_BLOCK_ID',
          `Schedule block id "${block.id}" is used more than once.`,
          block.id,
        ),
      );
    }
    seenIds.add(block.id);

    if (block.kind === 'shots' && block.shotIds.length === 0) {
      issues.push(
        issue(
          'warning',
          'EMPTY_SHOTS_BLOCK',
          `Shots block "${block.id}" references no shots.`,
          block.id,
        ),
      );
    }
  }

  return issues;
};
