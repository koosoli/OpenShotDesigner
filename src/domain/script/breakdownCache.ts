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
import { screenplayLayoutOptions } from './pagination';
import type { ScreenplayLayout } from './pagination';

const NONE: readonly never[] = [];

interface Entry {
  characters: readonly Character[];
  locations: readonly Location[];
  layoutKey: string;
  result: ScriptBreakdown;
}

const cache = new WeakMap<readonly ScriptBreakdownLine[], Entry>();

export const cachedScriptBreakdown = (
  lines: readonly ScriptBreakdownLine[],
  characters?: readonly Character[],
  locations?: readonly Location[],
  layout?: ScreenplayLayout,
): ScriptBreakdown => {
  const chars = characters ?? NONE;
  const locs = locations ?? NONE;
  const options = screenplayLayoutOptions(layout);
  const layoutKey = `${options.paper}:${options.autoContd}:${options.multicam}:${options.sceneContinued}`;
  const hit = cache.get(lines);
  if (hit && hit.characters === chars && hit.locations === locs && hit.layoutKey === layoutKey) return hit.result;
  const result = deriveScriptBreakdown([...lines], [...chars], [...locs], options);
  cache.set(lines, { characters: chars, locations: locs, layoutKey, result });
  return result;
};
