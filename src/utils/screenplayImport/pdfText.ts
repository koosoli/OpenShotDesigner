/**
 * A screenplay's text from where its words sit on PDF pages.
 *
 * A PDF knows nothing about scene headings or dialogue — only that some words
 * start 2.2" in and others at the margin. That is enough: a screenplay's
 * elements are its columns. This rebuilds the printed lines, measures each
 * one's indent in Courier columns from the action margin, joins the lines a
 * paragraph wrapped onto, and drops what the page added — page numbers,
 * revision headers and asterisks, (MORE) and the NAME (CONT'D) that repeats a
 * speech's cue on the next page, CONTINUED. The result is indented plain text
 * for the screenplay text importer, which reads elements by column. A first
 * page with no scene on it is the cover, returned as its fields.
 *
 * Pure: the PDF reading itself lives in ./pdf.ts.
 */
import { titlePageFromLines } from '../../domain/script/fdxDocument';
import type { ScreenplayTitlePage } from '../../domain/script';

export interface PdfTextItem {
  str: string;
  /** Left edge, points from the page's left. */
  x: number;
  /** Baseline, points from the page's bottom (PDF space). */
  y: number;
  width: number;
}

export interface PdfPageText {
  width: number;
  height: number;
  items: PdfTextItem[];
}

interface Line {
  page: number;
  y: number;
  x0: number;
  x1: number;
  items: PdfTextItem[];
}

const SCENE_START = /^\s*(\d+[A-Z]{0,2}\.?\s+)?(INT|EXT|EST|I\/E)[.\s/]/i;
const SCENE_NUMBER = /^\d{1,4}[A-Z]{0,3}\.?$/;
const MORE = /^\(\s*MORE\s*\)$/i;
const CONTINUED = /^\(?\s*CONTINUED\s*\)?:?$|^CONT['’]?D:?$/i;
const PAGE_NUMBER = /^\d{1,4}[A-Z]{0,3}\.?$/;

const median = (values: number[], fallback: number): number => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : fallback;
};

/** One Courier column, from the words themselves (fonts and sizes vary). */
const columnWidth = (pages: readonly PdfPageText[]): number =>
  median(
    pages.flatMap((page) => page.items.filter((item) => item.str.trim().length >= 3 && item.width > 0).map((item) => item.width / item.str.length)),
    7.2,
  );

const linesOf = (page: PdfPageText, index: number): Line[] => {
  const items = page.items.filter((item) => item.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of items) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= 2.5) {
      last.items.push(item);
      last.x0 = Math.min(last.x0, item.x);
      last.x1 = Math.max(last.x1, item.x + item.width);
    } else {
      lines.push({ page: index, y: item.y, x0: item.x, x1: item.x + item.width, items: [item] });
    }
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
};

/** The words of a line, with the gaps between them kept as spaces. */
const joinItems = (items: readonly PdfTextItem[], column: number): string => {
  let out = '';
  let end: number | undefined;
  for (const item of items) {
    if (end !== undefined) {
      const gap = item.x - end;
      if (gap > column * 0.3 && !out.endsWith(' ') && !item.str.startsWith(' ')) out += ' '.repeat(Math.max(1, Math.round(gap / column)));
    }
    out += item.str;
    end = item.x + item.width;
  }
  return out.replace(/\s+$/, '');
};

export interface PdfScreenplay {
  /** Indented screenplay text for the text importer. */
  text: string;
  titlePage?: ScreenplayTitlePage;
}

