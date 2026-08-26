export type LightModifierKind =
  | 'softbox'
  | 'lantern'
  | 'fresnel'
  | 'grid'
  | 'eggcrate'
  | 'gel'
  | 'snoot'
  | 'reflector'
  | 'diffusion'
  | 'barn_doors';

export interface LightModifier {
  id: string;
  kind: LightModifierKind;
  /** Shared Asset Library symbol used on canvas and in exports. */
  symbolId: string;
  enabled: boolean;
  label?: string;
  /** Optional gel colour; absent means the fixture colour remains unchanged. */
  colorHex?: string;
  /** User/source supplied transmission. Absent means unknown, never 100%. */
  transmissionPercent?: number;
  /** Explicit effective beam angle after this modifier. Absent means unknown/no override. */
  beamAngleDeg?: number;
}

export type PhotometricSourceKind = 'manual' | 'manufacturer' | 'measured';

export interface LightPhotometricReference {
  /** Canonical illuminance value at distanceMm. */
  illuminanceLux: number;
  /** Canonical reference distance. */
  distanceMm: number;
  /** Dimmer level used for the reference reading; defaults to 100 when absent. */
  referenceIntensityPercent?: number;
  /** Whether the reading is bare-fixture data or already includes the current stack. */
  modifierBasis: 'bare_fixture' | 'current_modifier_stack';
  sourceKind: PhotometricSourceKind;
  sourceLabel?: string;
  sourceUrl?: string;
}

export interface LightPhotometricResult {
  lux: number | null;
  footCandles: number | null;
  warnings: string[];
}

export interface LightPhotometricMarker extends LightPhotometricResult {
  distancePx: number;
  distanceMm: number;
}
