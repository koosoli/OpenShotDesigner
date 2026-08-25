/**
 * v28 → v29 lets a logged spend name the estimated line it belongs to:
 *
 *  - `BudgetActual.entryId` — matches `deriveBudget` entry ids
 *    (`person:<id>`, `line:<id>`, `equipment:<key>`). Optional and NOT
 *    backfilled: existing entries were logged without a line, and guessing
 *    one from category would put somebody's catering bill on Alex's row.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV28ToV29 = (raw: UnknownRecord): Project => ({
  ...(raw as unknown as Project),
  schemaVersion: 29,
});
