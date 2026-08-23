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
  return {
    ...refs,
    scheduleBlocks: (refs.scheduleBlocks ?? []).filter((block) => !removedIds.has(block.id)),
    productionDays: (refs.productionDays ?? []).map((day) =>
      day.scheduleBlockIds.some((id) => removedIds.has(id))
        ? { ...day, scheduleBlockIds: day.scheduleBlockIds.filter((id) => !removedIds.has(id)) }
        : day,
    ),
  };
};

/**
 * Delete a shot's references: its schedule strip, and the script line that was
 * lined for it.
 *
 * A `shots` strip covering several shots keeps the others and loses only this
 * one; a strip that covered only this shot goes entirely, because a strip
 * covering nothing is not a plan, it is a gap the 1st AD has to work out.
 *
 * The camera and the lining marks are handled where the shot itself is removed,
 * since they live inside the owning setup.
 */
export const removeShotReferences = <R extends ShotReferences>(refs: R, shotId: string): R => {
  const blocks = refs.scheduleBlocks ?? [];
  const emptied = new Set<string>();

  const nextBlocks = blocks.map((block) => {
    if (block.kind !== 'shots' || !block.shotIds.includes(shotId)) return block;
    const shotIds = block.shotIds.filter((id) => id !== shotId);
    if (shotIds.length === 0) {
      emptied.add(block.id);
      return block;
    }
    return { ...block, shotIds };
  });

  const withBlocks = dropBlocks({ ...refs, scheduleBlocks: nextBlocks }, emptied);

  return {
    ...withBlocks,
    scriptLines: (refs.scriptLines ?? []).map((line) =>
      line.linkedShotId === shotId ? { ...line, linkedShotId: undefined } : line,
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
 */
export const removeSetupReferences = <R extends ScheduleReferences>(
  refs: R,
  setupId: string,
  shotIdsOnSetup: readonly string[],
): R => {
  const shotIds = new Set(shotIdsOnSetup);
  const blocks = refs.scheduleBlocks ?? [];
  const removed = new Set<string>();

  const nextBlocks = blocks.map((block) => {
    if (block.kind === 'setup' && block.setupId === setupId) {
      removed.add(block.id);
      return block;
    }
    if (block.kind === 'shots') {
      const remaining = block.shotIds.filter((id) => !shotIds.has(id));
      if (remaining.length === 0 && block.shotIds.length > 0) {
        removed.add(block.id);
        return block;
      }
      if (remaining.length !== block.shotIds.length) return { ...block, shotIds: remaining };
    }
    return block;
  });

  return dropBlocks({ ...refs, scheduleBlocks: nextBlocks }, removed);
};
