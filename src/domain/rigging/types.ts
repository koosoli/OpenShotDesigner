/**
 * Truss & rigging domain types (plan §11).
 *
 * Planning aid only — never a structural safety certification (rule 15).
 * Canonical units: mm / kg (rule 14). Missing technical data stays
 * `undefined`/`null` — never silently substituted with 0 (rule 13).
 */

export interface TrussProfile {
  id: string;
  manufacturer?: string;
  model?: string;
  geometry: 'box' | 'triangle' | 'ladder' | 'other';
  lengthMm?: number; // canonical mm
  widthMm?: number;
  heightMm?: number;
  selfWeightKg?: number; // canonical kg
  /** Imported or user-attached GDTF archive for this truss type. */
  gdtfAssetId?: string;
  gdtfFileName?: string;
  gdtfModeName?: string;
  /** Imported MVR geometry resource (GLB/GLTF/3DS), preserved for re-export. */
  geometryAssetId?: string;
  geometryFileName?: string;
  source?: {
    provider?: string;
    sourceId?: string;
    version?: string;
    retrievedAt?: string;
    license?: string;
  };
}

export interface TrussElement {
  id: string;
  /** Optional human label (e.g. "Upstage overhead run"). */
  label?: string;
  profileId?: string;
  x: number;
  y: number;
  rotation: number;
  /** Setup/layer this run belongs to. Legacy runs without it use the active setup. */
  setupId?: string;
  elevationMm?: number;
  /** Original MVR UUID, retained across round-trips. */
  mvrUuid?: string;
  lengthOverrideMm?: number;
}

export type RiggingItemKind =
  | 'motor'
  | 'hang_point'
  | 'drop'
  | 'clamp'
  | 'safety'
  | 'bridle'
  | 'note';

export interface RiggingItem {
  id: string;
  kind: RiggingItemKind;
  trussElementId?: string;
  /** Along the truss from its origin. */
  positionMm?: number;
  /**
   * User-entered planned load in kg where applicable
   * (motors carry capacity, not load).
   */
  capacityKg?: number;
  label?: string;
  notes?: string;
}

/** Any equipment with known weight can be a planned suspended load — NOT lighting-only (plan §11.5). */
export interface SuspendedLoad {
  id: string;
  trussElementId: string;
  label: string;
  /**
   * Unknown stays undefined — NEVER 0 (rule 13). On a `'profile'` load this
   * field is not stored: the catalogue owns the figure and
   * `resolveSuspendedLoadWeights` fills it in on read.
   */
  weightKg?: number;
  quantity: number;
  /**
   * Where the weight comes from. `'profile'` is set only by the code paths in
   * `fixtureLoads.ts` that actually link a catalogue profile — it is not a word
   * the operator can pick over a hand-typed number.
   */
  source?: 'profile' | 'manual' | 'unknown';
  /**
   * The floor-plan light this load stands for, when it was added from the
   * plan. Absent on hand-added loads and on loads picked straight out of the
   * catalogue.
   */
  sourceElementId?: string;
  /** The catalogue profile the weight is read from; set with `source: 'profile'`. */
  fixtureProfileId?: string;
}

/**
 * The hardware weights a rigging plan assumes but does not measure: what one
 * clamp weighs, what one safety weighs, and a flat allowance for the cable and
 * ancillaries riding on a run.
 *
 * These are assumptions, not catalogue data, which is why they live on the
 * project rather than in a fixture profile — but they are the operator's
 * assumptions for this production, so they belong in the save file and on the
 * printed sheet rather than evaporating with the browser tab.
 *
 * Absent-safe in two layers: an absent object means "never set", and the
 * caller applies `DEFAULT_RIGGING_ASSUMPTIONS`; an object with an individual
 * field cleared means the operator deliberately emptied that box, and the
 * figure stays unknown rather than reverting to a default they just removed.
 */
export interface RiggingAssumptions {
  /** Weight of a single clamp in kg, applied to the clamp count on each run. */
  clampWeightKg?: number;
  /** Weight of a single safety in kg, applied to the safety count on each run. */
  safetyWeightKg?: number;
  /** Flat cable/ancillary allowance in kg, applied once per truss run. */
  cableAllowanceKg?: number;
}
