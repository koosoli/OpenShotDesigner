import { CORE_MODULES, type ModuleId, type WorkspacePresetDefinition, type WorkspaceProfile } from './types';
/**
 * The bundled workspace presets (plan §1.2). Presets bootstrap module
 * visibility only; users may switch to `custom` and toggle modules freely.
 */
export const WORKSPACE_PRESETS: WorkspacePresetDefinition[] = [
  {
    id: 'blank',
    label: 'Blank Floor Plan',
    description: 'A genuinely clean plan workspace — no mandatory actor/camera/shot bootstrap.',
    enabledModules: [...CORE_MODULES, 'annotations'],
  },
  {
    id: 'shot_planning',
    label: 'Shot Planning / Blocking',
    description: 'The classic fast workflow: plan, shots, storyboard, equipment. No screenplay required.',
    enabledModules: [
      'contacts',
      'tasks',
      'budget',
      ...CORE_MODULES,
      'annotations',
      'shots',
      'storyboard',
      'equipment',
    ],
  },
  {
    id: 'narrative',
    label: 'Narrative Film',
    description: 'Script-first workflow with coverage, scheduling and call sheets.',
    enabledModules: [
      'contacts',
      'tasks',
      'budget',
      ...CORE_MODULES,
      'locations',
      'script',
      'breakdown',
      'shots',
      'storyboard',
      'schedule',
      'call_sheets',
      'production_day',
      'equipment',
    ],
  },
  {
    id: 'documentary',
    label: 'Documentary',
    description: 'Interviews, segments and shot planning without a screenplay.',
    enabledModules: [
      'contacts',
      'tasks',
      'budget',
      ...CORE_MODULES,
      'locations',
      'shots',
      'storyboard',
      'schedule',
      'production_day',
      'equipment',
      'moodboard',
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial / AV Script',
    description: 'Two-column AV script workflow with boards and gear planning.',
    enabledModules: [
      'contacts',
      'tasks',
      'budget',
      ...CORE_MODULES,
      'av_script',
      'shots',
      'storyboard',
      'schedule',
      'equipment',
      'moodboard',
    ],
  },
  {
    id: 'interview',
    label: 'Interview',
    description: 'Compact setup for interviews: plan, cameras, questions as segments.',
    enabledModules: [
      'contacts',
      'tasks',...CORE_MODULES, 'locations', 'shots', 'run_of_show', 'equipment'],
  },
  {
    id: 'concert',
    label: 'Concert / Live Event',
    description: 'Venue, stage, cameras, lighting, DMX, power, cables, run of show.',
    enabledModules: [
      'contacts',
      'tasks',
      'budget',
      ...CORE_MODULES,
      'locations',
      'shots',
      'run_of_show',
      'production_day',
      'equipment',
      'fixtures_dmx',
      'cables_signal',
      'power',
      'rigging',
      'logistics',
    ],
  },
  {
    id: 'broadcast',
    label: 'Broadcast / OB',
    description: 'Studio or compound camera plan, signal flow and show-day schedule.',
    enabledModules: [
      'contacts',
      'tasks',
      'budget',
      ...CORE_MODULES,
      'locations',
      'shots',
      'run_of_show',
      'schedule',
      'production_day',
      'equipment',
      'cables_signal',
      'power',
      'logistics',
    ],
  },
  {
    id: 'studio',
    label: 'Studio Production',
    description: 'Multi-cam studio floor with technical planning modules.',
    enabledModules: [
      'contacts',
      'tasks',
      'budget',
      ...CORE_MODULES,
      'locations',
      'shots',
      'run_of_show',
      'schedule',
      'equipment',
      'fixtures_dmx',
      'cables_signal',
    ],
  },
  {
    id: 'photo',
    label: 'Photo Shoot',
    description: 'Plan, mood boards and light setup — no motion-specific tooling.',
    enabledModules: [
      'contacts',
      'tasks',...CORE_MODULES, 'locations', 'moodboard', 'equipment', 'power'],
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Start from everything and hide what you do not need.',
    enabledModules: [],
  },
];

export const getPreset = (id: WorkspacePresetDefinition['id']): WorkspacePresetDefinition =>
  WORKSPACE_PRESETS.find((preset) => preset.id === id) ?? WORKSPACE_PRESETS[0];

/** Build the initial workspace profile for a preset. */
export const createWorkspaceProfile = (id: WorkspacePresetDefinition['id']): WorkspaceProfile => ({
  preset: id,
  enabledModules: getPreset(id).enabledModules,
});

/** Enable/disable a module, always keeping the core modules available. */
export const withModuleToggled = (
  profile: WorkspaceProfile,
  moduleId: ModuleId,
  enabled: boolean,
): WorkspaceProfile => {
  const base = new Set(profile.enabledModules);
  if (enabled) base.add(moduleId);
  else if (!CORE_MODULES.includes(moduleId)) base.delete(moduleId);
  return { ...profile, preset: 'custom', enabledModules: [...base] };
};

export const isModuleEnabled = (profile: WorkspaceProfile, moduleId: ModuleId): boolean =>
  CORE_MODULES.includes(moduleId) || profile.enabledModules.includes(moduleId);

/**
 * Profile used when a project has no stored preset (e.g. projects created
 * before presets existed): every module visible, preserving current behavior.
 */
export const ALL_MODULES_PROFILE: WorkspaceProfile = {
  preset: 'custom',
  enabledModules: [
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
    'contacts',
    'tasks',
    'budget',
    'comments',
  ],
};
