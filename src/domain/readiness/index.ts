import type { LightElement, Project } from '../../types';
import {
  collectFixturePatches,
  DMX_CHANNELS_PER_UNIVERSE,
  findConflicts,
} from '../../utils/dmxPatch';
import { deriveAllScenesEquipment } from '../../utils/equipmentList';
import { deriveBudget } from '../budget';
import { isGoodCoverageTake, shotIdsScheduledOn, takesForShot } from '../continuity';
import { circuitHeadroom, phaseBalance } from '../power';
import { equipmentKey, equipmentLabel, resolveDayLocations } from '../reports';
import { todayIso } from '../scheduling';

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

/**
 * Phase spread that earns a warning, as a fraction of the busiest leg
 * (0 = perfectly balanced, 1 = everything on one leg). At 0.5 the busiest
 * leg carries at least twice the quietest one — past the point where moving
 * a circuit across legs stops being a judgement call.
 */
const PHASE_IMBALANCE_WARN_RATIO = 0.5;

/** True for a usable 1-based DMX start address (mirrors dmxPatch's own rule). */
const isPatchableAddress = (address: number | undefined): address is number =>
  typeof address === 'number' &&
  Number.isFinite(address) &&
  address >= 1 &&
  address <= DMX_CHANNELS_PER_UNIVERSE;

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
    // Known watts per circuit from authoritative overrides only — the same
    // known-loads-only basis the power panel reports, shared by the overload
    // and phase-balance findings below so they never disagree.
    const knownWattsByCircuit = new Map<string, number>();
    for (const circuit of powerPlan.circuits) {
      const consumers = [...new Set([
        ...circuit.consumerIds,
        ...(powerPlan.consumers ?? []).filter((consumer) => consumer.circuitId === circuit.id).map((consumer) => consumer.id),
      ])].map((id) => consumerById.get(id)).filter((consumer) => consumer?.powerWattsOverride != null);
      const knownWatts = consumers.reduce((sum, consumer) => sum + (consumer?.powerWattsOverride ?? 0) * Math.max(0, consumer?.quantity ?? 0), 0);
      knownWattsByCircuit.set(circuit.id, knownWatts);
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
    // Phase balance is only meaningful on a 3-phase supply, for that supply's
    // own circuits — the same scoping the power panel uses.
    for (const source of powerPlan.sources) {
      if (source.phases !== 3) continue;
      const owned = powerPlan.circuits
        .filter((circuit) => circuit.sourceId === source.id)
        .map((circuit) => ({ circuit, watts: knownWattsByCircuit.get(circuit.id) ?? 0 }));
      if (owned.length === 0) continue;
      const balance = phaseBalance(owned, { voltageV: source.voltageV });
      if (balance.imbalanceRatio !== null && balance.imbalanceRatio >= PHASE_IMBALANCE_WARN_RATIO) {
        const legs = balance.legs.map((leg) => ({ leg: leg.leg, watts: leg.watts }));
        result.push({
          id: `power-phase-${source.id}`,
          severity: 'warning',
          label: `${source.name} has unbalanced phases`,
          detail: `Leg L${balance.busiestLeg} carries the most at ${Math.round(balance.imbalanceRatio * 100)}% spread — move circuits across legs.`,
          tab: 'power',
          facts: { sourceId: source.id, imbalanceRatio: balance.imbalanceRatio, busiestLeg: balance.busiestLeg, legs },
        });
      }
    }
  }
  // DMX findings read the patch bay's own verdicts (collect/findConflicts) so
  // the readiness list and the patch sheet can never disagree about a fixture.
  const lights = project.setups.flatMap((setup) => setup.elements)
    .filter((element): element is LightElement => element.type === 'light');
  const patches = collectFixturePatches(lights);
  const conflictByLightId = new Map(findConflicts(patches).map((patch) => [patch.light.id, patch.conflict]));
  const footprintIds = new Set<string>();
  for (const patch of patches) {
    if (!patch.dmxable || patch.channels !== undefined) continue;
    if (patch.universe === undefined && patch.address === undefined) continue;
    const light = patch.light;
    footprintIds.add(light.id);
    const start = patch.universe !== undefined && patch.address !== undefined
      ? `U${patch.universe}:${String(patch.address).padStart(3, '0')}`
      : 'Its patch';
    result.push({
      id: `dmx-footprint-${light.id}`,
      severity: 'warning',
      label: `${light.name} has an unknown DMX footprint`,
      detail: `${start} cannot be checked for overlaps until its fixture mode is set.`,
      tab: 'equipment',
      facts: { universe: patch.universe ?? null, address: patch.address ?? null, footprint: null },
    });
  }
  // Pairwise overlap ids, over placeable fixtures only: a fixture whose own
  // footprint overflows the universe (or whose address is invalid) is that
  // fixture's own problem and is reported as invalid below, not as an overlap.
  const placeable = patches.filter((patch) =>
    patch.dmxable &&
    typeof patch.channels === 'number' &&
    typeof patch.universe === 'number' &&
    patch.universe > 0 &&
    isPatchableAddress(patch.address) &&
    patch.address + Math.max(1, Math.floor(patch.channels)) - 1 <= DMX_CHANNELS_PER_UNIVERSE);
  const overlapIds = new Set<string>();
  for (let leftIndex = 0; leftIndex < placeable.length; leftIndex++) {
    const left = placeable[leftIndex];
    const leftEnd = left.address! + Math.max(1, Math.floor(left.channels!)) - 1;
    for (let rightIndex = leftIndex + 1; rightIndex < placeable.length; rightIndex++) {
      const right = placeable[rightIndex];
      if (left.universe !== right.universe) continue;
      const rightEnd = right.address! + Math.max(1, Math.floor(right.channels!)) - 1;
      if (left.address! <= rightEnd && right.address! <= leftEnd) {
        overlapIds.add(left.light.id);
        overlapIds.add(right.light.id);
        result.push({
          id: `dmx-overlap-${[left.light.id, right.light.id].sort().join('-')}`,
          severity: 'blocker',
          label: `DMX overlap: ${left.light.name} / ${right.light.name}`,
          detail: `Both occupy channels in universe ${left.universe}.`,
          tab: 'equipment',
          facts: { universe: left.universe, left: [left.address, leftEnd], right: [right.address, rightEnd] },
        });
      }
    }
  }
  // Whatever the patch bay still flags after footprint and overlap are
  // accounted for: out-of-range or half-set addresses and universe overflows.
  for (const patch of patches) {
    if (!patch.dmxable || conflictByLightId.get(patch.light.id) !== true) continue;
    if (footprintIds.has(patch.light.id) || overlapIds.has(patch.light.id)) continue;
    if (patch.universe === undefined && patch.address === undefined) continue;
    result.push({
      id: `dmx-invalid-${patch.light.id}`,
      severity: 'blocker',
      label: `${patch.light.name} has an invalid DMX patch`,
      detail: 'Its universe/address cannot place its footprint; re-patch before the plot.',
      tab: 'equipment',
      facts: { universe: patch.universe ?? null, address: patch.address ?? null, channels: patch.channels ?? null },
    });
  }
  const trussProfileById = new Map((project.trussProfiles ?? []).map((profile) => [profile.id, profile]));
  for (const truss of project.trussElements ?? []) {
    const profile = truss.profileId ? trussProfileById.get(truss.profileId) : undefined;
    if (!profile) result.push({ id: `truss-profile-${truss.id}`, severity: 'blocker', label: `${truss.label || 'Truss run'} has no profile`, detail: 'Geometry, self-weight and dimensions cannot be verified.', tab: 'rigging', facts: { profileId: truss.profileId ?? null } });
    else if (profile.selfWeightKg == null || profile.lengthMm == null) result.push({ id: `truss-data-${truss.id}`, severity: 'warning', label: `${truss.label || profile.model || 'Truss run'} has incomplete technical data`, detail: 'Length or self-weight is unknown; rigging totals remain incomplete.', tab: 'rigging', facts: { lengthMm: profile.lengthMm ?? null, selfWeightKg: profile.selfWeightKg ?? null } });
  }
  // Budget blind spots come from deriveBudget, so the readiness list and the
  // budget panel price the same crew list and the same gear on the plan.
  // Days are irrelevant here (only rates matter), hence days: 0.
  const budgetSummary = deriveBudget({
    budget: project.budget,
    people: project.people,
    shootDays: project.productionDays?.length ?? 0,
    equipment: deriveAllScenesEquipment(project.setups).map((item) => ({
      key: equipmentKey(item),
      label: equipmentLabel(item),
      category: item.category,
      quantity: item.maxConcurrentQuantity,
      days: 0,
    })),
  });
  const unpricedPeople = budgetSummary.unpriced
    .filter((entry) => entry.kind === 'person')
    .map((entry) => entry.label);
  if (unpricedPeople.length) result.push({
    id: 'budget-unpriced-people',
    severity: 'warning',
    label: `${unpricedPeople.length} crew/cast rate${unpricedPeople.length === 1 ? '' : 's'} missing`,
    detail: unpricedPeople.slice(0, 4).join(', ') + (unpricedPeople.length > 4 ? '…' : ''),
    tab: 'budget',
    facts: {
      personIds: budgetSummary.unpriced
        .filter((entry) => entry.kind === 'person')
        .map((entry) => entry.id)
        .sort(),
    },
  });
  const unpricedEquipment = budgetSummary.unpriced.filter((entry) => entry.kind === 'equipment');
  if (unpricedEquipment.length) result.push({
    id: 'budget-unpriced-equipment',
    severity: 'warning',
    label: `${unpricedEquipment.length} equipment rate${unpricedEquipment.length === 1 ? '' : 's'} missing`,
    detail: unpricedEquipment.slice(0, 4).map((entry) => entry.label).join(', ') + (unpricedEquipment.length > 4 ? '…' : ''),
    tab: 'budget',
    facts: { keys: unpricedEquipment.map((entry) => entry.id).sort() },
  });
  // Schedule-vs-plan gaps, resolved with the continuity checklist's own
  // resolvers so "scheduled" means the same here as on the stripboard.
  const blocks = project.scheduleBlocks ?? [];
  const days = project.productionDays ?? [];
  const continuitySources = { setups: project.setups, scriptScenes: project.scriptScenes };
  const scheduledShotIds = new Set<string>();
  for (const day of days) {
    for (const shotId of shotIdsScheduledOn(day.scheduleBlockIds, blocks, continuitySources)) {
      scheduledShotIds.add(shotId);
    }
  }
  const knownShotIds = new Set(shots.map((shot) => shot.id));
  for (const setup of project.setups) {
    for (const shot of setup.shots) {
      if (shot.unplanned === true || scheduledShotIds.has(shot.id)) continue;
      result.push({
        id: `shot-unscheduled-${shot.id}`,
        severity: 'warning',
        label: `Shot ${shot.shotNumber} is not on any shooting day`,
        detail: `${setup.name} · add it to a strip or mark it unplanned.`,
        tab: 'schedule',
        facts: { shotId: shot.id, setupId: setup.id },
      });
    }
  }
  // A past day whose scheduled shots have no takes at all: the unit wrapped
  // (or the log was never kept) and nobody can still cover it unnoticed.
  // Shots with takes but no good one already surface as coverage blockers.
  const today = todayIso();
  for (const day of days) {
    if (!day.date || day.date >= today) continue;
    const unlogged = shotIdsScheduledOn(day.scheduleBlockIds, blocks, continuitySources)
      .filter((shotId) => knownShotIds.has(shotId) && takesForShot(takes, shotId).length === 0)
      .sort();
    if (unlogged.length) result.push({
      id: `day-coverage-${day.id}`,
      severity: 'blocker',
      label: `${day.name} wrapped with shots unlogged`,
      detail: `${unlogged.length} scheduled shot${unlogged.length === 1 ? '' : 's'} ha${unlogged.length === 1 ? 's' : 've'} no takes.`,
      tab: 'continuity',
      facts: { dayId: day.id, date: day.date, shotIds: unlogged },
    });
  }
  // A day with strips but no resolvable shooting location: nothing to print
  // on the call sheet and nowhere for the unit to go.
  for (const day of days) {
    if (day.scheduleBlockIds.length === 0) continue;
    const dayLocations = resolveDayLocations(day.scheduleBlockIds, blocks, {
      locations: project.locations,
      scriptScenes: project.scriptScenes,
      setups: project.setups,
    });
    if (dayLocations.length === 0) result.push({
      id: `day-location-${day.id}`,
      severity: 'warning',
      label: `${day.name} has no shooting location`,
      detail: 'Its strips resolve to no location; link one before issuing.',
      tab: 'schedule',
      facts: { dayId: day.id, blockIds: [...day.scheduleBlockIds] },
    });
  }
  return result;
};
