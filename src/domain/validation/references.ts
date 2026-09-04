/**
 * Cross-domain reference validation (plan §3.6, roadmap Phase 1).
 *
 * `project.ts` covers the setup/script/calendar cores. Everything persisted
 * outside those cores — takes, schedule, people, call sheets, review notes,
 * asset shapes — is checked here, one function per domain, aggregated by
 * `validateProject`. Split by domain rather than grown into one file, so a
 * new collection brings a new function instead of another hundred lines in
 * the core validator.
 *
 * Severity policy: ERROR blocks import (`loadProjectFromJson` rejects on
 * errors), so it is reserved for references the app itself maintains
 * atomically (deleting a shot deletes its takes; deleting a setup removes
 * its strips). Anything the UI deliberately tolerates — unresolved call
 * sheet rows, review notes on deleted entities, legacy inline media — is a
 * WARNING: visible in the integrity report, never import-blocking.
 */

import type { Project } from '../../types';
import { isAssetRef, isInlineImage } from '../media/imageRef';
import { issue, type ValidationIssue } from './types';

/** Id sets for cross-domain reference checks, built once per validation. */
export interface ProjectReferenceIndex {
  shotIds: Set<string>;
  setupIds: Set<string>;
  elementIds: Set<string>;
  scriptSceneIds: Set<string>;
  characterIds: Set<string>;
  personIds: Set<string>;
  dayIds: Set<string>;
  blockIds: Set<string>;
  cueIds: Set<string>;
  segmentIds: Set<string>;
  locationIds: Set<string>;
}

export const indexProjectReferences = (project: Project): ProjectReferenceIndex => {
  const shotIds = new Set<string>();
  const setupIds = new Set<string>();
  const elementIds = new Set<string>();
  for (const setup of project.setups ?? []) {
    setupIds.add(setup.id);
    for (const shot of setup.shots ?? []) shotIds.add(shot.id);
    for (const element of setup.elements ?? []) elementIds.add(element.id);
  }
  return {
    shotIds,
    setupIds,
    elementIds,
    scriptSceneIds: new Set((project.scriptScenes ?? []).map((scene) => scene.id)),
    characterIds: new Set((project.characters ?? []).map((character) => character.id)),
    personIds: new Set((project.people ?? []).map((person) => person.id)),
    dayIds: new Set((project.productionDays ?? []).map((day) => day.id)),
    blockIds: new Set((project.scheduleBlocks ?? []).map((block) => block.id)),
    cueIds: new Set((project.runOfShowCues ?? []).map((cue) => cue.id)),
    segmentIds: new Set((project.productionSegments ?? []).map((segment) => segment.id)),
    locationIds: new Set((project.locations ?? []).map((location) => location.id)),
  };
};

/** Takes hang off shots; deleting a shot deletes its takes, so these are errors. */
export const validateTakes = (project: Project, index = indexProjectReferences(project)): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const takeIds = new Set<string>();
  for (const take of project.takes ?? []) {
    if (takeIds.has(take.id)) {
      issues.push(issue('error', 'DUPLICATE_TAKE_ID', `Duplicate take id "${take.id}".`, take.id));
    }
    takeIds.add(take.id);
    if (!index.shotIds.has(take.shotId)) {
      issues.push(issue('error', 'DANGLING_TAKE_SHOT', `Take ${take.takeNumber} references missing shot "${take.shotId}".`, take.id));
    }
    // Deleting a day unhooks its takes rather than deleting footage, so a
    // dangling day is a warning: worth surfacing, never import-blocking.
    if (take.productionDayId && !index.dayIds.has(take.productionDayId)) {
      issues.push(issue('warning', 'DANGLING_TAKE_DAY', `Take ${take.takeNumber} references missing shooting day "${take.productionDayId}".`, take.id));
    }
  }
  return issues;
};

