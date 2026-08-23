/**
 * The power plan's consumer list, derived from the floor plan (plan §22).
 *
 * A light standing on the plan is a light that will be plugged in. Until now
 * the power page ignored that: consumers existed only if the user pressed "add
 * all lights from current scene", and even then the fixture's identity was left
 * behind, so every row reported an unknown wattage no matter how precisely the
 * fixture had been specified in the inspector. The page could therefore only
 * ever tell you what you had already typed into it twice.
 *
 * This mirrors what the equipment manifest already does with
 * `deriveSceneEquipment`: the plan owns which things exist, and the panel
 * persists only the decisions the plan cannot know — which circuit a fixture is
 * on, how many of it there are, what its distro zone is, and an explicit
 * wattage where the operator knows better than the catalogue.
 *
 * Pure: no React, no catalogue lookups of its own. The caller supplies the
 * wattage resolver so the same function works against the bundled snapshot, an
 * online refresh, or a stub in a test.
 */

import type { PowerConsumer } from './types';

/** The parts of a floor-plan light this module needs. */
export interface PlanLight {
  id: string;
  name?: string;
  fixtureType?: string;
  brand?: string;
  fixtureModel?: string;
  /** Set when the fixture was picked from the catalogue in the inspector. */
  fixtureProfileId?: string;
}

export interface PlanPowerConsumer extends PowerConsumer {
  /** The plan element this row stands for; absent on hand-added consumers. */
  sourceElementId?: string;
  /** True when the row exists only because the light is on the plan. */
  derivedFromPlan?: boolean;
  /**
   * A saved row whose light has since been deleted from the plan. Kept rather
   * than dropped — the operator may still have the fixture in the truck — but
   * flagged, because a consumer pointing at nothing is exactly the kind of
   * quiet inconsistency this app refuses to leave unlabelled.
   */
  orphanedFromPlan?: boolean;
}

/** A stable id for a light's consumer row, so circuit assignment survives a reload. */
export const planConsumerId = (lightId: string): string => `pcons-plan-${lightId}`;

/** A readable name for a light that was never given one. */
const lightLabel = (light: PlanLight): string => {
  const named = light.name?.trim();
  if (named) return named;
  const model = [light.brand?.trim(), light.fixtureModel?.trim()].filter(Boolean).join(' ');
  if (model) return model;
  return light.fixtureType?.replace(/_/g, ' ') || 'Light';
};

/**
 * Merge the plan's lights with the consumers saved on the power plan.
 *
 * The plan decides what exists; the saved row decides how it is powered. A
 * saved row is matched to its light by `sourceElementId`, and the fields the
 * plan owns — the name and the fixture identity — are refreshed from the light
 * so renaming a fixture in the inspector does not leave a stale label on the
 * distro sheet. Everything the operator set here is preserved untouched.
 */
export const derivePlanConsumers = (
  planLights: readonly PlanLight[],
  saved: readonly PlanPowerConsumer[],
): PlanPowerConsumer[] => {
  const savedByElement = new Map<string, PlanPowerConsumer>();
  for (const consumer of saved) {
    if (consumer.sourceElementId) savedByElement.set(consumer.sourceElementId, consumer);
  }

  const fromPlan = planLights.map((light): PlanPowerConsumer => {
    const existing = savedByElement.get(light.id);
    return {
      // A deterministic id, so a light that has never been touched here still
      // keeps the same row identity between renders and reloads.
      id: existing?.id ?? planConsumerId(light.id),
      quantity: existing?.quantity ?? 1,
      circuitId: existing?.circuitId,
      powerWattsOverride: existing?.powerWattsOverride,
      trussElementId: existing?.trussElementId,
      ...(existing?.distroZone !== undefined ? { distroZone: existing.distroZone } : null),
      // Owned by the plan, refreshed on every read.
      name: lightLabel(light),
      equipmentProfileId: light.fixtureProfileId,
      sourceElementId: light.id,
      derivedFromPlan: true,
    };
  });

  const onPlan = new Set(planLights.map((light) => light.id));
  const handAdded = saved.filter(
    (consumer) => !consumer.sourceElementId || !onPlan.has(consumer.sourceElementId),
  );

  return [
    ...fromPlan,
    ...handAdded.map((consumer) =>
      consumer.sourceElementId ? { ...consumer, orphanedFromPlan: true } : consumer,
    ),
  ];
};

/**
 * The rows worth saving: a derived row that carries no decision of its own is
 * not written to the project.
 *
 * Persisting every light the moment the panel opens would bloat the file with
 * rows that say nothing, and — worse — would freeze the fixture's name and
 * identity at the moment of first render, which is exactly the staleness this
 * derivation exists to avoid.
 */
export const savablePlanConsumers = (
  consumers: readonly PlanPowerConsumer[],
): PlanPowerConsumer[] =>
  consumers
    .filter((consumer) => {
      if (!consumer.derivedFromPlan) return true;
      return (
        consumer.circuitId !== undefined ||
        consumer.powerWattsOverride !== undefined ||
        consumer.trussElementId !== undefined ||
        consumer.distroZone !== undefined ||
        consumer.quantity !== 1
      );
    })
    .map(({ derivedFromPlan: _derived, orphanedFromPlan: _orphaned, ...rest }) => rest);
