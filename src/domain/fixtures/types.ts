/**
 * Fixture domain types (plan §17.1).
 *
 * A FixtureProfile extends EquipmentProfile with lighting-specific data:
 * DMX modes/channels, optics, color temperature. Channel offsets are
 * 1-based within a mode, matching how consoles and patch sheets count.
 */

import type { EquipmentProfile, SourceMetadata } from '../equipment';

export interface FixtureChannelDefinition {
  /** 1-based DMX channel offset within the mode. */
  offset: number;
  name: string;
  resolution?: 8 | 16;
}

export interface FixtureMode {
  id: string;
  name: string;
  channelCount: number;
  channels?: FixtureChannelDefinition[];
}

export interface FixtureProfile extends EquipmentProfile {
  /**
   * Narrowed from the optional fields on `EquipmentProfile`. A generic piece
   * of gear can be a nameless bit of grip; a lighting fixture profile cannot —
   * it comes from OFL or from the curated table, and both key on maker and
   * model. Every consumer already assumed this (sorting, matching a preset,
   * building the catalogue key), and saying so lets the compiler check it
   * instead of each caller re-deciding what a missing model would mean.
   */
  manufacturer: string;
  model: string;
  categories: string[];
  modes: FixtureMode[];
  optics?: {
    beamAngleMinDeg?: number;
    beamAngleMaxDeg?: number;
    fieldAngleMinDeg?: number;
    fieldAngleMaxDeg?: number;
  };
  colorTemperatureK?: { min?: number; max?: number };
  source?: FixtureProfileSource;
}

export interface FixtureProfileSource extends SourceMetadata {
  /** Snapshot identifier of the external database this profile came from. */
  snapshotId?: string;
}
