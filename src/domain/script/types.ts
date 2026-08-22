/**
 * Optional script-domain entities (plan §4.4, §4.5, §12.1).
 *
 * A screenplay is optional: these entities exist only for productions that
 * use one. No other feature may require them.
 */

export interface Character {
  id: string;
  canonicalName: string;
  aliases: string[];
}

export interface ScriptScene {
  id: string;
  sceneNumber: string;
  heading: string;

  intExt?: 'INT' | 'EXT' | 'INT_EXT' | 'OTHER';
  locationId?: string;
  subLocation?: string;
  timeOfDay?: string;

  /**
   * Scene was cut from a numbered script. The number is kept so paperwork
   * stays aligned; the scene renders as "SCENE n — OMITTED".
   */
  omitted?: boolean;

  synopsis?: string;
  /** Page length in eighths, as used by classic breakdowns. */
  pageLengthEighths?: number;

  characterIds: string[];
  breakdownItemIds: string[];
}

export type BreakdownCategory =
  | 'prop'
  | 'wardrobe'
  | 'vehicle'
  | 'sfx'
  | 'vfx'
  | 'makeup'
  | 'animal'
  | 'stunt'
  | 'sound'
  | 'music'
  | 'extras'
  | 'special_equipment'
  | 'other';

export interface BreakdownItem {
  id: string;
  category: BreakdownCategory;
  name: string;
  notes?: string;
  sourceScriptLineIds?: string[];
}
