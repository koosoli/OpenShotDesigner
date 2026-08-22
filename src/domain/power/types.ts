/**
 * Power domain types (plan §22).
 *
 * Planning aid only — not engineering or safety certification (plan rule 15).
 * Voltages/amperages are explicit fields; unknown stays `undefined`, never
 * a fabricated 0 (plan rule 13). Wattage is canonical W (units policy).
 */

export type PowerSourceKind =
  | 'mains_120v_20a' | 'mains_230v_16a' | 'mains_230v_32a'
  | 'three_phase_400v_16a' | 'three_phase_400v_32a' | 'three_phase_400v_63a' | 'three_phase_400v_125a'
  | 'generator' | 'battery' | 'custom';

export interface PowerSource {
  id: string;
  name: string;
  kind: PowerSourceKind;
  /** Explicit volts; unknown stays undefined. */
  voltageV?: number;
  ampsPerPhaseA?: number;
  phases?: 1 | 3;
  notes?: string;
}

export interface PowerConsumer {
  id: string;
  name: string;
  equipmentProfileId?: string;
  /** Authoritative wattage override; takes priority over profile data. */
  powerWattsOverride?: number;
  quantity: number;
  circuitId?: string;
  /**
   * Truss / rigged position this consumer hangs on (`TrussElement.id`), so the
   * power report can be broken down per truss run. Absent = not rigged or not
   * yet assigned; never guessed from the fixture's plan position.
   */
  trussElementId?: string;
  /**
   * Free-form distribution zone label ("Stage-left distro", "Genny B") for
   * productions that group by area rather than by truss. Absent = ungrouped.
   */
  distroZone?: string;
}

export interface PowerCircuit {
  id: string;
  name: string;
  sourceId: string;
  maxAmperesA?: number;
  consumerIds: string[];
  /**
   * Which leg of a 3-phase supply this circuit hangs off (L1/L2/L3). Absent =
   * unassigned, which keeps the circuit out of the phase-balance report rather
   * than silently loading it onto L1 (plan rule 13).
   */
  phaseLeg?: 1 | 2 | 3;
}

/**
 * Power estimation priority (plan §22):
 * authoritative profile → user override → curated fallback → unknown.
 * Never infer watts from model names.
 */
export type PowerEstimateSource = 'profile' | 'override' | 'fallback' | 'unknown';

export interface PowerLoadResult {
  /** Known load only (equals {@link PowerLoadResult.knownWatts}). Callers must surface unknownConsumerCount. */
  totalWatts: number | null;
  knownWatts: number;
  unknownConsumerCount: number;
  perConsumer: Array<{ consumerId: string; watts: number | null; source: PowerEstimateSource }>;
}

/** A project's persisted power topology (plan §22). */
export interface PowerPlan {
  sources: PowerSource[];
  circuits: PowerCircuit[];
  /** Planned consumers (e.g. fixtures placed on the plan). */
  consumers?: PowerConsumer[];
}

