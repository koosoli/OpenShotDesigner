/**
 * v27 → v28 records what was actually spent:
 *
 *  - `ProjectBudget.actuals` — the ledger of money that left the account,
 *    entered as it is paid. Optional and NOT backfilled: an empty ledger is
 *    the honest state of a production that has not logged any spend, and a
 *    variance is only spoken once at least one entry exists. Assuming zero
 *    would print "on budget" about a budget nobody has compared against.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV27ToV28 = (raw: UnknownRecord): Project => ({
  ...(raw as unknown as Project),
  schemaVersion: 28,
});
