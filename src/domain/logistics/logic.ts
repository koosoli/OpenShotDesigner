/**
 * Pure logistics calculations (plan §24, rules 4 & 7).
 *
 * Planning estimates only — verify against actual weighed gear and vehicle
 * documentation. Missing data propagates as `null`, never fabricated zeros
 * (rule 13). Canonical units kg / liters (rule 14).
 */

import type { ContainerLoadResult, LogisticsContainer, PackedItem } from './types';

/**
 * Tare plus direct item weights for one container, and how many of those
 * items nobody has weighed. Split out because the rollup needs exactly this
 * per nested container, and computing it twice invites the two figures to
 * drift apart.
 */
const directWeight = (
  container: LogisticsContainer,
  items: readonly PackedItem[],
): { knownKg: number; unknownItemCount: number; tareUnknown: boolean } => {
  let knownKg = container.tareWeightKg ?? 0;
  let unknownItemCount = 0;
  for (const item of items) {
    if (item.containerId !== container.id) continue;
    if (item.unitWeightKg === undefined || item.unitWeightKg === null) {
      unknownItemCount += 1;
      continue;
    }
    const quantity = item.quantity > 0 ? item.quantity : 0;
    knownKg += item.unitWeightKg * quantity;
  }
  return { knownKg, unknownItemCount, tareUnknown: container.tareWeightKg === undefined };
};

/**
 * @param containers every container in the project, so the weight of what is
 * packed inside nested containers can be rolled up. Omit it and the rolled-up
 * figures simply equal the direct ones, which is the truth when the caller
 * knows of no nesting.
 */
export const calculateContainerLoad = (
  container: LogisticsContainer,
  items: PackedItem[],
  containers: readonly LogisticsContainer[] = [],
): ContainerLoadResult => {
  const contents = items.filter((item) => item.containerId === container.id);

  const direct = directWeight(container, items);
  const tareUnknown = direct.tareUnknown;
  const unknownItemCount = direct.unknownItemCount;

  const totalWeightKg = unknownItemCount > 0 ? null : direct.knownKg;

  /**
   * Walk the nesting depth-first, accumulating tare and item weights. A
   * corrupt project can list a container as its own ancestor; `visited` makes
   * that a bounded no-op rather than a stack overflow while a producer is
   * looking at a truck.
   */
  const rolled = { knownKg: 0, unknownItemCount: 0, tareUnknown: false, nestedCount: 0 };
  const accumulate = (node: LogisticsContainer, visited: Set<string>) => {
    const own = directWeight(node, items);
    rolled.knownKg += own.knownKg;
    rolled.unknownItemCount += own.unknownItemCount;
    if (own.tareUnknown) rolled.tareUnknown = true;
    for (const child of containers) {
      if (child.parentContainerId !== node.id || visited.has(child.id)) continue;
      rolled.nestedCount += 1;
      accumulate(child, new Set([...visited, child.id]));
    }
  };
  accumulate(container, new Set([container.id]));

  const rolledUpWeightKg = rolled.unknownItemCount > 0 ? null : rolled.knownKg;

  let usedVolumeLiters = 0;
  let volumeKnown = true;
  let volumeIsEstimate = false;
  for (const item of contents) {
    if (item.packedVolumeLiters === undefined || item.packedVolumeLiters === null) {
      volumeKnown = false;
      continue;
    }
    if (item.volumeIsEstimate) volumeIsEstimate = true;
    const quantity = item.quantity > 0 ? item.quantity : 0;
    usedVolumeLiters += item.packedVolumeLiters * quantity;
  }

  const payloadUtilization =
    container.maxPayloadKg !== undefined && totalWeightKg !== null
      ? totalWeightKg / container.maxPayloadKg
      : null;

  const volumeUtilization =
    container.usableVolumeLiters !== undefined && volumeKnown
      ? usedVolumeLiters / container.usableVolumeLiters
      : null;

  const rolledUpPayloadUtilization =
    container.maxPayloadKg !== undefined && rolledUpWeightKg !== null
      ? rolledUpWeightKg / container.maxPayloadKg
      : null;

  return {
    totalWeightKg,
    tareUnknown,
    unknownItemCount,
    rolledUpWeightKg,
    rolledUpUnknownItemCount: rolled.unknownItemCount,
    rolledUpTareUnknown: rolled.tareUnknown,
    nestedContainerCount: rolled.nestedCount,
    rolledUpPayloadUtilization,
    usedVolumeLiters: volumeKnown ? usedVolumeLiters : null,
    volumeIsEstimate,
    payloadUtilization,
    volumeUtilization,
  };
};

