/**
 * Scheduling domain types (plan §4.7).
 *
 * Production days group ordered schedule blocks. Blocks are deliberately
 * heterogeneous so scheduling works with or without a screenplay
 * (plan rule 1 / rule 36): scenes, setups, shots, cues, segments, or fully
 * manual entries such as meals and moves.
 */

export interface CallSheetAcknowledgement {
  personId: string;
  confirmedAt?: string;
}

export interface CallSheetIssueRevision {
  id: string;
  revision: number;
  issuedAt: string;
  /** Immutable rendered data at the moment this revision was issued. */
  snapshotJson: string;
  acknowledgements: CallSheetAcknowledgement[];
}

export interface ProductionDay {
  id: string;
  /** ISO date string (yyyy-mm-dd), optional so planning can start undated. */
  date?: string;
  name: string;
  crewCall?: string;
  plannedWrap?: string;
  notes?: string;
  /** Explicit day-specific call-sheet details; canonical schedule data stays derived. */
  callSheet?: {
    type?: 'shoot' | 'rehearsal' | 'scout' | 'event';
    /**
     * Day-level overrides of the production's standing content. Blank means
     * "inherit"; a day with genuinely no walkie plan says so in words rather
     * than by being empty, so one stored value never carries two meanings.
     */
    walkieChannels?: string;
    unitBase?: string;
    parking?: string;
    nearestHospital?: string;
    weatherSummary?: string;
    /**
     * Explicit sunrise / sunset for the day. Absent means "use the calculated
     * time for the location pin"; present wins, because a production may work
     * to its own published times or to a ridge line no ephemeris knows about
     * (rule 37). Free text, stored exactly as entered.
     */
    sunriseOverride?: string;
    sunsetOverride?: string;
    /**
     * Per-sheet toggle for the location map picture. Off by default: not every
     * sheet wants one, and fetching tiles is a deliberate act rather than
     * something every day does on open (rules 29–30).
     */
    /**
     * Whether this sheet has been signed off. ABSENT MEANS DRAFT, deliberately:
     * a sheet is a draft until someone says otherwise, and the expensive
     * mistake is a half-finished sheet going out looking final. Marking it
     * final is the decision worth recording (rule 13).
     */
    status?: 'draft' | 'final';
    /**
     * Whether cast contact numbers appear on this sheet. ABSENT MEANS INCLUDE,
     * which is what the sheet has always done — silently withholding numbers a
     * production already relied on would be the worse surprise.
     *
     * Worth switching off: a call sheet is copied, printed and left on a table,
     * and plenty of productions keep performers' numbers to the AD department
     * rather than putting them on every copy.
     */
    hideCastContacts?: boolean;
    showLocationMap?: boolean;
    /**
     * The composed OpenStreetMap picture in the asset store. Captured once and
     * then printable offline; absent means it has not been captured yet.
     */
    mapAssetId?: string;
    /**
     * One captured map per location (v21). A day that moves between two
     * places needs two pictures, each saying which place it shows — the name
     * is stored with the picture and also burned into it. `mapAssetId` above is
     * the pre-v21 single map, still read for the first pinned location.
     */
    locationMaps?: Array<{
      id: string;
      locationName: string;
      lat: number;
      lng: number;
      assetId: string;
    }>;
    safetyNotes?: string;
    generalNotes?: string;
    /** Transport arrangements for the day as free text (shuttles, drivers). */
    pickupNotes?: string;
    /**
     * Individual pick-ups: who is collected, when and from where. Each entry
     * references a `Person`; a person with no time or location yet is still a
     * valid row (the transport captain fills it in later), and a reference to a
     * deleted person is rendered as unresolved rather than dropped silently.
     */
    pickups?: Array<{
      id: string;
      personId: string;
      time?: string;
      location?: string;
      notes?: string;
    }>;
    /**
     * Per-person call times. A general crew call is not enough to issue a sheet:
     * cast come in for make-up, departments pre-rig, and a few people are on a
     * later call. Absent for a person means they work to the general crew call.
     */
    personCalls?: Array<{
      id: string;
      personId: string;
      /** "07:30". Free text so "on set 08:00" and "O/C" stay expressible. */
      time?: string;
      /** What the call is for: make-up, rigging, travel. */
      note?: string;
    }>;
    /** Immutable issued copies; later edits create a new revision. */
    issues?: CallSheetIssueRevision[];
  };
  scheduleBlockIds: string[];
}

export interface ProductionCalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  category: 'development' | 'preproduction' | 'shoot' | 'post' | 'delivery' | 'custom';
  status?: 'planned' | 'in_progress' | 'blocked' | 'done';
  /** Per-line clip color on the timeline calendar; undefined = default violet. */
  color?: string;
  notes?: string;
  assigneeIds?: string[];
  dependencyIds?: string[];
}

export type ScheduleBlock =
  | {
      id: string;
      kind: 'scene';
      scriptSceneId: string;
      estimatedMinutes?: number;
      /**
       * Set when the scene was removed from the screenplay while this strip
       * still exists: the block stays visible as OMITTED until the user
       * deletes it. Optional/absent-safe for legacy projects.
       */
      omittedLabel?: string;
    }
  | { id: string; kind: 'setup'; setupId: string; estimatedMinutes?: number }
  | { id: string; kind: 'shots'; shotIds: string[]; estimatedMinutes?: number }
  | { id: string; kind: 'cue'; cueId: string; estimatedMinutes?: number }
  | { id: string; kind: 'segment'; segmentId: string; estimatedMinutes?: number }
  | {
      id: string;
      kind: 'manual';
      label: string;
      manualType?: 'meal' | 'move' | 'rehearsal' | 'load_in' | 'strike' | 'other';
      estimatedMinutes?: number;
    };
