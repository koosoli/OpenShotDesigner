import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';

const fixture = () => ({
  schemaVersion: 32,
  title: 'Pre-annotation project', activeSetupId: 'setup-1',
  setups: [{
    id: 'setup-1', name: 'Plan', sceneNumber: '1', location: '', timeOfDay: 'Day INT',
    elements: [
      { id: 'prop-1', type: 'prop', name: 'Table', x: 100, y: 200, rotation: 0 },
      { id: 'txt-1', type: 'text', name: 'Label', x: 10, y: 10, rotation: 0, text: 'Hi', fontSize: 16, color: '#fff' },
    ],
    shots: [], currentBeat: 1, totalBeats: 1,
    gridSettings: { size: 40, snap: true, showGrid: true, unit: 'm', pixelsPerUnit: 40 },
  }],
});

describe('migrateV32ToV33', () => {
  it('bumps the version without touching existing elements', () => {
    const input = fixture();
    const { project } = migrateProject(input);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(project.setups[0].elements).toEqual(input.setups[0].elements);
  });

  it('is deterministic', () => {
    expect(migrateProject(fixture()).project).toEqual(migrateProject(fixture()).project);
  });
});
