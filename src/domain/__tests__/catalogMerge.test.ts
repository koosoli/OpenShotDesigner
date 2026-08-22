import { describe, it, expect } from 'vitest';
import { CURATED_FILM_FIXTURES, fixtureIdentityKey, loadOfflineFixtureDb, mergeFixtureProfiles } from '../fixtures';
import type { FixtureProfile } from '../fixtures';

const profile = (provider: string, manufacturer: string, model: string, powerWatts?: number): FixtureProfile => ({
  id: `${provider}:${manufacturer}/${model}`.toLowerCase().replace(/\s+/g, '-'),
  category: 'lighting',
  manufacturer,
  model,
  categories: [],
  modes: [],
  ...(powerWatts !== undefined ? { powerWatts } : {}),
  source: { provider, sourceId: 'x' },
});

describe('mergeFixtureProfiles', () => {
  it('lets OFL replace curated and custom entries for the same manufacturer + model', () => {
    const ofl = [profile('ofl', 'ARRI', 'Skypanel S60C', 420)];
    const curated = [profile('curated', 'ARRI', 'SkyPanel S60-C', 400)];
    const custom = [profile('manual', 'arri', 'skypanel s60 c', 999), profile('manual', 'Acme', 'Blaster', 50)];
    const { profiles, replaced } = mergeFixtureProfiles(ofl, curated, custom);
    expect(profiles.map((p) => p.id)).toEqual(['manual:acme/blaster', 'ofl:arri/skypanel-s60c']);
    expect(replaced.map((r) => r.replacedId)).toEqual(['curated:arri/skypanel-s60-c', 'manual:arri/skypanel-s60-c']);
    expect(profiles.find((p) => p.manufacturer === 'ARRI')?.powerWatts).toBe(420);
  });

  it('prefers a better source regardless of argument order', () => {
    const curated = [profile('curated', 'Nanlite', 'Forza 500', 520)];
    const ofl = [profile('ofl', 'Nanlite', 'Forza 500', 521)];
    expect(mergeFixtureProfiles(curated, ofl).profiles[0].source?.provider).toBe('ofl');
  });

  it('keys identity on normalized manufacturer + model', () => {
    expect(fixtureIdentityKey({ manufacturer: 'Kino Flo', model: 'Diva-Lite 400' })).toBe('kinoflo/divalite400');
  });
});

describe('supplementary film fixtures', () => {
  it('carry the unverified provenance and unique identities', () => {
    const keys = new Set<string>();
    for (const fixture of CURATED_FILM_FIXTURES) {
      expect(fixture.source?.provider).toBe('curated');
      expect(fixture.source?.license).toMatch(/verify/i);
      expect(fixture.id.startsWith('curated:')).toBe(true);
      expect(fixture.powerWatts === undefined || fixture.powerWatts > 0).toBe(true);
      expect(fixture.weightKg === undefined || fixture.weightKg > 0).toBe(true);
      const key = fixtureIdentityKey(fixture);
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
    expect(CURATED_FILM_FIXTURES.length).toBeGreaterThan(20);
  });

  it('never shadows a model the bundled OFL snapshot already provides', async () => {
    // The snapshot is a dynamic import now (it is 1.2 MB and must not sit in
    // the entry chunk), so the test awaits it like the app does.
    const { fixtures: OFFLINE_FIXTURE_PROFILES } = await loadOfflineFixtureDb();
    const oflKeys = new Set(OFFLINE_FIXTURE_PROFILES.map(fixtureIdentityKey));
    const shadowed = CURATED_FILM_FIXTURES.filter((fixture) => oflKeys.has(fixtureIdentityKey(fixture)));
    expect(shadowed.map((f) => `${f.manufacturer} ${f.model}`)).toEqual([]);
    // And if one ever appears, the merge still prefers OFL.
    const merged = mergeFixtureProfiles(OFFLINE_FIXTURE_PROFILES, CURATED_FILM_FIXTURES);
    expect(merged.profiles.length).toBe(OFFLINE_FIXTURE_PROFILES.length + CURATED_FILM_FIXTURES.length);
  });
});

