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
  /**
   * References to asset-library entries, never embedded media. Scout photos
   * live here; their captions and EXIF data are in `scout.photos`.
   */
  referenceAssetIds: string[];
  /** v34: location scouting report. */
  scout?: LocationScout;
}

export type LocationScoutStatus = 'candidate' | 'shortlisted' | 'approved' | 'rejected';

/** What one scout photo shows, keyed by its asset id in `referenceAssetIds`. */
export interface LocationScoutPhoto {
  caption?: string;
  /** From EXIF: local capture time, "2026-05-04T14:22:10". */
  takenAt?: string;
  lat?: number;
  lng?: number;
  /** Compass direction the camera faced, degrees. */
  heading?: number;
}

/**
 * A scouting report: the practical questions a location manager answers on a
 * recce, so the department heads are not each asking them again.
 */
export interface LocationScout {
  status?: LocationScoutStatus;
  /**
   * The script set this place is being scouted for ("LIVING ROOM"), so several
   * candidates for one set can be compared side by side. Free text matched
   * case-insensitively against slugline locations.
   */
  candidateFor?: string;
  /** ISO date of the scout. */
  scoutedOn?: string;
  scoutedBy?: string;
  /** 1–5. */
  rating?: number;
  power?: string;
  parking?: string;
  restrooms?: string;
  /** Holding, base camp, green room. */
  holding?: string;
  /** Load-in, lifts, stairs, door widths. */
  access?: string;
  /** Traffic, flight paths, neighbours, HVAC. */
  sound?: string;
  /** Window directions, sun path, practicals. */
  light?: string;
  cellSignal?: string;
  permits?: string;
  /** Location fee / terms. */
  fee?: string;
  /** Per-photo details keyed by asset id. */
  photos?: Record<string, LocationScoutPhoto>;
}
