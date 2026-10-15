/**
 * v35 -> v36 adds optional, absent-safe fields for the screenplay layout:
 *
 * - `Project.screenplayLayout` — paper (Letter / A4) and automatic (CONT'D);
 *   absent means US Letter with automatic (CONT'D).
 * - `ScriptLine.dual` — dual dialogue on a character cue.
 * - `ScriptLine.synopsis` / `ScriptLine.sceneColor` — a scene heading's
 *   index-card summary and colour.
 *
 * Nothing existing changes meaning, so this only stamps the version.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV35ToV36 = (raw: UnknownRecord): Project => {
  const project = raw as unknown as Project;
  return { ...project, schemaVersion: 36 };
};
