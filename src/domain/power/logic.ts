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
  PowerSource,
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
  /** Overrides the circuit's own power factor. 0 < pf ≤ 1; anything else is ignored. */
  powerFactor?: number;
}

/**
 * The power factor to price a circuit's current at: the caller's override, then
 * the circuit's own, then 1. A value outside 0 < pf ≤ 1 is nonsense — a stored
 * 0 would divide by zero and a pf above 1 does not exist — so it is ignored
 * rather than propagated as an Infinity that would read as a fake overload.
 *
 * Every place amps are derived from watts goes through here, so a circuit's
 * headroom, its leg's line current and its source's apparent load all agree
 * about the same circuit instead of one of them quietly dividing by volts alone.
 */
export const circuitPowerFactor = (circuit: PowerCircuit, override?: number): number => {
  const declared = override ?? circuit.powerFactor;
  return declared !== undefined && Number.isFinite(declared) && declared > 0 && declared <= 1
    ? declared
    : 1;
};

export interface CircuitHeadroomResult {
  usedA: number | null;
  headroomA: number | null;
  overloaded: boolean | null;
  /** The power factor the current was computed with (1 when none is set). */
  powerFactor: number;
}

/**
 * Compare a known load against a circuit's rating. Returns `null` results
 * whenever the circuit limit or the supply voltage is unknown — never
 * fabricates 0 or a fake "not overloaded" verdict (plan rule 13).
 *
 * Current is `W / (V × pf)`, not `W / V`. A breaker trips on current, and a
 * magnetic ballast at pf 0.6 pulls two thirds again as many amps as its
 * wattage implies — dividing by volts alone reported "not overloaded" for a
 * circuit that would trip on the first take. `pf` defaults to 1, which is
 * correct for tungsten and PFC LED and leaves every existing plan's numbers
 * exactly as they were.
 */
export const circuitHeadroom = (
  circuit: PowerCircuit,
  loadWatts: number,
  options: CircuitHeadroomOptions = {},
): CircuitHeadroomResult => {
  const { maxAmperesA } = circuit;
  const { voltageV } = options;
  const powerFactor = circuitPowerFactor(circuit, options.powerFactor);
  if (maxAmperesA === undefined || voltageV === undefined || voltageV <= 0) {
    return { usedA: null, headroomA: null, overloaded: null, powerFactor };
  }
  const usedA = loadWatts / (voltageV * powerFactor);
  const headroomA = maxAmperesA - usedA;
  return { usedA, headroomA, overloaded: usedA > maxAmperesA, powerFactor };
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
  /**
   * Line current on this leg, or null when the supply voltage is unknown.
   * Derived per circuit as W/(V·pf) and then summed, so a leg's amps are the
   * same figure the circuits on it report rather than the leg's watts divided
   * by volts alone.
   */
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
  // Apparent power per leg, W/pf summed circuit by circuit. It is accumulated
  // here rather than derived from the leg's watts afterwards because a leg
  // carrying a tungsten circuit and a magnetic-ballast one has no single power
  // factor: averaging the two, or ignoring them, is how the same screen came to
  // show a circuit at 21.7 A while its leg reported 13 A.
  const apparent: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  let unassignedWatts = 0;
  for (const { circuit, watts } of circuitWatts) {
    if (circuit.phaseLeg === 1 || circuit.phaseLeg === 2 || circuit.phaseLeg === 3) {
      totals[circuit.phaseLeg] += watts;
      apparent[circuit.phaseLeg] += watts / circuitPowerFactor(circuit);
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
    ampsA: voltageV !== undefined && voltageV > 0 ? apparent[leg] / voltageV : null,
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

export interface SourceLoadResult {
  /** Real power on this source's circuits, in watts — what the load consumes. */
  knownWatts: number;
  /**
   * Apparent power, Σ W/pf taken circuit by circuit — what the supply has to
   * deliver. Equals {@link SourceLoadResult.knownWatts} while every circuit is
   * at pf 1, so a plan that never touched power factor reads exactly as before.
   */
  apparentVA: number;
  /** Rated V×A×phases, or null while any part of the rating is unknown. */
  capacityVA: number | null;
  /** null when the rating is unknown — never a fabricated "within capacity". */
  overCapacity: boolean | null;
}

/**
 * What one supply is being asked for, against what it is rated to give.
 *
 * The comparison is apparent power on both sides, not watts against volt-amps.
 * A generator and a breaker are sized in kVA and amps; a rig of magnetic
 * ballasts drawing 9 kW at pf 0.6 asks 15 kVA of a supply, and a panel that
 * compared 9 kW with an 11 kVA rating called that comfortable. The sum is taken
 * per circuit because the circuits on one source rarely share a power factor,
 * and an averaged one would be a number nobody could check against a fixture.
 */
export const sourceLoad = (
  source: Pick<PowerSource, 'voltageV' | 'ampsPerPhaseA' | 'phases'>,
  circuitWatts: Array<{ circuit: PowerCircuit; watts: number }>,
): SourceLoadResult => {
  let knownWatts = 0;
  let apparentVA = 0;
  for (const { circuit, watts } of circuitWatts) {
    knownWatts += watts;
    apparentVA += watts / circuitPowerFactor(circuit);
  }
  const { voltageV, ampsPerPhaseA, phases } = source;
  const capacityVA =
    voltageV !== undefined && ampsPerPhaseA !== undefined && phases !== undefined
      ? voltageV * ampsPerPhaseA * phases
      : null;
  return {
    knownWatts,
    apparentVA,
    capacityVA,
    overCapacity: capacityVA === null ? null : apparentVA > capacityVA,
  };
};

/** Planning-aid disclaimer shown wherever power figures are presented. */
export const POWER_DISCLAIMER =
  'Planning estimates only — not an electrical design or safety certification. ' +
  'Have a qualified electrician verify distribution, protection and phase loading on site.';
