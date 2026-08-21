/**
 * Minimal typed shapes for the subset of Open Fixture Library (OFL)
 * fixture JSON that our adapter consumes (plan §17.2).
 *
 * These types describe OFL's external schema ONLY — they are never used
 * as our internal domain model. Anything not listed here is ignored by
 * the adapter on purpose.
 */

/** OFL channel slot inside a mode: a channel key, an inline definition, or null (unused slot). */
export type OflChannelSlot = string | OflChannelDefinition | null;

export interface OflChannelDefinition {
  /** Channel function name, e.g. 'Pan', 'Color Wheel'. */
  name?: string;
  /** Multi-byte hint: number of DMX slots this channel spans (>1 means 16-bit). */
  pixelCount?: number;
  /** Alternative multi-byte hint used by some OFL fixtures. */
  multiByte?: boolean;
  [key: string]: unknown;
}

export interface OflMode {
  name?: string;
  /** Physical DMX slots; entries may be keys, inline definitions, or null. */
  channels?: OflChannelSlot[];
  [key: string]: unknown;
}

export interface OflPhysical {
  /** [heightMm, widthMm, depthMm] in OFL's fixed order. */
  dimensions?: [number, number, number];
  /** Canonical kilograms in OFL. */
  weight?: number;
  /** Maximum power draw in watts. */
  power?: number;
  /** Free-text lamp description — deliberately NOT parsed into optics. */
  bulb?: { type?: string; [key: string]: unknown };
  /** e.g. '5-pin', '3-pin', 'RJ45'. */
  DMXconnector?: string;
  [key: string]: unknown;
}

export interface OflMeta {
  authors?: string[];
  website?: string;
  [key: string]: unknown;
}

export interface OflFixtureJson {
  $schema?: string;
  name?: string;
  manufacturer?: string;
  categories?: string[];
  /** Some exports carry the OFL fixture key at top level. */
  fixture_key?: string;
  /** Others nest it under `fixture.key`. */
  fixture?: { key?: string; [key: string]: unknown };
  modes?: OflMode[];
  physical?: OflPhysical;
  meta?: OflMeta;
  [key: string]: unknown;
}
