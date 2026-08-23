/**
 * Which scene and which location each schedule strip belongs to (plan §16).
 *
 * A call sheet is read by scene number. "Shot 1/3 — OTS Sarah" tells a 2nd AD
 * nothing about where to send people; "Sc 1 · LIVING ROOM" does. Scene strips
 * carried the number inside their label, setup and shot strips carried it
 * nowhere, and no strip carried its location at all — so the table that the
 * whole unit plans its day from answered neither "what scene is this" nor
 * "where".
 *
 * Resolved here, once, from the project, rather than by each strip kind doing
 * its own lookup inside the sheet derivation: a shot's scene is its setup's
 * scene, a setup's location is a canonical `Location` when linked and its own
 * free text otherwise, and a scene's location is the slugline when nothing is
 * linked. Three kinds, one set of rules (rule 37).
 */

import type { ScheduleBlock } from '../scheduling';
import type { ScriptScene } from '../script/types';
import { parseSceneHeading } from '../script/logic';

export interface StripContext {
  /** "1", "2A" — as printed on the slugline. */
  sceneNumber?: string;
  /** A location name, canonical when one is linked, the set name otherwise. */
  location?: string;
}

/** The slices a strip-context lookup needs; keeps it pure and testable. */
export interface StripContextSources {
  scriptScenes?: ScriptScene[];
  locations?: Array<{ id: string; name: string }>;
  setups?: Array<{
    id: string;
    sceneNumber?: string;
    location?: string;
    locationId?: string;
    shots?: Array<{ id: string; sceneNumber?: string }>;
  }>;
}

const trimmed = (value: string | undefined): string | undefined => {
  const text = value?.trim();
  return text || undefined;
};

/**
 * Build the resolver once per sheet. Returns `undefined` for strips that have
 * no scene or place of their own — a lunch break, a company move — so the
 * sheet prints nothing rather than inventing a scene for a banner.
 */
export const buildStripContextResolver = (
  sources: StripContextSources,
): ((block: ScheduleBlock) => StripContext | undefined) => {
  const locationName = new Map((sources.locations ?? []).map((l) => [l.id, l.name] as const));
  const sceneById = new Map((sources.scriptScenes ?? []).map((s) => [s.id, s] as const));
  const setupById = new Map((sources.setups ?? []).map((s) => [s.id, s] as const));
  const setupOfShot = new Map<string, NonNullable<StripContextSources['setups']>[number]>();
  for (const setup of sources.setups ?? []) {
    for (const shot of setup.shots ?? []) setupOfShot.set(shot.id, setup);
  }

  const fromScene = (scene: ScriptScene): StripContext => ({
    sceneNumber: trimmed(scene.sceneNumber),
    location:
      (scene.locationId && locationName.get(scene.locationId)) ||
      trimmed(parseSceneHeading(scene.heading).location),
  });

  const fromSetup = (setup: NonNullable<StripContextSources['setups']>[number]): StripContext => ({
    sceneNumber: trimmed(setup.sceneNumber),
    location: (setup.locationId && locationName.get(setup.locationId)) || trimmed(setup.location),
  });

  const compact = (context: StripContext): StripContext | undefined =>
    context.sceneNumber || context.location ? context : undefined;

  return (block) => {
    switch (block.kind) {
      case 'scene': {
        const scene = sceneById.get(block.scriptSceneId);
        return scene ? compact(fromScene(scene)) : undefined;
      }
      case 'setup': {
        const setup = setupById.get(block.setupId);
        return setup ? compact(fromSetup(setup)) : undefined;
      }
      case 'shots': {
        // Every shot on a strip belongs to a setup; when they all share one,
        // that is the strip's context. Mixed strips name the scenes they span
        // rather than picking one and misleading about the rest.
        const owners = [...new Set(block.shotIds.map((id) => setupOfShot.get(id)).filter(Boolean))] as Array<
          NonNullable<StripContextSources['setups']>[number]
        >;
        if (owners.length === 0) return undefined;
        if (owners.length === 1) return compact(fromSetup(owners[0]));
        const numbers = [...new Set(owners.map((o) => trimmed(o.sceneNumber)).filter(Boolean))] as string[];
        const places = [...new Set(owners.map((o) => fromSetup(o).location).filter(Boolean))] as string[];
        return compact({
          sceneNumber: numbers.length ? numbers.join(', ') : undefined,
          location: places.length ? places.join(' / ') : undefined,
        });
      }
      default:
        return undefined;
    }
  };
};