/** Schedule blocks resolve against scenes, setups, shots, cues and segments. */
export const validateSchedule = (project: Project, index = indexProjectReferences(project)): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const dayIds = new Set<string>();
  for (const day of project.productionDays ?? []) {
    if (dayIds.has(day.id)) {
      issues.push(issue('error', 'DUPLICATE_PRODUCTION_DAY_ID', `Duplicate shooting day id "${day.id}".`, day.id));
    }
    dayIds.add(day.id);
    for (const blockId of day.scheduleBlockIds ?? []) {
      if (!index.blockIds.has(blockId)) {
        issues.push(issue('error', 'DANGLING_SCHEDULE_BLOCK', `Day "${day.name}" references missing schedule block "${blockId}".`, day.id));
      }
    }
  }
  const blockIds = new Set<string>();
  for (const block of project.scheduleBlocks ?? []) {
    if (blockIds.has(block.id)) {
      issues.push(issue('error', 'DUPLICATE_SCHEDULE_BLOCK_ID', `Duplicate schedule block id "${block.id}".`, block.id));
    }
    blockIds.add(block.id);
    switch (block.kind) {
      case 'scene':
        if (!index.scriptSceneIds.has(block.scriptSceneId)) {
          issues.push(issue('error', 'DANGLING_SCHEDULE_SCENE', `Schedule block references missing scene "${block.scriptSceneId}".`, block.id));
        }
        break;
      case 'setup':
        if (!index.setupIds.has(block.setupId)) {
          issues.push(issue('error', 'DANGLING_SCHEDULE_SETUP', `Schedule block references missing setup "${block.setupId}".`, block.id));
        }
        break;
      case 'shots':
        for (const shotId of block.shotIds ?? []) {
          if (!index.shotIds.has(shotId)) {
            issues.push(issue('error', 'DANGLING_SCHEDULE_SHOT', `Schedule block references missing shot "${shotId}".`, block.id));
          }
        }
        break;
      case 'cue':
        if (!index.cueIds.has(block.cueId)) {
          issues.push(issue('error', 'DANGLING_SCHEDULE_CUE', `Schedule block references missing run-of-show cue "${block.cueId}".`, block.id));
        }
        break;
      case 'segment':
        if (!index.segmentIds.has(block.segmentId)) {
          issues.push(issue('error', 'DANGLING_SCHEDULE_SEGMENT', `Schedule block references missing segment "${block.segmentId}".`, block.id));
        }
        break;
      case 'manual':
        break;
    }
  }
  return issues;
};

/** Cast assignments bind characters to people; both ends must exist. */
export const validatePeople = (project: Project, index = indexProjectReferences(project)): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const personIds = new Set<string>();
  for (const person of project.people ?? []) {
    if (personIds.has(person.id)) {
      issues.push(issue('error', 'DUPLICATE_PERSON_ID', `Duplicate person id "${person.id}".`, person.id));
    }
    personIds.add(person.id);
  }
  const assignmentIds = new Set<string>();
  for (const assignment of project.castAssignments ?? []) {
    if (assignmentIds.has(assignment.id)) {
      issues.push(issue('error', 'DUPLICATE_CAST_ASSIGNMENT_ID', `Duplicate cast assignment id "${assignment.id}".`, assignment.id));
    }
    assignmentIds.add(assignment.id);
    if (!index.characterIds.has(assignment.characterId)) {
      issues.push(issue('error', 'DANGLING_CAST_CHARACTER', `Cast assignment references missing character "${assignment.characterId}".`, assignment.id));
    }
    if (!index.personIds.has(assignment.personId)) {
      issues.push(issue('error', 'DANGLING_CAST_PERSON', `Cast assignment references missing person "${assignment.personId}".`, assignment.id));
    }
  }
  return issues;
};

/**
 * Call sheet person rows render as "unresolved" by design when the person is
 * gone, so these stay warnings: the sheet must still open and print.
 */
export const validateCallSheets = (project: Project, index = indexProjectReferences(project)): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  for (const day of project.productionDays ?? []) {
    const sheet = day.callSheet;
    if (!sheet) continue;
    for (const pickup of sheet.pickups ?? []) {
      if (!index.personIds.has(pickup.personId)) {
        issues.push(issue('warning', 'DANGLING_CALLSHEET_PERSON', `Day "${day.name}" pick-up references missing person "${pickup.personId}".`, day.id));
      }
    }
    for (const call of sheet.personCalls ?? []) {
      if (!index.personIds.has(call.personId)) {
        issues.push(issue('warning', 'DANGLING_CALLSHEET_PERSON', `Day "${day.name}" call time references missing person "${call.personId}".`, day.id));
      }
    }
    for (const revision of sheet.issues ?? []) {
      for (const ack of revision.acknowledgements ?? []) {
        if (!index.personIds.has(ack.personId)) {
          issues.push(issue('warning', 'DANGLING_CALLSHEET_PERSON', `Day "${day.name}" revision ${revision.revision} acknowledgement references missing person "${ack.personId}".`, day.id));
        }
      }
    }
  }
  return issues;
};

