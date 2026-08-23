/**
 * Workspace profiles & module activation (plan §1.2, §4.9).
 *
 * Presets configure which modules are VISIBLE by default. They are UX /
 * workspace configuration — never hard data-model restrictions. No persisted
 * entity becomes invalid merely because its module is hidden.
 */

export type ModuleId =
  // Plan family
  | 'floorplan'
  | 'locations'
  | 'assets'
  | 'annotations'
  // Create family
  | 'script'
  | 'av_script'
  | 'breakdown'
  | 'shots'
  | 'storyboard'
  | 'moodboard'
  // Schedule family
  | 'schedule'
  | 'run_of_show'
  | 'call_sheets'
  | 'production_day'
  // Technical family
  | 'equipment'
  | 'fixtures_dmx'
  | 'cables_signal'
  | 'power'
  | 'rigging'
  // Logistics family
  | 'logistics'
  // Production-day family
  | 'continuity'
  // People & management family
  | 'contacts'
  | 'tasks'
  | 'budget'
  // Collaborate family
  | 'comments';

export type WorkspacePresetId =
  | 'blank'
  | 'shot_planning'
  | 'narrative'
  | 'documentary'
  | 'commercial'
  | 'interview'
  | 'concert'
  | 'broadcast'
  | 'studio'
  | 'photo'
  | 'custom';

export interface WorkspaceProfile {
  preset: WorkspacePresetId;
  enabledModules: ModuleId[];
}

export interface WorkspacePresetDefinition {
  id: WorkspacePresetId;
  label: string;
  description: string;
  enabledModules: ModuleId[];
}

/** Modules every preset always exposes regardless of configuration. */
export const CORE_MODULES: ModuleId[] = ['floorplan', 'assets', 'comments'];
