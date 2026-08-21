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
