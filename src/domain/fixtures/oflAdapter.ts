/**
 * OFL adapter (plan §17.2): pure mapping from Open Fixture Library JSON
 * to our internal FixtureProfile. OFL is a technical-data SOURCE only —
 * never our internal schema and never our icon library.
 *
 * Missing technical data stays `undefined` (plan rule 13); power is
 * NEVER guessed from model names (plan rule 28).
 */

import type { ConnectionPortDefinition, ConnectorType } from '../cable';
import type {
  FixtureChannelDefinition,
  FixtureMode,
  FixtureProfile,
} from './types';
import type {
  OflChannelDefinition,
  OflChannelSlot,
  OflFixtureJson,
  OflPhysical,
} from './oflTypes';

export const FIXTURE_DB_SCHEMA_ADAPTER_VERSION = 1;

/** Adapter-supplied snapshot provenance (plan rules 27/35). */
export interface OflProvenance {
  snapshotId?: string;
  version?: string;
  retrievedAt?: string;
  license?: string;
}

export interface FixtureDbManifest {
  provider: 'ofl';
  snapshotId: string;
  retrievedAt: string;
  license: string;
  providerVersion?: string;
  schemaAdapterVersion: number;
  count: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const DMX_CONNECTOR_LOOKUP: Record<string, ConnectorType> = {
  xlr5: 'XLR5',
  '5-pin': 'XLR5',
  '5pin': 'XLR5',
  xlr3: 'XLR3',
  '3-pin': 'XLR3',
  '3pin': 'XLR3',
  rj45: 'RJ45',
};

function mapDmxConnector(raw: string): ConnectorType {
  const normalized = raw.trim().toLowerCase();
  return DMX_CONNECTOR_LOOKUP[normalized] ?? 'OTHER';
}

function buildDmxInPort(rawConnector: string): ConnectionPortDefinition {
  return {
    id: 'dmx-in',
    name: 'DMX In',
    connectorType: mapDmxConnector(rawConnector),
    signalType: 'DMX512',
    direction: 'bidirectional',
  };
}

function mapChannelSlot(
  slot: OflChannelSlot,
  offset: number,
): FixtureChannelDefinition | null {
  if (typeof slot === 'string') {
    return { offset, name: slot };
  }
  if (!isRecord(slot)) return null;
  const channel = slot as OflChannelDefinition;
  const name = asOptionalString(channel.name) ?? `Channel ${offset}`;
  const pixelCount = asOptionalNumber(channel.pixelCount);
  let resolution: 8 | 16 | undefined;
  if ((pixelCount !== undefined && pixelCount > 1) || channel.multiByte === true) {
    resolution = 16;
  } else if (pixelCount === 1) {
    resolution = 8;
  }
  return resolution !== undefined ? { offset, name, resolution } : { offset, name };
}

function mapMode(mode: Record<string, unknown>, index: number): FixtureMode {
  const name = asOptionalString(mode.name) ?? `Mode ${index + 1}`;
  const rawChannels = Array.isArray(mode.channels) ? mode.channels : [];
  const channels: FixtureChannelDefinition[] = [];
  rawChannels.forEach((slot, i) => {
    const mapped = mapChannelSlot(slot as OflChannelSlot, i + 1);
    if (mapped) channels.push(mapped);
  });
  return {
    id: slugify(name) || `mode-${index + 1}`,
    name,
    channelCount: rawChannels.length,
    channels,
  };
}

/**
 * Map one OFL fixture JSON document to a FixtureProfile.
 * Throws on structurally unusable input; missing technical data stays
 * `undefined` rather than being defaulted or inferred.
 */
export function adaptOflFixture(
  json: unknown,
  provenance?: OflProvenance,
): FixtureProfile {
  if (!isRecord(json)) {
    throw new Error('Invalid OFL fixture data');
  }
  const fixture = json as OflFixtureJson;
  const name = asOptionalString(fixture.name);
  const manufacturer = asOptionalString(fixture.manufacturer);
  if (!name || !manufacturer) {
    throw new Error('Invalid OFL fixture data');
  }

  const physical = isRecord(fixture.physical)
    ? (fixture.physical as OflPhysical)
    : undefined;

  const dimensions =
    physical && Array.isArray(physical.dimensions) && physical.dimensions.length >= 3
      ? {
          heightMm: asOptionalNumber(physical.dimensions[0]),
          widthMm: asOptionalNumber(physical.dimensions[1]),
          depthMm: asOptionalNumber(physical.dimensions[2]),
        }
      : undefined;

  // Power only from explicit data — never from the model name.
  const powerWatts =
    asOptionalNumber(physical?.power) ?? asOptionalNumber(fixture.power);

  const modes = Array.isArray(fixture.modes)
    ? fixture.modes.map((mode, i) =>
        mapMode(isRecord(mode) ? mode : {}, i),
      )
    : [];

  const categories = Array.isArray(fixture.categories)
    ? fixture.categories.filter(
        (c): c is string => typeof c === 'string' && c.length > 0,
      )
    : [];

  const dmxConnector = asOptionalString(physical?.DMXconnector);

  const sourceId =
    asOptionalString(fixture.fixture_key) ??
    asOptionalString(
      isRecord(fixture.fixture) ? fixture.fixture.key : undefined,
    ) ??
    `${slugify(manufacturer)}/${slugify(name)}`;

  return {
    id: `ofl:${slugify(manufacturer)}/${slugify(name)}`,
    category: 'lighting',
    manufacturer,
    model: name,
    dimensions,
    weightKg: asOptionalNumber(physical?.weight),
    powerWatts,
    portDefinitions: dmxConnector ? [buildDmxInPort(dmxConnector)] : undefined,
    categories,
    modes,
    // bulb.type is free text; optics stay undefined unless clearly numeric data exists.
    optics: undefined,
    source: {
      provider: 'ofl',
      sourceId,
      version: provenance?.version,
      retrievedAt: provenance?.retrievedAt,
      license: provenance?.license,
      snapshotId: provenance?.snapshotId,
    },
  };
}

/** Build the manifest describing an imported OFL snapshot (plan §17.3). */
export function createFixtureDbManifest(
  profiles: readonly FixtureProfile[],
  info: {
    snapshotId: string;
    retrievedAt: string;
    license: string;
    providerVersion?: string;
  },
): FixtureDbManifest {
  return {
    provider: 'ofl',
    snapshotId: info.snapshotId,
    retrievedAt: info.retrievedAt,
    license: info.license,
    providerVersion: info.providerVersion,
    schemaAdapterVersion: FIXTURE_DB_SCHEMA_ADAPTER_VERSION,
    count: profiles.length,
  };
}
