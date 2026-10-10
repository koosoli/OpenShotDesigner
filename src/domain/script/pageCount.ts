/**
 * Scene length in eighths of a page, estimated from the screenplay text.
 *
 * A breakdown measures every scene in eighths: the page is cut into eight
 * strips of roughly an inch, and a scene "is" as many strips as it covers.
 * Nothing measured them before — `pageLengthEighths` was only ever filled in
 * by the sample project — so every page total on a real script was a dash.
 *
 * The estimate lays the script out the way a standard 12pt Courier page sets
 * it (55 lines a page, ten characters to the inch, the usual element widths
 * and spacing), walks the scenes through those pages and counts how much of
 * each page every scene takes. A fragment on one page rounds to the nearest
 * eighth but never below one, which is how a breakdown counts a scene that
 * spills two lines onto the next page. A scene heading may carry a manual
 * figure (`pageEighthsOverride`), which wins.
 */

/** Printed lines on a standard screenplay page. */
export const SCREENPLAY_LINES_PER_PAGE = 55;

export interface PageCountLine {
  id: string;
  text: string;
  type?: string;
  omitted?: boolean;
  pageEighthsOverride?: number;
}

/** Characters per printed line for each element (Courier 12, 10 cpi). */
export const ELEMENT_WIDTH: Record<string, number> = {
  scene: 60,
  action: 60,
  shot: 60,
  character: 38,
  parenthetical: 25,
  dialogue: 35,
  transition: 20,
};

/** Blank lines printed above each element. */
export const SPACE_BEFORE: Record<string, number> = {
  scene: 2,
  action: 1,
  shot: 1,
  character: 1,
  transition: 1,
  parenthetical: 0,
  dialogue: 0,
};

/** How many printed lines a piece of text wraps to at the given width. */
export const wrappedLineCount = (text: string, width: number): number => {
  const paragraphs = text.split('\n');
  let total = 0;
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      total += 1;
      continue;
    }
    let lines = 1;
    let used = 0;
    for (const word of words) {
      // A word longer than the column breaks across lines on its own.
      if (word.length > width) {
        if (used > 0) lines += 1;
        lines += Math.ceil(word.length / width) - 1;
        used = word.length % width || width;
        continue;
      }
      const needed = used === 0 ? word.length : used + 1 + word.length;
      if (needed > width) {
        lines += 1;
        used = word.length;
      } else {
        used = needed;
      }
    }
    total += lines;
  }
  return total;
};

/**
 * Eighths for every scene, keyed by the scene heading's line id.
 *
 * Omitted scenes measure 0 — the heading stays on the page but there is
 * nothing to shoot. Lines before the first heading (a cold open with no
 * slugline, a FADE IN:) are laid out but belong to no scene.
 */
export const estimateScenePageEighths = (
  lines: readonly PageCountLine[],
  linesPerPage = SCREENPLAY_LINES_PER_PAGE,
): Map<string, number> => {
  const perPage = new Map<string, Map<number, number>>();
  const result = new Map<string, number>();
  let cursor = 0;
  let sceneId: string | undefined;
  let sceneOmitted = false;

  const add = (page: number, count: number) => {
    if (!sceneId || sceneOmitted || count <= 0) return;
    const pages = perPage.get(sceneId) ?? new Map<number, number>();
    pages.set(page, (pages.get(page) ?? 0) + count);
    perPage.set(sceneId, pages);
  };

  for (const line of lines) {
    const type = line.type ?? 'action';
    if (type === 'page-break') {
      const offset = cursor % linesPerPage;
      if (offset !== 0) cursor += linesPerPage - offset;
      continue;
    }
    if (type === 'note') continue;
    if (type === 'scene') {
      sceneId = line.id;
      sceneOmitted = !!line.omitted;
      result.set(line.id, 0);
    }
    const width = ELEMENT_WIDTH[type] ?? ELEMENT_WIDTH.action;
    const body = wrappedLineCount(line.text, width);
    // Leading space is dropped at the top of a page.
    const before = cursor % linesPerPage === 0 ? 0 : (SPACE_BEFORE[type] ?? 1);
    // Blank lines above an element are page space the scene uses — except
    // the gap above a new heading, which never spills past the page end.
    const gap = Math.min(before, linesPerPage - (cursor % linesPerPage));
    if (type !== 'scene') add(Math.floor(cursor / linesPerPage), gap);
    cursor += gap;
    let remaining = body;
    while (remaining > 0) {
      const page = Math.floor(cursor / linesPerPage);
      const room = linesPerPage - (cursor % linesPerPage);
      const take = Math.min(room, remaining);
      add(page, take);
      cursor += take;
      remaining -= take;
    }
  }

  for (const [id, pages] of perPage) {
    let eighths = 0;
    for (const count of pages.values()) {
      eighths += Math.max(1, Math.round((count * 8) / linesPerPage));
    }
    result.set(id, Math.max(1, eighths));
  }

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
