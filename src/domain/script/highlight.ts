/**
 * Script highlighter colours.
 *
 * Breakdown sheets have always been colour-coded by department; reading a
 * script for one actor, or one location, is the other half of that: every
 * line a character speaks in their colour, every scene at a location tinted
 * the same. Nothing here is stored except a character's chosen colour.
 */

import type { Character } from './types';

/** Twelve distinguishable hues that read on both white and dark paper. */
export const HIGHLIGHT_PALETTE: readonly string[] = [
  '#e11d48',
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#4f46e5',
  '#0d9488',
  '#ca8a04',
];

export type HighlightMode = 'off' | 'breakdown' | 'characters' | 'locations';

/** A character's colour: their own, or one from the palette by position. */
export const characterColor = (characterId: string, characters: readonly Character[]): string | undefined => {
  const index = characters.findIndex((character) => character.id === characterId);
  if (index === -1) return undefined;
  return characters[index].color ?? HIGHLIGHT_PALETTE[index % HIGHLIGHT_PALETTE.length];
};

/** Stable colour per location key, in order of first appearance. */
export const locationColors = (keys: readonly string[]): Map<string, string> => {
  const colors = new Map<string, string>();
  for (const key of keys) {
    if (!colors.has(key)) colors.set(key, HIGHLIGHT_PALETTE[colors.size % HIGHLIGHT_PALETTE.length]);
  }
  return colors;
};

export interface LineHighlight {
  color: string;
  /** Who or where — shown as the line's tooltip. */
  label: string;
  /** Legend key this line belongs to (character id or location key). */
  key: string;
}

/** A character's name inside an action line. */
export interface NameMention {
  start: number;
  end: number;
  color: string;
  label: string;
  key: string;
}

export interface HighlightLegendEntry {
  key: string;
  label: string;
  color: string;
  /** Lines carrying this entry's colour. */
  lineCount: number;
}

export interface HighlightLine {
  id: string;
  text: string;
  type?: string;
  omitted?: boolean;
}

const norm = (value: string): string => value.replace(/\s+/g, ' ').trim().toUpperCase();

/** The catalog character a cue line names, ignoring (V.O.), (CONT'D) and friends. */
const characterForCue = (cue: string, characters: readonly Character[]): Character | undefined => {
  const name = norm(cue.replace(/\([^()]*\)/g, ''));
  if (!name) return undefined;
  return characters.find((character) =>
    norm(character.canonicalName) === name || character.aliases.some((alias) => norm(alias) === name),
  );
};

/**
 * Which lines to colour, and how, for a highlight mode.
 *
 * - `characters`: a cue and the parentheticals and dialogue under it take the
 *   speaker's colour.
 * - `locations`: every line of a scene takes its location's colour.
 *
 * `focusKey` narrows it to one character id or one location key — reading the
 * script "for" one actor.
 */
export const deriveLineHighlights = (
  lines: readonly HighlightLine[],
  options: {
    mode: HighlightMode;
    characters: readonly Character[];
    /** Location key for each scene heading line id. */
    sceneLocation?: ReadonlyMap<string, { key: string; label: string }>;
    focusKey?: string | null;
  },
): { lines: Map<string, LineHighlight>; mentions: Map<string, NameMention[]>; legend: HighlightLegendEntry[] } => {
  const result = new Map<string, LineHighlight>();
  const mentions = new Map<string, NameMention[]>();
  const legend = new Map<string, HighlightLegendEntry>();
  const note = (lineId: string, highlight: LineHighlight) => {
    const entry = legend.get(highlight.key) ?? { key: highlight.key, label: highlight.label, color: highlight.color, lineCount: 0 };
    entry.lineCount += 1;
    legend.set(highlight.key, entry);
    if (!options.focusKey || options.focusKey === highlight.key) result.set(lineId, highlight);
  };

  if (options.mode === 'characters') {
    // Every name a character goes by, longest first so "MARY ANN" wins over "MARY".
    const names = options.characters
      .flatMap((character) => [character.canonicalName, ...character.aliases]
        .map((name) => name.replace(/\([^()]*\)/g, '').trim())
        .filter((name) => name.length >= 2)
        .map((name) => ({ name, character })))
      .sort((a, b) => b.name.length - a.name.length);
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = names.length
      ? new RegExp(`(?<![\\p{L}\\p{N}])(${names.map((entry) => escape(entry.name)).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
      : null;
    const findMentions = (line: HighlightLine) => {
      if (!pattern) return;
      const found: NameMention[] = [];
      for (const match of line.text.matchAll(pattern)) {
        const entry = names.find((candidate) => candidate.name.toUpperCase() === match[1].toUpperCase());
        if (!entry || match.index === undefined) continue;
        const key = entry.character.id;
        if (options.focusKey && options.focusKey !== key) continue;
        found.push({
          start: match.index,
          end: match.index + match[1].length,
          key,
          label: entry.character.canonicalName,
          color: characterColor(key, options.characters)!,
        });
      }
      if (found.length) mentions.set(line.id, found);
    };
    let speaker: LineHighlight | undefined;
    for (const line of lines) {
      const type = line.type ?? 'action';
      if (type === 'character') {
        const character = characterForCue(line.text, options.characters);
        speaker = character
          ? { key: character.id, label: character.canonicalName, color: characterColor(character.id, options.characters)! }
          : undefined;
        if (speaker) note(line.id, speaker);
        continue;
      }
      if ((type === 'dialogue' || type === 'parenthetical') && speaker) {
        note(line.id, speaker);
        continue;
      }
      speaker = undefined;
      if (type === 'action' && !line.omitted) findMentions(line);
    }
  } else if (options.mode === 'locations' && options.sceneLocation) {
    const keys = [...new Set([...options.sceneLocation.values()].map((entry) => entry.key))];
    const colors = locationColors(keys);
    let current: LineHighlight | undefined;
    for (const line of lines) {
      if (line.type === 'scene') {
        const location = options.sceneLocation.get(line.id);
        current = location && !line.omitted
          ? { key: location.key, label: location.label, color: colors.get(location.key)! }
          : undefined;
      }
      if (current) note(line.id, current);
    }
  }

  return {
    lines: result,
    mentions,
    legend: [...legend.values()].sort((a, b) => b.lineCount - a.lineCount || a.label.localeCompare(b.label)),
  };
};
