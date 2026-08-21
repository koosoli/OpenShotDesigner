/**
 * Project / setup structural validation: duplicate persistent ids and
 * dangling required references (plan §3.6, §4.6 referential integrity).
 */

import type {
  CameraElement,
  FloorPlanElement,
  Project,
  SceneSetup,
  Shot,
} from '../../types';
import { issue, type ValidationIssue } from './types';

const CAMERA_TYPES = new Set(['camera']);

const getCameraIds = (elements: FloorPlanElement[]): Set<string> =>
  new Set(elements.filter((el) => CAMERA_TYPES.has(el.type)).map((el) => el.id));

const getActorIds = (elements: FloorPlanElement[]): Set<string> =>
  new Set(elements.filter((el) => el.type === 'actor').map((el) => el.id));

export const validateSetup = (setup: SceneSetup): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const elementIds = new Set<string>();
  const shotIds = new Set<string>();
  const lineIds = new Set<string>();
  const avRowIds = new Set<string>();

  // --- Duplicate ids -------------------------------------------------------
  for (const el of setup.elements) {
    if (elementIds.has(el.id)) {
      issues.push(issue('error', 'DUPLICATE_ELEMENT_ID', `Duplicate element id "${el.id}" in setup "${setup.name}".`, el.id));
    }
    elementIds.add(el.id);
  }
  for (const shot of setup.shots) {
    if (shotIds.has(shot.id)) {
      issues.push(issue('error', 'DUPLICATE_SHOT_ID', `Duplicate shot id "${shot.id}" in setup "${setup.name}".`, shot.id));
    }
    shotIds.add(shot.id);
  }
  for (const line of setup.scriptLines || []) {
    if (lineIds.has(line.id)) {
      issues.push(issue('error', 'DUPLICATE_SCRIPT_LINE_ID', `Duplicate script line id "${line.id}" in setup "${setup.name}".`, line.id));
    }
    lineIds.add(line.id);
  }
  for (const row of setup.avScriptRows || []) {
    if (avRowIds.has(row.id)) {
      issues.push(issue('error', 'DUPLICATE_AV_ROW_ID', `Duplicate AV script row id "${row.id}" in setup "${setup.name}".`, row.id));
    }
    avRowIds.add(row.id);
  }

  const cameraIds = getCameraIds(setup.elements);
  const actorIds = getActorIds(setup.elements);

  // --- Shot references -----------------------------------------------------
  for (const shot of setup.shots) {
    if (!cameraIds.has(shot.cameraId)) {
      issues.push(issue('error', 'DANGLING_CAMERA_REF', `Shot "${shot.name}" references missing camera "${shot.cameraId}".`, shot.id));
    }
    for (const actorId of shot.subjectActorIds || []) {
      if (!actorIds.has(actorId)) {
        issues.push(issue('error', 'DANGLING_ACTOR_REF', `Shot "${shot.name}" references missing actor "${actorId}".`, shot.id));
      }
    }
    if (shot.scriptLineId && !lineIds.has(shot.scriptLineId)) {
      issues.push(issue('error', 'DANGLING_SCRIPT_LINE', `Shot "${shot.name}" references missing script line "${shot.scriptLineId}".`, shot.id));
    }
  }

  // --- Element references --------------------------------------------------
  for (const el of setup.elements) {
    const camera = el as CameraElement;
    if (camera.type === 'camera' && camera.associatedShotId && !shotIds.has(camera.associatedShotId)) {
      issues.push(issue('error', 'DANGLING_SHOT_REF', `Camera "${el.name}" references missing shot "${camera.associatedShotId}".`, el.id));
    }
    if ('lookAtTargetId' in el && el.lookAtTargetId && !elementIds.has(el.lookAtTargetId)) {
      issues.push(issue('error', 'DANGLING_LOOK_AT_TARGET', `"${el.name}" looks at missing element "${el.lookAtTargetId}".`, el.id));
    }
  }

  // --- Script marks --------------------------------------------------------
  for (const mark of setup.scriptMarks || []) {
    if (!shotIds.has(mark.shotId)) {
      issues.push(issue('error', 'DANGLING_SHOT_REF', `Script mark "${mark.label}" references missing shot "${mark.shotId}".`, mark.id));
    }
    if (!lineIds.has(mark.startLineId)) {
      issues.push(issue('error', 'DANGLING_SCRIPT_LINE', `Script mark "${mark.label}" starts at missing line "${mark.startLineId}".`, mark.id));
    }
    if (!lineIds.has(mark.endLineId)) {
      issues.push(issue('error', 'DANGLING_SCRIPT_LINE', `Script mark "${mark.label}" ends at missing line "${mark.endLineId}".`, mark.id));
    }
  }

  // --- AV rows -------------------------------------------------------------
  for (const row of setup.avScriptRows || []) {
    if (row.linkedShotId && !shotIds.has(row.linkedShotId)) {
      issues.push(issue('error', 'DANGLING_LINKED_SHOT', `AV row "${row.shotNumber}" links to missing shot "${row.linkedShotId}".`, row.id));
    }
  }

  // --- Custom equipment ----------------------------------------------------
  for (const item of setup.customEquipment || []) {
    if (item.elementId && !elementIds.has(item.elementId)) {
      issues.push(issue('error', 'DANGLING_EQUIPMENT_ELEMENT', `Equipment "${item.name}" references missing element "${item.elementId}".`, item.id));
    }
  }

  return issues;
};

