/**
 * One script breakdown per script, shared.
 *
 * Several panels derive the same breakdown from the same project data — the
 * script page, its reports, contacts, the actor inspector, the print studio.
 * Each used to run `deriveScriptBreakdown` on its own. This remembers the last
 * result per script-lines array (by identity, which only changes when the
 * script does), so they all share one derivation. Results are read-only.
 */
import type { Location } from '../locations';
import type { Character } from './types';
import { deriveScriptBreakdown } from './logic';
import type { ScriptBreakdown, ScriptBreakdownLine } from './logic';

const NONE: readonly never[] = [];

interface Entry {
  characters: readonly Character[];
  locations: readonly Location[];
  result: ScriptBreakdown;
}

const cache = new WeakMap<readonly ScriptBreakdownLine[], Entry>();

export const cachedScriptBreakdown = (
  lines: readonly ScriptBreakdownLine[],
  characters?: readonly Character[],
  locations?: readonly Location[],
): ScriptBreakdown => {
  const chars = characters ?? NONE;
  const locs = locations ?? NONE;
  const hit = cache.get(lines);
  if (hit && hit.characters === chars && hit.locations === locs) return hit.result;
  const result = deriveScriptBreakdown([...lines], [...chars], [...locs]);
  cache.set(lines, { characters: chars, locations: locs, result });
  return result;
};
