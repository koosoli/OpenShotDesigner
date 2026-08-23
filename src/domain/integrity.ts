/**
 * Referential integrity on delete.
 *
 * Deleting an entity has to take every reference to it with it, or the project
 * accumulates pointers into nothing: a power consumer hanging on a truss that
 * was struck, a coverage row for a cue that no longer exists. Those degrade
 * quietly — a stub label here, a missing chip there — which is exactly why they
 * survive for months.
 *
 * These are per-entity and typed rather than one generic
 * `removeEntity(kind, id)`. A generic version would need loose types at every
 * call site and would not know that deleting a truss clears three different
 * collections while deleting a cue clears a matrix row. Each function takes
 * only the slices it touches, returns new objects, and is pure.
 *
 * `removePerson` lives in `domain/people/logic.ts` with the rest of the people
 * logic and follows the same shape.
 */

import { removeCoverageRow, type CoverageMatrix } from './scheduling/coverageMatrix';
import { pruneBreakdownScriptLines } from './script/breakdownTags';
import type { BreakdownItem, ScriptScene } from './script/types';
import type { PowerPlan } from './power';
import type { ProductionDay, ScheduleBlock } from './scheduling';
import type { RiggingItem, SuspendedLoad, TrussElement } from './rigging';

export interface TrussReferences {
  trussElements: TrussElement[];
  suspendedLoads: SuspendedLoad[];
  riggingItems: RiggingItem[];
  /** Power consumers carry the truss they hang on. Optional: not every caller has a plan. */
  powerPlan?: PowerPlan;
}

/**
 * Strike a truss run: the run itself, everything hung on it, the rigging
 * hardware attached to it, and the truss reference on any power consumer.
 *
 * A consumer is NOT deleted — the fixture still exists and still draws power;
 * it just is not on a truss any more, which is the honest state.
 */
export const removeTrussElement = <R extends TrussReferences>(refs: R, trussElementId: string): R => {
  const powerPlan = refs.powerPlan;
  const consumers = powerPlan?.consumers;
  const needsPowerUpdate = consumers?.some((consumer) => consumer.trussElementId === trussElementId);

  return {
    ...refs,
    trussElements: refs.trussElements.filter((element) => element.id !== trussElementId),
    suspendedLoads: refs.suspendedLoads.filter((load) => load.trussElementId !== trussElementId),
    riggingItems: refs.riggingItems.filter((item) => item.trussElementId !== trussElementId),
    ...(needsPowerUpdate && powerPlan
      ? {
          powerPlan: {
            ...powerPlan,
            consumers: consumers!.map((consumer) =>
              consumer.trussElementId === trussElementId
                ? { ...consumer, trussElementId: undefined }
                : consumer,
            ),
          },
        }
      : {}),
  };
};

export interface CueReferences {
  runOfShowCues: Array<{ id: string }>;
  /** Coverage rows are keyed by cue id. Optional: a project may have no matrix. */
  coverageMatrix?: CoverageMatrix;
}

/**
 * Delete a run-of-show cue and the coverage row keyed by it.
 *
 * The row used to be left behind: the editor filtered it out of the display, so
 * it looked gone, but the cells stayed in the project forever and the print
 * builder still emitted them under a `Row abcdef` stub.
 */
export const removeRunOfShowCue = <R extends CueReferences>(refs: R, cueId: string): R => ({
  ...refs,
  runOfShowCues: refs.runOfShowCues.filter((cue) => cue.id !== cueId),
  ...(refs.coverageMatrix
    ? { coverageMatrix: removeCoverageRow(refs.coverageMatrix, cueId) }
    : {}),
});

/** The slices touched when a breakdown element goes. */
export interface BreakdownItemReferences {
  breakdownItems: BreakdownItem[];
  /** Scenes cache the elements they need. Optional: a project may have no script. */
  scriptScenes?: ScriptScene[];
}

