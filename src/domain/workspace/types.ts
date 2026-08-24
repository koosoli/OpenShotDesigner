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
  | 'full'
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

/**
 * Every module there is, in the order the module picker lists them. The
 * `full` preset and `ALL_MODULES_PROFILE` both build from this, so adding a
 * ModuleId above only needs one edit here to reach both.
 */
export const ALL_MODULE_IDS: ModuleId[] = [
  'floorplan',
  'locations',
  'assets',
  'annotations',
  'script',
  'av_script',
  'breakdown',
  'shots',
  'storyboard',
  'moodboard',
  'schedule',
  'run_of_show',
  'call_sheets',
  'production_day',
  'equipment',
  'fixtures_dmx',
  'cables_signal',
  'power',
  'rigging',
  'logistics',
  'continuity',
  'contacts',
  'tasks',
  'budget',
  'comments',
];
