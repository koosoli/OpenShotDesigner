/**
 * Where a production day shoots (plan §16, rule 4).
 *
 * Every strip kind contributes: a setup its linked `Location` or its own
 * location text, a scene its linked location or the set its heading names, a
 * shots strip the setups that own the shots. Free text is resolved against the
 * project's locations by name AND alias — the same rule the script breakdown
 * uses — so linking "LIVING ROOM" once, anywhere, gives every strip that names
 * it the address and the map pin. A setup whose location field holds a whole
 * heading ("INT. LIVING ROOM - NIGHT") is read as the set it names.
 */

import type { ScheduleBlock } from '../scheduling';
import type { Location } from '../locations';
import { locationForSetName } from '../locations';
import { parseSceneHeading } from '../script/logic';
import type { CallSheetLocation } from './callSheet';

export interface DayLocationSources {
  locations?: readonly Location[];
  scriptScenes?: ReadonlyArray<{ id: string; heading: string; locationId?: string }>;
  setups?: ReadonlyArray<{ id: string; location?: string; locationId?: string; shots?: Array<{ id: string }> }>;
}

/** The set a free-text location names: the heading's location part, or the text itself. */
export const setNameFromLocationText = (text: string | undefined): string | undefined => {
  const raw = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return undefined;
  return parseSceneHeading(raw).location?.trim() || raw;
};

/** The project location a free-text location resolves to, by name or alias. */
export const locationForText = (locations: readonly Location[], text: string | undefined): Location | undefined => {
  const setName = setNameFromLocationText(text);
  if (!setName) return undefined;
  return locationForSetName(locations, setName) ?? (text ? locationForSetName(locations, text) : undefined);
};

export const resolveDayLocations = (
  scheduleBlockIds: readonly string[],
  blocks: readonly ScheduleBlock[],
  sources: DayLocationSources,
): CallSheetLocation[] => {
  const locations = sources.locations ?? [];
  const out: CallSheetLocation[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const pushEntity = (entity: Location, setName?: string) => {
    if (seenIds.has(entity.id)) return;
    seenIds.add(entity.id);
    seenNames.add(entity.name.toLocaleLowerCase());
    const entry: CallSheetLocation = { name: entity.name };
    if (setName && setName.toLocaleLowerCase() !== entity.name.toLocaleLowerCase()) entry.setName = setName;
    if (entity.address) entry.address = entity.address;
    if (typeof entity.lat === 'number') entry.lat = entity.lat;
    if (typeof entity.lng === 'number') entry.lng = entity.lng;
    out.push(entry);
  };
  const pushText = (text: string | undefined) => {
    const entity = locationForText(locations, text);
    const name = setNameFromLocationText(text);
    if (entity) {
      pushEntity(entity, name);
      return;
    }
    if (!name || seenNames.has(name.toLocaleLowerCase())) return;
    seenNames.add(name.toLocaleLowerCase());
    out.push({ name });
  };
  const pushLinkedOrText = (locationId: string | undefined, text: string | undefined) => {
    const linked = locationId ? locations.find((candidate) => candidate.id === locationId) : undefined;
    if (linked) pushEntity(linked, setNameFromLocationText(text));
    else pushText(text);
  };

  for (const id of scheduleBlockIds) {
    const block = blocks.find((candidate) => candidate.id === id);
    if (!block) continue;
    switch (block.kind) {
      case 'setup': {
        const setup = sources.setups?.find((candidate) => candidate.id === block.setupId);
        if (setup) pushLinkedOrText(setup.locationId, setup.location);
        break;
      }
      case 'scene': {
        const scene = sources.scriptScenes?.find((candidate) => candidate.id === block.scriptSceneId);
        if (scene) pushLinkedOrText(scene.locationId, scene.heading);
        break;
      }
      case 'shots': {
        for (const shotId of block.shotIds) {
          const owner = sources.setups?.find((setup) => (setup.shots ?? []).some((shot) => shot.id === shotId));
          if (owner) pushLinkedOrText(owner.locationId, owner.location);
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
};
