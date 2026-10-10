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
  // The Production menu, grouped by phase in the order the work happens.
  {
    label: 'Prep',
    modules: [
      { id: 'locations', label: 'Locations & scouting' },
      { id: 'moodboard', label: 'Moodboard' },
      { id: 'contacts', label: 'Crew, cast & contacts' },
      { id: 'budget', label: 'Budget' },
      { id: 'tasks', label: 'Task board' },
    ],
  },
  {
    label: 'Plan',
    modules: [
      { id: 'power', label: 'Power' },
      { id: 'rigging', label: 'Rigging' },
    ],
  },
  {
    label: 'Schedule',
    modules: [
      { id: 'schedule', label: 'Schedule, call sheets & time reports' },
      { id: 'run_of_show', label: 'Run of show' },
    ],
  },
  {
    label: 'Shoot',
    modules: [
      { id: 'continuity', label: 'Continuity' },
      { id: 'logistics', label: 'Logistics' },
    ],
  },
];

/** Flat list of every pickable module, in group order. */
export const PICKABLE_MODULES = MODULE_PICKER_GROUPS.flatMap((group) => group.modules);
