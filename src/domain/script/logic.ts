/**
 * Script intelligence helpers (plan §12).
 *
 * Pure domain logic over optional screenplay data: character-name
 * normalization, character-cue catalog building, scene-heading parsing,
 * and deterministic suggestions/merges. No React, no I/O.
 *
 * A screenplay is optional — nothing here is required by any other feature.
 */

import type { Character } from './types';
import type { ScriptScene } from './types';
import type { Location } from '../locations';
import { createId } from '../ids';

// ---------------------------------------------------------------------------
// Character name normalization
// ---------------------------------------------------------------------------

export interface NormalizedCharacterName {
  canonicalName: string;
  /** Dialogue-state extension such as `V.O.`, `O.S.` or `CONT'D`, without parentheses. */
  extension?: string;
}

/** Recognized cue extensions (mirrors the parser's convention). */
const EXTENSION_INNER_RE =
  /^(V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|PRE-?LAP|SUBTITLED?|FILTERED|ON PHONE)$/;

/**
 * Normalize a raw character-cue string.
 *
 * - `"JOHN"` → `{ canonicalName: "JOHN" }`
 * - `"John (V.O.)"` → `{ canonicalName: "JOHN", extension: "V.O." }`
 * - `"JOHN JR."` → `{ canonicalName: "JOHN JR." }` (suffixes stay in the name)
 *
 * Canonical names are trimmed, whitespace-collapsed and uppercased.
 * Unknown parenthesized content is left in the canonical name rather than
 * guessed at.
 */
export const normalizeCharacterName = (raw: string): NormalizedCharacterName => {
  let working = raw.replace(/\s+/g, ' ').trim();
  if (!working) return { canonicalName: '' };

  let extension: string | undefined;
  const trailing = working.match(/\(([^()]*)\)\s*$/);
  if (trailing && trailing.index !== undefined) {
    const inner = trailing[1].replace(/\s+/g, ' ').trim().toUpperCase();
    if (inner && EXTENSION_INNER_RE.test(inner)) {
      extension = inner;
      working = working.slice(0, trailing.index).replace(/\s+/g, ' ').trim();
    }
  }

  const result: NormalizedCharacterName = { canonicalName: working.toUpperCase() };
  if (extension) result.extension = extension;
  return result;
};

// ---------------------------------------------------------------------------
// Character catalog from script lines
// ---------------------------------------------------------------------------

