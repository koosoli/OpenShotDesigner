import { describe, expect, it } from 'vitest';
import {
  adaptOflFixture,
  createFixtureDbManifest,
} from '../fixtures/oflAdapter';

const sampleOfl = {
  $schema: 'https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/master/schemas/fixture.json',
  name: 'S60 Beam',
  manufacturer: 'Generic Lights',
  fixture_key: 'generic-lights-s60-beam',
  categories: ['Moving Head', 'Color Changer'],
  meta: {
    authors: ['Jane Doe'],
    website: 'https://example.com/s60',
  },
  modes: [
    {
      name: 'Standard',
      channels: [
        'Pan',
        'Pan Fine',
        null,
        'Tilt',
        { name: 'Dimmer', pixelCount: 1 },
        'Strobe',
      ],
    },
    {
      name: 'Extended',
      channels: ['Pan', 'Tilt', { name: 'Color Macro' }],
    },
  ],
  physical: {
    dimensions: [320, 240, 180],
    weight: 12.5,
    power: 150,
    bulb: {
      type: 'LED 60W white — beam angle unspecified in text',
    },
    DMXconnector: '5-pin',
  },
};

describe('adaptOflFixture', () => {
  it('maps a realistic OFL fixture to a FixtureProfile', () => {
    const profile = adaptOflFixture(sampleOfl, {
      snapshotId: 'ofl-2026-08-01',
      version: '2026-08-01',
      retrievedAt: '2026-08-01T00:00:00Z',
      license: 'CC-BY-SA-4.0',
    });

    expect(profile.id).toBe('ofl:generic-lights/s60-beam');
    expect(profile.category).toBe('lighting');
    expect(profile.manufacturer).toBe('Generic Lights');
    expect(profile.model).toBe('S60 Beam');
    expect(profile.categories).toEqual(['Moving Head', 'Color Changer']);
    expect(profile.dimensions).toEqual({
      heightMm: 320,
      widthMm: 240,
      depthMm: 180,
    });
    expect(profile.weightKg).toBe(12.5);
    expect(profile.powerWatts).toBe(150);
    expect(profile.optics).toBeUndefined();
    expect(profile.source).toEqual({
      provider: 'ofl',
      sourceId: 'generic-lights-s60-beam',
      version: '2026-08-01',
      retrievedAt: '2026-08-01T00:00:00Z',
      license: 'CC-BY-SA-4.0',
      snapshotId: 'ofl-2026-08-01',
    });
  });

  it('keeps mode channel counts and stable offsets across null slots', () => {
    const profile = adaptOflFixture(sampleOfl);
    const [standard, extended] = profile.modes;

    expect(standard.channelCount).toBe(6);
    expect(standard.channels).toEqual([
      { offset: 1, name: 'Pan' },
      { offset: 2, name: 'Pan Fine' },
      // offset 3 is a null slot — skipped but not renumbered
      { offset: 4, name: 'Tilt' },
      { offset: 5, name: 'Dimmer', resolution: 8 },
      { offset: 6, name: 'Strobe' },
    ]);

    expect(extended.channelCount).toBe(3);
    expect(extended.id).toBe('extended');
  });

  it('marks multi-byte channels as 16-bit resolution', () => {
    const withFine = adaptOflFixture({
      ...sampleOfl,
      modes: [
        {
          name: '16bit',
          channels: [{ name: 'Pan', pixelCount: 2 }, { name: 'Tilt', multiByte: true }],
        },
      ],
    });
    expect(withFine.modes[0].channels?.map((c) => c.resolution)).toEqual([
      16, 16,
    ]);
  });

  it('never guesses power from the model name (rule 28)', () => {
    const noPower = adaptOflFixture({
      ...sampleOfl,
      name: 'S60',
      physical: {
        ...sampleOfl.physical,
        power: undefined,
      },
    });
    expect(noPower.powerWatts).toBeUndefined();
  });

  it('falls back to top-level power when physical.power is absent', () => {
    const topLevel = adaptOflFixture({
      ...sampleOfl,
      physical: { ...sampleOfl.physical, power: undefined },
      power: 200,
    });
    expect(topLevel.powerWatts).toBe(200);
  });

  it('leaves optics undefined even when bulb.type mentions angles as text', () => {
    const profile = adaptOflFixture(sampleOfl);
    expect(profile.optics).toBeUndefined();
  });

  it('maps known and unknown DMX connectors to port definitions', () => {
    expect(adaptOflFixture(sampleOfl).portDefinitions).toEqual([
      {
        id: 'dmx-in',
        name: 'DMX In',
        connectorType: 'XLR5',
        signalType: 'DMX512',
        direction: 'bidirectional',
      },
    ]);

    for (const [connector, expected] of [
      ['3-pin', 'XLR3'],
      ['XLR3', 'XLR3'],
      ['RJ45', 'RJ45'],
      ['weird proprietary plug', 'OTHER'],
    ] as const) {
      const profile = adaptOflFixture({
        ...sampleOfl,
        physical: { ...sampleOfl.physical, DMXconnector: connector },
      });
      expect(profile.portDefinitions?.[0].connectorType).toBe(expected);
    }
  });

  it('omits port definitions when DMXconnector is absent', () => {
    const profile = adaptOflFixture({
      ...sampleOfl,
      physical: { weight: 10 },
    });
    expect(profile.portDefinitions).toBeUndefined();
  });

  it('is deterministic: same input twice deep-equals', () => {
    const a = adaptOflFixture(sampleOfl, {
      snapshotId: 'snap',
      license: 'CC-BY-SA-4.0',
    });
    const b = adaptOflFixture(sampleOfl, {
      snapshotId: 'snap',
      license: 'CC-BY-SA-4.0',
    });
    expect(a).toEqual(b);
    expect(a.id).toBe(b.id);
  });

  it('derives sourceId from nested fixture.key or the slug fallback', () => {
    const nested = adaptOflFixture({
      ...sampleOfl,
      fixture_key: undefined,
      fixture: { key: 'nested-key' },
    });
    expect(nested.source?.sourceId).toBe('nested-key');

    const fallback = adaptOflFixture({ name: 'Foo Bar', manufacturer: 'Acme' });
    expect(fallback.source?.sourceId).toBe('acme/foo-bar');
    expect(fallback.id).toBe('ofl:acme/foo-bar');
  });

  it('throws on structurally unusable input', () => {
    expect(() => adaptOflFixture(null)).toThrow('Invalid OFL fixture data');
    expect(() => adaptOflFixture('nope')).toThrow('Invalid OFL fixture data');
    expect(() => adaptOflFixture([])).toThrow('Invalid OFL fixture data');
    expect(() => adaptOflFixture({ name: 'Only Name' })).toThrow(
      'Invalid OFL fixture data',
    );
    expect(() => adaptOflFixture({ manufacturer: 'Only Maker' })).toThrow(
      'Invalid OFL fixture data',
    );
  });
});

describe('createFixtureDbManifest', () => {
  it('builds the §17.3 manifest shape', () => {
    const profiles = [adaptOflFixture(sampleOfl), adaptOflFixture(sampleOfl)];
    const manifest = createFixtureDbManifest(profiles, {
      snapshotId: 'ofl-2026-08-01',
      retrievedAt: '2026-08-01T00:00:00Z',
      license: 'CC-BY-SA-4.0',
      providerVersion: 'v1.2.3',
    });

    expect(manifest).toEqual({
      provider: 'ofl',
      snapshotId: 'ofl-2026-08-01',
      retrievedAt: '2026-08-01T00:00:00Z',
      license: 'CC-BY-SA-4.0',
      providerVersion: 'v1.2.3',
      schemaAdapterVersion: 1,
      count: 2,
    });
  });
});
