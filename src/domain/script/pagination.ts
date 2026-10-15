/**
 * Screenplay pagination — the industry page, laid out the way Final Draft
 * prints it.
 *
 * Every page figure in the app comes from here: the eighths on the breakdown
 * and the stripboard, the page markers on the lined script, locked pages and
 * A-pages, and the printed screenplay itself. Before this existed each of
 * those estimated pages on its own (a 55-line count here, "break between
 * scenes when 40% of the page is left" there), so the page a call sheet named
 * was not the page the writer's printout had.
 *
 * The page: US Letter (54 body lines) or A4 (58), 12-point Courier at ten
 * characters and six lines to the inch, 1.5" left margin. Columns below are
 * counted from that margin.
 *
 * Page-break rules (ported from ScriptCraft's layout crate, MIT/Apache-2.0,
 * https://github.com/NoJuanNobody/scriptcraft):
 * - A scene heading (or shot) is never the last thing on a page: it moves on
 *   unless the first lines of what follows fit with it.
 * - A character cue is never separated from its first line of dialogue.
 * - Dialogue that does not fit splits between lines — preferably at a
 *   sentence end, never right after a parenthetical, two lines each side
 *   when possible — with (MORE) under the first part and the cue repeated as
 *   NAME (CONT'D) at the top of the next page.
 * - Action splits only with two or more lines each side; otherwise it moves
 *   whole.
 * - Dual dialogue sits side by side and splits both columns at the same row,
 *   with (MORE) / (CONT'D) on each column that carries on.
 * - Optionally a cue gets (CONT'D) when the same character speaks again after
 *   action in the same scene.
 * - Optionally a scene that runs over a page says so: (CONTINUED) at the foot
 *   of the page and CONTINUED: at the top of the next, as production drafts do.
 * - Multi-camera format (sitcoms): dialogue double-spaced and every scene on a
 *   new page, so its pages and eighths are counted the way the show prints.
 *
 * Locked pages: a unit whose first line was locked to a later page starts that
 * page; text that no longer fits flows onto 12A, 12B….
 */
import { omittedSceneLabel } from './omission';

export type ScreenplayPaper = 'letter' | 'a4';

/** Body lines on a page with 1" top and bottom margins at six lines an inch. */
export const SCREENPLAY_ROWS: Record<ScreenplayPaper, number> = { letter: 54, a4: 58 };

export type ScreenplayFormat = 'feature' | 'multicam';

/** The project's page settings (`Project.screenplayLayout`). */
export interface ScreenplayLayout {
  /** Absent = US Letter. */
  paper?: ScreenplayPaper;
  /** Absent = on. */
  autoContd?: boolean;
  /** Absent = feature (single-camera) format. */
  format?: ScreenplayFormat;
  /** (CONTINUED) / CONTINUED: where a scene runs over a page. Absent = off. */
  sceneContinued?: boolean;
}

/** Pagination options for a project's page settings. */
export const screenplayLayoutOptions = (layout: ScreenplayLayout | undefined): {
  paper: ScreenplayPaper;
  autoContd: boolean;
  multicam: boolean;
  sceneContinued: boolean;
} => ({
  paper: layout?.paper === 'a4' ? 'a4' : 'letter',
  autoContd: layout?.autoContd !== false,
  multicam: layout?.format === 'multicam',
  sceneContinued: layout?.sceneContinued === true,
});

export interface PaginationLine {
  id: string;
  text: string;
  type?: string;
  omitted?: boolean;
  /** On a character cue: this speech sits beside the one before it. */
  dual?: boolean;
  sceneNumber?: string;
}

export interface PaginationOptions {
  paper?: ScreenplayPaper;
  /** (MORE) / NAME (CONT'D) across dialogue page breaks. Default on. */
  moreContd?: boolean;
  /** (CONT'D) on a cue whose character spoke last in the same scene. Default on. */
  autoContd?: boolean;
  /** Locked page per line id: those pages keep their numbers. */
  lock?: Readonly<Record<string, number>>;
  /** Explicit page starts by line index ("12", "12A"), for callers without ids. */
  anchors?: ReadonlyMap<number, string>;
  /** Body lines per page when not a standard screenplay page (compact sides). */
  rowsPerPage?: number;
  /** Multi-camera format: double-spaced dialogue, a new page for every scene. */
  multicam?: boolean;
  /** (CONTINUED) / CONTINUED: where a scene runs over a page. */
  sceneContinued?: boolean;
}

