/**
 * v33 -> v34 adds production-paperwork fields, all optional and absent-safe:
 *
 * - `ScriptLine.pageEighthsOverride` — a hand-set scene length on a heading;
 *   absent means the measured estimate (domain/script/pageCount.ts).
 * - `Character.color` — highlighter colour; absent means a palette colour.
 * - `Project.doodOverrides` / `doodDropAfterDays` — hand-entered DOOD cells
 *   and the drop/pick-up threshold; absent means none / 10 days.
 * - `Location.scout` — scouting report; scout photos keep living in
 *   `referenceAssetIds`, so packaging needs no change.
 * - `Project.performerTimeReports` — Exhibit G time sheets.
 * - `ScriptLine.revisedIn` / `Project.scriptRevisionColor` — script revision
 *   colours; absent means unchanged lines and a colour derived from the
 *   number of imported revisions.
 * - `LocationScout.candidateFor` — the set a scouted place could play.
 * - `Project.scriptPageLock` — locked script pages (A-pages); absent means
 *   pages are numbered freshly, as before.
 *
 * Nothing existing changes meaning, so this only stamps the version and
 * old projects load byte-identical apart from the number.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV33ToV34 = (raw: UnknownRecord): Project => {
  const project = raw as unknown as Project;
  return { ...project, schemaVersion: 34 };
};
