/**
 * Scheduling domain types (plan §4.7).
 *
 * Production days group ordered schedule blocks. Blocks are deliberately
 * heterogeneous so scheduling works with or without a screenplay
 * (plan rule 1 / rule 36): scenes, setups, shots, cues, segments, or fully
 * manual entries such as meals and moves.
 */

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
    parking?: string;
    nearestHospital?: string;
    weatherSummary?: string;
    safetyNotes?: string;
    generalNotes?: string;
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
  | { id: string; kind: 'scene'; scriptSceneId: string; estimatedMinutes?: number }
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
