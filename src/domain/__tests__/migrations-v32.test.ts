import { describe, expect, it } from 'vitest';
import { migrateProject } from '../migrations';

const fixture = () => ({
  schemaVersion: 31,
  title: 'Legacy lights', activeSetupId: 'setup-1',
  setups: [{
    id: 'setup-1', name: 'Plan', sceneNumber: '1', location: '', timeOfDay: 'Day INT',
    elements: [
      { id: 'light-1', type: 'light', fixtureType: 'fresnel', hasBarnDoors: true, hasDiffusionGrid: true },
      { id: 'light-2', type: 'light', fixtureType: 'led_panel' },
    ],
    shots: [], currentBeat: 1, totalBeats: 1,
    gridSettings: { size: 40, snap: true, showGrid: true, unit: 'm', pixelsPerUnit: 40 },
  }],
});

describe('migrateV31ToV32', () => {
  it('preserves legacy modifier meaning deterministically', () => {
    const first = migrateProject(fixture()).project;
    const second = migrateProject(fixture()).project;
    expect(first.schemaVersion).toBe(32);
    expect(first.setups[0].elements[0]).toMatchObject({
      modifiers: [
        { id: 'light-1-modifier-barn-doors', kind: 'barn_doors', enabled: true },
        { id: 'light-1-modifier-diffusion', kind: 'diffusion', enabled: true },
      ],
    });
    expect(first.setups[0].elements[1]).not.toHaveProperty('modifiers');
    expect(second).toEqual(first);
  });
});
