/**
 * v26 → v27 records when a person is known to be unavailable:
 *
 *  - `Person.unavailableRanges` — inclusive ISO date ranges, e.g. another job.
 *    Optional and NOT backfilled: a person with no ranges is simply always
 *    available, which was the only answer the app could give before this
 *    field existed. Deriving "free" from an empty list is therefore not a
 *    guess but the definition.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV26ToV27 = (raw: UnknownRecord): Project => ({
  ...(raw as unknown as Project),
  schemaVersion: 27,
});
