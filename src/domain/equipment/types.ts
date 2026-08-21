/**
 * Equipment profile domain types (plan §4.10).
 *
 * A profile is reference/catalog data about a class of gear — never a
 * specific instance on a plan. Canonical units only: kg, W, mm
 * (see src/domain/units.ts). Missing technical data stays `undefined`
 * (unknown) — never silently substituted with 0 (plan rule 13).
 */

import type { ConnectionPortDefinition } from '../cable';

export interface Dimensions {
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
}

/**
 * Provenance of technical data (plan rule 27/35): where it came from,
 * which version, when it was retrieved, under which license.
 */
export interface SourceMetadata {
  /** e.g. 'ofl', 'manual' */
  provider?: string;
  sourceId?: string;
  version?: string;
  /** ISO date */
  retrievedAt?: string;
  license?: string;
}

export interface EquipmentProfile {
  id: string;
  /** 'camera' | 'lighting' | 'grip' | 'audio' | ... (open string, not closed enum) */
  category: string;
  manufacturer?: string;
  model?: string;
  dimensions?: Dimensions;
  /** Canonical kg — never lb (see src/domain/units.ts). */
  weightKg?: number;
  /** Canonical W; undefined = unknown, NEVER 0-by-default. */
  powerWatts?: number;
  portDefinitions?: ConnectionPortDefinition[];
  source?: SourceMetadata;
}
