/**
 * Keeping floor-plan scenes and screenplay scenes linked
 * (domain/script/setupLink): bring every plan in step with the script, make a
 * plan for scenes just written, and link a plan to a scene by hand.
 */
import type { Project, SceneSetup } from '../../types';
import { linkSetupToScene, scenesWithoutSetup, syncSetupsWithScript } from '../script/setupLink';
import type { ScriptScene } from '../script/types';
import { commandTimestamp } from './types';
import type { CommandResult } from './types';

export interface SyncSetupsWithScriptInput {
  /** Headings just written: each gets an empty plan if it has none. */
  createFor?: readonly string[];
  /** Makes that plan (utils/setupFromScene `setupForScriptScene`). */
  makeSetup?: (scene: ScriptScene) => SceneSetup;
}

/** Whether the sync would change anything — callers skip the command when not. */
export const setupsOutOfStep = (project: Project, input: SyncSetupsWithScriptInput = {}): boolean => {
  const scenes = project.scriptScenes ?? [];
  if (syncSetupsWithScript(project.setups, scenes).length > 0) return true;
  return !!input.createFor?.length && scenesWithoutSetup(project.setups, scenes, new Set(input.createFor)).length > 0;
};

export const syncSetupsWithScriptCommand = (project: Project, input: SyncSetupsWithScriptInput = {}): CommandResult => {
  const scenes = project.scriptScenes ?? [];
  const { makeSetup } = input;
  const created: SceneSetup[] = input.createFor?.length && makeSetup
    ? scenesWithoutSetup(project.setups, scenes, new Set(input.createFor)).map((scene) => makeSetup(scene))
    : [];
  const setups = [...project.setups, ...created];
  const patches = new Map(syncSetupsWithScript(setups, scenes).map(({ setupId, patch }) => [setupId, patch]));
  return {
    project: {
      ...project,
      setups: setups.map((setup) => (patches.has(setup.id) ? { ...setup, ...patches.get(setup.id) } : setup)),
    },
    meta: {
      type: 'syncSetupsWithScript',
      timestamp: commandTimestamp(),
      description: created.length > 0 ? `Plan for ${created.map((setup) => `scene ${setup.sceneNumber}`).join(', ')}` : 'Plans follow the script',
    },
  };
};

export interface LinkSetupToSceneInput {
  setupId: string;
  /** The heading's id, or null: this plan is not for any scene of the script. */
  sceneId: string | null;
}

export const linkSetupToSceneCommand = (project: Project, input: LinkSetupToSceneInput): CommandResult => {
  const scene = input.sceneId ? (project.scriptScenes ?? []).find((candidate) => candidate.id === input.sceneId) : null;
  if (input.sceneId && !scene) throw new Error('linkSetupToScene: unknown scene.');
  const setup = project.setups.find((candidate) => candidate.id === input.setupId);
  if (!setup) throw new Error('linkSetupToScene: unknown plan.');
  return {
    project: {
      ...project,
      setups: project.setups.map((candidate) => (candidate.id === setup.id ? linkSetupToScene(candidate, scene ?? null) : candidate)),
    },
    meta: {
      type: 'linkSetupToScene',
      timestamp: commandTimestamp(),
      description: scene ? `Link ${setup.name} to scene ${scene.sceneNumber}` : `Unlink ${setup.name} from the script`,
    },
  };
};
