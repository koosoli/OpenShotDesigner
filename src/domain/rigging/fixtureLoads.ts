/**
 * Suspended loads that come from a fixture the app already knows (plan §11.5).
 *
 * `SuspendedLoad.source` has always offered a `'profile'` value, but nothing
 * ever set it: the operator picked the word by hand after typing the weight in
 * by hand, so the sheet claimed a catalogue figure for a number the catalogue
 * had never been asked for. Meanwhile the same fixture's mass is sitting in
 * the fixture catalogue, and every light on the floor plan can point at it.
 *
 * This closes that loop the way `domain/power/planConsumers.ts` closed it for
 * wattage: the load stores the *link* — which plan light it stands for, which
 * catalogue profile its weight is read from — and the weight itself is
 * resolved on read, so a catalogue refresh or a corrected profile reaches the
 * rigging sheet without anybody re-typing anything.
 *
 * Pure: no React, no catalogue lookups of its own. The caller supplies the
 * profile lookup, so the same functions work against the bundled snapshot, an
 * online refresh, or a stub in a test. A profile the lookup cannot find, or
 * one that carries no mass, leaves the weight `undefined` — explicitly unknown,
 * never 0 (rule 13).
 */

import type { SuspendedLoad } from './types';

/** The parts of a floor-plan light this module needs. */
export interface RiggablePlanLight {
  id: string;
  name?: string;
  fixtureType?: string;
  brand?: string;
  fixtureModel?: string;
  /** Set when the fixture was picked from the catalogue in the inspector. */
  fixtureProfileId?: string;
}

/** The catalogue facts a suspended load needs: what to call it, what it weighs. */
export interface FixtureWeightProfile {
  id: string;
  manufacturer?: string;
  model?: string;
  /** Unknown stays undefined — a fixture with no published mass is not weightless. */
  weightKg?: number;
}

/** Supplied by the caller so this module never reaches into the catalogue store. */
export type FixtureProfileLookup = (profileId: string) => FixtureWeightProfile | undefined;

/** A readable name for a light that was never given one — same rule as the power page. */
export const planLightLoadLabel = (light: RiggablePlanLight): string => {
  const named = light.name?.trim();
  if (named) return named;
  const model = [light.brand?.trim(), light.fixtureModel?.trim()].filter(Boolean).join(' ');
  if (model) return model;
  return light.fixtureType?.replace(/_/g, ' ') || 'Light';
};

/** "ARRI SkyPanel S60-C", falling back to whichever half the catalogue has. */
export const fixtureProfileLabel = (profile: FixtureWeightProfile): string => {
  const bits = [profile.manufacturer?.trim(), profile.model?.trim()].filter(Boolean);
  return bits.length > 0 ? bits.join(' ') : 'Catalogue fixture';
};

/**
 * A load standing for a light on the floor plan.
 *
 * The light's own identity decides the label and the catalogue link; the
 * weight is deliberately left off, because it belongs to the catalogue and is
 * filled in by `resolveSuspendedLoadWeights` on every read. A light that was
 * never linked to a catalogue profile produces an honestly `'unknown'` load
 * rather than a `'profile'` one with nothing behind it.
 */
export const suspendedLoadFromPlanLight = (
  light: RiggablePlanLight,
  trussElementId: string,
  id: string,
): SuspendedLoad => ({
  id,
  trussElementId,
  label: planLightLoadLabel(light),
  quantity: 1,
  sourceElementId: light.id,
  ...(light.fixtureProfileId
    ? { source: 'profile' as const, fixtureProfileId: light.fixtureProfileId }
    : { source: 'unknown' as const }),
});

/**
 * A load for a catalogue fixture that is not (or not yet) on the floor plan —
 * the practical hanging off the grid that nobody has drawn.
 */
export const suspendedLoadFromFixtureProfile = (
  profile: FixtureWeightProfile,
  trussElementId: string,
  id: string,
): SuspendedLoad => ({
  id,
  trussElementId,
  label: fixtureProfileLabel(profile),
  quantity: 1,
  source: 'profile',
  fixtureProfileId: profile.id,
});

/**
 * Fill in the catalogue weight of every profile-sourced load.
 *
 * Only loads that say they come from a profile are touched, so a hand-entered
 * weight is never overwritten — that is what makes overriding a catalogue
 * figure (which flips the load to `'manual'`) a one-way, deliberate act. A
 * profile that has gone missing, or one with no published mass, yields
 * `undefined`: the load then counts as an unknown weight on the run instead of
 * quietly weighing nothing.
 */
export const resolveSuspendedLoadWeights = (
  loads: readonly SuspendedLoad[],
  lookup: FixtureProfileLookup,
): SuspendedLoad[] =>
  loads.map((load) => {
    if (load.source !== 'profile' || !load.fixtureProfileId) return load;
    return { ...load, weightKg: lookup(load.fixtureProfileId)?.weightKg };
  });

/**
 * Turn a catalogue-linked load back into a hand-entered one, seeded with
 * whatever the catalogue last said.
 *
 * The seed matters: an operator who overrides a 6.2 kg fixture usually means
 * "6.2 plus the yoke and the frame", so starting from a blank box would throw
 * away the only figure anyone has. When the catalogue never had a weight the
 * box stays blank — still unknown, still never 0.
 */
export const detachLoadFromProfile = (
  load: SuspendedLoad,
  lookup: FixtureProfileLookup,
): SuspendedLoad => {
  const { fixtureProfileId: _link, ...rest } = load;
  return {
    ...rest,
    source: 'manual',
    weightKg: load.fixtureProfileId ? lookup(load.fixtureProfileId)?.weightKg : load.weightKg,
  };
};

/** True when this plan light already hangs on this run — the add button says so. */
export const planLightIsOnRun = (
  loads: readonly SuspendedLoad[],
  lightId: string,
  trussElementId: string,
): boolean =>
  loads.some((load) => load.sourceElementId === lightId && load.trussElementId === trussElementId);
