/**
 * Non-scripted production segments (plan §4.7).
 *
 * Live, broadcast, documentary and commercial work need a grouping concept
 * that is neither a screenplay scene nor a single cue.
 */

export interface ProductionSegment {
  id: string;
  name: string;

  kind:
    | 'song'
    | 'act'
    | 'interview'
    | 'presentation'
    | 'commercial_segment'
    | 'sequence'
    | 'custom';

  plannedDurationSeconds?: number;
  locationId?: string;

  notes?: string;
}
