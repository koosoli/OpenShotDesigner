/**
 * v25 → v26 records where each logistics container physically is:
 *
 *  - `LogisticsContainer.journey` — the transport captain's mark: packed,
 *    loaded, delivered, returned. Optional and NOT backfilled. Absent has a
 *    meaning of its own — nobody has marked it — and assuming "packed" would
 *    hide exactly the case everyone forgot about. The day report prints the
 *    absence as "not marked" instead.
 *
 * Nothing is derived from `productionDayId` either. A container routed to a
 * day is planned to travel; whether it has actually been packed is a fact
 * about the warehouse floor, and inventing one from the schedule would put a
 * guess where the crew expects a fact (rule 13).
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV25ToV26 = (raw: UnknownRecord): Project => ({
  ...(raw as unknown as Project),
  schemaVersion: 26,
});
