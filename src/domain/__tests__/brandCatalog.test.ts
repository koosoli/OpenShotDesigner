import { describe, it, expect } from 'vitest';
import {
  findProfileForModel,
  fixtureProfileLinkUpdates,
  fixtureProfileSummary,
  listBrandOptions,
  normalizeModelKey,
  profilesForBrand,
} from '../fixtures/brandCatalog';
import type { FixtureProfile } from '../fixtures';

const profile = (manufacturer: string, model: string, extra: Partial<FixtureProfile> = {}): FixtureProfile => ({
  id: `ofl:${normalizeModelKey(manufacturer)}/${normalizeModelKey(model)}`,
  category: 'lighting',
  manufacturer,
  model,
  categories: [],
  modes: [],
  ...extra,
});

const profiles: FixtureProfile[] = [
  profile('ARRI', 'SkyPanel S60-C', { powerWatts: 420, weightKg: 12.5, modes: [{ id: 'm1', name: 'CCT', channelCount: 4 }] }),
  profile('ARRI', 'SkyPanel S360-C', { powerWatts: 1500 }),
  profile('ARRI', 'L7-C'),
  profile('Aputure', 'LS 600d Pro', { powerWatts: 720 }),
  profile('Astera', 'Titan Tube'),
  profile('Chauvet DJ', 'SlimPAR 56'),
];

const presets = [
  { brand: 'ARRI', models: ['SkyPanel S60-C', 'M18 HMI'] },
  { brand: 'Aputure', models: ['LS 600d Pro'] },
  { brand: 'Generic / Custom', models: ['Custom Fixture'] },
];

describe('listBrandOptions', () => {
  it('keeps preset order, counts database profiles, and appends database-only brands alphabetically', () => {
    const options = listBrandOptions(presets, profiles);
    expect(options.slice(0, 3).map((o) => o.brand)).toEqual(['ARRI', 'Aputure', 'Generic / Custom']);
    expect(options[0]).toEqual({ brand: 'ARRI', preset: true, profileCount: 3 });
    expect(options[2].profileCount).toBe(0);
    expect(options.slice(3).map((o) => o.brand)).toEqual(['Astera', 'Chauvet DJ']);
    expect(options[3].preset).toBe(false);
  });
});

describe('profilesForBrand', () => {
  it('matches case-insensitively and sorts by model', () => {
    expect(profilesForBrand(profiles, 'arri').map((p) => p.model)).toEqual(['L7-C', 'SkyPanel S360-C', 'SkyPanel S60-C']);
    expect(profilesForBrand(profiles, undefined)).toEqual([]);
  });
});

describe('findProfileForModel', () => {
  it('returns exact normalized matches', () => {
    expect(findProfileForModel(profiles, 'ARRI', 'skypanel s60c')?.model).toBe('SkyPanel S60-C');
    expect(findProfileForModel(profiles, 'Aputure', 'LS 600d Pro')?.model).toBe('LS 600d Pro');
  });

  it('accepts a contained model name when the overlap is substantial', () => {
    expect(findProfileForModel(profiles, 'Astera', 'Titan Tube FP1')?.model).toBe('Titan Tube');
  });

  it('never guesses on short or ambiguous overlaps', () => {
    expect(findProfileForModel(profiles, 'ARRI', 'S60')).toBeUndefined();
    expect(findProfileForModel(profiles, 'ARRI', 'M18 HMI')).toBeUndefined();
    expect(findProfileForModel(profiles, 'ARRI', '')).toBeUndefined();
  });

  it('restricts to the brand when one is given', () => {
    expect(findProfileForModel(profiles, 'Aputure', 'SkyPanel S60-C')).toBeUndefined();
    expect(findProfileForModel(profiles, undefined, 'SkyPanel S60-C')?.manufacturer).toBe('ARRI');
  });
});

describe('fixtureProfileLinkUpdates / fixtureProfileSummary', () => {
  it('links the first mode by default and exposes DMX footprint', () => {
    const updates = fixtureProfileLinkUpdates(profiles[0]);
    expect(updates).toEqual({
      brand: 'ARRI',
      fixtureModel: 'SkyPanel S60-C',
      fixtureProfileId: profiles[0].id,
      fixtureModeId: 'm1',
      dmxModeName: 'CCT',
      dmxChannelCount: 4,
    });
  });

  it('leaves DMX fields undefined for profiles without modes', () => {
    const updates = fixtureProfileLinkUpdates(profiles[2]);
    expect(updates.fixtureModeId).toBeUndefined();
    expect(updates.dmxChannelCount).toBeUndefined();
  });

  it('summarizes only known values', () => {
    expect(fixtureProfileSummary(profiles[0])).toBe('420 W · 12.5 kg · 1 mode');
    expect(fixtureProfileSummary(profiles[2])).toBe('');
  });
});
