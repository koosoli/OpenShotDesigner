/**
 * Scene length in eighths of a page, measured on the laid-out screenplay.
 *
 * A breakdown measures every scene in eighths: the page is cut into eight
 * strips of roughly an inch, and a scene "is" as many strips as it covers.
 * Nothing measured them before — `pageLengthEighths` was only ever filled in
 * by the sample project — so every page total on a real script was a dash.
 *
 * The scenes are measured on the same pages the screenplay prints on
 * (domain/script/pagination): each page a scene touches counts the rows from
 * its first line to its last, (MORE) and (CONT'D) included. A fragment on one
 * page rounds to the nearest eighth but never below one, which is how a
 * breakdown counts a scene that spills two lines onto the next page. A scene
 * heading may carry a manual figure (`pageEighthsOverride`), which wins.
 */
import { SCREENPLAY_ROWS, elementWidth, paginateScreenplay, wrapScreenplayText } from './pagination';
import type { PaginationLine, ScreenplayPaper } from './pagination';

/** Printed lines on a standard (US Letter) screenplay page. */
export const SCREENPLAY_LINES_PER_PAGE = SCREENPLAY_ROWS.letter;

export interface PageCountLine extends PaginationLine {
  pageEighthsOverride?: number;
}

/** How many printed lines a piece of text wraps to at the given width. */
export const wrappedLineCount = (text: string, width: number): number => wrapScreenplayText(text, width).length;

/** Characters per printed line for an element (Courier 12, 10 cpi). */
export { elementWidth };

export interface PageCountOptions {
  paper?: ScreenplayPaper;
  autoContd?: boolean;
  multicam?: boolean;
  sceneContinued?: boolean;
}

/**
 * Eighths for every scene, keyed by the scene heading's line id.
 *
 * Omitted scenes measure 0 — the heading stays on the page but there is
 * nothing to shoot. Lines before the first heading (a cold open with no
 * slugline, a FADE IN:) are laid out but belong to no scene.
 */
export const estimateScenePageEighths = (
  lines: readonly PageCountLine[],
  options: PageCountOptions = {},
): Map<string, number> => {
  const result = new Map<string, number>();
  const sceneOf: Array<string | undefined> = [];
  let sceneId: string | undefined;
  for (const line of lines) {
    if (line.type === 'scene') {
      sceneId = line.id;
      result.set(line.id, 0);
    }
    sceneOf.push(sceneId);
  }

  const { pages, rowsPerPage } = paginateScreenplay(lines, options);
  const total = new Map<string, number>();
  for (const page of pages) {
    const extent = new Map<string, { first: number; last: number }>();
    for (const laid of page.lines) {
      const id = sceneOf[laid.index];
      if (!id) continue;
      const seen = extent.get(id);
      if (!seen) extent.set(id, { first: laid.row, last: laid.row });
      else {
        seen.first = Math.min(seen.first, laid.row);
        seen.last = Math.max(seen.last, laid.row);
      }
    }
    for (const [id, { first, last }] of extent) {
      const count = last - first + 1;
      total.set(id, (total.get(id) ?? 0) + Math.max(1, Math.round((count * 8) / rowsPerPage)));
    }
  }
  for (const [id, eighths] of total) result.set(id, Math.max(1, eighths));

  for (const line of lines) {
    if (line.type !== 'scene') continue;
    if (line.omitted) {
      result.set(line.id, 0);
      continue;
    }
    if (line.pageEighthsOverride !== undefined && Number.isFinite(line.pageEighthsOverride)) {
      result.set(line.id, Math.max(0, Math.round(line.pageEighthsOverride)));
    }
  }
  return result;
};

/**
 * Parse what a person types for a page length: "2 3/8", "3/8", "1", "1.5".
 * Returns eighths, or undefined when the text is not a length.
 */
export const parsePageEighths = (raw: string): number | undefined => {
  const text = raw.trim();
  if (!text) return undefined;
  const mixed = text.match(/^(\d+)\s+(\d)\s*\/\s*8$/);
  if (mixed) return Number(mixed[1]) * 8 + Number(mixed[2]);
  const fraction = text.match(/^(\d+)\s*\/\s*8$/);
  if (fraction) return Number(fraction[1]);
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 8);
  return undefined;
};
