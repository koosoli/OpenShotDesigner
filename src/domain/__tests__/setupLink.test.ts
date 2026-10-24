import { describe, expect, it } from 'vitest';
import { linkSetupToSceneCommand, setupsOutOfStep, syncSetupsWithScriptCommand } from '../commands';
import { NOT_IN_SCRIPT, sceneOfSetup, scenesWithoutSetup, syncSetupsWithScript } from '../script/setupLink';
import type { ScriptScene } from '../script/types';
import type { Project, SceneSetup } from '../../types';

const scene = (id: string, sceneNumber: string, heading: string): ScriptScene => ({
  id,
  sceneNumber,
  heading,
  intExt: heading.startsWith('EXT') ? 'EXT' : 'INT',
  timeOfDay: heading.includes('NIGHT') ? 'NIGHT' : 'DAY',
  characterIds: [],
  breakdownItemIds: [],
});
const setup = (id: string, sceneNumber: string, name: string, extra: Partial<SceneSetup> = {}) =>
  ({ id, name, sceneNumber, location: '', timeOfDay: 'Day INT', elements: [], shots: [], ...extra }) as SceneSetup;
const project = (setups: SceneSetup[], scenes: ScriptScene[]) => ({ id: 'p', setups, scriptScenes: scenes, activeSetupId: setups[0]?.id }) as unknown as Project;
const apply = (setups: SceneSetup[], scenes: ScriptScene[]) => {
  const patches = new Map(syncSetupsWithScript(setups, scenes).map((p) => [p.setupId, p.patch]));
  return setups.map((s) => ({ ...s, ...patches.get(s.id) }));
};

describe('plans linked to screenplay scenes', () => {
  it('links a scene drawn on the canvas first to the scene of its number once written', () => {
    const [plan] = apply([setup('a', '2', 'Coverage 2')], [scene('h1', '1', 'INT. HALL - DAY'), scene('h2', '2', 'INT. KITCHEN - NIGHT')]);
    expect(plan).toMatchObject({ scriptSceneId: 'h2', name: 'Scene 2 · INT. KITCHEN - NIGHT', location: 'INT. KITCHEN - NIGHT', timeOfDay: 'Night INT' });
  });

  it('follows its scene when the script is renumbered, keeping a typed name', () => {
    const plans = [setup('a', '2', 'Kitchen master', { scriptSceneId: 'h2', location: 'Kitchen' })];
    // A scene was inserted before: the kitchen is scene 3 now.
    const [plan] = apply(plans, [scene('h1', '1', 'INT. HALL'), scene('new', '2', 'EXT. YARD'), scene('h2', '3', 'INT. KITCHEN')]);
    expect(plan).toMatchObject({ sceneNumber: '3', name: 'Kitchen master', location: 'Kitchen', scriptSceneId: 'h2' });
  });

  it('makes a plan only for new scenes that have none', () => {
    const scenes = [scene('h1', '1', 'INT. HALL'), scene('h2', '2', 'INT. KITCHEN')];
    expect(scenesWithoutSetup([setup('a', '1', 'Scene 1')], scenes, new Set(['h1', 'h2'])).map((s) => s.id)).toEqual(['h2']);
    const next = syncSetupsWithScriptCommand(project([setup('a', '1', 'Scene 1')], scenes), {
      createFor: ['h2'],
      makeSetup: (target) => setup(`plan-${target.id}`, target.sceneNumber, `Scene ${target.sceneNumber} · ${target.heading}`, { scriptSceneId: target.id }),
    }).project;
    expect(next.setups.map((s) => s.scriptSceneId)).toEqual(['h1', 'h2']);
    expect(setupsOutOfStep(next)).toBe(false);
  });

  it('links by hand, and an unlinked plan stays unlinked', () => {
    const scenes = [scene('h1', '1', 'INT. HALL'), scene('h2', '2', 'INT. KITCHEN')];
    const linked = linkSetupToSceneCommand(project([setup('a', '7', 'Scene 7')], scenes), { setupId: 'a', sceneId: 'h2' }).project;
    expect(linked.setups[0]).toMatchObject({ scriptSceneId: 'h2', sceneNumber: '2' });
    const unlinked = linkSetupToSceneCommand(linked, { setupId: 'a', sceneId: null }).project;
    expect(unlinked.setups[0].scriptSceneId).toBe(NOT_IN_SCRIPT);
    expect(sceneOfSetup(unlinked.setups[0], scenes)).toBeUndefined();
    expect(setupsOutOfStep(unlinked)).toBe(false);
  });

  it('never links a location master plan', () => {
    expect(syncSetupsWithScript([setup('m', '1', 'Master', { masterPlanForLocationId: 'loc' })], [scene('h1', '1', 'INT. HALL')])).toEqual([]);
  });
});
