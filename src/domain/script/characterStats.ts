/**
 * How much each character has to say: speeches, words of dialogue, the page
 * they first speak on, and the pages of the scenes they are in.
 *
 * Inspired by ScriptCraft's character report. These are the figures casting
 * and deal memos ask for — a day player with three lines on page 80 and a
 * lead in 40 pages of scenes are different deals — and the page is the
 * printed label, so a locked script says "12A" rather than a count.
 */
import type { Character } from './types';
import type { ScriptScene } from './types';
import { normalizeCharacterName } from './logic';

export interface CharacterScriptStats {
  speeches: number;
  words: number;
  /** Printed page label of the first cue ("12", "12A"). */
  firstPage?: string;
  /** Eighths of the (not omitted) scenes the character is in. */
  eighths: number;
}

const key = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase();

export const characterScriptStats = (
  lines: ReadonlyArray<{ id: string; type?: string; text: string; omitted?: boolean }>,
  characters: readonly Character[],
  scenes: readonly ScriptScene[],
  pageOfLine: ReadonlyMap<string, string>,
): Map<string, CharacterScriptStats> => {
  const byName = new Map<string, string>();
  for (const character of characters) {
    byName.set(key(character.canonicalName), character.id);
    for (const alias of character.aliases) byName.set(key(alias), character.id);
  }
  const stats = new Map<string, CharacterScriptStats>();
  const statsOf = (id: string) => {
    let entry = stats.get(id);
    if (!entry) {
      entry = { speeches: 0, words: 0, eighths: 0 };
      stats.set(id, entry);
    }
    return entry;
  };

  let speaker: string | undefined;
  let omittedScene = false;
  for (const line of lines) {
    if (line.type === 'scene') {
      omittedScene = !!line.omitted;
      speaker = undefined;
      continue;
    }
    if (omittedScene) continue;
    if (line.type === 'character') {
      speaker = byName.get(key(normalizeCharacterName(line.text).canonicalName));
      if (!speaker) continue;
      const entry = statsOf(speaker);
      entry.speeches += 1;
      if (entry.firstPage === undefined) entry.firstPage = pageOfLine.get(line.id);
      continue;
    }
    if (line.type === 'dialogue' && speaker) {
      statsOf(speaker).words += line.text.split(/\s+/).filter(Boolean).length;
      continue;
    }
    if (line.type !== 'parenthetical') speaker = undefined;
  }

  for (const scene of scenes) {
    if (scene.omitted) continue;
    for (const id of new Set(scene.characterIds)) statsOf(id).eighths += scene.pageLengthEighths ?? 0;
  }
  return stats;
};
