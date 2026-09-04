/**
 * Move a schedule block between production days as a pure domain command.
 *
 * Days hold an ordered list of block ids, so moving is an unhook plus an
 * insert: the block leaves every day that referenced it and joins the target
 * day at the requested position (end by default). Moving within the same day
 * reorders. A move that changes nothing returns the caller's project
 * reference untouched, with metadata saying so.
 */
import type { Project } from '../../types';
import type { ScheduleBlock } from '../scheduling';
import { blockLabel, buildStripboardLabelContext } from '../scheduling';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

export interface MoveScheduleBlockInput {
  blockId: string;
  toDayId: string;
  /** Position in the target day. Defaults to the end; clamps into range. */
  toIndex?: number;
}

const describeTarget = (position: number, length: number): string =>
  position >= length ? 'the end' : `position ${position + 1}`;

export const moveScheduleBlockCommand = (
  project: Project,
  input: MoveScheduleBlockInput,
): CommandResult => {
  if (typeof input.blockId !== 'string' || input.blockId.trim() === '') {
    throw new Error('moveScheduleBlock: blockId must be a non-empty string.');
  }
  if (typeof input.toDayId !== 'string' || input.toDayId.trim() === '') {
    throw new Error('moveScheduleBlock: toDayId must be a non-empty string.');
  }
  const block: ScheduleBlock | undefined = (project.scheduleBlocks ?? []).find(
    (candidate) => candidate.id === input.blockId,
  );
  if (!block) {
    throw new Error(`moveScheduleBlock: unknown schedule block id "${input.blockId}".`);
  }
  const days = project.productionDays ?? [];
  const target = days.find((day) => day.id === input.toDayId);
  if (!target) {
    throw new Error(`moveScheduleBlock: unknown production day id "${input.toDayId}".`);
  }
  if (
    input.toIndex !== undefined &&
    (!Number.isInteger(input.toIndex) || input.toIndex < 0)
  ) {
    throw new Error('moveScheduleBlock: toIndex must be a non-negative integer.');
  }

  const label = blockLabel(block, buildStripboardLabelContext(project));
  const sources = days.filter((day) => day.scheduleBlockIds.includes(input.blockId));
  const fromName = sources.length > 0 ? sources[0].name : 'unscheduled';

  const withoutBlock = target.scheduleBlockIds.filter((id) => id !== input.blockId);
  const position = Math.min(input.toIndex ?? withoutBlock.length, withoutBlock.length);
  const reordered = [
    ...withoutBlock.slice(0, position),
    input.blockId,
    ...withoutBlock.slice(position),
  ];

  const sameDayOnly = sources.length === 1 && sources[0].id === target.id;
  const unchanged =
    sameDayOnly &&
    target.scheduleBlockIds.length === reordered.length &&
    target.scheduleBlockIds.every((id, index) => id === reordered[index]);
  if (unchanged) {
    return {
      project,
      meta: {
        type: 'moveScheduleBlock',
        entityId: input.blockId,
        timestamp: commandTimestamp(),
        description: `Move ${label} to ${target.name} — already there, no change`,
      },
    };
  }

  // Clone only after validation, so a failure can never half-apply.
  const next: Project = structuredClone(project);
  const nextDays = next.productionDays ?? [];
  for (const day of nextDays) {
    if (day.id === input.toDayId) {
      const ids = day.scheduleBlockIds.filter((id) => id !== input.blockId);
      const at = Math.min(input.toIndex ?? ids.length, ids.length);
      day.scheduleBlockIds = [...ids.slice(0, at), input.blockId, ...ids.slice(at)];
    } else if (day.scheduleBlockIds.includes(input.blockId)) {
      day.scheduleBlockIds = day.scheduleBlockIds.filter((id) => id !== input.blockId);
    }
  }

  const description =
    sources.length === 0
      ? `Schedule ${label} on ${target.name} (${describeTarget(position, reordered.length)})`
      : sameDayOnly
        ? `Reorder ${label} within ${target.name} (${describeTarget(position, reordered.length)})`
        : `Move ${label} from ${fromName} to ${target.name}`;

  return {
    project: next,
    meta: {
      type: 'moveScheduleBlock',
      entityId: input.blockId,
      timestamp: commandTimestamp(),
      description,
    },
  };
};