/** Rebuild a screenplay from its PDF pages. */
export const screenplayFromPdfPages = (pages: readonly PdfPageText[]): PdfScreenplay => {
  const column = columnWidth(pages);
  const all = pages.map((page, index) => {
    // Page furniture: running headers (page number, revision label) in the
    // top margin and footers in the bottom one.
    const top = page.height - 0.8 * 72;
    // Body text ends at the 1" margin; footers sit below it (0.75" up at most).
    const bottom = 0.85 * 72;
    return linesOf(page, index).filter((line) => line.y < top && line.y > bottom);
  });

  // A first page without a scene on it, in front of more pages, is the cover.
  let titlePage: ScreenplayTitlePage | undefined;
  let bodyPages = all;
  if (all.length > 1 && all[0].length > 0 && all[0].length <= 30 && !all[0].some((line) => SCENE_START.test(joinItems(line.items, column)))) {
    const page = pages[0];
    titlePage = titlePageFromLines(all[0].map((line) => {
      const centre = (line.x0 + line.x1) / 2;
      const align = Math.abs(centre - page.width / 2) < 0.6 * 72 ? 'center' as const : line.x1 > page.width - 1.6 * 72 && line.x0 > page.width / 2 - 36 ? 'right' as const : 'left' as const;
      return { align, text: joinItems(line.items, column).replace(/\s+/g, ' ') };
    }));
    bodyPages = all.slice(1);
  }
  const lines = bodyPages.flat();
  if (lines.length === 0) return { text: '', ...(titlePage ? { titlePage } : {}) };

  // The action margin: the leftmost column a good share of lines start at
  // (scene numbers hang further left, so a lone outlier never sets it).
  const starts = new Map<number, number>();
  for (const line of lines) {
    const first = line.items.find((item) => !SCENE_NUMBER.test(item.str.trim())) ?? line.items[0];
    const bin = Math.round(first.x / column);
    starts.set(bin, (starts.get(bin) ?? 0) + 1);
  }
  const threshold = Math.max(2, lines.length * 0.05);
  const marginBin = Math.min(...[...starts].filter(([, count]) => count >= threshold).map(([bin]) => bin), ...(starts.size ? [] : [0]));
  const margin = (Number.isFinite(marginBin) ? marginBin : Math.min(...starts.keys())) * column;

  // Typical line spacing, to tell a wrapped line from a new paragraph.
  const spacings: number[] = [];
  for (let k = 1; k < lines.length; k += 1) {
    if (lines[k].page === lines[k - 1].page) spacings.push(lines[k - 1].y - lines[k].y);
  }
  // The tight end of the spacings: single-spaced lines, not the blank lines between paragraphs.
  const sortedSpacings = spacings.filter((value) => value > 2).sort((a, b) => a - b);
  const spacing = sortedSpacings.length ? sortedSpacings[Math.floor(sortedSpacings.length * 0.2)] : 12;

  interface Row { indent: number; text: string; gapBefore: boolean; page: number }
  const rows: Row[] = [];
  let pendingMore = false;
  let lastCue = '';
  for (let k = 0; k < lines.length; k += 1) {
    const line = lines[k];
    const previous = lines[k - 1];
    const newPage = !previous || previous.page !== line.page;
    let items = [...line.items];
    // Revision asterisks in the right margin.
    items = items.filter((item) => !(item.str.trim() === '*' && item.x > margin + 58 * column));
    if (items.length === 0) continue;

    // Dual dialogue: two cues side by side open a block whose lines split
    // into a left and a right column until the next blank line.
    const split = margin + 30.5 * column;
    const isCue = (text: string) => /[A-Z]/.test(text) && text.replace(/\([^)]*\)/g, '').trim() === text.replace(/\([^)]*\)/g, '').trim().toUpperCase() && text.length <= 40;
    const leftCue = joinItems(items.filter((item) => item.x < split), column).trim();
    const rightCue = joinItems(items.filter((item) => item.x >= split), column).trim();
    const leftAt = items[0].x;
    if (leftCue && rightCue && isCue(leftCue) && isCue(rightCue) && leftAt > margin + 4 * column && leftAt < margin + 20 * column) {
      const left: string[] = [];
      const right: string[] = [];
      let end = k + 1;
      while (end < lines.length && lines[end].page === line.page && lines[end - 1].y - lines[end].y <= spacing * 1.5) {
        const row = lines[end].items;
        const l = joinItems(row.filter((item) => item.x < split), column).trim();
        const r = joinItems(row.filter((item) => item.x >= split), column).trim();
        if (l) left.push(l);
        if (r) right.push(r);
        end += 1;
      }
      // A column's rows as its speech: parentheticals on their own, the rest joined.
      const speech = (rowsOfColumn: string[]) => {
        const out: Array<{ indent: number; text: string }> = [];
        for (const text of rowsOfColumn) {
          const previousRow = out[out.length - 1];
          const inParen = previousRow?.indent === 16 && !previousRow.text.endsWith(')');
          if (inParen || (previousRow && previousRow.indent === 10 && !text.startsWith('('))) previousRow!.text = `${previousRow!.text} ${text}`;
          else out.push({ indent: text.startsWith('(') ? 16 : 10, text });
        }
        return out;
      };
      const gap = previous && !newPage ? previous.y - line.y > spacing * 1.5 : rows.length > 0;
      rows.push({ indent: 22, text: leftCue, gapBefore: gap, page: line.page });
      for (const part of speech(left)) rows.push({ ...part, gapBefore: false, page: line.page });
      rows.push({ indent: 22, text: `${rightCue} ^`, gapBefore: false, page: line.page });
      for (const part of speech(right)) rows.push({ ...part, gapBefore: false, page: line.page });
      lastCue = '';
      pendingMore = false;
      k = end - 1;
      continue;
    }
    // Scene numbers in the margins.
    let leading = '';
    let trailing = '';
    if (items.length > 1 && SCENE_NUMBER.test(items[0].str.trim()) && items[0].x < margin - column * 0.5) {
      leading = items[0].str.trim().replace(/\.$/, '');
      items = items.slice(1);
    }
    const last = items[items.length - 1];
    if (items.length > 1 && SCENE_NUMBER.test(last.str.trim()) && last.x > margin + 55 * column) {
      trailing = last.str.trim().replace(/\.$/, '');
      items = items.slice(0, -1);
    }
    const text = joinItems(items, column).trim();
    if (!text) continue;
    if (!leading && !trailing && PAGE_NUMBER.test(text) && line.x0 > margin + 40 * column) continue;
    if (CONTINUED.test(text)) continue;
    if (MORE.test(text)) {
      pendingMore = true;
      continue;
    }
    const indent = Math.max(0, Math.round((items[0].x - margin) / column));
    // The cue repeated at the top of the next page after (MORE): the speech
    // simply carries on.
    if (newPage && pendingMore && /\(\s*CONT['’]?D\s*\)/i.test(text) && text.replace(/\s*\(.*$/, '').trim() === lastCue) {
      pendingMore = false;
      continue;
    }
    if (!newPage) pendingMore = false;
    const gap = previous && !newPage ? previous.y - line.y > spacing * 1.5 : !pendingMore && rows.length > 0;
    const body = leading ? `${leading}   ${text}${trailing ? `   ${trailing}` : ''}` : trailing ? `${text}   ${trailing}` : text;
    const cueName = text.replace(/\s*\(.*$/, '').trim();
    if (indent >= 15 && indent <= 30 && cueName && /^[^a-z]*$/.test(text) && /[A-Z]/.test(text)) lastCue = cueName;
    rows.push({ indent, text: body, gapBefore: gap, page: line.page });
    if (newPage) pendingMore = false;
  }

  // Join the lines a paragraph wrapped onto: same column, no gap between.
  const out: string[] = [];
  let current: Row | undefined;
  const flush = () => {
    if (current) out.push(`${' '.repeat(current.indent)}${current.text}`);
    current = undefined;
  };
  for (const row of rows) {
    const continues = current && !row.gapBefore && Math.abs(row.indent - current.indent) <= 1 && !SCENE_START.test(row.text) && !SCENE_START.test(current.text);
    if (continues && current) {
      current.text = `${current.text} ${row.text}`;
      continue;
    }
    flush();
    if (row.gapBefore && out.length > 0) out.push('');
    current = { ...row };
  }
  flush();
  return { text: `${out.join('\n')}\n`, ...(titlePage ? { titlePage } : {}) };
};
