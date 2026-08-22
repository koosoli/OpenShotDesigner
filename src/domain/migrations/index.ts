/**
 * Project schema migration framework (plan §3.2).
 *
 * Migrations are deterministic and lossless. Old saved projects and imports
 * must keep loading; migration failures produce a useful error instead of
 * silently corrupting data.
 */

import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  MigrationError,
  type MigrationResult,
} from './types';
import { migrateV1ToV2 } from './v1-to-v2';
import { migrateV2ToV3 } from './v2-to-v3';
import { migrateV3ToV4 } from './v3-to-v4';
import { migrateV4ToV5 } from './v4-to-v5';
import { migrateV5ToV6 } from './v5-to-v6';
import { migrateV6ToV7 } from './v6-to-v7';
import { migrateV7ToV8 } from './v7-to-v8';
import { migrateV8ToV9 } from './v8-to-v9';
import { migrateV9ToV10 } from './v9-to-v10';
import { migrateV10ToV11 } from './v10-to-v11';
import { migrateV11ToV12 } from './v11-to-v12';
import { migrateV12ToV13 } from './v12-to-v13';
import { migrateV13ToV14 } from './v13-to-v14';
import { migrateV14ToV15 } from './v14-to-v15';
import { migrateV15ToV16 } from './v15-to-v16';

export { CURRENT_PROJECT_SCHEMA_VERSION, MigrationError } from './types';
export type { MigrationResult } from './types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Detect the schema version of raw (untrusted) project data.
 * Returns null when the input is not recognizable project data at all.
 * Projects without a `schemaVersion` field are legacy v1.
 */
export const detectSchemaVersion = (raw: unknown): number | null => {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.setups)) return null;
  if (raw.schemaVersion === undefined) return 1;
  if (typeof raw.schemaVersion !== 'number') return null;
  return raw.schemaVersion;
};

/**
 * Migrate raw project data to the current schema version.
 * Throws {@link MigrationError} for structurally invalid input or when no
 * migration path exists. Already-current projects pass through unchanged.
 */
export const migrateProject = (raw: unknown): MigrationResult => {
  if (!isRecord(raw) || !Array.isArray(raw.setups)) {
    throw new MigrationError('Project data is not a valid project document.', [
      'Expected an object with a `setups` array.',
    ]);
  }

  const version = detectSchemaVersion(raw);
  if (version === null) {
    throw new MigrationError('Unrecognizable project data.', [
      'Could not determine the schema version of the supplied data.',
    ]);
  }

  if (version > CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new MigrationError(
      `Project was saved with a newer schema version (${version}); this build supports up to ${CURRENT_PROJECT_SCHEMA_VERSION}.`,
      [`schemaVersion ${version} is newer than supported version ${CURRENT_PROJECT_SCHEMA_VERSION}.`],
    );
  }

  let current: UnknownRecord = raw;
  let migratedFrom: number | null = null;

  for (let v = version; v < CURRENT_PROJECT_SCHEMA_VERSION; v++) {
    migratedFrom = migratedFrom ?? v;
    switch (v) {
      case 1:
        current = migrateV1ToV2(current) as unknown as UnknownRecord;
        break;
      case 2:
        current = migrateV2ToV3(current) as unknown as UnknownRecord;
        break;
      case 3:
        current = migrateV3ToV4(current) as unknown as UnknownRecord;
        break;
      case 4:
        current = migrateV4ToV5(current) as unknown as UnknownRecord;
        break;
      case 5:
        current = migrateV5ToV6(current) as unknown as UnknownRecord;
        break;
      case 6:
        current = migrateV6ToV7(current) as unknown as UnknownRecord;
        break;
      case 7:
        current = migrateV7ToV8(current) as unknown as UnknownRecord;
        break;
      case 8:
        current = migrateV8ToV9(current) as unknown as UnknownRecord;
        break;
      case 9:
        current = migrateV9ToV10(current) as unknown as UnknownRecord;
        break;
      case 10:
        current = migrateV10ToV11(current) as unknown as UnknownRecord;
        break;
      case 11:
        current = migrateV11ToV12(current) as unknown as UnknownRecord;
        break;
      case 12:
        current = migrateV12ToV13(current) as unknown as UnknownRecord;
        break;
      case 13:
        current = migrateV13ToV14(current) as unknown as UnknownRecord;
        break;
      case 14:
        current = migrateV14ToV15(current) as unknown as UnknownRecord;
        break;
      case 15:
        current = migrateV15ToV16(current) as unknown as UnknownRecord;
        break;
      default:
        throw new MigrationError(`No migration path from schema version ${v}.`, [
          `Missing v${v}-to-v${v + 1} migration.`,
        ]);
    }
  }

  return { project: current as unknown as import('../../types').Project, migratedFrom };
};