/** Name body of a plausible cue: uppercase-ish, limited punctuation. */
const CUE_BODY_RE = /^[A-Z0-9][A-Z0-9 .,'’&/#-]*$/;
/** Trailing recognized extensions, e.g. `(V.O.) (CONT'D)`. */
const CUE_EXTENSIONS_RE = /^(?:\s*\((?:V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|PRE-?LAP|SUBTITLED?|FILTERED|ON PHONE)[^()]*\))*\s*$/;
/** Slugline prefixes must never be mistaken for cues. */
const SCENE_PREFIX_RE = /^(INT|EXT|EST|I\/E)\b/i;
/** Name suffixes that legitimately end with a period. */
const SUFFIX_DOT_RE = /\.(JR|SR|MR|MRS|MS|DR|ST|LT|SGT|CAPT|PROF|REV)\.$/i;

/** Conservative shape check for a character-cue line's text. */
const looksLikeCueText = (text: string): boolean => {
  if (!text || text.length > 45) return false;
  if (SCENE_PREFIX_RE.test(text)) return false;
  if (text.endsWith('.') && !SUFFIX_DOT_RE.test(text)) return false;
  const withoutExtensions = text.replace(/\([^()]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!withoutExtensions) return false;
  return CUE_BODY_RE.test(withoutExtensions) && CUE_EXTENSIONS_RE.test(text.slice(withoutExtensions.length));
};

/**
 * Build a deduplicated character catalog from parsed script lines.
 *
 * Lines explicitly typed `'character'` are trusted. Untyped lines are
 * accepted only when their whole text matches the cue shape AND the next
 * non-empty line is dialogue/parenthetical (i.e. they precede dialogue).
 * Duplicate cues merge by canonical name; alternate spellings are kept as
 * aliases.
 */
export const buildCharacterCatalog = (
  lines: Array<{ text: string; type?: string }>
): Character[] => {
  const byCanonical = new Map<string, Character>();
  const out: Character[] = [];

  lines.forEach((line, index) => {
    const text = (line.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;

    const type = line.type;
    const isTypedCue = type === 'character';
    if (!isTypedCue && type !== undefined) return;

    if (!isTypedCue) {
      if (!looksLikeCueText(text)) return;
      const next = lines
        .slice(index + 1)
        .find((l) => (l.text || '').trim().length > 0);
      if (!next || (next.type !== 'dialogue' && next.type !== 'parenthetical')) return;
    }

    const { canonicalName } = normalizeCharacterName(text);
    if (!canonicalName) return;

    const key = canonicalName.toLowerCase();
    const alias = text !== canonicalName && text.toLowerCase() !== canonicalName.toLowerCase() ? text : undefined;

    const existing = byCanonical.get(key);
    if (existing) {
      if (alias && !existing.aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) {
        existing.aliases.push(alias);
      }
      return;
    }

    const character: Character = {
      id: createId('char'),
      canonicalName,
      aliases: alias ? [alias] : [],
    };
    byCanonical.set(key, character);
    out.push(character);
  });

  return out;
};

// ---------------------------------------------------------------------------
// Scene heading parsing
// ---------------------------------------------------------------------------

export interface ParsedSceneHeading {
  intExt?: 'INT' | 'EXT' | 'INT_EXT' | 'OTHER';
  location?: string;
  subLocation?: string;
  timeOfDay?: string;
}

const TIME_OF_DAY_RE =
  /^(DAY|NIGHT|DUSK|DAWN|MORNING|AFTERNOON|EVENING|SUNRISE|SUNSET|MAGIC HOUR|GOLDEN HOUR|BLUE HOUR|TWILIGHT|MIDNIGHT|NOON|MIDDAY|NIGHTFALL|PRE-?DAWN|LATER|CONTINUOUS|MOMENTS LATER|SAME TIME|SAME NIGHT|NEXT DAY|EARLIER)$/i;

const INT_EXT_PREFIX_RE =
  /^(?:INT\.?\s*\/\s*EXT(?:ERIOR)?\.?|EXT\.?\s*\/\s*INT(?:ERIOR)?\.?|I\s*\/\s*E\b|INT[-. ]?EXT\b)/i;
const INT_PREFIX_RE = /^INT\.?(?=\s|$)/i;
const EXT_PREFIX_RE = /^EXT\.?(?=\s|$)/i;
const EST_PREFIX_RE = /^EST(?:ABLISHING)?\.?(?=\s|$)/i;
const FOUNTAIN_SCENE_NUMBER_RE = /#[0-9A-Za-z.-]+#\s*$/;

/**
 * Conservatively parse a slugline such as
 * `"INT. JOHN'S APARTMENT - KITCHEN - NIGHT"`.
 *
 * Only well-formed `INT/EXT/EST/I-E` headings are decomposed; anything else
 * returns an almost-empty result (`{}`) instead of guessing. The final
 * `-`-separated segment is treated as time-of-day only when it matches a
 * known time word.
 */
export const parseSceneHeading = (heading: string): ParsedSceneHeading => {
  let text = heading.replace(/\s+/g, ' ').trim();
  if (!text) return {};

  text = text.replace(FOUNTAIN_SCENE_NUMBER_RE, '').trim();

  let intExt: ParsedSceneHeading['intExt'];
  if (INT_EXT_PREFIX_RE.test(text)) {
    intExt = 'INT_EXT';
  } else if (INT_PREFIX_RE.test(text)) {
    intExt = 'INT';
  } else if (EXT_PREFIX_RE.test(text)) {
    intExt = 'EXT';
  } else if (EST_PREFIX_RE.test(text)) {
    intExt = 'OTHER';
  } else {
    return {};
  }

  text = text
    .replace(INT_EXT_PREFIX_RE, '')
    .replace(/^(?:INT|EXT|EST)(?:ABLISHING)?\.?/i, '')
    .trim();

  if (!text) return { intExt };

  const parts = text
    .split(/\s+[–—-]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return { intExt };

  const result: ParsedSceneHeading = { intExt };
  const last = parts[parts.length - 1];
  const remainder = TIME_OF_DAY_RE.test(last) ? parts.slice(0, -1) : parts;

  result.location = remainder[0];
  if (remainder.length > 1) result.subLocation = remainder.slice(1).join(' - ');
  if (remainder !== parts) result.timeOfDay = last;
  return result;
};

/** Return only the location-shaped portion of a partial or complete slugline. */
export const sceneHeadingLocationQuery = (heading: string): string => {
  const parsed = parseSceneHeading(heading);
  if (parsed.location) return parsed.location;
  return heading
    .replace(INT_EXT_PREFIX_RE, '')
    .replace(/^(?:INT|EXT|EST)(?:ABLISHING)?\.?/i, '')
    .replace(/\s+[–—-]\s+.*$/, '')
    .trim();
};

/** Replace a slugline's location without discarding INT/EXT, sub-location or time. */
export const replaceSceneHeadingLocation = (heading: string, locationName: string): string => {
  const parsed = parseSceneHeading(heading);
  const location = locationName.trim().toUpperCase();
  if (!location) return heading;
  if (!parsed.intExt) return location;
  const prefix = parsed.intExt === 'INT_EXT'
    ? 'INT./EXT.'
    : parsed.intExt === 'OTHER'
      ? 'EST.'
      : `${parsed.intExt}.`;
  return [
    `${prefix} ${location}`,
    parsed.subLocation?.toUpperCase(),
    parsed.timeOfDay?.toUpperCase(),
  ].filter(Boolean).join(' - ');
};

// ---------------------------------------------------------------------------
// Live script breakdown
// ---------------------------------------------------------------------------

export interface ScriptBreakdownLine {
  id: string;
  text: string;
  type?: string;
  sceneNumber?: string;
  omitted?: boolean;
}

export interface ScriptLocationBreakdown {
  key: string;
  name: string;
  locationId?: string;
  scenes: ScriptScene[];
}

export interface ScriptBreakdown {
  characters: Character[];
  scenes: ScriptScene[];
  locations: ScriptLocationBreakdown[];
}

const normalizedName = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();

const characterMatches = (character: Character, name: string): boolean => {
  const key = normalizedName(name);
  return normalizedName(character.canonicalName) === key ||
    character.aliases.some((alias) => normalizedName(alias) === key);
};

/** Combine canonical project characters with cues discovered in the script. */
export const mergeCharacterCatalogs = (
  existing: Character[],
  discovered: Character[],
): Character[] => {
  const merged = existing.map((character) => ({ ...character, aliases: [...character.aliases] }));
  for (const candidate of discovered) {
    const match = merged.find((character) =>
      characterMatches(character, candidate.canonicalName) ||
      candidate.aliases.some((alias) => characterMatches(character, alias))
    );
    if (!match) {
      merged.push({ ...candidate, aliases: [...candidate.aliases] });
      continue;
    }
    const seen = new Set([match.canonicalName, ...match.aliases].map(normalizedName));
    for (const alias of [candidate.canonicalName, ...candidate.aliases]) {
      const key = normalizedName(alias);
      if (key && !seen.has(key)) {
        match.aliases.push(alias);
        seen.add(key);
      }
    }
  }
  return merged;
};

/**
 * Derive scene, character and location breakdowns from current script text.
 * Scene ids reuse their globally unique source line ids; this view is derived
 * and is deliberately not duplicated into persistent project state.
 */
export const deriveScriptBreakdown = (
  lines: ScriptBreakdownLine[],
  existingCharacters: Character[] = [],
  canonicalLocations: Location[] = [],
): ScriptBreakdown => {
  const discovered = buildCharacterCatalog(lines);
  const characters = mergeCharacterCatalogs(existingCharacters, discovered);
  const scenes: ScriptScene[] = [];
  const locationNames = new Map<string, string>();
  let currentScene: ScriptScene | undefined;
  let ordinal = 0;

  for (const line of lines) {
    if (line.type === 'scene') {
      ordinal += 1;
      const parsed = parseSceneHeading(line.text);
      const parsedLocation = parsed.location?.trim();
      const location = parsedLocation
        ? canonicalLocations.find((candidate) =>
            normalizedName(candidate.name) === normalizedName(parsedLocation) ||
            (candidate.aliases || []).some((alias) => normalizedName(alias) === normalizedName(parsedLocation))
          )
        : undefined;
      currentScene = {
        id: line.id,
        sceneNumber: line.sceneNumber || String(ordinal),
        heading: line.text.trim(),
        intExt: parsed.intExt,
        locationId: location?.id,
        subLocation: parsed.subLocation,
        timeOfDay: parsed.timeOfDay,
        characterIds: [],
        breakdownItemIds: [],
      };
      if (line.omitted) currentScene.omitted = true;
      scenes.push(currentScene);
      if (parsedLocation && !line.omitted) locationNames.set(line.id, location?.name || parsedLocation);
      continue;
    }
    if (line.type !== 'character' || !currentScene) continue;
    const cue = normalizeCharacterName(line.text).canonicalName;
    const character = characters.find((candidate) => characterMatches(candidate, cue));
    if (character && !currentScene.characterIds.includes(character.id)) {
      currentScene.characterIds.push(character.id);
    }
  }

  const locationGroups = new Map<string, ScriptLocationBreakdown>();
  for (const scene of scenes) {
    const name = locationNames.get(scene.id);
    if (!name) continue;
    const key = scene.locationId ? `location:${scene.locationId}` : `script:${normalizedName(name)}`;
    const group = locationGroups.get(key);
    if (group) group.scenes.push(scene);
    else locationGroups.set(key, { key, name, locationId: scene.locationId, scenes: [scene] });
  }

  return { characters, scenes, locations: Array.from(locationGroups.values()) };
};

// ---------------------------------------------------------------------------
// Character dialogue lookup (speech bubbles / sides)
// ---------------------------------------------------------------------------

/** One spoken dialogue line attributed to a character, for pickers. */
export interface CharacterDialogueLine {
  /** Source screenplay line id (stable, globally unique). */
  lineId: string;
  /** Scene number of the enclosing slugline, when known. */
  sceneNumber?: string;
  text: string;
}

const cueMatchesCharacter = (cue: string, canonicalName: string, aliases: string[]): boolean => {
  const key = normalizedName(cue);
  if (!key) return false;
  if (normalizedName(canonicalName) === key) return true;
  return aliases.some((alias) => normalizedName(alias) === key);
};

/**
 * Collect all dialogue lines spoken by one character, in script order.
 *
 * A run of dialogue/parenthetical lines belongs to the most recent cue;
 * any other line kind ends the run. Omitted scenes are skipped.
 * Pure and deterministic; empty when the name matches nothing.
 */
export const collectCharacterDialogue = (
  lines: ScriptBreakdownLine[],
  canonicalName: string,
  aliases: string[] = [],
): CharacterDialogueLine[] => {
  if (!normalizedName(canonicalName)) return [];

  const out: CharacterDialogueLine[] = [];
  let sceneNumber: string | undefined;
  let sceneOmitted = false;
  let speaking = false;

  for (const line of lines) {
    const text = (line.text || '').replace(/\s+/g, ' ').trim();
    if (line.type === 'scene') {
      sceneOmitted = !!line.omitted;
      if (!sceneOmitted) sceneNumber = line.sceneNumber;
      speaking = false;
      continue;
    }
    if (sceneOmitted || line.omitted) continue;
    if (!text) continue;
    if (line.type === 'character') {
      speaking = cueMatchesCharacter(
        normalizeCharacterName(line.text).canonicalName,
        canonicalName,
        aliases,
      );
      continue;
    }
    if (!speaking) continue;
    if (line.type === 'parenthetical') continue;
    if (line.type === 'dialogue') {
      out.push({
        lineId: line.id,
        ...(sceneNumber !== undefined ? { sceneNumber } : {}),
        text,
      });
    } else {
      speaking = false;
    }
  }

  return out;
};

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Best match score of `query` against `target` (0 = no match). */
const matchScore = (target: string, query: string): number => {
  const t = target.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/\s+/).some((word) => word.startsWith(q))) return 70;
  const idx = t.indexOf(q);
  if (idx >= 0) return 60 - Math.min(idx, 20) * 0.5;
  // Fuzzy subsequence fallback.
  let searchFrom = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, searchFrom);
    if (found === -1) return 0;
    searchFrom = found + 1;
  }
  return 40;
};

