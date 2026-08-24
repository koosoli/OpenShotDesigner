import { describe, it, expect } from 'vitest';
import {
  ALL_MODULE_IDS,
  CORE_MODULES,
  WORKSPACE_PRESETS,
  createWorkspaceProfile,
  getPreset,
  isModuleEnabled,
  withModuleToggled,
} from '../workspace';

describe('workspace presets', () => {
  it('defines every preset id from the plan', () => {
    const ids = WORKSPACE_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      'blank',
      'shot_planning',
      'full',
      'narrative',
      'documentary',
      'commercial',
      'interview',
      'concert',
      'broadcast',
      'studio',
      'photo',
      'custom',
    ]);
  });

  it('keeps core modules in every preset that has modules enabled', () => {
    for (const preset of WORKSPACE_PRESETS) {
      if (preset.id === 'custom') continue;
      for (const core of CORE_MODULES) {
        expect(preset.enabledModules).toContain(core);
      }
    }
  });

  it('never makes the script module mandatory outside script presets', () => {
    // Shot Planning carries the script deliberately — the lined script is how
    // coverage is marked up during blocking — so it is not on this list.
    const scriptFree = ['blank', 'concert', 'broadcast'] as const;
    for (const id of scriptFree) {
      expect(getPreset(id).enabledModules).not.toContain('script');
    }
  });

  it('blank preset opens a genuinely clean workspace', () => {
    const profile = createWorkspaceProfile('blank');
    expect(profile.enabledModules).not.toContain('shots');
    expect(profile.enabledModules).not.toContain('script');
    expect(isModuleEnabled(profile, 'floorplan')).toBe(true);
  });

  it('concert preset exposes technical modules without a screenplay', () => {
    const profile = createWorkspaceProfile('concert');
    expect(profile.enabledModules).toContain('fixtures_dmx');
    expect(profile.enabledModules).toContain('power');
    expect(profile.enabledModules).toContain('run_of_show');
    expect(profile.enabledModules).not.toContain('script');
  });

  it('shot planning stays a blocking workspace with no production tools', () => {
    const profile = createWorkspaceProfile('shot_planning');
    expect(profile.enabledModules).toContain('shots');
    expect(profile.enabledModules).toContain('script');
    expect(profile.enabledModules).toContain('storyboard');
    for (const hidden of ['equipment', 'schedule', 'contacts', 'tasks', 'budget'] as const) {
      expect(profile.enabledModules).not.toContain(hidden);
    }
  });

  it('the full preset enables every module', () => {
    const profile = createWorkspaceProfile('full');
    for (const module of ALL_MODULE_IDS) {
      expect(isModuleEnabled(profile, module)).toBe(true);
    }
  });

  it('custom accepts an explicit module list and still keeps the core', () => {
    const profile = createWorkspaceProfile('custom', ['shots', 'budget']);
    expect(profile.preset).toBe('custom');
    expect(isModuleEnabled(profile, 'shots')).toBe(true);
    expect(isModuleEnabled(profile, 'budget')).toBe(true);
    expect(isModuleEnabled(profile, 'schedule')).toBe(false);
    for (const core of CORE_MODULES) {
      expect(isModuleEnabled(profile, core)).toBe(true);
    }
  });

  it('toggling a module switches the profile to custom and preserves the rest', () => {
    const profile = createWorkspaceProfile('shot_planning');
    const updated = withModuleToggled(profile, 'schedule', true);
    expect(updated.preset).toBe('custom');
    expect(updated.enabledModules).toContain('schedule');
    expect(updated.enabledModules).toContain('shots');
  });

  it('cannot disable core modules', () => {
    const profile = createWorkspaceProfile('narrative');
    const updated = withModuleToggled(profile, 'floorplan', false);
    expect(isModuleEnabled(updated, 'floorplan')).toBe(true);
  });

  it('falls back to the first preset for unknown ids', () => {
    expect(getPreset('does-not-exist' as never).id).toBe(WORKSPACE_PRESETS[0].id);
  });
});
