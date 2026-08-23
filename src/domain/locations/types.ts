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
  /** Optional map pin (WGS84 decimal degrees) resolved via the map adapter. */
  lat?: number;
  lng?: number;
  /**
   * Optional IANA time zone ("America/Los_Angeles"). Absent means the machine's
   * zone, which is what every project stored before this existed, so nothing
   * needs migrating. Set it and the call sheet's sun times are the unit's own
   * wall clock rather than the producer's.
   */
  timeZone?: string;
  /** References to people-domain contacts (people.Person ids). */
  contactIds?: string[];
  notes?: string;
  masterPlanId?: string;
  /** References to asset-library entries, never embedded media. */
  referenceAssetIds: string[];
}