export type LaidLineKind = 'body' | 'more' | 'contd' | 'omitted' | 'continued';

/** One printed row. */
export interface LaidLine {
  kind: LaidLineKind;
  /** Index of the source line in the input (for MORE/CONT'D, the speech it belongs to; -1 for CONTINUED). */
  index: number;
  type: string;
  text: string;
  /** Display-only text after `text`, i.e. an automatic " (CONT'D)". */
  suffix?: string;
  /** Column from the text margin (1.5"); 10 columns an inch. */
  col: number;
  /** Row on the page from the top margin, 0-based. */
  row: number;
  /** Set on the first printed row of a source line. */
  first?: boolean;
  /** Which column of a dual-dialogue block. */
  side?: 'left' | 'right';
}

export interface LaidPage {
  /** Printed page number: "3", or with locked pages "12A". */
  label: string;
  lines: LaidLine[];
}

export interface ScreenplayPagination {
  pages: LaidPage[];
  rowsPerPage: number;
  /** Page index each input line starts on (hidden lines take the page before them). */
  pageOfLine: number[];
}

interface ElementSpec {
  col: number;
  width: number;
  before: number;
  right?: boolean;
}

/**
 * Element geometry. Scene headings keep this app's two blank lines above
 * (what the PDF has always printed); the rest are the Final Draft defaults.
 */
const SPEC: Record<string, ElementSpec> = {
  scene: { col: 0, width: 60, before: 2 },
  action: { col: 0, width: 60, before: 1 },
  shot: { col: 0, width: 60, before: 1 },
  character: { col: 22, width: 38, before: 1 },
  parenthetical: { col: 16, width: 25, before: 0 },
  dialogue: { col: 10, width: 35, before: 0 },
  transition: { col: 25, width: 35, before: 1, right: true },
};

const specOf = (type: string): ElementSpec => SPEC[type] ?? SPEC.action;

/** Dual-dialogue columns: 1.5"–4.3" and 4.6"–7.4" on the paper. */
const DUAL: Record<'left' | 'right', Record<string, { col: number; width: number }>> = {
  left: { dialogue: { col: 0, width: 28 }, character: { col: 9, width: 19 }, parenthetical: { col: 4, width: 21 } },
  right: { dialogue: { col: 31, width: 28 }, character: { col: 40, width: 19 }, parenthetical: { col: 35, width: 21 } },
};

/** Characters per printed line for an element. */
export const elementWidth = (type: string | undefined): number => specOf(type ?? 'action').width;

/**
 * Greedy word wrap at `width` characters. Spaces at a break belong to neither
 * line; a word longer than the column is cut. Always at least one line.
 */
export const wrapScreenplayText = (text: string, width: number): string[] => {
  const w = Math.max(1, Math.floor(Number.isFinite(width) ? width : 1));
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const p = raw.trim();
    if (!p) {
      out.push('');
      continue;
    }
    let start = 0;
    while (start < p.length) {
      if (p.length - start <= w) {
        out.push(p.slice(start));
        break;
      }
      const limit = start + w;
      let end = limit;
      if (p[limit] !== ' ') {
        const space = p.lastIndexOf(' ', limit - 1);
        if (space > start) end = space;
      }
      out.push(p.slice(start, end).trimEnd());
      let next = end;
      while (p[next] === ' ') next += 1;
      start = next > start ? next : limit;
    }
  }
  return out.length ? out : [''];
};

/** "ANA (V.O.) (CONT'D)" → "ANA"; a Fountain dual caret is ignored. */
export const cueName = (cue: string): string => cue.split('(')[0].replace(/\^\s*$/, '').trim().toUpperCase();

