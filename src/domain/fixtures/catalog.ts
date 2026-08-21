import type { FixtureMode, FixtureProfile } from './types';

/** Search only canonical profile fields; profile data remains offline and local. */
export const searchFixtureProfiles = (profiles: readonly FixtureProfile[], query: string): FixtureProfile[] => {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...profiles];
  return profiles.filter((profile) => {
    const haystack = [profile.manufacturer, profile.model, ...profile.categories].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
};

export const fixtureModeById = (profile: FixtureProfile, modeId: string | undefined): FixtureMode | undefined =>
  profile.modes.find((mode) => mode.id === modeId) ?? profile.modes[0];

/** Physical bounding estimate only; it must never be labelled as shipping volume. */
export const fixtureBoundingVolumeLitres = (profile: FixtureProfile): number | undefined => {
  const { widthMm, heightMm, depthMm } = profile.dimensions ?? {};
  if (![widthMm, heightMm, depthMm].every((value) => typeof value === 'number' && value > 0)) return undefined;
  return (widthMm! * heightMm! * depthMm!) / 1_000_000;
};
