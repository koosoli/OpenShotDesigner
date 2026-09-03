import type { Project } from '../../types';
import { isGoodCoverageTake } from '../continuity';
import { todayIso } from '../scheduling';

export type ReadinessTarget = 'schedule' | 'continuity' | 'tasks' | 'locations' | 'power';

export interface ReadinessItem {
  id: string;
  severity: 'blocker' | 'warning';
  label: string;
  detail: string;
  tab: ReadinessTarget;
}

export interface ReadinessDismissal {
  itemId: string;
  fingerprint: string;
  dismissedAt: string;
}

/** A dismissal only applies while the underlying finding is unchanged. */
export const readinessFingerprint = (item: ReadinessItem): string =>
  JSON.stringify([item.severity, item.label, item.detail, item.tab]);

export const buildReadinessItems = (project: Project): ReadinessItem[] => {
  const result: ReadinessItem[] = [];
  const takes = project.takes ?? [];
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
    });
  }
  for (const shot of shots) {
    const shotTakes = takes.filter((take) => take.shotId === shot.id);
    if (shotTakes.length > 0 && !shotTakes.some(isGoodCoverageTake)) result.push({
      id: `coverage-${shot.id}`,
      severity: 'blocker',
      label: `Shot ${shot.shotNumber} attempted without coverage`,
      detail: 'No good base take; a good PU does not cover the planned shot.',
      tab: 'continuity',
    });
  }
  for (const task of project.tasks ?? []) {
    if (!task.completedAt && task.dueDate && task.dueDate < todayIso()) result.push({
      id: `task-${task.id}`,
      severity: task.priority === 'urgent' ? 'blocker' : 'warning',
      label: `Overdue: ${task.title}`,
      detail: `Due ${task.dueDate}${task.priority ? ` · ${task.priority}` : ''}`,
      tab: 'tasks',
    });
  }
  for (const location of project.locations ?? []) {
    if (!location.address) result.push({
      id: `location-${location.id}`,
      severity: 'warning',
      label: `${location.name} has no address`,
      detail: 'Call sheets and transport plans cannot provide an address.',
      tab: 'locations',
    });
  }
  for (const consumer of project.powerPlan?.consumers ?? []) {
    if (!consumer.circuitId) result.push({
      id: `power-${consumer.id}`,
      severity: 'warning',
      label: `${consumer.name} is not assigned to a circuit`,
      detail: 'It cannot be included in circuit loading or phase balance.',
      tab: 'power',
    });
  }
  return result;
};
