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
  /**
   * The scene heading this strip shoots under — "INT. LIVING ROOM - DAY" —
   * so the sheet can group consecutive strips under one slugline the way a
   * shooting schedule does. Scenes print their own heading; a setup without a
   * screenplay synthesises one from its INT/EXT, location and time of day.
   */
  slugline?: string;
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
    timeOfDay?: string;
    shots?: Array<{ id: string; sceneNumber?: string }>;
  }>;
}

/**
 * "INT. KITCHEN - NIGHT" from a setup's own fields. A setup's time of day is
 * stored as "Day INT" / "Night EXT"; anything else contributes no prefix or
 * time rather than a guessed one (rule 13).
 */
export const synthesiseSlugline = (
  setup: { location?: string; locationId?: string; timeOfDay?: string },
  locationName?: string,
): string | undefined => {
  const place = (locationName || setup.location || '').trim();
  if (!place) return undefined;
  // Setups created from a screenplay carry the whole heading as their
  // location text; that already is the slugline, so it is never re-wrapped
  // into "INT. INT. LIVING ROOM - NIGHT - NIGHT".
  if (/^(INT|EXT|I\/E|INT\.?\/EXT|EST)\b/i.test(place)) return place.toUpperCase();
  const tod = (setup.timeOfDay || '').trim();
  const match = /^(day|night|dawn|dusk|morning|evening)\s+(int|ext)$/i.exec(tod);
  const prefix = match ? `${match[2].toUpperCase()}. ` : '';
  const suffix = match ? ` - ${match[1].toUpperCase()}` : '';
  return `${prefix}${place.toUpperCase()}${suffix}`;
};

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
    slugline: trimmed(scene.heading.replace(/s*#[^#]*#s*$/, ''))?.toUpperCase(),
  });

  const fromSetup = (setup: NonNullable<StripContextSources['setups']>[number]): StripContext => {
    const linked = setup.locationId ? locationName.get(setup.locationId) : undefined;
    return {
      sceneNumber: trimmed(setup.sceneNumber),
      location: linked || trimmed(setup.location),
      slugline: synthesiseSlugline(setup, linked),
    };
  };

  const compact = (context: StripContext): StripContext | undefined => {
    if (!context.sceneNumber && !context.location) return undefined;
    // Never emit an explicit undefined: the sheet spreads this over its entry.
    const out: StripContext = {};
    if (context.sceneNumber) out.sceneNumber = context.sceneNumber;
    if (context.location) out.location = context.location;
    if (context.slugline) out.slugline = context.slugline;
    return out;
  };

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
        // A mixed strip spans headings; it gets no single slugline to sit under.
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
