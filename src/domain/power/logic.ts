/**
 * Pure power-load calculations (plan §22, rules 4 & 7).
 *
 * Planning aid only — not engineering or safety certification (rule 15).
 * Priority: override → profile → fallback (caller-supplied via
 * `getProfileWatts`) → unknown. Never infer watts from model names
 * (rule 28): a model string like 'S60' is never parsed for numbers.
 */

import type {
  PowerConsumer,
  PowerCircuit,
  PowerEstimateSource,
  PowerLoadResult,
} from './types';

export const estimateConsumerWatts = (
  consumer: PowerConsumer,
  profileWatts?: number,
): { watts: number | null; source: PowerEstimateSource } => {
  if (consumer.powerWattsOverride !== undefined && consumer.powerWattsOverride !== null) {
    return { watts: consumer.powerWattsOverride, source: 'override' };
  }
  if (profileWatts !== undefined && profileWatts !== null) {
    return { watts: profileWatts, source: 'profile' };
  }
  return { watts: null, source: 'unknown' };
};

export const calculatePowerLoad = (
  consumers: PowerConsumer[],
  getProfileWatts: (equipmentProfileId: string) => number | undefined,
): PowerLoadResult => {
  let knownWatts = 0;
  let unknownConsumerCount = 0;
  const perConsumer: PowerLoadResult['perConsumer'] = [];

  for (const consumer of consumers) {
    const profileWatts = consumer.equipmentProfileId
      ? getProfileWatts(consumer.equipmentProfileId)
      : undefined;
    const { watts, source } = estimateConsumerWatts(consumer, profileWatts);
    const quantity = consumer.quantity > 0 ? consumer.quantity : 0;

    if (watts === null) {
      unknownConsumerCount += 1;
      perConsumer.push({ consumerId: consumer.id, watts: null, source: 'unknown' });
    } else {
      knownWatts += watts * quantity;
      perConsumer.push({ consumerId: consumer.id, watts: watts * quantity, source });
    }
  }

  return {
    totalWatts: knownWatts,
    knownWatts,
    unknownConsumerCount,
    perConsumer,
  };
};

export interface CircuitHeadroomOptions {
  /** Supply voltage in volts; unknown stays undefined. */
  voltageV?: number;
}

export interface CircuitHeadroomResult {
  usedA: number | null;
  headroomA: number | null;
  overloaded: boolean | null;
}

/**
 * Compare a known load against a circuit's rating. Returns `null` results
 * whenever the circuit limit or the supply voltage is unknown — never
 * fabricates 0 or a fake "not overloaded" verdict (plan rule 13).
 */
export const circuitHeadroom = (
  circuit: PowerCircuit,
  loadWatts: number,
  options: CircuitHeadroomOptions = {},
): CircuitHeadroomResult => {
  const { maxAmperesA } = circuit;
  const { voltageV } = options;
  if (maxAmperesA === undefined || voltageV === undefined || voltageV <= 0) {
    return { usedA: null, headroomA: null, overloaded: null };
  }
  const usedA = loadWatts / voltageV;
  const headroomA = maxAmperesA - usedA;
  return { usedA, headroomA, overloaded: usedA > maxAmperesA };
};

export interface PowerGroupLoad {
  /** Group key as returned by the caller's `groupKeyOf`. */
  key: string;
  /** Sum of the known per-consumer loads in this group, in watts. */
  knownWatts: number;
  /** Consumers in the group whose wattage is unknown — never counted as 0. */
  unknownConsumerCount: number;
  consumerIds: string[];
}

/**
 * Break a power load down by any grouping the caller chooses — truss run,
 * distro zone, circuit, department. Pure regrouping of
 * {@link calculatePowerLoad}: the same priority order and the same
 * unknown-stays-unknown behaviour, never a second estimation path.
 *
 * Consumers whose `groupKeyOf` returns `undefined` land in `ungrouped` rather
 * than being dropped, so a total built from the groups still reconciles with
 * the overall load.
 */