export interface ContainerContents {
  /** Direct packed-item labels in this container. */
  itemLabels: string[];
  /** Containers nested directly inside this container (one level deep). */
  childContainers: LogisticsContainer[];
}

export const listContainerContents = (
  containerId: string,
  items: PackedItem[],
  containers: LogisticsContainer[],
): ContainerContents => {
  const itemLabels = items
    .filter((item) => item.containerId === containerId)
    .map((item) => item.label);
  const childContainers = containers.filter(
    (candidate) => candidate.parentContainerId === containerId,
  );
  return { itemLabels, childContainers };
};

/** Where a container is routed, once inheritance from its parent is applied. */
export interface ContainerAssignment {
  /** `ProductionDay.id`, or undefined when neither it nor any parent names a day. */
  productionDayId?: string;
  /** `Location.id`, on the same terms. */
  locationId?: string;
  /** True when the day came from a parent container rather than from this one. */
  dayInherited: boolean;
  /** True when the location came from a parent container. */
  locationInherited: boolean;
}

/**
 * Resolve every container's shoot day and destination, inheriting each from
 * the nearest ancestor that names one.
 *
 * A case packed inside the truck travels on the truck's day whether or not
 * anybody re-typed it, so filtering a load list by day has to see through the
 * nesting. The walk is cycle-guarded: corrupt data that makes a container its
 * own ancestor stops at the repeat instead of looping.
 */
export const resolveContainerAssignments = (
  containers: readonly LogisticsContainer[],
): Map<string, ContainerAssignment> => {
  const byId = new Map(containers.map((container) => [container.id, container] as const));
  const out = new Map<string, ContainerAssignment>();

  for (const container of containers) {
    let productionDayId = container.productionDayId;
    let locationId = container.locationId;
    let dayInherited = false;
    let locationInherited = false;

    const visited = new Set<string>([container.id]);
    let ancestor = container.parentContainerId ? byId.get(container.parentContainerId) : undefined;
    while (ancestor && !visited.has(ancestor.id) && (productionDayId === undefined || locationId === undefined)) {
      visited.add(ancestor.id);
      if (productionDayId === undefined && ancestor.productionDayId !== undefined) {
        productionDayId = ancestor.productionDayId;
        dayInherited = true;
      }
      if (locationId === undefined && ancestor.locationId !== undefined) {
        locationId = ancestor.locationId;
        locationInherited = true;
      }
      ancestor = ancestor.parentContainerId ? byId.get(ancestor.parentContainerId) : undefined;
    }

    out.set(container.id, { productionDayId, locationId, dayInherited, locationInherited });
  }

  return out;
};

/**
 * Does this container belong on the load list for `productionDayId`?
 *
 * An undefined `productionDayId` argument means "the whole production", so
 * everything belongs. Otherwise a container belongs when it is routed to that
 * day — and also when it is routed to no day at all, because a case nobody has
 * scheduled yet still has to be found and loaded. Hiding unrouted gear from a
 * day sheet is the failure that leaves it in the warehouse.
 */
export const containerBelongsToDay = (
  assignment: ContainerAssignment | undefined,
  productionDayId: string | undefined,
): boolean => {
  if (!productionDayId) return true;
  const assigned = assignment?.productionDayId;
  return assigned === undefined || assigned === productionDayId;
};

export const SAFETY_NOTE =
  'Weight/volume figures are planning estimates; verify against actual weighed gear and vehicle documentation.';
