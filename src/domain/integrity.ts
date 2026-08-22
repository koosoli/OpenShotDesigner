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
