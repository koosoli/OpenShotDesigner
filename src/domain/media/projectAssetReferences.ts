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

/**
 * Rewrite asset ids across the whole project graph.
 *
 * The counterpart to the collector above for id upgrades: an `asset-local-…`
 * id minted without `crypto.subtle` becomes a real `asset-sha256-…` id when
 * its bytes are re-imported on a hashing browser, and every field that held
 * the old id has to move. Kept next to the collector so a new asset-bearing
 * field cannot be added to one walk and forgotten in the other. Free-form
 * text is never touched, for the same reason the collector never scans it.
 */
export const remapProjectAssetIds = (
  project: Project,
  mapping: Record<string, string>,
): { project: Project; applied: number } => {
  if (Object.keys(mapping).length === 0) return { project, applied: 0 };
  const working = JSON.parse(JSON.stringify(project)) as Project;
  let applied = 0;
  const rewrite = (value: string | undefined, set: (next: string) => void): void => {
    if (!value) return;
    const next = mapping[value];
    if (next && next !== value) {
      set(next);
      applied += 1;
    }
  };
  if (working.logo) rewrite(working.logo, (next) => { working.logo = next; });
  for (const setup of working.setups ?? []) {
    if (setup.backgroundImage?.url) {
      rewrite(setup.backgroundImage.url, (next) => { setup.backgroundImage!.url = next; });
    }
    for (const background of setup.backgroundImages ?? []) {
      if (background.url) rewrite(background.url, (next) => { background.url = next; });
    }
    for (const shot of setup.shots ?? []) {
      if (shot.storyboardImage) {
        rewrite(shot.storyboardImage, (next) => { shot.storyboardImage = next; });
      }
      if (shot.storyboardImageEnd) {
        rewrite(shot.storyboardImageEnd, (next) => { shot.storyboardImageEnd = next; });
      }
      for (const frame of Object.values(shot.storyboardFrames ?? {})) {
        if (frame.image) rewrite(frame.image, (next) => { frame.image = next; });
      }
    }
    for (const element of setup.elements ?? []) {
      if (element.type === 'light' && element.gdtfAssetId) {
        rewrite(element.gdtfAssetId, (next) => { element.gdtfAssetId = next; });
      }
    }
  }
  for (const row of working.avScriptRows ?? []) {
    if (row.storyboardImage) rewrite(row.storyboardImage, (next) => { row.storyboardImage = next; });
  }
  for (const person of working.people ?? []) {
    if (person.headshotAssetId) {
      rewrite(person.headshotAssetId, (next) => { person.headshotAssetId = next; });
    }
  }
  for (const location of working.locations ?? []) {
    (location.referenceAssetIds ?? []).forEach((id, index) => {
      rewrite(id, (next) => { location.referenceAssetIds![index] = next; });
    });
  }
  for (const board of working.moodBoards ?? []) {
    for (const card of board.cards) {
      if (card.assetId) rewrite(card.assetId, (next) => { card.assetId = next; });
    }
  }
  for (const day of working.productionDays ?? []) {
    if (day.callSheet?.mapAssetId) {
      rewrite(day.callSheet.mapAssetId, (next) => { day.callSheet!.mapAssetId = next; });
    }
    for (const map of day.callSheet?.locationMaps ?? []) {
      if (map.assetId) rewrite(map.assetId, (next) => { map.assetId = next; });
    }
  }
  for (const profile of working.trussProfiles ?? []) {
    if (profile.gdtfAssetId) {
      rewrite(profile.gdtfAssetId, (next) => { profile.gdtfAssetId = next; });
    }
    if (profile.geometryAssetId) {
      rewrite(profile.geometryAssetId, (next) => { profile.geometryAssetId = next; });
    }
  }
  return applied > 0 ? { project: working, applied } : { project, applied: 0 };
};
