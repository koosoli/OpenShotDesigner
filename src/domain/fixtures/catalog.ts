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

/**
 * The mode a fixture is set to.
 *
 * Two different absences, deliberately not collapsed:
 *  - no id at all — nothing has been chosen yet, so the fixture's first
 *    personality is the sensible default to show.
 *  - an id matching no mode — something WAS chosen, and the profile has since
 *    changed under it (deleted and re-authored, or an OFL refresh renaming its
 *    modes). Falling back to the first mode there would answer a question
 *    about a 20-channel personality with an 8-channel one, and on a patch
 *    sheet a wrong footprint reads exactly like a right one. Unknown is the
 *    honest answer, and every caller already renders undefined as unknown.
 */
export const fixtureModeById = (profile: FixtureProfile, modeId: string | undefined): FixtureMode | undefined =>
  modeId === undefined ? profile.modes[0] : profile.modes.find((mode) => mode.id === modeId);

/** Physical bounding estimate only; it must never be labelled as shipping volume. */
export const fixtureBoundingVolumeLitres = (profile: FixtureProfile): number | undefined => {
  const { widthMm, heightMm, depthMm } = profile.dimensions ?? {};
  if (![widthMm, heightMm, depthMm].every((value) => typeof value === 'number' && value > 0)) return undefined;
  return (widthMm! * heightMm! * depthMm!) / 1_000_000;
};