/**
 * Review notes attach to a polymorphic target. A note on a deleted entity
 * must survive as readable history, so these are warnings, never errors.
 */
export const validateReviewTargets = (project: Project, index = indexProjectReferences(project)): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  for (const comment of project.reviewComments ?? []) {
    let missing = false;
    switch (comment.targetKind) {
      case 'project':
        break;
      case 'shot':
        missing = !index.shotIds.has(comment.targetId);
        break;
      case 'scene':
        missing = !index.setupIds.has(comment.targetId);
        break;
      case 'person':
        missing = !index.personIds.has(comment.targetId);
        break;
      case 'location':
        missing = !index.locationIds.has(comment.targetId);
        break;
      case 'production_day':
        missing = !index.dayIds.has(comment.targetId);
        break;
      case 'plan_element':
        missing = !index.elementIds.has(comment.targetId);
        break;
      default:
        missing = true;
        break;
    }
    if (missing) {
      issues.push(issue('warning', 'DANGLING_REVIEW_TARGET', `Review note references missing ${comment.targetKind} "${comment.targetId}".`, comment.id));
    }
  }
  return issues;
};

/**
 * Asset reference shapes: every media-bearing field must hold an asset id or
 * a legacy inline data URL. Anything else is a corrupt write, but media
 * resolves through placeholders at render time, so this stays a warning.
 * Mirrors the `collectProjectAssetReferences` inventory field by field.
 */
export const validateAssetShapes = (project: Project): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const check = (value: string | undefined, path: string): void => {
    if (!value) return;
    if (isAssetRef(value) || isInlineImage(value)) return;
    issues.push(issue('warning', 'MALFORMED_ASSET_REF', `Media field ${path} holds neither an asset reference nor inline image data.`, undefined));
  };
  check(project.logo, 'logo');
  (project.setups ?? []).forEach((setup, setupIndex) => {
    check(setup.backgroundImage?.url, `setups[${setupIndex}].backgroundImage.url`);
    (setup.backgroundImages ?? []).forEach((background, backgroundIndex) =>
      check(background.url, `setups[${setupIndex}].backgroundImages[${backgroundIndex}].url`),
    );
    (setup.shots ?? []).forEach((shot, shotIndex) => {
      const base = `setups[${setupIndex}].shots[${shotIndex}]`;
      check(shot.storyboardImage, `${base}.storyboardImage`);
      check(shot.storyboardImageEnd, `${base}.storyboardImageEnd`);
      for (const [slot, frame] of Object.entries(shot.storyboardFrames ?? {})) {
        check(frame.image, `${base}.storyboardFrames.${slot}.image`);
      }
    });
    (setup.elements ?? []).forEach((element, elementIndex) => {
      if (element.type === 'light') {
        check(element.gdtfAssetId, `setups[${setupIndex}].elements[${elementIndex}].gdtfAssetId`);
      }
    });
  });
  (project.avScriptRows ?? []).forEach((row, index) =>
    check(row.storyboardImage, `avScriptRows[${index}].storyboardImage`),
  );
  (project.people ?? []).forEach((person, index) =>
    check(person.headshotAssetId, `people[${index}].headshotAssetId`),
  );
  (project.locations ?? []).forEach((location, locationIndex) =>
    (location.referenceAssetIds ?? []).forEach((id, index) =>
      check(id, `locations[${locationIndex}].referenceAssetIds[${index}]`),
    ),
  );
  (project.moodBoards ?? []).forEach((board, boardIndex) =>
    board.cards.forEach((card, cardIndex) =>
      check(card.assetId, `moodBoards[${boardIndex}].cards[${cardIndex}].assetId`),
    ),
  );
  (project.productionDays ?? []).forEach((day, dayIndex) => {
    check(day.callSheet?.mapAssetId, `productionDays[${dayIndex}].callSheet.mapAssetId`);
    (day.callSheet?.locationMaps ?? []).forEach((map, index) =>
      check(map.assetId, `productionDays[${dayIndex}].callSheet.locationMaps[${index}].assetId`),
    );
  });
  (project.trussProfiles ?? []).forEach((profile, index) => {
    check(profile.gdtfAssetId, `trussProfiles[${index}].gdtfAssetId`);
    check(profile.geometryAssetId, `trussProfiles[${index}].geometryAssetId`);
  });
  return issues;
};