/**
 * Suggest characters matching `query` against canonical names and aliases.
 * Deterministic: higher score first, ties broken by canonicalName then id.
 */
export const suggestCharacters = (
  catalog: Character[],
  query: string,
  limit = 8
): Character[] => {
  const q = query.trim();
  if (!q) return [];
  const scored: Array<{ character: Character; score: number }> = [];
  for (const character of catalog) {
    let best = matchScore(character.canonicalName, q);
    for (const alias of character.aliases) {
      best = Math.max(best, matchScore(alias, q));
    }
    if (best > 0) scored.push({ character, score: best });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      cmp(a.character.canonicalName, b.character.canonicalName) ||
      cmp(a.character.id, b.character.id)
  );
  return scored.slice(0, limit).map((entry) => entry.character);
};

/** A suggestable location record. */
export interface LocationEntry {
  name: string;
  aliases?: string[];
}

/**
 * Suggest locations matching `query` against names and aliases.
 * Same deterministic ordering rules as {@link suggestCharacters}.
 */
export const suggestLocations = (
  locations: LocationEntry[],
  query: string,
  limit = 8
): LocationEntry[] => {
  const q = query.trim();
  if (!q) return [];
  const scored: Array<{ location: LocationEntry; score: number }> = [];
  for (const location of locations) {
    let best = matchScore(location.name, q);
    for (const alias of location.aliases || []) {
      best = Math.max(best, matchScore(alias, q));
    }
    if (best > 0) scored.push({ location, score: best });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      cmp(a.location.name, b.location.name) ||
      cmp(a.location.aliases?.[0] || '', b.location.aliases?.[0] || '')
  );
  return scored.slice(0, limit).map((entry) => entry.location);
};

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