const hasContd = (cue: string): boolean => /CONT['’]?D/i.test(cue);

const contdCue = (cue: string): string => (hasContd(cue) ? cue.toUpperCase() : `${cue.trim().toUpperCase()} (CONT'D)`);

const sentenceEnd = (text: string): boolean => {
  const t = text.trimEnd().replace(/["')”’]+$/, '');
  return /[.?!:\-—]$/.test(t) || t.endsWith('...');
};

/** 0 → '', 1 → 'A', 26 → 'Z', 27 → 'AA'. */
export const pageSuffix = (index: number): string => {
  let n = index;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
};

interface Item {
  index: number;
  type: string;
  rows: string[];
  col: number;
  width: number;
  right?: boolean;
  side?: 'left' | 'right';
  suffix?: string;
  kind?: 'omitted';
}

type Unit =
  | { kind: 'single'; item: Item }
  | { kind: 'dialogue'; items: Item[] }
  | { kind: 'dual'; a: Item[]; b: Item[] }
  | { kind: 'break'; index: number };

const isSpeech = (type: string | undefined) => type === 'parenthetical' || type === 'dialogue';

const firstIndex = (unit: Unit): number => {
  switch (unit.kind) {
    case 'single': return unit.item.index;
    case 'dialogue': return unit.items[0]?.index ?? -1;
    case 'dual': return unit.a[0]?.index ?? unit.b[0]?.index ?? -1;
    default: return unit.index;
  }
};

const firstType = (unit: Unit): string => {
  switch (unit.kind) {
    case 'single': return unit.item.type;
    case 'dialogue': return unit.items[0]?.type ?? 'character';
    case 'dual': return 'character';
    default: return 'page-break';
  }
};

const rowsOf = (items: readonly Item[]): Array<[number, number]> =>
  items.flatMap((item, a) => item.rows.map((_, k) => [a, k] as [number, number]));

const dualHeight = (a: readonly Item[], b: readonly Item[]) =>
  Math.max(rowsOf(a).length, rowsOf(b).length);

/** Lines that have to come along with a heading placed just before this unit. */
const minLines = (unit: Unit): number => {
  switch (unit.kind) {
    case 'single': return Math.min(unit.item.rows.length, 2);
    case 'dialogue': return Math.min(rowsOf(unit.items).length, 2);
    case 'dual': return Math.min(dualHeight(unit.a, unit.b), 3);
    default: return 0;
  }
};

const beforeOf = (unit: Unit): number => {
  const type = firstType(unit);
  // A speech without its cue (a pasted fragment) still stands off what is above.
  if (unit.kind === 'dialogue' && isSpeech(type)) return 1;
  if (unit.kind === 'dual') return SPEC.character.before;
  return specOf(type).before;
};

const buildUnits = (lines: readonly PaginationLine[], autoContd: boolean, multicam = false): Unit[] => {
  const units: Unit[] = [];
  const item = (index: number): Item => {
    const line = lines[index];
    const type = line.type ?? 'action';
    const spec = specOf(type);
    let rows = wrapScreenplayText(line.text ?? '', spec.width);
    // Multi-camera dialogue is double-spaced: a blank row between its lines.
    if (multicam && type === 'dialogue') rows = rows.flatMap((row, k) => (k < rows.length - 1 ? [row, ''] : [row]));
    return { index, type, rows, col: spec.col, width: spec.width, ...(spec.right ? { right: true } : {}) };
  };
  const dualItem = (index: number, side: 'left' | 'right'): Item => {
    const line = lines[index];
    const type = line.type ?? 'dialogue';
    const geometry = DUAL[side][type] ?? DUAL[side].dialogue;
    return { index, type, rows: wrapScreenplayText(line.text ?? '', geometry.width), col: geometry.col, width: geometry.width, side };
  };
  const blockEnd = (start: number): number => {
    let end = start + 1;
    while (end < lines.length && isSpeech(lines[end].type)) end += 1;
    return end;
  };
  const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k);

  let lastSpeaker: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const type = line.type ?? 'action';
    if (type === 'note') {
      i += 1;
      continue;
    }
    if (type === 'page-break') {
      units.push({ kind: 'break', index: i });
      i += 1;
      continue;
    }
    if (type === 'character') {
      const end = blockEnd(i);
      if (lines[end]?.type === 'character' && lines[end].dual) {
        const end2 = blockEnd(end);
        units.push({ kind: 'dual', a: range(i, end).map((k) => dualItem(k, 'left')), b: range(end, end2).map((k) => dualItem(k, 'right')) });
        lastSpeaker = null;
        i = end2;
        continue;
      }
      const items = range(i, end).map(item);
      const name = cueName(line.text ?? '');
      if (autoContd && name && lastSpeaker === name && !hasContd(line.text ?? '')) items[0].suffix = " (CONT'D)";
      lastSpeaker = name || null;
      units.push({ kind: 'dialogue', items });
      i = end;
      continue;
    }
    if (isSpeech(type)) {
      const end = blockEnd(i);
      units.push({ kind: 'dialogue', items: [i, ...range(i + 1, end)].map(item) });
      i = end;
      continue;
    }
    if (type === 'scene') {
      lastSpeaker = null;
      if (line.omitted) {
        // Prints as its number and OMITTED; anything left under it is hidden.
        units.push({ kind: 'single', item: { ...item(i), rows: [omittedSceneLabel(line.sceneNumber)], kind: 'omitted' } });
        i += 1;
        while (i < lines.length && lines[i].type !== 'scene' && lines[i].type !== 'page-break') i += 1;
        continue;
      }
    }
    units.push({ kind: 'single', item: item(i) });
    i += 1;
  }
  return units;
};

/**
 * Ids of the cues that print an automatic (CONT'D) — the same character
 * speaking again after action in the same scene — so the editor can show it.
 */
export const autoContdCueIds = (lines: readonly PaginationLine[]): Set<string> => {
  const ids = new Set<string>();
  for (const unit of buildUnits(lines, true)) {
    if (unit.kind === 'dialogue' && unit.items[0]?.suffix) ids.add(lines[unit.items[0].index].id);
  }
  return ids;
};

/** Which column of a dual-dialogue block each of its lines prints in, by line id. */
export const dualDialogueSides = (lines: readonly PaginationLine[]): Map<string, 'left' | 'right'> => {
  const sides = new Map<string, 'left' | 'right'>();
  for (const unit of buildUnits(lines, false)) {
    if (unit.kind !== 'dual') continue;
    for (const item of unit.a) sides.set(lines[item.index].id, 'left');
    for (const item of unit.b) sides.set(lines[item.index].id, 'right');
  }
  return sides;
};

/** Lay out a screenplay on industry pages. */
export const paginateScreenplay = (
  lines: readonly PaginationLine[],
  options: PaginationOptions = {},
): ScreenplayPagination => {
  const pageRows = options.rowsPerPage !== undefined && Number.isFinite(options.rowsPerPage) && options.rowsPerPage >= 8
    ? Math.floor(options.rowsPerPage)
    : SCREENPLAY_ROWS[options.paper ?? 'letter'] ?? SCREENPLAY_ROWS.letter;
  // CONTINUED marks take the first and last row of every page.
  const sceneContinued = options.sceneContinued === true;
  const rows = sceneContinued ? pageRows - 2 : pageRows;
  const moreContd = options.moreContd !== false;
  const multicam = options.multicam === true;
  const units = buildUnits(lines, options.autoContd !== false, multicam);
  const lock = options.lock && Object.keys(options.lock).length > 0 ? options.lock : undefined;
  const anchors = options.anchors && options.anchors.size > 0 ? options.anchors : undefined;
  const numbered = !lock && !anchors;

  const pages: LaidPage[] = [];
  let cur: LaidLine[] = [];
  let row = 0;
  let baseLabel = '1';
  let basePage = 1;
  let overflow = 0;
  let curLabel = '1';

  const closePage = () => {
    pages.push({ label: curLabel, lines: cur });
    cur = [];
    row = 0;
  };
  const newPage = (anchor?: string) => {
    closePage();
    if (anchor !== undefined) {
      baseLabel = anchor;
      overflow = 0;
      curLabel = anchor;
    } else if (numbered) {
      curLabel = String(pages.length + 1);
    } else {
      overflow += 1;
      curLabel = `${baseLabel}${pageSuffix(overflow)}`;
    }
  };
  const left = () => Math.max(0, rows - row);
  const gap = (before: number) => {
    if (row > 0) row += before;
  };

  const emit = (it: Item, k: number, withSuffix: boolean) => {
    const text = it.rows[k] ?? '';
    const suffix = withSuffix && k === it.rows.length - 1 && it.suffix ? it.suffix : undefined;
    const length = text.length + (suffix?.length ?? 0);
    const col = it.right ? Math.max(it.col, it.col + it.width - length) : it.col;
    cur.push({
      kind: it.kind === 'omitted' ? 'omitted' : 'body',
      index: it.index,
      type: it.type,
      text,
      col,
      row,
      ...(suffix ? { suffix } : {}),
      ...(k === 0 ? { first: true } : {}),
      ...(it.side ? { side: it.side } : {}),
    });
    row += 1;
  };

  const single = (it: Item, keep: number) => {
    const before = specOf(it.type).before;
    const need = it.rows.length;
    if (!(row === 0 || row + before + need + keep <= rows)) {
      // Action may split across the break, two lines each side.
      const room = Math.max(0, left() - before);
      const splittable = it.type === 'action' && keep === 0 && it.kind !== 'omitted';
      let k = 0;
      if (splittable && need >= 4 && room >= 2) {
        const max = Math.min(room, need - 2);
        for (let c = max; c >= 2; c -= 1) {
          if (need - c >= 2 && sentenceEnd(it.rows[c - 1] ?? '')) {
            k = c;
            break;
          }
        }
        if (k === 0 && max >= 2) k = max;
      }
      if (k > 0) {
        gap(before);
        for (let j = 0; j < k; j += 1) emit(it, j, true);
        newPage();
        for (let j = k; j < need; j += 1) {
          if (row >= rows) newPage();
          emit(it, j, true);
        }
        return;
      }
      newPage();
    }
    gap(before);
    for (let j = 0; j < need; j += 1) {
      if (row >= rows) newPage();
      emit(it, j, true);
    }
  };

  const more = (col: number, index: number) => {
    cur.push({ kind: 'more', index, type: 'character', text: '(MORE)', col, row });
    row += 1;
  };
  const contd = (cue: Item) => {
    cur.push({ kind: 'contd', index: cue.index, type: 'character', text: contdCue(lines[cue.index]?.text ?? ''), col: cue.col, row, ...(cue.side ? { side: cue.side } : {}) });
    row += 1;
  };

  const placeRows = (items: readonly Item[], list: ReadonlyArray<[number, number]>) => {
    for (const [a, k] of list) {
      const it = items[a];
      if (it) emit(it, k, true);
    }
  };

  /** How many rows of a speech go on this page (room includes the MORE line). */
  const splitPoint = (items: readonly Item[], list: ReadonlyArray<[number, number]>, room: number, hasCue: boolean): number | undefined => {
    const total = list.length;
    const moreRow = hasCue && moreContd ? 1 : 0;
    const cue = hasCue ? 1 : 0;
    if (room < moreRow) return undefined;
    const max = Math.min(room - moreRow, total - 1);
    const typeAt = (i: number) => items[list[i]?.[0] ?? -1]?.type;
    const textAt = (i: number) => {
      const entry = list[i];
      return entry ? items[entry[0]]?.rows[entry[1]] ?? '' : '';
    };
    const lastOfLine = (i: number) => !list[i + 1] || list[i]?.[0] !== list[i + 1][0];
    const valid = (k: number, minAfter: number) => k >= cue + 2 && total - k >= minAfter && typeAt(k - 1) !== 'parenthetical';
    const good = (k: number) => sentenceEnd(textAt(k - 1)) || lastOfLine(k - 1);
    for (let k = max; k >= 1; k -= 1) if (valid(k, 2) && good(k)) return k;
    for (let k = max; k >= 1; k -= 1) if (valid(k, 2)) return k;
    for (let k = max; k >= 1; k -= 1) if (valid(k, 1)) return k;
    return undefined;
  };

  const rest = (items: readonly Item[], list: ReadonlyArray<[number, number]>, hasCue: boolean) => {
    let remaining = list;
    let guard = 0;
    while (remaining.length > 0 && guard < 100_000) {
      guard += 1;
      const room = left();
      if (remaining.length <= room) {
        placeRows(items, remaining);
        return;
      }
      const k = Math.min(Math.max(1, room - 1), remaining.length);
      placeRows(items, remaining.slice(0, k));
      if (moreContd && hasCue && row < rows) more(items[0].col, items[0].index);
      newPage();
      if (moreContd && hasCue) contd(items[0]);
      remaining = remaining.slice(k);
    }
  };

  const dialogue = (items: readonly Item[], before: number) => {
    const list = rowsOf(items);
    const hasCue = items[0]?.type === 'character';
    if (row > 0 && row + before + list.length > rows) {
      const room = Math.max(0, left() - before);
      const k = splitPoint(items, list, room, hasCue);
      if (k !== undefined) {
        gap(before);
        placeRows(items, list.slice(0, k));
        if (moreContd && hasCue) more(items[0].col, items[0].index);
        newPage();
        if (moreContd && hasCue) contd(items[0]);
        rest(items, list.slice(k), hasCue);
        return;
      }
      newPage();
    }
    gap(before);
    rest(items, list, hasCue);
  };

  // Dual dialogue: both columns split at the same row.
  const dual = (a: readonly Item[], b: readonly Item[], before: number) => {
    const sides: Array<[readonly Item[], Array<[number, number]>]> = [[a, rowsOf(a)], [b, rowsOf(b)]];
    const height = (from: number) => Math.max(...sides.map(([, list]) => Math.max(0, list.length - from)));
    const cueOf = (items: readonly Item[]) => items.find((it) => it.type === 'character') ?? items[0];

    const dualSplit = (from: number, room: number, force: boolean): number | undefined => {
      const moreRow = moreContd ? 1 : 0;
      const max = Math.min(Math.max(0, room - moreRow), Math.max(0, height(from) - 1));
      if (max === 0) return force ? 1 : undefined;
      const valid = (r: number) => sides.every(([items, list]) => {
        const end = from + r;
        if (list.length <= end) return true;
        const entry = list[end - 1];
        return (from > 0 || r >= 2) && items[entry[0]]?.type !== 'parenthetical';
      });
      const good = (r: number) => sides.every(([items, list]) => {
        const end = from + r;
        if (list.length <= end) return true;
        const entry = list[end - 1];
        const next = list[end];
        return sentenceEnd(items[entry[0]]?.rows[entry[1]] ?? '') || (!!next && entry[0] !== next[0]);
      });
      for (let r = max; r >= 1; r -= 1) if (valid(r) && good(r)) return r;
      for (let r = max; r >= 1; r -= 1) if (valid(r)) return r;
      return force ? max : undefined;
    };

    const dualPlace = (from: number, to: number, withMore: boolean) => {
      const top = row;
      let bottom = top;
      for (const [items, list] of sides) {
        row = top;
        for (const [ai, k] of list.slice(Math.min(from, list.length), Math.min(to, list.length))) {
          const it = items[ai];
          if (it) emit(it, k, false);
        }
        if (withMore && moreContd && list.length > to) {
          const cue = cueOf(items);
          cur.push({ kind: 'more', index: cue.index, type: 'character', text: '(MORE)', col: cue.col, row, ...(cue.side ? { side: cue.side } : {}) });
          row += 1;
        }
        bottom = Math.max(bottom, row);
      }
      row = bottom;
    };

    const dualBreak = (at: number) => {
      newPage();
      if (!moreContd) return;
      // NAME (CONT'D) stays inside its column: at the cue position when it
      // fits, moved left (never past the column) when it doesn't, and with
      // (CONT'D) on a row of its own when even the column is too narrow.
      let used = 0;
      for (const [items, list] of sides) {
        if (list.length <= at) continue;
        const cue = items.find((it) => it.type === 'character');
        if (!cue) continue;
        const side = cue.side ?? 'left';
        const column = DUAL[side].dialogue;
        const end = column.col + column.width;
        const text = contdCue(lines[cue.index]?.text ?? '');
        const base = { kind: 'contd' as const, index: cue.index, type: 'character', side };
        if (text.length <= column.width) {
          cur.push({ ...base, text, col: Math.max(column.col, Math.min(cue.col, end - text.length)), row });
          used = Math.max(used, 1);
        } else {
          const name = text.replace(/\s*\(CONT['’]?D\)\s*$/i, '');
          const nameRows = wrapScreenplayText(name, column.width);
          nameRows.forEach((part, k) => cur.push({ ...base, text: part, col: Math.max(column.col, Math.min(cue.col, end - part.length)), row: row + k }));
          cur.push({ ...base, text: "(CONT'D)", col: Math.max(column.col, Math.min(cue.col, end - 8)), row: row + nameRows.length });
          used = Math.max(used, nameRows.length + 1);
        }
      }
      row += used;
    };

    let from = 0;
    if (row > 0 && row + before + height(0) > rows) {
      const r = dualSplit(0, Math.max(0, left() - before), false);
      if (r !== undefined) {
        gap(before);
        dualPlace(0, r, true);
        dualBreak(r);
        from = r;
      } else {
        newPage();
      }
    } else {
      gap(before);
    }
    let guard = 0;
    while (height(from) > 0 && guard < 100_000) {
      guard += 1;
      const remain = height(from);
      const room = left();
      if (remain <= room) {
        dualPlace(from, from + remain, false);
        return;
      }
      const r = Math.max(1, dualSplit(from, room, true) ?? 1);
      dualPlace(from, from + r, true);
      dualBreak(from + r);
      from += r;
    }
  };

  /** The label a unit's first line asks its page to carry, when it starts one. */
  const anchorOf = (unit: Unit): string | undefined => {
    const index = firstIndex(unit);
    if (index < 0) return undefined;
    if (anchors) return anchors.get(index);
    if (!lock) return undefined;
    const locked = lock[lines[index]?.id ?? ''];
    if (locked === undefined || !(locked > basePage)) return undefined;
    return String(locked);
  };

  units.forEach((unit, u) => {
    const anchor = anchorOf(unit);
    if (anchor !== undefined) {
      if (lock) basePage = Number(anchor);
      if (cur.length > 0 || row > 0) newPage(anchor);
      else {
        // Already at the top of a fresh page: it simply takes the number.
        curLabel = anchor;
        baseLabel = anchor;
        overflow = 0;
      }
    }
    switch (unit.kind) {
      case 'break':
        if (cur.length > 0) newPage();
        break;
      case 'single': {
        // Multi-camera: every scene starts a page.
        if (multicam && unit.item.type === 'scene' && (cur.length > 0 || row > 0)) newPage();
        let keep = 0;
        if ((unit.item.type === 'scene' && unit.item.kind !== 'omitted') || unit.item.type === 'shot') {
          const next = units[u + 1];
          if (next && next.kind !== 'break' && anchorOf(next) === undefined) keep = beforeOf(next) + minLines(next);
        }
        single(unit.item, keep);
        break;
      }
      case 'dialogue':
        dialogue(unit.items, beforeOf(unit));
        break;
      case 'dual':
        dual(unit.a, unit.b, beforeOf(unit));
        break;
    }
  });
  if (cur.length > 0 || pages.length === 0) closePage();

  if (sceneContinued) {
    // Make room for the marks, then mark every page break inside a scene.
    const sceneAt: Array<number | undefined> = [];
    let scene: number | undefined;
    lines.forEach((line, index) => {
      if (line.type === 'scene') scene = index;
      sceneAt.push(scene);
    });
    for (const page of pages) for (const line of page.lines) line.row += 1;
    for (let p = 0; p + 1 < pages.length; p += 1) {
      const last = pages[p].lines.filter((line) => line.index >= 0).at(-1);
      const next = pages[p + 1].lines.find((line) => line.index >= 0);
      if (!last || !next) continue;
      const sceneHere = sceneAt[last.index];
      const opensScene = lines[next.index]?.type === 'scene' && next.first && next.kind !== 'contd';
      if (sceneHere === undefined || opensScene || sceneAt[next.index] !== sceneHere) continue;
      pages[p].lines.push({ kind: 'continued', index: -1, type: 'action', text: '(CONTINUED)', col: 49, row: pageRows - 1 });
      pages[p + 1].lines.unshift({ kind: 'continued', index: -1, type: 'action', text: 'CONTINUED:', col: 0, row: 0 });
    }
  }

  // Where each source line starts; hidden lines (notes, an omitted scene's
  // leftovers) take the page of the line before them.
  const pageOfLine = new Array<number>(lines.length).fill(-1);
  pages.forEach((page, p) => {
    for (const line of page.lines) {
      if (line.kind !== 'more' && line.kind !== 'contd' && line.kind !== 'continued' && pageOfLine[line.index] === -1) pageOfLine[line.index] = p;
    }
  });
  let last = 0;
  for (let k = 0; k < pageOfLine.length; k += 1) {
    if (pageOfLine[k] === -1) pageOfLine[k] = last;
    last = pageOfLine[k];
  }
  return { pages, rowsPerPage: pageRows, pageOfLine };
};
