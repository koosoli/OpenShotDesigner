/**
 * Locations domain types (plan §4.1).
 *
 * Locations are physical places used by the production: practical
 * locations, studios, stages, venues, arenas, outdoor sites. They are a
 * standalone domain — no screenplay required (plan rule 1).
 */

export type LocationType =
  | 'location'
  | 'studio'
  | 'stage'
  | 'venue'
  | 'arena'
  | 'outdoor'
  | 'other';

export interface Location {
  id: string;
  name: string;
  aliases?: string[];
  /** Optional parent for venue areas / sub-locations such as Arena → Backstage. */
  parentLocationId?: string;
  type: LocationType;
  address?: string;
  /** References to people-domain contacts (people.Person ids). */
  contactIds?: string[];
  notes?: string;
  masterPlanId?: string;
  /** References to asset-library entries, never embedded media. */
  referenceAssetIds: string[];
}