export const powerLoadByGroup = (
  consumers: PowerConsumer[],
  getProfileWatts: (equipmentProfileId: string) => number | undefined,
  groupKeyOf: (consumer: PowerConsumer) => string | undefined,
): { groups: PowerGroupLoad[]; ungrouped: PowerGroupLoad } => {
  const load = calculatePowerLoad(consumers, getProfileWatts);
  const wattsById = new Map(load.perConsumer.map((entry) => [entry.consumerId, entry.watts]));
  const byKey = new Map<string, PowerGroupLoad>();
  const ungrouped: PowerGroupLoad = {
    key: '',
    knownWatts: 0,
    unknownConsumerCount: 0,
    consumerIds: [],
  };

  for (const consumer of consumers) {
    const key = groupKeyOf(consumer);
    const bucket = key
      ? byKey.get(key) ??
        (() => {
          const created: PowerGroupLoad = {
            key,
            knownWatts: 0,
            unknownConsumerCount: 0,
            consumerIds: [],
          };
          byKey.set(key, created);
          return created;
        })()
      : ungrouped;
    bucket.consumerIds.push(consumer.id);
    const watts = wattsById.get(consumer.id);
    if (watts === null || watts === undefined) bucket.unknownConsumerCount += 1;
    else bucket.knownWatts += watts;
  }

  return { groups: [...byKey.values()], ungrouped };
};

export interface PhaseLegLoad {
  leg: 1 | 2 | 3;
  watts: number;
  /** Line current on this leg, or null when the supply voltage is unknown. */
  ampsA: number | null;
}

export interface PhaseBalanceResult {
  legs: PhaseLegLoad[];
  /** Watts on circuits with no leg assigned — excluded from the balance maths. */
  unassignedWatts: number;
  /**
   * Spread between the busiest and quietest leg as a fraction of the busiest
   * (0 = perfectly balanced, 1 = everything on one leg). `null` when no leg
   * carries any known load, because a spread of "0 %" would read as balanced
   * when nothing is actually known (plan rule 13).
   */
  imbalanceRatio: number | null;
  /** The most heavily loaded leg, or null when nothing is assigned. */
  busiestLeg: 1 | 2 | 3 | null;
}

/**
 * Distribute known circuit loads across the three legs of a supply so an
 * operator can see whether the phases are anywhere near even. Planning aid
 * only — this is not a load-flow calculation and says nothing about neutral
 * current or harmonics (plan rule 15).
 */
export const phaseBalance = (
  circuitWatts: Array<{ circuit: PowerCircuit; watts: number }>,
  options: { voltageV?: number } = {},
): PhaseBalanceResult => {
  const totals: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  let unassignedWatts = 0;
  for (const { circuit, watts } of circuitWatts) {
    if (circuit.phaseLeg === 1 || circuit.phaseLeg === 2 || circuit.phaseLeg === 3) {
      totals[circuit.phaseLeg] += watts;
    } else {
      unassignedWatts += watts;
    }
  }
  const { voltageV } = options;
  // Line-to-neutral voltage for a wye supply: a 400 V 3-phase service feeds
  // 230 V single-phase legs. Callers pass the phase voltage they measure.
  const legs: PhaseLegLoad[] = ([1, 2, 3] as const).map((leg) => ({
    leg,
    watts: totals[leg],
    ampsA: voltageV !== undefined && voltageV > 0 ? totals[leg] / voltageV : null,
  }));

  const max = Math.max(...legs.map((entry) => entry.watts));
  const min = Math.min(...legs.map((entry) => entry.watts));
  return {
    legs,
    unassignedWatts,
    imbalanceRatio: max > 0 ? (max - min) / max : null,
    busiestLeg: max > 0 ? (legs.find((entry) => entry.watts === max)?.leg ?? null) : null,
  };
};

/** Planning-aid disclaimer shown wherever power figures are presented. */
export const POWER_DISCLAIMER =
  'Planning estimates only — not an electrical design or safety certification. ' +
  'Have a qualified electrician verify distribution, protection and phase loading on site.';
