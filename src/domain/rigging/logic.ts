/**
 * Pure truss-load calculations (plan §11, rules 4 & 7).
 *
 * Planning aid only — planned attached load, not a structural safety
 * certification (rule 15). Missing data propagates as `null`/counts,
 * never fabricated zeros (rule 13). Canonical units kg (rule 14).
 */

import type {
  RiggingAssumptions,
  RiggingItem,
  RiggingItemKind,
  SuspendedLoad,
  TrussElement,
  TrussProfile,
} from './types';

export interface TrussLoadBreakdown {
  trussElementId: string;
  /** null when profile/self-weight unknown. */
  trussSelfWeightKg: number | null;
  /** Sum of known suspended loads (weight × quantity). */
  loadsKg: number;
  /** Loads with unknown weight; they contribute 0 to `loadsKg`. */
  unknownLoadCount: number;
  /**
   * Clamp + safety hardware weight, derived from the explicit per-item
   * option values × item counts (default undefined → 0 contribution).
   */
  clampsKg: number;
  /** Clamps on this run — printed beside `clampsKg` so the sum can be checked. */
  clampCount: number;
  /** Safeties on this run, same reason. */
  safetyCount: number;
  /** The flat cable allowance applied to this run; undefined when none was set. */
  cableAllowanceKg?: number;
  /**
   * selfWeight + loadsKg + clamps + safeties + cable allowance;
   * null when self-weight unknown — callers must surface "unknown",
   * never fabricate a total.
   */
  totalKg: number | null;
}

export interface TrussLoadOptions {
  /** Per-clamp hardware weight in kg; undefined → clamps contribute 0. */
  clampWeightKg?: number;
  /** Per-safety hardware weight in kg; undefined → safeties contribute 0. */
  safetyWeightKg?: number;
  /** Flat cable/ancillary allowance in kg for this truss run. */
  cableAllowanceKg?: number;
}

/**
 * What the panel assumed before these figures were stored on the project:
 * a half-kilo clamp and a 150 g safety, with no cable allowance until someone
 * decides on one. Keeping them as the fallback means an existing project's
 * numbers do not move the first time it is opened after this change.
 */
export const DEFAULT_RIGGING_ASSUMPTIONS: RiggingAssumptions = {
  clampWeightKg: 0.5,
  safetyWeightKg: 0.15,
};

/**
 * The load options for a project's stored assumptions.
 *
 * An absent object means the project predates the field (or has never been
 * touched here), so the defaults apply. A stored object is taken literally,
 * blanks included: clearing the clamp box is a statement that the clamp weight
 * is unknown, and quietly restoring 0.5 kg would overrule it.
 */
export const riggingLoadOptions = (
  assumptions: RiggingAssumptions | undefined,
): TrussLoadOptions => assumptions ?? DEFAULT_RIGGING_ASSUMPTIONS;

export const calculateTrussLoad = (
  truss: TrussElement,
  profile: TrussProfile | undefined,
  loads: SuspendedLoad[],
  riggingItems: RiggingItem[],
  options?: TrussLoadOptions,
): TrussLoadBreakdown => {
  const trussSelfWeightKg =
    profile && profile.selfWeightKg !== undefined ? profile.selfWeightKg : null;

  let loadsKg = 0;
  let unknownLoadCount = 0;
  for (const load of loads) {
    if (load.trussElementId !== truss.id) continue;
    if (load.weightKg === undefined || load.weightKg === null) {
      unknownLoadCount += 1;
      continue;
    }
    const quantity = load.quantity > 0 ? load.quantity : 0;
    loadsKg += load.weightKg * quantity;
  }

  const clampWeightKg = options?.clampWeightKg ?? 0;
  const safetyWeightKg = options?.safetyWeightKg ?? 0;
  let clampCount = 0;
  let safetyCount = 0;
  for (const item of riggingItems) {
    if (item.trussElementId !== truss.id) continue;
    if (item.kind === 'clamp') clampCount += 1;
    else if (item.kind === 'safety') safetyCount += 1;
  }
  const clampsKg = clampCount * clampWeightKg + safetyCount * safetyWeightKg;

  const cableAllowanceKg = options?.cableAllowanceKg ?? 0;

  return {
    trussElementId: truss.id,
    trussSelfWeightKg,
    loadsKg,
    unknownLoadCount,
    clampsKg,
    clampCount,
    safetyCount,
    cableAllowanceKg: options?.cableAllowanceKg,
    totalKg:
      trussSelfWeightKg === null
        ? null
        : trussSelfWeightKg + loadsKg + clampsKg + cableAllowanceKg,
  };
};

/** Rigging points that carry a truss run — the things a capacity is quoted for. */
const CAPACITY_BEARING_KINDS: ReadonlySet<RiggingItemKind> = new Set(['motor', 'hang_point']);

export interface TrussCapacityVerdict {
  trussElementId: string;
  /** Motors and hang points attached to this run. */
  pointCount: number;
  /** Of those, how many carry no capacity figure. */
  unknownCapacityPointCount: number;
  /**
   * Combined rated capacity in kg, or null when there is nothing to add up or
   * any single point's capacity is unknown — a partial sum would read as the
   * whole rig's limit and invite overloading it (rule 13).
   */
  capacityKg: number | null;
  /** Planned total / capacity as a fraction; null whenever either side is unknown. */
  utilization: number | null;
  /**
   * 'within' and 'over' are only ever reported when both the planned load and
   * the combined capacity are known; everything else is 'unknown'.
   */
  verdict: 'within' | 'over' | 'unknown';
}

/**
 * Compare a run's planned load against the rated capacity of the motors and
 * hang points holding it up.
 *
 * This is a planning cross-check, not a structural sign-off (rule 15): it
 * ignores load distribution, bridle angles, point-by-point sharing and dynamic
 * factors, all of which a rigger judges on site.
 */
export const evaluateTrussCapacity = (
  breakdown: TrussLoadBreakdown,
  riggingItems: RiggingItem[],
): TrussCapacityVerdict => {
  let pointCount = 0;
  let unknownCapacityPointCount = 0;
  let knownCapacityKg = 0;
  for (const item of riggingItems) {
    if (item.trussElementId !== breakdown.trussElementId) continue;
    if (!CAPACITY_BEARING_KINDS.has(item.kind)) continue;
    pointCount += 1;
    if (item.capacityKg === undefined || item.capacityKg === null) {
      unknownCapacityPointCount += 1;
      continue;
    }
    knownCapacityKg += item.capacityKg;
  }

  const capacityKg =
    pointCount > 0 && unknownCapacityPointCount === 0 ? knownCapacityKg : null;

  const utilization =
    capacityKg !== null && capacityKg > 0 && breakdown.totalKg !== null
      ? breakdown.totalKg / capacityKg
      : null;

  return {
    trussElementId: breakdown.trussElementId,
    pointCount,
    unknownCapacityPointCount,
    capacityKg,
    utilization,
    verdict: utilization === null ? 'unknown' : utilization > 1 ? 'over' : 'within',
  };
};

export const SAFETY_DISCLAIMER =
  'Planning aid only — planned attached load, not a structural safety certification.';
