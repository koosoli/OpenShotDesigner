/**
 * Pure truss-load calculations (plan §11, rules 4 & 7).
 *
 * Planning aid only — planned attached load, not a structural safety
 * certification (rule 15). Missing data propagates as `null`/counts,
 * never fabricated zeros (rule 13). Canonical units kg (rule 14).
 */

import type { RiggingItem, SuspendedLoad, TrussElement, TrussProfile } from './types';

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
    totalKg:
      trussSelfWeightKg === null
        ? null
        : trussSelfWeightKg + loadsKg + clampsKg + cableAllowanceKg,
  };
};

export const SAFETY_DISCLAIMER =
  'Planning aid only — planned attached load, not a structural safety certification.';
