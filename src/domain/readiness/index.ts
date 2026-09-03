import type { LightElement, Project } from '../../types';
import { isGoodCoverageTake } from '../continuity';
import { todayIso } from '../scheduling';
import { circuitHeadroom } from '../power';

export type ReadinessTarget = 'schedule' | 'continuity' | 'tasks' | 'locations' | 'power' | 'equipment' | 'rigging' | 'budget';

export interface ReadinessItem {
  id: string;
  severity: 'blocker' | 'warning';
  label: string;
  detail: string;
  tab: ReadinessTarget;
  /** Stable machine facts; wording/localisation must not invalidate dismissals. */
  facts?: unknown;
}

export interface ReadinessDismissal {
  itemId: string;
  fingerprint: string;
  dismissedAt: string;
}

/** A dismissal only applies while the underlying finding is unchanged. */
export const readinessFingerprint = (item: ReadinessItem): string =>
  JSON.stringify([item.id, item.severity, item.facts ?? item.detail]);

export const buildReadinessItems = (project: Project): ReadinessItem[] => {
  const result: ReadinessItem[] = [];
  const takes = project.takes ?? [];
  const takesByShot = new Map<string, typeof takes>();
  for (const take of takes) takesByShot.set(take.shotId, [...(takesByShot.get(take.shotId) ?? []), take]);
  const shots = project.setups.flatMap((setup) => setup.shots);
  for (const day of project.productionDays ?? []) {
    const missing = [
      !day.date && 'date',
      !day.crewCall && 'crew call',
      day.scheduleBlockIds.length === 0 && 'schedule',
      !day.callSheet?.nearestHospital && 'nearest hospital',
    ].filter(Boolean);
    if (missing.length) result.push({
      id: `day-${day.id}`,
      severity: 'blocker',
      label: `${day.name} is not ready to issue`,
      detail: `Missing ${missing.join(', ')}`,
      tab: 'schedule',
      facts: { missing },
    });
  }
  for (const shot of shots) {
    const shotTakes = takesByShot.get(shot.id) ?? [];
    if (shotTakes.length > 0 && !shotTakes.some(isGoodCoverageTake)) result.push({
      id: `coverage-${shot.id}`,
      severity: 'blocker',
      label: `Shot ${shot.shotNumber} attempted without coverage`,
      detail: 'No good base take; a good PU does not cover the planned shot.',
      tab: 'continuity',
      facts: { takeIds: shotTakes.map((take) => take.id), goodBaseTake: false },
    });
  }
  for (const task of project.tasks ?? []) {
    if (!task.completedAt && task.dueDate && task.dueDate < todayIso()) result.push({
      id: `task-${task.id}`,
      severity: task.priority === 'urgent' ? 'blocker' : 'warning',
      label: `Overdue: ${task.title}`,
      detail: `Due ${task.dueDate}${task.priority ? ` · ${task.priority}` : ''}`,
      tab: 'tasks',
      facts: { dueDate: task.dueDate, priority: task.priority, completed: false },
    });
  }
  for (const location of project.locations ?? []) {
    if (!location.address) result.push({
      id: `location-${location.id}`,
      severity: 'warning',
      label: `${location.name} has no address`,
      detail: 'Call sheets and transport plans cannot provide an address.',
      tab: 'locations',
      facts: { address: null },
    });
  }
  for (const consumer of project.powerPlan?.consumers ?? []) {
    if (!consumer.circuitId) result.push({
      id: `power-${consumer.id}`,
      severity: 'warning',
      label: `${consumer.name} is not assigned to a circuit`,
      detail: 'It cannot be included in circuit loading or phase balance.',
      tab: 'power',
      facts: { circuitId: null },
    });
    if (consumer.powerWattsOverride == null && !consumer.equipmentProfileId) result.push({
      id: `power-watts-${consumer.id}`,
      severity: 'warning',
      label: `${consumer.name} has unknown power draw`,
      detail: 'Enter authoritative watts or link a fixture profile before calculating load.',
      tab: 'power',
      facts: { watts: null, equipmentProfileId: null },
    });
  }
  const powerPlan = project.powerPlan;
  if (powerPlan) {
    const sourceById = new Map(powerPlan.sources.map((source) => [source.id, source]));
    const consumerById = new Map((powerPlan.consumers ?? []).map((consumer) => [consumer.id, consumer]));
    for (const circuit of powerPlan.circuits) {
      const consumers = [...new Set([
        ...circuit.consumerIds,
        ...(powerPlan.consumers ?? []).filter((consumer) => consumer.circuitId === circuit.id).map((consumer) => consumer.id),
      ])].map((id) => consumerById.get(id)).filter((consumer) => consumer?.powerWattsOverride != null);
      const knownWatts = consumers.reduce((sum, consumer) => sum + (consumer?.powerWattsOverride ?? 0) * Math.max(0, consumer?.quantity ?? 0), 0);
      const headroom = circuitHeadroom(circuit, knownWatts, { voltageV: sourceById.get(circuit.sourceId)?.voltageV });
      if (headroom.overloaded) result.push({
        id: `power-overload-${circuit.id}`,
        severity: 'blocker',
        label: `${circuit.name} is overloaded`,
        detail: `${headroom.usedA?.toFixed(1)} A planned on a ${circuit.maxAmperesA} A circuit (known loads only).`,
        tab: 'power',
        facts: { usedA: headroom.usedA, capacityA: circuit.maxAmperesA },
      });
    }
  }
  const patchedLights = project.setups.flatMap((setup) => setup.elements)
    .filter((element): element is LightElement => element.type === 'light' && Boolean(element.dmxUniverse && element.dmxAddress));
  for (const light of patchedLights) {
    if (!light.dmxChannelCount) result.push({
      id: `dmx-footprint-${light.id}`,
      severity: 'warning',
      label: `${light.name} has an unknown DMX footprint`,
      detail: `U${light.dmxUniverse}:${String(light.dmxAddress).padStart(3, '0')} cannot be checked for overlaps.`,
      tab: 'equipment',
      facts: { universe: light.dmxUniverse, address: light.dmxAddress, footprint: null },
    });
  }
  for (let leftIndex = 0; leftIndex < patchedLights.length; leftIndex++) {
    const left = patchedLights[leftIndex];
    if (!left.dmxChannelCount) continue;
    const leftEnd = left.dmxAddress! + left.dmxChannelCount - 1;
    for (let rightIndex = leftIndex + 1; rightIndex < patchedLights.length; rightIndex++) {
      const right = patchedLights[rightIndex];
      if (left.dmxUniverse !== right.dmxUniverse || !right.dmxChannelCount) continue;
      const rightEnd = right.dmxAddress! + right.dmxChannelCount - 1;
      if (left.dmxAddress! <= rightEnd && right.dmxAddress! <= leftEnd) result.push({
        id: `dmx-overlap-${[left.id, right.id].sort().join('-')}`,
        severity: 'blocker',
        label: `DMX overlap: ${left.name} / ${right.name}`,
        detail: `Both occupy channels in universe ${left.dmxUniverse}.`,
        tab: 'equipment',
        facts: { universe: left.dmxUniverse, left: [left.dmxAddress, leftEnd], right: [right.dmxAddress, rightEnd] },
      });
    }
  }
  const trussProfileById = new Map((project.trussProfiles ?? []).map((profile) => [profile.id, profile]));
  for (const truss of project.trussElements ?? []) {
    const profile = truss.profileId ? trussProfileById.get(truss.profileId) : undefined;
    if (!profile) result.push({ id: `truss-profile-${truss.id}`, severity: 'blocker', label: `${truss.label || 'Truss run'} has no profile`, detail: 'Geometry, self-weight and dimensions cannot be verified.', tab: 'rigging', facts: { profileId: truss.profileId ?? null } });
    else if (profile.selfWeightKg == null || profile.lengthMm == null) result.push({ id: `truss-data-${truss.id}`, severity: 'warning', label: `${truss.label || profile.model || 'Truss run'} has incomplete technical data`, detail: 'Length or self-weight is unknown; rigging totals remain incomplete.', tab: 'rigging', facts: { lengthMm: profile.lengthMm ?? null, selfWeightKg: profile.selfWeightKg ?? null } });
  }
  const unpricedPeople = (project.people ?? []).filter((person) => ['crew', 'cast', 'talent'].includes(person.kind ?? 'other') && !person.rateCard);
  if (unpricedPeople.length) result.push({
    id: 'budget-unpriced-people',
    severity: 'warning',
    label: `${unpricedPeople.length} crew/cast rate${unpricedPeople.length === 1 ? '' : 's'} missing`,
    detail: unpricedPeople.slice(0, 4).map((person) => person.displayName).join(', ') + (unpricedPeople.length > 4 ? '…' : ''),
    tab: 'budget',
    facts: { personIds: unpricedPeople.map((person) => person.id).sort() },
  });
  return result;
};
