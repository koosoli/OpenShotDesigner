/**
 * v30 -> v31 repairs bundled template projects created before cloned setup and
 * shot ids were respected by the example schedule. It also persists the
 * templates' explicit three-page lengths and missing actor/casting links.
 * Non-template projects pass through unchanged apart from the version stamp.
 */
import type { Project, SceneSetup } from '../../types';
import type { ScheduleBlock } from '../scheduling';

type UnknownRecord = Record<string, unknown>;

const TEMPLATE = [
  { id: 'setup-dialogue-classic', sceneNumber: '1', page: 'p. 1-3', shots: { 'shot-1c': '1C' } },
  { id: 'setup-noir-interrogation', sceneNumber: '2', page: 'p. 8-10', shots: { 'shot-2b': '2B' } },
] as const;

export const migrateV30ToV31 = (raw: UnknownRecord): Project => {
  const project = raw as unknown as Project;
  const setups = (project.setups ?? []) as SceneSetup[];
  const originalBlocks = project.scheduleBlocks ?? [];

  /**
   * This migration repairs one specific historical template defect: a cloned
   * example setup received new ids while its schedule retained bundled ids.
   * Scene numbers, page ranges, actor names and role names are ordinary user
   * data and are deliberately not accepted as a template fingerprint.
   */
  const hasLegacyTemplateReference = originalBlocks.some((block) => {
    if (block.kind === 'setup') {
      return TEMPLATE.some((template) => template.id === block.setupId)
        && !setups.some((setup) => setup.id === block.setupId);
    }
    if (block.kind === 'shots') {
      return block.shotIds.some(
        (shotId) =>
          TEMPLATE.some((template) => shotId in template.shots)
          && !setups.some((setup) => setup.shots.some((shot) => shot.id === shotId)),
      );
    }
    return false;
  });

  // Non-template projects pass through unchanged apart from the version
  // stamp. Never infer page counts or cast links from plausible user data.
  if (!hasLegacyTemplateReference) return { ...project, schemaVersion: 31 };

  const targetFor = (template: (typeof TEMPLATE)[number]): SceneSetup | undefined =>
    setups.find((setup) => setup.id === template.id)
    ?? [...setups].reverse().find((setup) =>
      setup.sceneNumber === template.sceneNumber && setup.scriptPage === template.page,
    );

  const scheduleBlocks = originalBlocks.map((block): ScheduleBlock => {
    if (block.kind === 'setup' && !setups.some((setup) => setup.id === block.setupId)) {
      const template = TEMPLATE.find((candidate) => candidate.id === block.setupId);
      const target = template ? targetFor(template) : undefined;
      return target ? { ...block, setupId: target.id } : block;
    }
    if (block.kind !== 'shots') return block;
    return {
      ...block,
      shotIds: block.shotIds.map((shotId) => {
        if (setups.some((setup) => setup.shots.some((shot) => shot.id === shotId))) return shotId;
        const template = TEMPLATE.find((candidate) => shotId in candidate.shots);
        const shotNumber = template?.shots[shotId as keyof typeof template.shots];
        return (template && shotNumber
          ? targetFor(template)?.shots.find((shot) => String(shot.shotNumber) === shotNumber)?.id
          : undefined) ?? shotId;
      }),
    };
  });

  const sampleScenes = new Set<string>(
    TEMPLATE.filter((template) => targetFor(template)).map((template) => template.sceneNumber),
  );
  const scriptScenes = project.scriptScenes?.map((scene) =>
    scene.pageLengthEighths === undefined && sampleScenes.has(scene.sceneNumber)
      ? { ...scene, pageLengthEighths: 24 }
      : scene,
  );

  const characters = project.characters ?? [];
  const byName = new Map(characters.map((character) => [character.canonicalName.trim().toUpperCase(), character] as const));
  const linkedSetups = setups.map((setup) => ({
    ...setup,
    elements: setup.elements.map((element) => {
      if (element.type !== 'actor' || element.characterId) return element;
      const name = ('characterName' in element ? element.characterName : undefined) ?? element.name;
      const character = byName.get((name ?? '').trim().toUpperCase());
      return character ? { ...element, characterId: character.id, characterName: character.canonicalName } : element;
    }),
  }));

  const castAssignments = (project.castAssignments?.length ?? 0) > 0
    ? project.castAssignments
    : characters.flatMap((character, index) => {
        const person = (project.people ?? []).find((candidate) =>
          candidate.kind === 'cast'
          && (candidate.role ?? '').toUpperCase().includes(`"${character.canonicalName.toUpperCase()}"`),
        );
        return person
          ? [{ id: `cast-${character.id}`, characterId: character.id, personId: person.id, castNumber: index + 1 }]
          : [];
      });

  return {
    ...project,
    schemaVersion: 31,
    setups: linkedSetups,
    ...(project.scheduleBlocks ? { scheduleBlocks } : {}),
    ...(scriptScenes ? { scriptScenes } : {}),
    ...(castAssignments?.length ? { castAssignments } : {}),
  };
};