/**
 * Merge a duplicate character into a primary one (pure).
 *
 * Returns a new catalog with the duplicate removed and the primary's alias
 * list extended by the duplicate's aliases plus its canonical name
 * (deduplicated case-insensitively, order preserved). `remap` translates the
 * duplicate id to the primary id and leaves every other id untouched.
 * No-op (identity remap, unchanged catalog) when ids are missing/equal.
 */
export const mergeCharacters = (
  catalog: Character[],
  primaryId: string,
  duplicateId: string
): { catalog: Character[]; remap: (oldId: string) => string } => {
  const primary = catalog.find((c) => c.id === primaryId);
  const duplicate = catalog.find((c) => c.id === duplicateId);
  if (!primary || !duplicate || primaryId === duplicateId) {
    return { catalog, remap: (oldId: string) => oldId };
  }

  const seen = new Set([primary.canonicalName.trim().toLowerCase()]);
  const aliases: string[] = [];
  for (const candidate of [...primary.aliases, ...duplicate.aliases, duplicate.canonicalName]) {
    const trimmed = candidate.trim();
    const key = trimmed.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    aliases.push(trimmed);
  }

  const merged: Character = { ...primary, aliases };
  const next = catalog
    .filter((c) => c.id !== duplicateId)
    .map((c) => (c.id === primaryId ? merged : c));

  return {
    catalog: next,
    remap: (oldId: string) => (oldId === duplicateId ? primaryId : oldId),
  };
};
