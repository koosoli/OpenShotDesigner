/**
 * Derived breakdown reports (plan §12.6–§12.9).
 *
 * Scene reports, department breakdowns and character/location reports DERIVE
 * from canonical project data (plan §4.12 derived-view rule / rule 37).
 * Everything here is pure and deterministic; nothing is persisted.
 */

import type {
  BreakdownCategory,
  BreakdownItem,
  Character,
  ScriptScene,
} from '../script/types';
import type { CastAssignment, Person } from '../people';
import type { Location } from '../locations';

/** Fixed canonical display order for breakdown categories. */
export const BREAKDOWN_CATEGORY_ORDER: readonly BreakdownCategory[] = [
  'prop',
  'wardrobe',
  'vehicle',
  'sfx',
  'vfx',
  'makeup',
  'animal',
  'stunt',
  'sound',
  'music',
  'extras',
  'special_equipment',
  'other',
];

export interface SceneReport {
  sceneId: string;
  heading: string;
  locationName?: string;
  pageLengthEighths?: number;
  castNames: string[];
  /** Item names grouped by category, categories in canonical order. */
  breakdownByCategory: Partial<Record<BreakdownCategory, string[]>>;
  shotCount: number;
}

export const deriveSceneReport = (
  scene: ScriptScene,
  ctx: {
    characters?: Character[];
    breakdownItems?: BreakdownItem[];
    locations?: Array<{ id: string; name: string }>;
    shotsPerScene?: (sceneId: string) => number;
  },
): SceneReport => {
  const { characters = [], breakdownItems = [], locations = [] } = ctx;

  const castNames = scene.characterIds
    .map((id) => characters.find((c) => c.id === id)?.canonicalName)
    .filter((name): name is string => !!name);

  const breakdownByCategory: Partial<Record<BreakdownCategory, string[]>> = {};
  for (const category of BREAKDOWN_CATEGORY_ORDER) {
    const names = scene.breakdownItemIds
      .map((id) => breakdownItems.find((i) => i.id === id))
      .filter((item): item is BreakdownItem => !!item && item.category === category)
      .map((item) => item.name);
    if (names.length > 0) breakdownByCategory[category] = names;
  }

  return {
    sceneId: scene.id,
    heading: scene.heading,
    locationName: locations.find((l) => l.id === scene.locationId)?.name,
    pageLengthEighths: scene.pageLengthEighths,
    castNames,
    breakdownByCategory,
    shotCount: ctx.shotsPerScene?.(scene.id) ?? 0,
  };
};

export interface DepartmentReportEntry {
  category: BreakdownCategory;
  items: BreakdownItem[];
  count: number;
}

/**
 * Group breakdown items by category. Categories appear in the fixed canonical
 * order regardless of input order (unless restricted by `categoryFilter`,
 * which also yields canonical order among the selected categories).
 */
export const deriveDepartmentReport = (
  items: BreakdownItem[],
  categoryFilter?: BreakdownCategory[],
): DepartmentReportEntry[] => {
  const filter = categoryFilter ? new Set(categoryFilter) : undefined;
  const entries: DepartmentReportEntry[] = [];
  for (const category of BREAKDOWN_CATEGORY_ORDER) {
    if (filter && !filter.has(category)) continue;
    const grouped = items.filter((item) => item.category === category);
    if (grouped.length === 0) continue;
    entries.push({ category, items: grouped, count: grouped.length });
  }
  return entries;
};

/**
 * Scene-number comparison that understands both halves of the production
 * numbering convention.
 *
 * A *suffix* means "inserted after": 3, 3A, 3AA, 3B. A *prefix* means
 * "inserted before": A1 is the scene added ahead of scene 1, and A3A the one
 * added ahead of 3A. The two are not symmetric, and the generic token walk
 * below cannot see the difference — it sorted every prefixed number to the very
 * end of the report, so `A1` printed after the last scene of the film rather
 * than before scene 1. That was wrong for numbers this app has generated since
 * prefixes were introduced (`insertedSceneNumber` mints them), which is why it
 * is worth a dedicated path rather than a note.
 *
 * Within one base number the order is therefore: the bare number, then each
 * suffix in string order ("" < "A" < "AA" < "B"), with a prefixed number
 * immediately ahead of the number it was inserted before, and prefixes among
 * themselves in letter order (A1 before B1, both before 1).
 *
 * Anything that is not a production number — an empty string, "OMITTED", a
 * free-text label — falls through to the original numeric-aware token walk, so
 * '10' still sorts after '9'.
 */
const SCENE_NUMBER = /^([A-Z]*)(\d+)([A-Z]*)$/;

