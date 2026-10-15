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
 * Pages come from the screenplay layout (domain/script/pagination), the same
 * pages the eighths are measured on and the PDF prints.
 */
import { paginateScreenplay } from './pagination';
import type { PaginationLine, PaginationOptions } from './pagination';

export type PageLine = PaginationLine;

/** Locked page per line id, taken when the pages were locked. */
export type PageLock = Record<string, number>;

export type PageLayoutOptions = Pick<PaginationOptions, 'paper' | 'autoContd' | 'multicam' | 'sceneContinued'>;

/** The page (1-based) each line starts on, laid out fresh. */
export const layoutPages = (lines: readonly PageLine[], options: PageLayoutOptions = {}): Map<string, number> => {
  const { pageOfLine } = paginateScreenplay(lines, options);
  return new Map(lines.map((line, index) => [line.id, (pageOfLine[index] ?? 0) + 1] as const));
};

/** Freeze the current pagination. */
export const lockPages = (lines: readonly PageLine[], options: PageLayoutOptions = {}): PageLock =>
  Object.fromEntries(layoutPages(lines, options));

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
 * layout. Locked: a passage locked to a later page starts that page; a new
 * line joins the page of the line before it; a locked page that now holds
 * more than a page of text spills onto A, B… pages.
 */
export const pageLabels = (
  lines: readonly PageLine[],
  lock?: PageLock,
  options: PageLayoutOptions = {},
): PageLabels => {
  const locked = !!lock && Object.keys(lock).length > 0;
  const { pages, pageOfLine } = paginateScreenplay(lines, { ...options, ...(locked ? { lock } : {}) });
  const byLine = new Map<string, string>();
  const starts: Array<{ lineId: string; label: string }> = [];
  let previous = -1;
  lines.forEach((line, index) => {
    const page = pageOfLine[index] ?? 0;
    const label = pages[page]?.label ?? String(page + 1);
    byLine.set(line.id, label);
    if (page !== previous) {
      starts.push({ lineId: line.id, label });
      previous = page;
    }
  });
  if (!locked) return { byLine, starts, omitted: [], addedPages: 0 };
  const seenBase = new Set(pages.map((page) => Number.parseInt(page.label, 10)).filter(Number.isFinite));
  const omitted = [...new Set(Object.values(lock))]
    .filter((page) => !seenBase.has(page))
    .sort((a, b) => a - b)
    .map(String);
  const addedPages = pages.filter((page) => /[A-Z]$/.test(page.label)).length;
  return { byLine, starts, omitted, addedPages };
};
