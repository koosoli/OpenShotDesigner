/**
 * Floor-plan scenes and screenplay scenes, kept linked.
 *
 * A plan (`SceneSetup`) is linked to a screenplay scene by the id of its
 * heading (`scriptSceneId`), not only by number, so it follows its scene when
 * the script is renumbered: insert a scene before scene 2 and the plan that was
 * scene 2 becomes scene 3 with it. Several plans can be linked to one scene
 * (coverage setups); a location's master plan is never linked.
 *
 * Linking happens by itself where it is unambiguous: a plan not linked yet is
 * linked to the scene with its number — so a scene 2 drawn on the canvas first
 * is joined by scene 2 when it is written. Anything else is linked by hand
 * (`linkSetupToScene`).
 *
 * A plan whose name the app made ("Scene 2 · INT. KITCHEN - DAY") or a
 * placeholder one ("Scene 2", "Coverage 3") is renamed after its heading as
 * the heading changes; a name someone typed is left alone.
 */
import type { SceneSetup } from '../../types';
import type { ScriptScene } from './types';

/** The name the app gives a plan made for a scene. */
export const setupNameForScene = (scene: Pick<ScriptScene, 'sceneNumber' | 'heading'>): string =>
  `Scene ${scene.sceneNumber} · ${scene.heading}`;

const APP_NAMED = /^Scene \S+ · /;
const PLACEHOLDER_NAME = /^(Scene|Coverage|Setup) \d+[A-Z]*$/i;

/** Whether the app may rename this plan after its heading. */
export const hasAutomaticName = (setup: Pick<SceneSetup, 'name'>): boolean =>
  APP_NAMED.test(setup.name) || PLACEHOLDER_NAME.test(setup.name.trim()) || setup.name.trim() === '';

const timeOfDayFor = (scene: Pick<ScriptScene, 'timeOfDay' | 'intExt'>): SceneSetup['timeOfDay'] => {
  const isNight = /NIGHT|DUSK|MIDNIGHT|NIGHTFALL/i.test(scene.timeOfDay || '');
  return `${isNight ? 'Night' : 'Day'} ${scene.intExt === 'EXT' ? 'EXT' : 'INT'}`;
};

/** What a plan takes from the scene it is linked to. */
const followScene = (setup: SceneSetup, scene: ScriptScene): Partial<SceneSetup> => {
  const patch: Partial<SceneSetup> = {};
  if (setup.scriptSceneId !== scene.id) patch.scriptSceneId = scene.id;
  if (setup.sceneNumber !== scene.sceneNumber) patch.sceneNumber = scene.sceneNumber;
  if (hasAutomaticName(setup)) {
    const name = setupNameForScene(scene);
    if (setup.name !== name) patch.name = name;
    if (setup.location !== scene.heading) patch.location = scene.heading;
    const timeOfDay = timeOfDayFor(scene);
    if (setup.timeOfDay !== timeOfDay) patch.timeOfDay = timeOfDay;
  } else if (!setup.location?.trim()) {
    patch.location = scene.heading;
  }
  return patch;
};

export interface SetupPatch {
  setupId: string;
  patch: Partial<SceneSetup>;
}

/**
 * `scriptSceneId` of a plan someone unlinked on purpose: it is not for any
 * scene of the script, and is not linked again by its number.
 */
export const NOT_IN_SCRIPT = '-';

const linkable = (setup: SceneSetup) => !setup.masterPlanForLocationId && setup.scriptSceneId !== NOT_IN_SCRIPT;

/** The changes that bring every plan in step with the screenplay. */
export const syncSetupsWithScript = (setups: readonly SceneSetup[], scenes: readonly ScriptScene[]): SetupPatch[] => {
  if (scenes.length === 0) return [];
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const byNumber = new Map<string, ScriptScene>();
  for (const scene of scenes) if (!byNumber.has(scene.sceneNumber)) byNumber.set(scene.sceneNumber, scene);

  const patches: SetupPatch[] = [];
  for (const setup of setups) {
    if (!linkable(setup)) continue;
    // A link to a heading that is gone counts as no link.
    const scene = (setup.scriptSceneId ? byId.get(setup.scriptSceneId) : undefined) ?? byNumber.get(setup.sceneNumber);
    if (!scene) continue;
    const patch = followScene(setup, scene);
    if (Object.keys(patch).length > 0) patches.push({ setupId: setup.id, patch });
  }
  return patches;
};

/** The scenes in `sceneIds` that no plan is for yet, by link or by number. */
export const scenesWithoutSetup = (
  setups: readonly SceneSetup[],
  scenes: readonly ScriptScene[],
  sceneIds?: ReadonlySet<string>,
): ScriptScene[] => {
  const linked = new Set(setups.filter(linkable).map((setup) => setup.scriptSceneId).filter(Boolean));
  const numbers = new Set(setups.filter(linkable).map((setup) => setup.sceneNumber));
  return scenes.filter(
    (scene) => !scene.omitted && (!sceneIds || sceneIds.has(scene.id)) && !linked.has(scene.id) && !numbers.has(scene.sceneNumber),
  );
};

/** The screenplay scene a plan is for, if any. */
export const sceneOfSetup = (setup: SceneSetup, scenes: readonly ScriptScene[]): ScriptScene | undefined =>
  !linkable(setup)
    ? undefined
    : (setup.scriptSceneId ? scenes.find((scene) => scene.id === setup.scriptSceneId) : undefined) ??
      scenes.find((scene) => scene.sceneNumber === setup.sceneNumber);

/** Link a plan to a scene by hand, or mark it as not in the script with `null`. */
export const linkSetupToScene = (setup: SceneSetup, scene: ScriptScene | null): SceneSetup => {
  if (!scene) return { ...setup, scriptSceneId: NOT_IN_SCRIPT };
  return { ...setup, ...followScene({ ...setup, scriptSceneId: undefined }, scene), scriptSceneId: scene.id };
};