/**
 * Delete a breakdown element and the scenes' claims on it.
 *
 * `ScriptScene.breakdownItemIds` is mostly rebuilt from the script by
 * `attachBreakdownItemsToScenes`, but ids that were stored on a scene some
 * other way are kept and merged — so removing the element without clearing
 * them leaves a scene asking for an element nobody can name. That prints on
 * the breakdown sheet as a blank row, which reads as a missing prop rather
 * than a stale pointer.
 */
export const removeBreakdownItemReferences = <R extends BreakdownItemReferences>(
  refs: R,
  itemId: string,
): R => ({
  ...refs,
  breakdownItems: refs.breakdownItems.filter((item) => item.id !== itemId),
  ...(refs.scriptScenes
    ? {
        scriptScenes: refs.scriptScenes.map((scene) =>
          scene.breakdownItemIds.includes(itemId)
            ? { ...scene, breakdownItemIds: scene.breakdownItemIds.filter((id) => id !== itemId) }
            : scene,
        ),
      }
    : {}),
});

/** The slices touched when script lines go. */
export interface ScriptLineReferences {
  breakdownItems?: BreakdownItem[];
}

/**
 * Rewrite breakdown elements after the script has changed, dropping every
 * pointer at a line that no longer exists.
 *
 * Lines come and go constantly — a re-import, a deleted scene, a reconciled
 * paste — so this takes the surviving lines rather than the removed ones.
 */
export const removeScriptLineReferences = <R extends ScriptLineReferences>(
  refs: R,
  liveLineIds: readonly string[],
): R => {
  const items = refs.breakdownItems;
  if (!items || items.length === 0) return refs;
  return { ...refs, breakdownItems: pruneBreakdownScriptLines(items, liveLineIds) };
};

export interface CircuitReferences {
  powerPlan: PowerPlan;
}

/**
 * Remove a power circuit: the circuit itself, and the circuit reference on
 * every consumer fed by it. Consumers survive as unassigned loads.
 */
export const removePowerCircuit = <R extends CircuitReferences>(refs: R, circuitId: string): R => ({
  ...refs,
  powerPlan: {
    ...refs.powerPlan,
    circuits: refs.powerPlan.circuits.filter((circuit) => circuit.id !== circuitId),
    consumers: (refs.powerPlan.consumers ?? []).map((consumer) =>
      consumer.circuitId === circuitId ? { ...consumer, circuitId: undefined } : consumer,
    ),
  },
});

/**
 * Remove a power source: its circuits go with it, and the consumers those
 * circuits fed become unassigned.
 */
export const removePowerSource = <R extends CircuitReferences>(refs: R, sourceId: string): R => {
  const deadCircuitIds = new Set(
    refs.powerPlan.circuits.filter((circuit) => circuit.sourceId === sourceId).map((c) => c.id),
  );
  return {
    ...refs,
    powerPlan: {
      ...refs.powerPlan,
      sources: refs.powerPlan.sources.filter((source) => source.id !== sourceId),
      circuits: refs.powerPlan.circuits.filter((circuit) => !deadCircuitIds.has(circuit.id)),
      consumers: (refs.powerPlan.consumers ?? []).map((consumer) =>
        consumer.circuitId !== undefined && deadCircuitIds.has(consumer.circuitId)
          ? { ...consumer, circuitId: undefined }
          : consumer,
      ),
    },
  };
};

/** The slices touched when a shot or a whole setup goes. */
export interface ScheduleReferences {
  scheduleBlocks?: ScheduleBlock[];
  productionDays?: ProductionDay[];
}

export interface ShotReferences extends ScheduleReferences {
  /** Script lines carry the shot they were lined for. */
  scriptLines?: Array<{ id: string; linkedShotId?: string }>;
}

/**
 * Drop schedule blocks, and unhook them from the days that held them.
 *
 * A day keeps an ordered list of block ids, so removing a block without
 * removing its id leaves the day pointing at nothing. The schedule panel
 * already reports that as a dangling reference — which is honest, and still a
 * warning the user can do nothing about.
 */
