/**
 * Linking scene headings to canonical locations (plan §4.1, §4.13).
 *
 * A scene heading names its set in free text — "INT. SARAH'S KITCHEN - DAY" —
 * and the breakdown resolves that text to a `Location` by comparing it with
 * each location's name and aliases (`deriveScriptBreakdown`). So the link IS
 * the alias: to point a heading at a location, teach the location the name the
 * script uses for it. Nothing new is persisted on the scene, every scene that
 * shares the set follows at once, and renaming the set in the script leaves a
 * visible, fixable "script only" badge rather than a dangling id.
 */

import type { Location } from './types';

const normalise = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();

/** True when `name` already resolves to this location. */
export const locationAnswersTo = (location: Location, name: string): boolean => {
  const key = normalise(name);
  if (!key) return false;
  return normalise(location.name) === key || (location.aliases ?? []).some((alias) => normalise(alias) === key);
};

/** The location a set name currently resolves to, if any. */
export const locationForSetName = (locations: readonly Location[], name: string): Location | undefined =>
  locations.find((location) => locationAnswersTo(location, name));

/**
 * Make `setName` resolve to the location with `locationId`, by adding it as an
 * alias. Any OTHER location that answered to the name loses that alias, so a
 * set name never resolves to two places. Returns the same array when nothing
 * changes. A name that is the chosen location's own name needs no alias.
 */
export const linkSetNameToLocation = (
  locations: readonly Location[],
  setName: string,
  locationId: string,
): Location[] => {
  const key = normalise(setName);
  if (!key || !locations.some((location) => location.id === locationId)) return [...locations];
  return locations.map((location) => {
    if (location.id === locationId) {
      if (locationAnswersTo(location, setName)) return location;
      return { ...location, aliases: [...(location.aliases ?? []), setName.trim()] };
    }
    if (normalise(location.name) === key || !(location.aliases ?? []).some((alias) => normalise(alias) === key)) {
      return location;
    }
    const aliases = (location.aliases ?? []).filter((alias) => normalise(alias) !== key);
    const next = { ...location };
    if (aliases.length) next.aliases = aliases;
    else delete next.aliases;
    return next;
  });
};

/** Stop `setName` resolving to any location. Returns the same content when it never did. */
export const unlinkSetName = (locations: readonly Location[], setName: string): Location[] =>
  locations.map((location) => {
    const aliases = location.aliases ?? [];
    if (!aliases.some((alias) => normalise(alias) === normalise(setName))) return location;
    const kept = aliases.filter((alias) => normalise(alias) !== normalise(setName));
    const next = { ...location };
    if (kept.length) next.aliases = kept;
    else delete next.aliases;
    return next;
  });
