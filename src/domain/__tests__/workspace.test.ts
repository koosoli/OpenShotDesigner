import { describe, it, expect } from 'vitest';
import {
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
    const scriptFree = ['blank', 'shot_planning', 'concert', 'broadcast'] as const;
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
