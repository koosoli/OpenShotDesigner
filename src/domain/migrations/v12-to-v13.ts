/**
 * v12 → v13 reserves optional, absent-safe fields introduced together:
 *  - `ScriptLine.omitted` / `ScriptScene.omitted` (scene omission keeps numbering),
 *  - `MoodBoardCard.collageLayout` + `MoodBoard.collage.mode` (free-form collage),
 *  - `Project.tasks` / `Project.taskBoards` (production task board).
 *
 * Nothing is backfilled: every field means "unset" when absent, so existing
 * projects migrate by version stamp only and stay byte-for-byte otherwise.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV12ToV13 = (raw: UnknownRecord): Project =>
  ({ ...(raw as unknown as Project), schemaVersion: 13 }) as Project;
