/**
 * User-visible project integrity report (roadmap Phase 1.3).
 *
 * `domain/integrity.ts` removes references when entities are deleted;
 * `domain/validation` finds the references that slipped through anyway
 * (legacy imports, older builds, hand-edited JSON). This module turns those
 * findings into counts plus inspectable issue lists for the dashboard.
 *
 * Pure function, no React, no I/O. Asset storage is never touched here: the
 * caller passes an already-computed summary (see `scanAssetGarbage` in
 * `utils/assetStorageInspection.ts`) and it is passed through untouched.
 */

import type { Project } from '../types';
import { validateProject, type ValidationIssue } from './validation';

/** Already-computed asset summary passed in by the caller (I/O happens elsewhere). */
export interface IntegrityAssetInfo {
  /** Stored assets verified reachable from the project graph. */
  verified: number;
  /** Stored asset ids no project references, sorted for stable output. */
  unreachable: string[];
  /** Bytes that deleting every unreachable asset would reclaim. Kept for
   * callers that show storage detail elsewhere; the report itself only
   * surfaces the ids, since bytes need formatting the report must not own. */
  reclaimableBytes: number;
}

export interface IntegrityReport {
  /** Reference checks that passed: total checks performed minus issues found. */
  validReferences: number;
  /** Assets verified reachable (from `assetInfo`, 0 when not supplied). */
  mediaVerified: number;
  warnings: ValidationIssue[];
  errors: ValidationIssue[];
  unreachableAssets: string[];
  generatedAt: string;
}

/**
 * How many individual checks `validateProject` performs on this project.
 *
 * `validReferences` is only meaningful against a precise denominator, so this
 * mirrors the validators assertion by assertion rather than estimating:
 *
 * - Setup core (`validateSetup`): one duplicate-id check per element, shot,
 *   script line and AV row; per shot one camera check plus one per subject
 *   actor plus one when `scriptLineId` is set; per camera element one check
 *   when `associatedShotId` is set; one per `lookAtTargetId` set; three per
 *   script mark (shot, start line, end line — wavy ranges are unchecked);
 *   one per AV row with `linkedShotId`; one per storyboard-order entry; one
 *   per equipment item linked to an element.
 * - Project core: one duplicate-id check per setup, one active-setup check,
 *   one duplicate plus one linked-shot check (when set) per project script
 *   line, one per actor element carrying a `characterId`, and per calendar
 *   event one duplicate check, one date-range check and one per dependency.
 * - Cross-domain (`validation/references.ts`): per take one duplicate check,
 *   one shot check and one when a shooting day is set; per production day
 *   one duplicate check plus one per listed block; per schedule block one
 *   duplicate check plus its target check (one per block, or one per shot
 *   for `shots` strips; `manual` blocks reference nothing); per person one
 *   duplicate check; per cast assignment one duplicate check plus two
 *   (character, person); one per call-sheet pickup, person call and revision
 *   acknowledgement; one per review comment; one per non-empty media field
 *   examined by the asset-shape check (empty fields are skipped, not passed).
 *
 * Every validator emits at most one issue per counted check, so
 * `total - issues.length` is the number of checks that passed.
 */
