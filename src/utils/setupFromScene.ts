/**
 * A floor-plan setup for a screenplay scene: named and located after its
 * heading, lit for its time of day, and with one example camera (Camera A on
 * Shot 1) so the shot list and the plan have something to start from. No
 * actor — who is in the scene comes from the script, not from a placeholder.
 */
import type { SceneSetup } from '../types';
import type { ScriptScene } from '../domain/script';
import { blankSetup } from './projectLibrary';

export const setupTimeOfDay = (scene: Pick<ScriptScene, 'timeOfDay' | 'intExt'>): SceneSetup['timeOfDay'] => {
  const isNight = /NIGHT|DUSK|MIDNIGHT|NIGHTFALL/i.test(scene.timeOfDay || '');
  const isExterior = scene.intExt === 'EXT';
  return `${isNight ? 'Night' : 'Day'} ${isExterior ? 'EXT' : 'INT'}`;
};

export const setupForScriptScene = (
  scene: Pick<ScriptScene, 'sceneNumber' | 'heading' | 'timeOfDay' | 'intExt'>,
  locationId?: string,
): SceneSetup => {
  const base = blankSetup(scene.sceneNumber, `Scene ${scene.sceneNumber} · ${scene.heading}`);
  const camera = base.elements.find((element) => element.type === 'camera');
  return {
    ...base,
    location: scene.heading,
    ...(locationId ? { locationId } : {}),
    timeOfDay: setupTimeOfDay(scene),
    elements: camera ? [camera] : [],
    shots: base.shots.map((shot) => ({ ...shot, subjectActorIds: [], framingDescription: '' })),
  };
};