export const validateProject = (project: Project): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const setupIds = new Set<string>();

  for (const setup of project.setups) {
    if (setupIds.has(setup.id)) {
      issues.push(issue('error', 'DUPLICATE_SETUP_ID', `Duplicate setup id "${setup.id}" in project "${project.title}".`, setup.id));
    }
    setupIds.add(setup.id);
    issues.push(...validateSetup(setup));
  }

  if (!setupIds.has(project.activeSetupId)) {
    issues.push(issue('error', 'MISSING_ACTIVE_SETUP', `Project "${project.title}" points at missing active setup "${project.activeSetupId}".`, project.activeSetupId));
  }

  // Project-level script entities.
  const projectShotIds = new Set<string>();
  for (const setup of project.setups) {
    for (const shot of setup.shots) projectShotIds.add(shot.id);
  }
  const projectLineIds = new Set<string>();
  for (const line of project.scriptLines || []) {
    if (projectLineIds.has(line.id)) {
      issues.push(issue('error', 'DUPLICATE_SCRIPT_LINE_ID', `Duplicate script line id "${line.id}" in project "${project.title}".`, line.id));
    }
    projectLineIds.add(line.id);
    if (line.linkedShotId && !projectShotIds.has(line.linkedShotId)) {
      issues.push(issue('error', 'DANGLING_LINKED_SHOT', `Script line ${line.lineNumber} links to missing shot "${line.linkedShotId}".`, line.id));
    }
  }

  const calendarEventIds = new Set<string>();
  for (const event of project.productionCalendarEvents ?? []) {
    if (calendarEventIds.has(event.id)) {
      issues.push(issue('error', 'DUPLICATE_CALENDAR_EVENT_ID', `Duplicate production calendar event id "${event.id}".`, event.id));
    }
    calendarEventIds.add(event.id);
    if (event.endDate < event.startDate) {
      issues.push(issue('error', 'INVALID_CALENDAR_EVENT_RANGE', `Calendar event "${event.title}" ends before it starts.`, event.id));
    }
  }
  for (const event of project.productionCalendarEvents ?? []) {
    for (const dependencyId of event.dependencyIds ?? []) {
      if (!calendarEventIds.has(dependencyId)) {
        issues.push(issue('error', 'DANGLING_CALENDAR_DEPENDENCY', `Calendar event "${event.title}" references missing dependency "${dependencyId}".`, event.id));
      }
    }
  }

  return issues;
};
