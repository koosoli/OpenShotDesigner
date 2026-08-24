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

/**
 * Where on one script line a tagged element's words sit.
 *
 * Offsets are optional and mean "the whole line" when absent, which is what
 * every item tagged before ranges existed carries. A multi-line tag is stored
 * flattened — one range per line it touches — rather than as a single
 * start/end pair like `ScriptMark`, because the page marks a tag by tinting
 * words line by line and a flat list is what that lookup needs.
 */
export interface BreakdownSourceRange {
  lineId: string;
  startOffset?: number;
  endOffset?: number;
}

export interface BreakdownItem {
  id: string;
  category: BreakdownCategory;
  name: string;
  notes?: string;
  /**
   * The lines this element was tagged from. This stays the authoritative list —
   * every report resolves scenes through it — and `sourceRanges` only refines
   * where on those lines the words are. The tagging operations keep the two in
   * step so a range can never point at a line the item does not claim.
   */
  sourceScriptLineIds?: string[];
  sourceRanges?: BreakdownSourceRange[];
}

/**
 * A selection on the script page, as both the panel and the lined page read it.
 *
 * Two kinds of selection reach the page and they are one type on purpose:
 * clicking lines selects whole lines, dragging across text selects part of the
 * first and last. `partial` says which, and `startOffset`/`endOffset` mean
 * nothing unless it is true.
 *
 * It was previously declared on the lined page as `{ from, to }` while the
 * panel passed four more fields, so the page read them back through
 * `(selection as any).partial`. That compiles after any of them is renamed:
 * `partial` silently becomes `undefined`, the page stops drawing a partial
 * highlight, and the selection just looks like it did not take.
 */
export interface ScriptSelectionRange {
  /** Index of the first line the selection touches. */
  from: number;
  /** Index of the last line the selection touches, inclusive. */
  to: number;
  /** True when the selection covers part of a line rather than whole lines. */
  partial: boolean;
  /** Character offset into `from`'s text. Only meaningful when `partial`. */
  startOffset?: number;
  /** Character offset into `to`'s text. Only meaningful when `partial`. */
  endOffset?: number;
  /** The selected text itself, when the selection came from a text drag. */
  text?: string;
}