const dropBlocks = <R extends ScheduleReferences>(refs: R, removedIds: Set<string>): R => {
  if (removedIds.size === 0) return refs;
  const withBlocks: R = {
    ...refs,
    scheduleBlocks: (refs.scheduleBlocks ?? []).filter((block) => !removedIds.has(block.id)),
  };
  // A caller that keeps no day list must not be handed an empty one: the result
  // is spread straight into project state, where an injected `[]` reads as "the
  // production has no days" rather than "days are none of this caller's
  // business".
  if (refs.productionDays === undefined) return withBlocks;
  return {
    ...withBlocks,
    productionDays: refs.productionDays.map((day) =>
      day.scheduleBlockIds.some((id) => removedIds.has(id))
        ? { ...day, scheduleBlockIds: day.scheduleBlockIds.filter((id) => !removedIds.has(id)) }
        : day,
    ),
  };
};

/**
 * Delete shots' references: their schedule strips, and the script lines that
 * were lined for them.
 *
 * Takes a set because deleting a camera takes every shot on it at once, and
 * doing that one at a time would drop a multi-shot strip only when the last of
 * its shots happened to go.
 *
 * A `shots` strip covering several shots keeps the others and loses only this
 * one; a strip that covered only this shot goes entirely, because a strip
 * covering nothing is not a plan, it is a gap the 1st AD has to work out.
 *
 * The camera and the lining marks are handled where the shot itself is removed,
 * since they live inside the owning setup.
 */
export const removeShotReferences = <R extends ShotReferences>(
  refs: R,
  shotIds: string | readonly string[],
): R => {
  const removed = new Set(typeof shotIds === 'string' ? [shotIds] : shotIds);
  if (removed.size === 0) return refs;

  const blocks = refs.scheduleBlocks ?? [];
  const emptied = new Set<string>();

  const nextBlocks = blocks.map((block) => {
    if (block.kind !== 'shots' || !block.shotIds.some((id) => removed.has(id))) return block;
    const shotIdsLeft = block.shotIds.filter((id) => !removed.has(id));
    if (shotIdsLeft.length === 0) {
      emptied.add(block.id);
      return block;
    }
    return { ...block, shotIds: shotIdsLeft };
  });

  // Only the keys the caller actually passed come back. Writing
  // `scriptLines: refs.scriptLines ?? []` turned "this project has no
  // screenplay" into "this project has an empty screenplay" the moment the
  // result was spread into project state — and the same for a caller that
  // hands over shots without a schedule.
  const withBlocks =
    refs.scheduleBlocks === undefined
      ? refs
      : dropBlocks({ ...refs, scheduleBlocks: nextBlocks }, emptied);

  if (withBlocks.scriptLines === undefined) return withBlocks;

  return {
    ...withBlocks,
    scriptLines: withBlocks.scriptLines.map((line) =>
      line.linkedShotId && removed.has(line.linkedShotId)
        ? { ...line, linkedShotId: undefined }
        : line,
    ),
  };
};

/**
 * Delete a setup's references: its own strip, and the strips covering the shots
 * that lived on it.
 *
 * Deleting a setup used to leave both behind. They rendered as "Unresolved
 * setup 8f3c…" on the board and on every call sheet for that day — honest, but
 * permanent, and nothing the user could clear except by deleting each strip by
 * hand without knowing which ones were affected.
 *
 * The shots that lived on the setup are cleaned up exactly as if each had been
 * deleted on its own — `removeShotReferences` does that part. This used to be a
 * separate, narrower implementation that only walked the schedule, so deleting
 * a setup left the script lined for shots that no longer existed: strokes on
 * the page pointing at nothing, which nothing in the UI could clear.
 */
export const removeSetupReferences = <R extends ShotReferences>(
  refs: R,
  setupId: string,
  shotIdsOnSetup: readonly string[],
): R => {
  const withoutShots = removeShotReferences(refs, shotIdsOnSetup);
  const removed = new Set<string>();
  for (const block of withoutShots.scheduleBlocks ?? []) {
    if (block.kind === 'setup' && block.setupId === setupId) removed.add(block.id);
  }
  return dropBlocks(withoutShots, removed);
};
