/**
 * Merge fixture profiles from several sources into one catalog.
 *
 * Precedence when two entries describe the same manufacturer + model:
 *   OFL (measured, community-reviewed) > supplementary film table > custom.
 * So the moment OFL publishes a profile for a unit we supplied or a user typed
 * in, the OFL data replaces it — the "newest real data wins" policy.
 */

import { normalizeModelKey } from './brandCatalog';
import type { FixtureProfile } from './types';

const SOURCE_RANK: Record<string, number> = { ofl: 0, curated: 1, manual: 2 };

const rankOf = (profile: FixtureProfile): number => SOURCE_RANK[profile.source?.provider ?? 'manual'] ?? 3;

export const fixtureIdentityKey = (profile: Pick<FixtureProfile, 'manufacturer' | 'model'>): string =>
  `${normalizeModelKey(profile.manufacturer)}/${normalizeModelKey(profile.model)}`;

export interface MergeReport {
  profiles: FixtureProfile[];
  /** Lower-priority entries that were superseded by a better source, keyed by their id. */
  replaced: Array<{ replacedId: string; byId: string }>;
}

export const mergeFixtureProfiles = (...sources: ReadonlyArray<readonly FixtureProfile[]>): MergeReport => {
  const best = new Map<string, FixtureProfile>();
  const replaced: MergeReport['replaced'] = [];
  for (const source of sources) {
    for (const profile of source) {
      const key = fixtureIdentityKey(profile);
      const current = best.get(key);
      if (!current) {
        best.set(key, profile);
        continue;
      }
      if (rankOf(profile) < rankOf(current)) {
        replaced.push({ replacedId: current.id, byId: profile.id });
        best.set(key, profile);
      } else if (profile.id !== current.id) {
        replaced.push({ replacedId: profile.id, byId: current.id });
      }
    }
  }
  const profiles = [...best.values()].sort(
    (a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model),
  );
  return { profiles, replaced };
};
