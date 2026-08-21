import { describe, it, expect } from 'vitest';
import { createId } from '../ids';
import type { EquipmentProfile } from '../equipment';
import type { FixtureProfile, FixtureMode } from '../fixtures';

describe('EquipmentProfile', () => {
  it('uses canonical units: kg for weight, W for power, mm for dimensions', () => {
    const profile: EquipmentProfile = {
      id: createId('eq'),
      category: 'lighting',
      manufacturer: 'Aputure',
      model: 'LS 600d Pro',
      dimensions: { widthMm: 420, heightMm: 250, depthMm: 180 },
      weightKg: 9.2,
      powerWatts: 720,
    };
    expect(profile.weightKg).toBe(9.2);
    expect(profile.powerWatts).toBe(720);
    expect(profile.dimensions?.widthMm).toBe(420);
  });

  it('leaves unknown technical data undefined instead of defaulting to 0', () => {
    const profile: EquipmentProfile = {
      id: createId('eq'),
      category: 'grip',
      manufacturer: 'Matthews',
      model: 'C-Stand 40"',
    };
    expect(profile.powerWatts).toBeUndefined();
    expect(profile.weightKg).toBeUndefined();
  });

  it('keeps an open string category (not a closed enum)', () => {
    const profile: EquipmentProfile = {
      id: createId('eq'),
      category: 'concert-rigging',
    };
    expect(profile.category).toBe('concert-rigging');
  });

  it('preserves source metadata (provider, version, license, retrieval date)', () => {
    const profile: EquipmentProfile = {
      id: createId('eq'),
      category: 'lighting',
      powerWatts: 300,
      source: {
        provider: 'ofl',
        sourceId: 'ofl:robe-megapointe',
        version: '2024-11-01',
        retrievedAt: '2026-08-01T00:00:00.000Z',
        license: 'CC-BY-SA',
      },
    };
    expect(profile.source?.provider).toBe('ofl');
    expect(profile.source?.license).toBe('CC-BY-SA');
    expect(new Date(profile.source!.retrievedAt!).getTime()).not.toBeNaN();
  });
});

describe('FixtureProfile', () => {
  it('extends EquipmentProfile and carries modes with 1-based channel offsets', () => {
    const mode: FixtureMode = {
      id: createId('mode'),
      name: 'Standard',
      channelCount: 3,
      channels: [
        { offset: 1, name: 'Pan' },
        { offset: 2, name: 'Dimmer' },
        { offset: 3, name: 'Color Wheel', resolution: 8 },
      ],
    };
    const fixture: FixtureProfile = {
      ...baseFixture(),
      categories: ['moving-head', 'spot'],
      modes: [mode],
    };
    expect(fixture.modes[0].channels![0].offset).toBe(1);
    expect(fixture.powerWatts).toBeDefined();
  });

  it('records the external database snapshot in its source metadata', () => {
    const fixture: FixtureProfile = {
      ...baseFixture(),
      categories: ['led-par'],
      modes: [{ id: createId('mode'), name: 'Standard', channelCount: 8 }],
      colorTemperatureK: { min: 2700, max: 6500 },
      optics: { beamAngleMinDeg: 12, beamAngleMaxDeg: 40 },
      source: {
        provider: 'ofl',
        snapshotId: 'ofl-snapshot-2026-07',
        license: 'CC-BY-SA',
      },
    };
    expect(fixture.source?.snapshotId).toBe('ofl-snapshot-2026-07');
  });
});

const baseFixture = (): EquipmentProfile => ({
  id: createId('eq'),
  category: 'lighting',
  manufacturer: 'Robe',
  model: 'MegaPointe',
  powerWatts: 1400,
});
