import type { Project } from '../../types';
import { isAssetRef } from './imageRef';

/** One typed project field that owns an asset-store reference. */
export interface ProjectAssetReference {
  id: string;
  path: string;
  kind: 'image' | 'map' | 'headshot' | 'location' | 'moodboard' | 'gdtf' | 'geometry';
}

/**
 * The single inventory used by packaging, storage inspection and validation.
 * Free-form script/comment text is deliberately never scanned for strings that
 * merely resemble asset ids.
 */
export const collectProjectAssetReferences = (project: Project): ProjectAssetReference[] => {
  const found: ProjectAssetReference[] = [];
  const add = (id: string | undefined, path: string, kind: ProjectAssetReference['kind']) => {
    if (id && isAssetRef(id)) found.push({ id, path, kind });
  };
  add(project.logo, 'logo', 'image');
  (project.setups ?? []).forEach((setup, setupIndex) => {
    add(setup.backgroundImage?.url, `setups[${setupIndex}].backgroundImage.url`, 'image');
    (setup.backgroundImages ?? []).forEach((background, index) => add(background.url, `setups[${setupIndex}].backgroundImages[${index}].url`, 'image'));
    (setup.shots ?? []).forEach((shot, shotIndex) => {
      const base = `setups[${setupIndex}].shots[${shotIndex}]`;
      add(shot.storyboardImage, `${base}.storyboardImage`, 'image');
      add(shot.storyboardImageEnd, `${base}.storyboardImageEnd`, 'image');
      Object.entries(shot.storyboardFrames ?? {}).forEach(([slot, frame]) => add(frame.image, `${base}.storyboardFrames.${slot}.image`, 'image'));
    });
    (setup.elements ?? []).forEach((element, elementIndex) => {
      if (element.type === 'light') add(element.gdtfAssetId, `setups[${setupIndex}].elements[${elementIndex}].gdtfAssetId`, 'gdtf');
    });
  });
  (project.avScriptRows ?? []).forEach((row, index) => add(row.storyboardImage, `avScriptRows[${index}].storyboardImage`, 'image'));
  (project.people ?? []).forEach((person, index) => add(person.headshotAssetId, `people[${index}].headshotAssetId`, 'headshot'));
  (project.locations ?? []).forEach((location, locationIndex) => (location.referenceAssetIds ?? []).forEach((id, index) => add(id, `locations[${locationIndex}].referenceAssetIds[${index}]`, 'location')));
  (project.moodBoards ?? []).forEach((board, boardIndex) => board.cards.forEach((card, cardIndex) => add(card.assetId, `moodBoards[${boardIndex}].cards[${cardIndex}].assetId`, 'moodboard')));
  (project.productionDays ?? []).forEach((day, dayIndex) => {
    add(day.callSheet?.mapAssetId, `productionDays[${dayIndex}].callSheet.mapAssetId`, 'map');
    (day.callSheet?.locationMaps ?? []).forEach((map, index) => add(map.assetId, `productionDays[${dayIndex}].callSheet.locationMaps[${index}].assetId`, 'map'));
  });
  (project.trussProfiles ?? []).forEach((profile, index) => {
    add(profile.gdtfAssetId, `trussProfiles[${index}].gdtfAssetId`, 'gdtf');
    add(profile.geometryAssetId, `trussProfiles[${index}].geometryAssetId`, 'geometry');
  });
  return found;
};

export const collectProjectAssetIds = (project: Project): string[] =>
  [...new Set(collectProjectAssetReferences(project).map((reference) => reference.id))];
