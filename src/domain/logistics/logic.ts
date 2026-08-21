/**
 * Pure logistics calculations (plan §24, rules 4 & 7).
 *
 * Planning estimates only — verify against actual weighed gear and vehicle
 * documentation. Missing data propagates as `null`, never fabricated zeros
 * (rule 13). Canonical units kg / liters (rule 14).
 */

import type { ContainerLoadResult, LogisticsContainer, PackedItem } from './types';

export const calculateContainerLoad = (
  container: LogisticsContainer,
  items: PackedItem[],
): ContainerLoadResult => {
  const contents = items.filter((item) => item.containerId === container.id);

  const tareUnknown = container.tareWeightKg === undefined;
  const tare = container.tareWeightKg ?? 0;

  let knownWeightKg = 0;
  let unknownItemCount = 0;
  for (const item of contents) {
    if (item.unitWeightKg === undefined || item.unitWeightKg === null) {
      unknownItemCount += 1;
      continue;
    }
    const quantity = item.quantity > 0 ? item.quantity : 0;
    knownWeightKg += item.unitWeightKg * quantity;
  }

  const totalWeightKg = unknownItemCount > 0 ? null : tare + knownWeightKg;

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

  return {
    totalWeightKg,
    tareUnknown,
    unknownItemCount,
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

export const SAFETY_NOTE =
  'Weight/volume figures are planning estimates; verify against actual weighed gear and vehicle documentation.';