export const countReferenceChecks = (project: Project): number => {
  let count = 0;

  for (const setup of project.setups ?? []) {
    const elements = setup.elements ?? [];
    const shots = setup.shots ?? [];
    const scriptLines = setup.scriptLines ?? [];
    const avRows = setup.avScriptRows ?? [];
    count += elements.length + shots.length + scriptLines.length + avRows.length;

    for (const shot of shots) {
      count += 1 + (shot.subjectActorIds ?? []).length + (shot.scriptLineId ? 1 : 0);
    }
    for (const element of elements) {
      if (element.type === 'camera' && element.associatedShotId) count += 1;
      if ('lookAtTargetId' in element && element.lookAtTargetId) count += 1;
      if (element.type === 'actor' && element.characterId) count += 1;
      if (element.type === 'light' && element.gdtfAssetId) count += 1;
    }
    count += (setup.scriptMarks ?? []).length * 3;
    for (const row of avRows) {
      if (row.linkedShotId) count += 1;
      if (row.storyboardImage) count += 1;
    }
    count += (setup.storyboardOrder ?? []).length;
    for (const item of setup.customEquipment ?? []) {
      if (item.elementId) count += 1;
    }
    if (setup.backgroundImage?.url) count += 1;
    for (const background of setup.backgroundImages ?? []) {
      if (background.url) count += 1;
    }
    for (const shot of shots) {
      if (shot.storyboardImage) count += 1;
      if (shot.storyboardImageEnd) count += 1;
      for (const frame of Object.values(shot.storyboardFrames ?? {})) {
        if (frame.image) count += 1;
      }
    }
  }

  const setups = project.setups ?? [];
  count += setups.length + 1;
  for (const line of project.scriptLines ?? []) {
    count += 1 + (line.linkedShotId ? 1 : 0);
  }
  for (const event of project.productionCalendarEvents ?? []) {
    count += 2 + (event.dependencyIds ?? []).length;
  }

  for (const take of project.takes ?? []) {
    count += 2 + (take.productionDayId ? 1 : 0);
  }
  for (const day of project.productionDays ?? []) {
    count += 1 + (day.scheduleBlockIds ?? []).length;
    const sheet = day.callSheet;
    if (sheet) {
      count += (sheet.pickups ?? []).length + (sheet.personCalls ?? []).length;
      for (const revision of sheet.issues ?? []) {
        count += (revision.acknowledgements ?? []).length;
      }
      if (sheet.mapAssetId) count += 1;
      for (const map of sheet.locationMaps ?? []) {
        if (map.assetId) count += 1;
      }
    }
  }
  for (const block of project.scheduleBlocks ?? []) {
    count += 1;
    switch (block.kind) {
      case 'scene':
      case 'setup':
      case 'cue':
      case 'segment':
        count += 1;
        break;
      case 'shots':
        count += (block.shotIds ?? []).length;
        break;
      case 'manual':
        break;
    }
  }
  count += (project.people ?? []).length;
  count += (project.castAssignments ?? []).length * 3;
  count += (project.reviewComments ?? []).length;

  if (project.logo) count += 1;
  for (const person of project.people ?? []) {
    if (person.headshotAssetId) count += 1;
  }
  for (const location of project.locations ?? []) {
    count += (location.referenceAssetIds ?? []).length;
  }
  for (const board of project.moodBoards ?? []) {
    for (const card of board.cards) {
      if (card.assetId) count += 1;
    }
  }
  for (const row of project.avScriptRows ?? []) {
    if (row.storyboardImage) count += 1;
  }
  for (const profile of project.trussProfiles ?? []) {
    if (profile.gdtfAssetId) count += 1;
    if (profile.geometryAssetId) count += 1;
  }

  return count;
};

/**
 * Build the dashboard integrity report for one project.
 *
 * Splits `validateProject` findings by severity: errors block import and
 * need fixing, warnings stay visible without blocking. `info` issues (none
 * emitted today) join warnings so nothing is silently dropped.
 */
export const buildIntegrityReport = (project: Project, assetInfo?: IntegrityAssetInfo): IntegrityReport => {
  const issues = validateProject(project);
  return {
    validReferences: Math.max(0, countReferenceChecks(project) - issues.length),
    mediaVerified: assetInfo?.verified ?? 0,
    warnings: issues.filter((issue: ValidationIssue) => issue.severity !== 'error'),
    errors: issues.filter((issue: ValidationIssue) => issue.severity === 'error'),
    unreachableAssets: assetInfo ? [...assetInfo.unreachable] : [],
    generatedAt: new Date().toISOString(),
  };
};
