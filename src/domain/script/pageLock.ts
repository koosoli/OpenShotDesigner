/**
 * Locked script pages and A-pages.
 *
 * Once a shooting script is distributed, its page numbers are frozen: page 12
 * stays page 12 in every later draft, so a call sheet that says "pp. 12–14"
 * is still right. New material that no longer fits on page 12 goes out on
 * page 12A (then 12B…), and a page whose every line was cut stays in the
 * count as OMITTED. This is the page half of locking; scene numbers already
 * lock separately (domain/script/numbering).
 *
 * Pages are laid out with the same 55-line Courier model as the eighths
 * estimate (domain/script/pageCount), so the two always agree.
 */
import { ELEMENT_WIDTH, SCREENPLAY_LINES_PER_PAGE, SPACE_BEFORE, wrappedLineCount } from './pageCount';

export interface PageLine {
  id: string;
  text: string;
  type?: string;
}

/** Locked page per line id, taken when the pages were locked. */
export type PageLock = Record<string, number>;

/** Printed lines one script line takes, with its leading space unless at the top. */
const heightOf = (line: PageLine, atTop: boolean): number => {
  const type = line.type ?? 'action';
  if (type === 'note' || type === 'page-break') return 0;
  const body = wrappedLineCount(line.text, ELEMENT_WIDTH[type] ?? ELEMENT_WIDTH.action);
  return body + (atTop ? 0 : (SPACE_BEFORE[type] ?? 1));
};

/** The page (1-based) each line starts on, laid out fresh. */
export const layoutPages = (lines: readonly PageLine[], linesPerPage = SCREENPLAY_LINES_PER_PAGE): Map<string, number> => {
  const pages = new Map<string, number>();
  let cursor = 0;
  for (const line of lines) {
    if (line.type === 'page-break') {
      const offset = cursor % linesPerPage;
      if (offset !== 0) cursor += linesPerPage - offset;
      pages.set(line.id, Math.floor(cursor / linesPerPage) + 1);
      continue;
    }
    let atTop = cursor % linesPerPage === 0;
    const height = heightOf(line, atTop);
    // A line that would straddle the page end starts on the next page.
    if (!atTop && (cursor % linesPerPage) + height > linesPerPage) {
      cursor += linesPerPage - (cursor % linesPerPage);
      atTop = true;
    }
    pages.set(line.id, Math.floor(cursor / linesPerPage) + 1);
    cursor += heightOf(line, atTop);
  }
  return pages;
};

/** Freeze the current pagination. */
export const lockPages = (lines: readonly PageLine[]): PageLock => Object.fromEntries(layoutPages(lines));

/** 0 -> '', 1 -> 'A', 2 -> 'B' … 26 -> 'Z', 27 -> 'AA'. */
const suffix = (index: number): string => {
  let n = index;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
};

export interface PageLabels {
  /** Page label each line sits on ("12", "12A"). */
  byLine: Map<string, string>;
  /** The line that starts each page, with its label, in order. */
  starts: Array<{ lineId: string; label: string }>;
  /** Locked pages that lost every line, printed as OMITTED. */
  omitted: string[];
  /** How many A-pages the current draft needs. */
  addedPages: number;
}

/**
 * Page labels for the current script. Unlocked: plain numbers from a fresh
 * layout. Locked: each surviving line keeps its locked page; a new line joins
 * the page of the line before it; a locked page that now holds more than a
 * page of text spills onto A, B… pages.
 */
export const pageLabels = (
  lines: readonly PageLine[],
  lock?: PageLock,
  linesPerPage = SCREENPLAY_LINES_PER_PAGE,
): PageLabels => {
  const byLine = new Map<string, string>();
  const starts: Array<{ lineId: string; label: string }> = [];
  if (!lock || Object.keys(lock).length === 0) {
    let previous: number | undefined;
    for (const [id, page] of layoutPages(lines, linesPerPage)) {
      byLine.set(id, String(page));
      if (page !== previous) starts.push({ lineId: id, label: String(page) });
      previous = page;
    }
    return { byLine, starts, omitted: [], addedPages: 0 };
  }

  let basePage = 1;
  let overflow = 0;
  let used = 0;
  let currentLabel = '';
  const seenBase = new Set<number>();
  for (const line of lines) {
    const locked = lock[line.id];
    if (locked !== undefined && locked > basePage) {
      basePage = locked;
      overflow = 0;
      used = 0;
    }
    seenBase.add(basePage);
    let atTop = used === 0;
    if (!atTop && used + heightOf(line, false) > linesPerPage) {
      overflow += 1;
      used = 0;
      atTop = true;
    }
    used += heightOf(line, atTop);
    const label = `${basePage}${suffix(overflow)}`;
    byLine.set(line.id, label);
    if (label !== currentLabel) {
      starts.push({ lineId: line.id, label });
      currentLabel = label;
    }
  }
  const lockedPages = new Set(Object.values(lock));
  const omitted = [...lockedPages].filter((page) => !seenBase.has(page)).sort((a, b) => a - b).map(String);
  const addedPages = starts.filter((start) => /[A-Z]$/.test(start.label)).length;
  return { byLine, starts, omitted, addedPages };
};
