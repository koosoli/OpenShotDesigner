/**
 * Rigging as commands.
 *
 * Second cluster off the free-form `updateProjectMeta` patches, chosen for the
 * same reason people were: one operation here carries a real invariant, and it
 * lived inside a React component.
 *
 * Deleting a truss run has to take its suspended loads and its rigging
 * hardware with it, AND release any power consumer that was hanging on it.
 * Miss the last part and the power panel keeps a consumer pointing at a truss
 * that no longer exists — it disappears from the rigging totals but still
 * counts against a circuit, so the load sheet and the rig disagree with each
 * other and nothing on screen says why.
 *
 * The list edits (add a profile, rename a run) are commands too, but for a
 * quieter reason: `updateProjectMeta` labelled every one of them "Update
 * project metadata", so a rigger who undid three steps had no way to tell what
 * they were undoing.
 */
import type { Project } from '../../types';
import type { RiggingItem, SuspendedLoad, TrussElement, TrussProfile } from '../rigging';
import { removeTrussElement } from '../integrity';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

const elementsOf = (project: Project): TrussElement[] => project.trussElements ?? [];

/** Human name for a run; falls back to the id so a log line is never anonymous. */
const runLabel = (element: TrussElement | undefined, fallbackId: string): string =>
  element?.label?.trim() || `truss run ${fallbackId.slice(0, 8)}`;

export interface RemoveTrussElementInput {
  trussElementId: string;
}

/**
 * Remove a truss run and everything hanging on it.
 *
 * The sweep is `removeTrussElement`'s, unchanged. This command exists to make
 * it the only way a run leaves a project and to report what went with it —
 * "and 4 attachments" tells a rigger that more changed than the row they
 * clicked.
 */
export const removeTrussElementCommand = (
  project: Project,
  input: RemoveTrussElementInput,
): CommandResult => {
  if (typeof input.trussElementId !== 'string' || input.trussElementId.trim() === '') {
    throw new Error('removeTrussElement: trussElementId must be a non-empty string.');
  }
  const removed = elementsOf(project).find((element) => element.id === input.trussElementId);
  if (!removed) {
    throw new Error(`removeTrussElement: unknown truss element id "${input.trussElementId}".`);
  }

  const next = removeTrussElement(
    {
      trussElements: elementsOf(project),
      suspendedLoads: project.suspendedLoads ?? [],
      riggingItems: project.riggingItems ?? [],
      powerPlan: project.powerPlan,
    },
    input.trussElementId,
  );

  // Counted before the write, so the description reports what actually went.
  const droppedLoads = (project.suspendedLoads ?? []).filter(
    (load) => load.trussElementId === input.trussElementId,
  ).length;
  const droppedItems = (project.riggingItems ?? []).filter(
    (item) => item.trussElementId === input.trussElementId,
  ).length;
  const releasedConsumers = (project.powerPlan?.consumers ?? []).filter(
    (consumer) => consumer.trussElementId === input.trussElementId,
  ).length;
  const attachments = droppedLoads + droppedItems + releasedConsumers;

  return {
    project: {
      ...project,
      trussElements: next.trussElements,
      suspendedLoads: next.suspendedLoads,
      riggingItems: next.riggingItems,
      ...(next.powerPlan ? { powerPlan: next.powerPlan } : {}),
    },
    meta: {
      type: 'removeTrussElement',
      entityId: input.trussElementId,
      timestamp: commandTimestamp(),
      description:
        attachments === 0
          ? `Remove ${runLabel(removed, input.trussElementId)}`
          : `Remove ${runLabel(removed, input.trussElementId)} and ${attachments} attachment${attachments === 1 ? '' : 's'}`,
    },
    ...(attachments > 0
      ? {
          warnings: [
            `Dropped ${droppedLoads} suspended load${droppedLoads === 1 ? '' : 's'} and ${droppedItems} rigging item${droppedItems === 1 ? '' : 's'}; released ${releasedConsumers} power consumer${releasedConsumers === 1 ? '' : 's'}.`,
          ],
        }
      : {}),
  };
};

export interface UpsertTrussElementInput {
  element: TrussElement;
}

