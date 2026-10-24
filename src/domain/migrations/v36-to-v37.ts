/**
 * v36 -> v37 adds optional, absent-safe fields:
 *
 * - `BaseElement.aboveWalls` — an object brought forward over the walls
 *   (domain/plan/stacking). Absent means drawn in its usual layer, under the
 *   walls, exactly as before.
 * - `SceneSetup.scriptSceneId` — the screenplay scene a plan is linked to
 *   (domain/script/setupLink). Absent means not linked yet; the app links
 *   plans to scenes of the same number by itself.
 *
 * Nothing existing changes meaning, so this only stamps the version.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV36ToV37 = (raw: UnknownRecord): Project => {
  const project = raw as unknown as Project;
  return { ...project, schemaVersion: 37 };
};
