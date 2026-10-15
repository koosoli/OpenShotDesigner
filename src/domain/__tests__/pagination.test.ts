import { describe, expect, it } from 'vitest';
import { paginateScreenplay, wrapScreenplayText } from '../script/pagination';
import type { LaidPage, PaginationLine } from '../script/pagination';

// Cases ported from ScriptCraft's layout tests (MIT/Apache-2.0).

let seq = 0;
const p = (type: string, text: string, extra: Partial<PaginationLine> = {}): PaginationLine => ({ id: `l${(seq += 1)}`, type, text, ...extra });
const body = (page: LaidPage) => page.lines.filter((line) => line.kind === 'body');
const filler = (n: number, word = 'Line') => Array.from({ length: n }, (_, i) => p('action', `${word} ${i}.`));
const speech = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i} is here.`).join(' ');

describe('wrapScreenplayText', () => {
  it('wraps on words and cuts words longer than the column', () => {
    expect(wrapScreenplayText('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapScreenplayText('aaa bbb ccc', 8)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapScreenplayText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapScreenplayText('', 4)).toEqual(['']);
    expect(wrapScreenplayText('ab   cd', 3)).toEqual(['ab', 'cd']);
    expect(wrapScreenplayText('x', 0)).toEqual(['x']);
  });
});

describe('paginateScreenplay', () => {
  it('sets the elements on their columns with Final Draft spacing', () => {
    const { pages } = paginateScreenplay([
      p('scene', 'INT. ROOM - DAY'),
      p('action', 'A chair.'),
      p('character', 'ANA'),
      p('parenthetical', '(softly)'),
      p('dialogue', 'Hello.'),
      p('transition', 'CUT TO:'),
    ]);
    const lines = body(pages[0]);
    expect(lines.map((line) => line.col)).toEqual([0, 0, 22, 16, 10, 53]);
    expect(lines.map((line) => line.row)).toEqual([0, 2, 4, 5, 6, 8]);
  });

  it('fits 54 lines on a Letter page and 58 on A4, dropping space at the top', () => {
    const lines = filler(60);
    const letter = paginateScreenplay(lines);
    expect(body(letter.pages[0])).toHaveLength(27);
    expect(body(letter.pages[0]).at(-1)?.row).toBe(52);
    expect(body(letter.pages[1])[0].row).toBe(0);
    expect(letter.pages.map((page) => page.label)).toEqual(['1', '2', '3']);
    expect(body(paginateScreenplay(lines, { paper: 'a4' }).pages[0])).toHaveLength(29);
  });

  it('never leaves a scene heading at the foot of a page', () => {
    const lines = [...filler(26), p('scene', 'EXT. FIELD - NIGHT'), p('action', 'Crickets.')];
    const { pages } = paginateScreenplay(lines);
    expect(body(pages[1]).map((line) => line.text)).toEqual(['EXT. FIELD - NIGHT', 'Crickets.']);
  });

  it("breaks a long speech with (MORE) and the cue as (CONT'D)", () => {
    const text = 'This is a sentence that goes on. '.repeat(20).trim();
    const lines = [...filler(20), p('character', 'MARGO'), p('dialogue', text)];
    const { pages, rowsPerPage } = paginateScreenplay(lines);
    const more = pages[0].lines.find((line) => line.kind === 'more');
    expect(more?.text).toBe('(MORE)');
    expect(more?.col).toBe(22);
    const contd = pages[1].lines.find((line) => line.kind === 'contd');
    expect(contd?.text).toBe("MARGO (CONT'D)");
    expect(contd?.row).toBe(0);
    expect(pages[0].lines.every((line) => line.row < rowsPerPage)).toBe(true);
    expect(body(pages[0]).at(-1)?.text.trimEnd().endsWith('.')).toBe(true);
    const printed = pages.flatMap((page) => page.lines).filter((line) => line.kind === 'body' && line.index === 21).length;
    expect(printed).toBe(wrapScreenplayText(text, 35).length);
  });

  it('keeps a cue with its dialogue', () => {
    const lines = [...filler(26), p('character', 'DEV'), p('dialogue', 'Two lines of dialogue here, wrapping onto a second.')];
    const { pages } = paginateScreenplay(lines);
    expect(body(pages[1])[0].text).toBe('DEV');
    expect(pages[0].lines.some((line) => line.kind === 'more')).toBe(false);
  });

  it("adds (CONT'D) when a character speaks again in the same scene", () => {
    const lines = [
      p('scene', 'INT. A - DAY'),
      p('character', 'ANA'), p('dialogue', 'One.'),
      p('action', 'She sits.'),
      p('character', 'ANA'), p('dialogue', 'Two.'),
      p('scene', 'INT. B - DAY'),
      p('character', 'ANA'), p('dialogue', 'Three.'),
    ];
    const cues = (autoContd: boolean) =>
      body(paginateScreenplay(lines, { autoContd }).pages[0])
        .filter((line) => line.type === 'character')
        .map((line) => line.text + (line.suffix ?? ''));
    expect(cues(true)).toEqual(['ANA', "ANA (CONT'D)", 'ANA']);
    expect(cues(false)).toEqual(['ANA', 'ANA', 'ANA']);
  });

  it('prints an omitted scene as its number and hides what is left under it', () => {
    const { pages } = paginateScreenplay([
      p('scene', 'INT. GONE - DAY', { omitted: true, sceneNumber: '4' }),
      p('action', 'Hidden.'),
      p('scene', 'INT. KEPT - DAY'),
    ]);
    expect(pages[0].lines.map((line) => line.text)).toEqual(['SCENE 4 — OMITTED', 'INT. KEPT - DAY']);
  });

  it('sets dual dialogue side by side', () => {
    const { pages } = paginateScreenplay([
      p('character', 'ANA'), p('dialogue', 'Left side.'),
      p('character', 'DEV', { dual: true }), p('dialogue', 'Right side.'),
    ]);
    const lines = body(pages[0]);
    expect(lines[0].row).toBe(lines[2].row);
    expect(lines[2].col).toBeGreaterThan(lines[0].col + 14);
    expect(lines.map((line) => line.side)).toEqual(['left', 'left', 'right', 'right']);
  });

  const dualScript = (leftCount: number, rightCount: number, before: PaginationLine[]) => [
    ...before,
    p('character', 'ANA'), p('dialogue', speech(leftCount)),
    p('character', 'BEN', { dual: true }), p('dialogue', speech(rightCount)),
  ];
  const printedRows = (pages: LaidPage[], index: number) =>
    pages.flatMap((page) => page.lines).filter((line) => line.kind === 'body' && line.index === index).length;

  it('splits both dual columns at the same row with (MORE) and (CONT\'D) on each', () => {
    const lines = dualScript(12, 12, filler(24, 'Beat'));
    const { pages, rowsPerPage } = paginateScreenplay(lines);
    expect(pages).toHaveLength(2);
    const mores = pages[0].lines.filter((line) => line.kind === 'more');
    expect(mores).toHaveLength(2);
    expect(mores[0].row).toBe(mores[1].row);
    expect(pages[0].lines.every((line) => line.row < rowsPerPage)).toBe(true);
    const contd = pages[1].lines.filter((line) => line.kind === 'contd');
    expect(contd.map((line) => line.text)).toEqual(["ANA (CONT'D)", "BEN (CONT'D)"]);
    expect(contd[0].row).toBe(contd[1].row);
    const n = lines.length;
    expect(printedRows(pages, n - 3)).toBe(wrapScreenplayText(speech(12), 28).length);
    expect(printedRows(pages, n - 1)).toBe(wrapScreenplayText(speech(12), 28).length);
  });

  it('gives only the continuing dual column a (MORE)', () => {
    const { pages } = paginateScreenplay(dualScript(14, 1, filler(24, 'Beat')));
    expect(pages[0].lines.filter((line) => line.kind === 'more')).toHaveLength(1);
    expect(pages[1].lines.filter((line) => line.kind === 'contd').map((line) => line.text)).toEqual(["ANA (CONT'D)"]);
  });

  it('never drops a line of dual dialogue taller than a page', () => {
    const lines = dualScript(150, 60, [p('scene', 'INT. HALL - DAY')]);
    for (const moreContd of [true, false]) {
      const { pages, rowsPerPage } = paginateScreenplay(lines, { moreContd });
      expect(pages.length).toBeGreaterThanOrEqual(3);
      expect(printedRows(pages, 2)).toBe(wrapScreenplayText(speech(150), 28).length);
      expect(printedRows(pages, 4)).toBe(wrapScreenplayText(speech(60), 28).length);
      expect(pages.every((page) => page.lines.every((line) => line.row < rowsPerPage))).toBe(true);
    }
  });

  it('survives hostile input', () => {
    const long = 'x'.repeat(5000);
    const { pages, rowsPerPage } = paginateScreenplay([
      p('dialogue', long), p('character', long), p('dialogue', 'word '.repeat(2000)), p('scene', long),
    ]);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every((page) => page.lines.every((line) => line.row < rowsPerPage))).toBe(true);
    expect(paginateScreenplay([]).pages).toHaveLength(1);
  });

  it('starts locked pages where they were and spills onto A-pages', () => {
    const lines = filler(40);
    const lock = Object.fromEntries(lines.map((line, i) => [line.id, i < 27 ? 1 : 2]));
    const revised = [...lines.slice(0, 10), ...filler(20, 'New'), ...lines.slice(10)];
    const { pages } = paginateScreenplay(revised, { lock });
    expect(pages.map((page) => page.label)).toEqual(['1', '1A', '2']);
  });
});
