import { describe, it, expect } from 'vitest';
import {
  fixtureModeLabel,
  fixtureSpecsLine,
  gearProfileUpdates,
  mergeGearBrands,
  mergeGearModels,
} from '../fixtures';
import type { FixtureProfile } from '../fixtures';

const profile = (
  manufacturer: string,
  model: string,
  overrides: Partial<FixtureProfile> = {},
): FixtureProfile => ({
  id: `${manufacturer}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  category: 'lighting',
  manufacturer,
  model,
  categories: ['Fixture'],
  modes: [
    { id: 'std', name: 'Standard', channelCount: 8 },
    { id: 'ext', name: 'Extended', channelCount: 16 },
  ],
  ...overrides,
});

const PROFILES: FixtureProfile[] = [
  profile('ARRI', 'SkyPanel S60-C', { powerWatts: 450, weightKg: 12.5 }),
  profile('ARRI', 'Orbiter'),
  profile('Chauvet', 'Ovation E-910FC'),
];

describe('gear brand options', () => {
  it('keeps department order and appends database-only makers alphabetically', () => {
    const merged = mergeGearBrands(['Aputure', 'ARRI'], PROFILES);
    expect(merged.map((option) => option.brand)).toEqual(['Aputure', 'ARRI', 'Chauvet']);
    expect(merged[1]).toMatchObject({ fromDepartment: true, profileCount: 2 });
    expect(merged[2]).toMatchObject({ fromDepartment: false, profileCount: 1 });
  });

  it('reports zero profiles for slash-joined department names rather than dropping them', () => {
    const merged = mergeGearBrands(['Aputure / Amaran'], PROFILES);
    expect(merged[0]).toMatchObject({ brand: 'Aputure / Amaran', profileCount: 0 });
    // The database makers still arrive, so the pairing never hides them.
    expect(merged.map((option) => option.brand)).toContain('ARRI');
  });

  it('offers the department list unchanged when no profiles are supplied', () => {
    expect(mergeGearBrands(['Sony', 'RED'], [])).toEqual([
      { brand: 'Sony', fromDepartment: true, profileCount: 0 },
      { brand: 'RED', fromDepartment: true, profileCount: 0 },
    ]);
  });
});

describe('gear model options', () => {
  it('attaches the database profile to a department name that matches it', () => {
    const merged = mergeGearModels(['SkyPanel S60-C'], PROFILES, 'ARRI');
    expect(merged).toHaveLength(2);
    expect(merged[0].model).toBe('SkyPanel S60-C');
    expect(merged[0].profile?.powerWatts).toBe(450);
    expect(merged[1].model).toBe('Orbiter');
  });

  it('collapses spelling differences between the two sources into one option', () => {
    const merged = mergeGearModels(['skypanel s60c'], PROFILES, 'ARRI');
    expect(merged.filter((option) => option.profile?.model === 'SkyPanel S60-C')).toHaveLength(1);
    expect(merged[0].model).toBe('skypanel s60c');
    expect(merged[0].profile).toBeDefined();
  });

  it('never mixes in another manufacturer’s models', () => {
    const merged = mergeGearModels([], PROFILES, 'ARRI');
    expect(merged.map((option) => option.model)).toEqual(['Orbiter', 'SkyPanel S60-C']);
  });

  it('returns only department names when the category has no database behind it', () => {
    expect(mergeGearModels(['FX6', 'FX3'], [], 'Sony')).toEqual([{ model: 'FX6' }, { model: 'FX3' }]);
  });
});

describe('fixture specs and updates', () => {
  it('names a mode with its channel footprint', () => {
    expect(fixtureModeLabel({ id: 'std', name: 'Standard', channelCount: 8 })).toBe('Standard (8 ch)');
  });

  it('omits unknown values instead of printing zeros', () => {
    expect(fixtureSpecsLine(profile('ARRI', 'Orbiter'))).toBe('DMX Standard (8 ch)');
    expect(fixtureSpecsLine(PROFILES[0])).toBe('450 W · 12.5 kg · DMX Standard (8 ch)');
  });

  it('says so when a fixture lists no DMX modes at all', () => {
    expect(fixtureSpecsLine(profile('Aputure', 'MC', { modes: [] }))).toBe('No DMX modes listed');
  });

  it('defaults to the first mode but honours an explicit one', () => {
    expect(gearProfileUpdates(PROFILES[0])).toMatchObject({
      brand: 'ARRI',
      model: 'SkyPanel S60-C',
      fixtureModeId: 'std',
    });
    const extended = gearProfileUpdates(PROFILES[0], 'ext');
    expect(extended.fixtureModeId).toBe('ext');
    expect(extended.specs).toContain('Extended (16 ch)');
  });

  it('records the profile id, not merely its name', () => {
    expect(gearProfileUpdates(PROFILES[0]).fixtureProfileId).toBe(PROFILES[0].id);
  });
});