/** Add a truss run, or replace the existing one with the same id. */
export const upsertTrussElementCommand = (
  project: Project,
  input: UpsertTrussElementInput,
): CommandResult => {
  if (!input.element || typeof input.element.id !== 'string' || input.element.id.trim() === '') {
    throw new Error('upsertTrussElement: element.id must be a non-empty string.');
  }
  const elements = elementsOf(project);
  const index = elements.findIndex((element) => element.id === input.element.id);
  const next =
    index === -1
      ? [...elements, input.element]
      : elements.map((element, at) => (at === index ? input.element : element));

  return {
    project: { ...project, trussElements: next },
    meta: {
      type: 'upsertTrussElement',
      entityId: input.element.id,
      timestamp: commandTimestamp(),
      description: `${index === -1 ? 'Add' : 'Update'} ${runLabel(input.element, input.element.id)}`,
    },
  };
};

export interface SetTrussProfilesInput {
  /**
   * Produces the next list from the current one.
   *
   * An updater rather than a finished array on purpose. `runCommand` applies a
   * command against the newest project inside the state updater, so a caller
   * that resolved the list at render time would hand over a stale snapshot and
   * two edits in the same tick would lose the first — a bug this codebase has
   * already paid for once.
   */
  update: (previous: TrussProfile[]) => TrussProfile[];
  /** What the caller did, for the log ("Add truss profile"). */
  description: string;
}

/**
 * Rewrite the truss profile catalogue.
 *
 * Whole-list rather than per-profile because the panel edits these as a table:
 * every field change rewrites the row, so a per-field command would say less,
 * not more.
 */
export const setTrussProfilesCommand = (
  project: Project,
  input: SetTrussProfilesInput,
): CommandResult => {
  if (typeof input.update !== 'function') {
    throw new Error('setTrussProfiles: update must be a function.');
  }
  return {
    project: { ...project, trussProfiles: input.update(project.trussProfiles ?? []) },
    meta: {
      type: 'setTrussProfiles',
      timestamp: commandTimestamp(),
      description: input.description,
    },
  };
};

export interface SetSuspendedLoadsInput {
  /**
   * Produces the next list from the current one.
   *
   * An updater rather than a finished array on purpose. `runCommand` applies a
   * command against the newest project inside the state updater, so a caller
   * that resolved the list at render time would hand over a stale snapshot and
   * two edits in the same tick would lose the first — a bug this codebase has
   * already paid for once.
   */
  update: (previous: SuspendedLoad[]) => SuspendedLoad[];
  /** What the caller did, for the log ("Add truss profile"). */
  description: string;
}

/** Replace the suspended-load list. */
export const setSuspendedLoadsCommand = (
  project: Project,
  input: SetSuspendedLoadsInput,
): CommandResult => {
  if (typeof input.update !== 'function') {
    throw new Error('setSuspendedLoads: update must be a function.');
  }
  return {
    project: { ...project, suspendedLoads: input.update(project.suspendedLoads ?? []) },
    meta: {
      type: 'setSuspendedLoads',
      timestamp: commandTimestamp(),
      description: input.description,
    },
  };
};

export interface SetRiggingItemsInput {
  /**
   * Produces the next list from the current one.
   *
   * An updater rather than a finished array on purpose. `runCommand` applies a
   * command against the newest project inside the state updater, so a caller
   * that resolved the list at render time would hand over a stale snapshot and
   * two edits in the same tick would lose the first — a bug this codebase has
   * already paid for once.
   */
  update: (previous: RiggingItem[]) => RiggingItem[];
  /** What the caller did, for the log ("Add truss profile"). */
  description: string;
}

/** Replace the rigging hardware list. */
export const setRiggingItemsCommand = (
  project: Project,
  input: SetRiggingItemsInput,
): CommandResult => {
  if (typeof input.update !== 'function') {
    throw new Error('setRiggingItems: update must be a function.');
  }
  return {
    project: { ...project, riggingItems: input.update(project.riggingItems ?? []) },
    meta: {
      type: 'setRiggingItems',
      timestamp: commandTimestamp(),
      description: input.description,
    },
  };
};
