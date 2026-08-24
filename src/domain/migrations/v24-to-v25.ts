/**
 * v24 → v25 records which DMX personality a piece of gear is set to:
 *
 *  - `EquipmentItem.fixtureModeId` — the mode chosen on the fixture profile
 *    named by `fixtureProfileId`, for lighting rows linked to the fixture
 *    database from the Gear tab. NOT backfilled: it is optional and
 *    absent-safe, and absent has a meaning of its own — no personality has
 *    been chosen, so the footprint is unknown rather than assumed.
 *
 * Nothing is inferred from `fixtureProfileId`. A row that names an ARRI L7-C
 * says which fixture is in the truck, not which of its fifteen personalities
 * the board is patched to; writing the first mode in would be inventing a
 * channel count nobody set, and a wrong footprint reads exactly like a right
 * one on a patch sheet. The field stays absent until somebody chooses.
 *
 * A stale id — the profile was deleted, or an OFL refresh renamed its modes —
 * is left exactly as written. Readers resolve it against the live catalogue
 * and report an unknown footprint when it matches nothing, which is the
 * honest reading; silently rewriting it here would destroy the only record of
 * what was chosen while the profile still existed.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV24ToV25 = (raw: UnknownRecord): Project => ({
  ...(raw as unknown as Project),
  schemaVersion: 25,
});