export const compareSceneNumbers = (a: string, b: string): number => {
  const parsedA = SCENE_NUMBER.exec(a.trim().toUpperCase());
  const parsedB = SCENE_NUMBER.exec(b.trim().toUpperCase());
  if (parsedA && parsedB) {
    const [, prefixA, baseA, suffixA] = parsedA;
    const [, prefixB, baseB, suffixB] = parsedB;
    if (baseA !== baseB) return Number(baseA) - Number(baseB);
    if (suffixA !== suffixB) return suffixA < suffixB ? -1 : 1;
    // Same slot: a prefixed number was inserted ahead of the unprefixed one.
    if (prefixA === prefixB) return 0;
    if (prefixA === '') return 1;
    if (prefixB === '') return -1;
    return prefixA < prefixB ? -1 : 1;
  }

  const tokensA = a.match(/\d+|\D+/g) ?? [a];
  const tokensB = b.match(/\d+|\D+/g) ?? [b];
  const len = Math.min(tokensA.length, tokensB.length);
  for (let i = 0; i < len; i++) {
    const ta = tokensA[i];
    const tb = tokensB[i];
    const numA = /^\d+$/.test(ta);
    const numB = /^\d+$/.test(tb);
    let cmp: number;
    if (numA && numB) cmp = Number(ta) - Number(tb);
    else if (numA !== numB) cmp = numA ? -1 : 1; // numeric runs sort before letters
    else cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
    if (cmp !== 0) return cmp;
  }
  return tokensA.length - tokensB.length;
};

export const sortScenesByNumber = (scenes: ScriptScene[]): ScriptScene[] =>
  [...scenes].sort((a, b) => compareSceneNumbers(a.sceneNumber, b.sceneNumber));

export interface CharacterReport {
  character: Character | undefined;
  scenes: ScriptScene[];
  firstSceneNumber?: string;
  lastSceneNumber?: string;
  castPerson?: Person;
  scheduledDays: Array<{ dayId: string; dayName: string }>;
}

export const deriveCharacterReport = (
  characterId: string,
  ctx: {
    scriptScenes?: ScriptScene[];
    characters?: Character[];
    people?: Person[];
    castAssignments?: CastAssignment[];
    scheduledSceneIdsByDay?: Array<{ dayId: string; dayName: string; sceneIds: string[] }>;
  },
): CharacterReport => {
  const {
    scriptScenes = [],
    characters = [],
    people = [],
    castAssignments = [],
    scheduledSceneIdsByDay = [],
  } = ctx;

  const character = characters.find((c) => c.id === characterId);
  const scenes = sortScenesByNumber(
    scriptScenes.filter((s) => s.characterIds.includes(characterId)),
  );

  const assignment = castAssignments.find((a) => a.characterId === characterId);
  const castPerson = assignment
    ? people.find((p) => p.id === assignment.personId)
    : undefined;

  const sceneIds = new Set(scenes.map((s) => s.id));
  const scheduledDays = scheduledSceneIdsByDay
    .filter((day) => day.sceneIds.some((id) => sceneIds.has(id)))
    .map(({ dayId, dayName }) => ({ dayId, dayName }));

  return {
    character,
    scenes,
    firstSceneNumber: scenes[0]?.sceneNumber,
    lastSceneNumber:
      scenes.length > 0 ? scenes[scenes.length - 1].sceneNumber : undefined,
    castPerson,
    scheduledDays,
  };
};

export type IntExtKey = 'INT' | 'EXT' | 'INT_EXT' | 'OTHER';

export interface LocationReport {
  location: { id: string; name: string } | undefined;
  scenes: ScriptScene[];
  intExtCounts: Record<IntExtKey, number>;
  /** Counts keyed by raw timeOfDay string; scenes without one count as 'unknown'. */
  dayNightCounts: Record<string, number>;
  /** Sum of page eighths; null when ANY scene lacks pageLengthEighths. */
  totalPagesEighths: number | null;
}

export const deriveLocationReport = (
  locationId: string,
  ctx: {
    scriptScenes?: ScriptScene[];
    locations?: Location[];
  },
): LocationReport => {
  const { scriptScenes = [], locations = [] } = ctx;

  const found = locations.find((l) => l.id === locationId);
  const location = found ? { id: found.id, name: found.name } : undefined;

  const scenes = sortScenesByNumber(
    scriptScenes.filter((s) => s.locationId === locationId),
  );

  const intExtCounts: Record<IntExtKey, number> = {
    INT: 0,
    EXT: 0,
    INT_EXT: 0,
    OTHER: 0,
  };
  const dayNightCounts: Record<string, number> = {};
  let allHavePages = true;

  for (const scene of scenes) {
    const key: IntExtKey =
      scene.intExt === 'INT' || scene.intExt === 'EXT' || scene.intExt === 'INT_EXT'
        ? scene.intExt
        : 'OTHER';
    intExtCounts[key] += 1;
    const timeKey = scene.timeOfDay ?? 'unknown';
    dayNightCounts[timeKey] = (dayNightCounts[timeKey] ?? 0) + 1;
    if (scene.pageLengthEighths === undefined) allHavePages = false;
  }

  return {
    location,
    scenes,
    intExtCounts,
    dayNightCounts,
    totalPagesEighths: allHavePages
      ? scenes.reduce((sum, s) => sum + (s.pageLengthEighths ?? 0), 0)
      : null,
  };
};
