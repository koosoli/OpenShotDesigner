/**
 * Script sides (plan §12): the pages handed to cast and crew for a shooting
 * day — only the scenes being shot, in shooting order, optionally filtered
 * to the scenes a character appears in. Pure derivation over script lines.
 */

import { normalizeCharacterName } from './logic';
import { omittedSceneLabel } from './omission';

export interface SidesLine {
  id: string;
  type?: string;
  text: string;
  sceneNumber?: string;
  isSceneHeading?: boolean;
  omitted?: boolean;
}

export interface SidesScene {
  sceneId: string;
  sceneNumber: string;
  heading: string;
  omitted: boolean;
  lines: SidesLine[];
  /** Canonical character names with dialogue in this scene. */
  characters: string[];
}

export interface ScriptSides {
  scenes: SidesScene[];
  /** Scene ids that were requested but do not exist in the script. */
  missingSceneIds: string[];
}

export interface SidesOptions {
  /** Scenes to include, in the order given (shooting order). Omit for every scene. */
  sceneIds?: readonly string[];
  /** Keep only scenes where this character has a cue. */
  character?: string;
  /** Drop omitted scenes entirely instead of printing their OMITTED slug. */
  skipOmitted?: boolean;
}

/** Split script lines into scene chunks keyed by heading line id. */
export const splitScenes = <T extends SidesLine>(lines: readonly T[]): Array<{ id: string; lines: T[] }> => {
  const out: Array<{ id: string; lines: T[] }> = [];
  let current: { id: string; lines: T[] } | null = null;
  let ordinal = 0;
  for (const line of lines) {
    if (line.type === 'scene') {
      ordinal += 1;
      current = { id: line.id, lines: [line] };
      out.push(current);
      continue;
    }
    if (!current) {
      // Lines before the first slugline (title cards, notes) form a pseudo-scene.
      current = { id: `preamble-${ordinal}`, lines: [] };
      out.push(current);
    }
    current.lines.push(line);
  }
  return out;
};

const charactersIn = (lines: readonly SidesLine[]): string[] => {
  const names = new Set<string>();
  for (const line of lines) {
    if (line.type !== 'character') continue;
    const name = normalizeCharacterName(line.text).canonicalName;
    if (name) names.add(name);
  }
  return [...names];
};

export const buildScriptSides = (lines: readonly SidesLine[], options: SidesOptions = {}): ScriptSides => {
  const chunks = splitScenes(lines).filter((chunk) => chunk.lines[0]?.type === 'scene');
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk] as const));
  const wanted = options.character ? normalizeCharacterName(options.character).canonicalName : undefined;

  const order = options.sceneIds ? [...options.sceneIds] : chunks.map((chunk) => chunk.id);
  const missingSceneIds: string[] = [];
  const scenes: SidesScene[] = [];
  let ordinal = 0;
  const numbers = new Map<string, string>();
  chunks.forEach((chunk) => {
    ordinal += 1;
    numbers.set(chunk.id, chunk.lines[0].sceneNumber || String(ordinal));
  });

  for (const sceneId of order) {
    const chunk = byId.get(sceneId);
    if (!chunk) {
      missingSceneIds.push(sceneId);
      continue;
    }
    const heading = chunk.lines[0];
    const omitted = heading.omitted === true;
    if (omitted && options.skipOmitted) continue;
    const characters = charactersIn(chunk.lines);
    if (wanted && !characters.includes(wanted)) continue;
    scenes.push({
      sceneId,
      sceneNumber: numbers.get(sceneId) ?? '',
      heading: omitted ? omittedSceneLabel(numbers.get(sceneId)) : heading.text,
      omitted,
      lines: omitted ? [heading] : chunk.lines,
      characters,
    });
  }
  return { scenes, missingSceneIds };
};

/** Every character with dialogue anywhere in the script, alphabetically — for the sides filter. */
export const sidesCharacterOptions = (lines: readonly SidesLine[]): string[] =>
  charactersIn(lines).sort((a, b) => a.localeCompare(b));
