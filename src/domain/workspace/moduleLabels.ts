import type { ModuleId } from './types';

/**
 * The modules a user can show or hide, grouped exactly the way the right
 * sidebar presents them: the first group is the always-visible tab strip, the
 * rest are the sections of the Production menu. Keeping one list here means
 * the New Project picker and the Settings checklist can never drift apart.
 */
export const MODULE_PICKER_GROUPS: Array<{
  label: string;
  modules: Array<{ id: ModuleId; label: string }>;
}> = [
  {
    label: 'Main tabs',
    modules: [
      { id: 'shots', label: 'Shot list' },
      { id: 'storyboard', label: 'Storyboard' },
      { id: 'script', label: 'Script' },
      { id: 'equipment', label: 'Gear & DMX' },
    ],
  },
  {
    label: 'Planning',
    modules: [
      { id: 'schedule', label: 'Schedule & call sheets' },
      { id: 'locations', label: 'Locations' },
      { id: 'moodboard', label: 'Moodboard' },
    ],
  },
  {
    label: 'People & money',
    modules: [
      { id: 'contacts', label: 'Crew, cast & contacts' },
      { id: 'tasks', label: 'Task board' },
      { id: 'budget', label: 'Budget' },
    ],
  },
  {
    label: 'Operations',
    modules: [
      { id: 'logistics', label: 'Logistics' },
      { id: 'run_of_show', label: 'Run of show' },
      { id: 'continuity', label: 'Continuity' },
    ],
  },
  {
    label: 'Technical',
    modules: [
      { id: 'power', label: 'Power' },
      { id: 'rigging', label: 'Rigging' },
    ],
  },
];

/** Flat list of every pickable module, in group order. */
export const PICKABLE_MODULES = MODULE_PICKER_GROUPS.flatMap((group) => group.modules);
