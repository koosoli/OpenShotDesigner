import { describe, expect, it } from 'vitest';
import { setupForScriptScene, setupTimeOfDay } from '../setupFromScene';
import { addSetupsCommand } from '../../domain/commands';
import type { Project } from '../../types';

describe('setupForScriptScene', () => {
  it('names and lights the setup after the scene, with one example camera and no actor', () => {
    const setup = setupForScriptScene({ sceneNumber: '3', heading: 'EXT. HARBOUR - DUSK', timeOfDay: 'DUSK', intExt: 'EXT' });
    expect(setup.name).toBe('Scene 3 · EXT. HARBOUR - DUSK');
    expect(setup.sceneNumber).toBe('3');
    expect(setup.location).toBe('EXT. HARBOUR - DUSK');
    expect(setup.timeOfDay).toBe('Night EXT');
    expect(setup.elements.map((element) => element.type)).toEqual(['camera']);
    expect(setup.shots).toHaveLength(1);
    expect(setup.shots[0]).toMatchObject({ shotNumber: '3/1', subjectActorIds: [] });
  });

  it('maps day and interior', () => {
    expect(setupTimeOfDay({ timeOfDay: 'MORNING', intExt: 'INT' })).toBe('Day INT');
  });

  it('can be added without switching the open setup', () => {
    const project = { id: 'p', title: 'T', setups: [{ id: 's1' }], activeSetupId: 's1' } as unknown as Project;
    const setup = setupForScriptScene({ sceneNumber: '2', heading: 'INT. KITCHEN - DAY', timeOfDay: 'DAY', intExt: 'INT' });
    const result = addSetupsCommand(project, { setups: [setup], open: false });
    expect(result.project.setups).toHaveLength(2);
    expect(result.project.activeSetupId).toBe('s1');
  });
});
