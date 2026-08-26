import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';

const fixture = () => ({
  schemaVersion: 30,
  title: 'Cloned template', director: '', cinematographer: '', date: '2026-08-26',
  activeSetupId: 'setup-clone',
  setups: [{
    id: 'setup-clone', name: 'Dialogue — Master + Shot / Reverse', sceneNumber: '1',
    scriptPage: 'p. 1-3', location: '', timeOfDay: '',
    elements: [{ id: 'actor-clone', type: 'actor', name: 'ALEX' }],
    shots: [{ id: 'shot-clone', shotNumber: '1C', name: 'CU', cameraId: 'cam' }],
  }],
  characters: [{ id: 'char-alex', canonicalName: 'ALEX', aliases: [] }],
  people: [{ id: 'person-alex', displayName: 'Marco', kind: 'cast', role: 'Lead — "Alex"' }],
  scriptScenes: [{ id: 'scene-1', sceneNumber: '1', heading: 'INT. ROOM', characterIds: ['char-alex'], breakdownItemIds: [] }],
  productionDays: [{ id: 'day', name: 'Day 1', scheduleBlockIds: ['setup-block', 'shot-block'] }],
  scheduleBlocks: [
    { id: 'setup-block', kind: 'setup', setupId: 'setup-dialogue-classic' },
    { id: 'shot-block', kind: 'shots', shotIds: ['shot-1c'] },
  ],
});

describe('migrateV30ToV31', () => {
  it('repairs cloned template schedule, pages and cast links deterministically', () => {
    const first = migrateProject(fixture()).project;
    const second = migrateProject(fixture()).project;
    expect(first.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(first.scheduleBlocks).toEqual([
      { id: 'setup-block', kind: 'setup', setupId: 'setup-clone' },
      { id: 'shot-block', kind: 'shots', shotIds: ['shot-clone'] },
    ]);
    expect(first.scriptScenes?.[0].pageLengthEighths).toBe(24);
    expect(first.setups[0].elements[0]).toMatchObject({ characterId: 'char-alex' });
    expect(first.castAssignments?.[0]).toMatchObject({ characterId: 'char-alex', personId: 'person-alex' });
    expect(second).toEqual(first);
  });
});
