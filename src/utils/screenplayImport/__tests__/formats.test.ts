import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { screenplayFromDocx } from '../docx';
import { elementsFromScreenplayHtml, screenplayFromCeltx } from '../celtx';
import { screenplayFromPdfPages } from '../pdfText';
import { parseScreenplay, parseScreenplayTitlePage } from '../../../components/script/screenplayParser';
import { parseFdxDocument } from '../../../domain/script/fdxDocument';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (text: string, opts: { style?: string; left?: number; jc?: string; pageBreak?: boolean } = {}) =>
  `<w:p><w:pPr>${opts.style ? `<w:pStyle w:val="${opts.style}"/>` : ''}${opts.left ? `<w:ind w:left="${opts.left}"/>` : ''}${opts.jc ? `<w:jc w:val="${opts.jc}"/>` : ''}${opts.pageBreak ? '<w:pageBreakBefore/>' : ''}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const docx = (body: string, styles = '') =>
  zipSync({
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`),
    ...(styles ? { 'word/styles.xml': strToU8(`<?xml version="1.0"?><w:styles ${W}>${styles}</w:styles>`) } : {}),
  });
const style = (id: string, name: string) => `<w:style w:styleId="${id}"><w:name w:val="${name}"/></w:style>`;
const typed = (raw: string, name: string) => parseScreenplay(raw, name).map((line) => [line.type, line.text, line.dual ?? false]);

describe('Word import', () => {
  it('reads a screenwriting app export by its styles, cover included', () => {
    const body = [
      para('THE BANK JOB', { jc: 'center' }),
      para('Written by', { jc: 'center' }),
      para('Ada Writer', { jc: 'center' }),
      para('ada@example.com'),
      para('INT. BANK - DAY', { style: 'SH', pageBreak: true }),
      para('Rain.', { style: 'Act' }),
      para('BEN', { style: 'Char' }),
      para('NO!', { style: 'Dial' }),
      para('CUT TO:', { style: 'Trans' }),
    ].join('');
    const styles = [style('SH', 'Scene Heading'), style('Act', 'Action'), style('Char', 'Character'), style('Dial', 'Dialogue'), style('Trans', 'Transition')].join('');
    const { raw, extension } = screenplayFromDocx(docx(body, styles));
    expect(extension).toBe('fdx');
    expect(typed(raw, 'bank.fdx')).toEqual([
      ['scene', 'INT. BANK - DAY', false],
      ['action', 'Rain.', false],
      ['character', 'BEN', false],
      ['dialogue', 'NO!', false],
      ['transition', 'CUT TO:', false],
    ]);
    expect(parseFdxDocument(raw).titlePage).toMatchObject({ title: 'THE BANK JOB', credit: 'Written by', authors: 'Ada Writer', contact: 'ada@example.com' });
  });

  it('reads a hand-typed document by its indents', () => {
    const body = [
      para('INT. BANK - DAY'),
      para('Rain hammers the windows.'),
      para('BEN', { left: 3168 }),
      para('Give it back.', { left: 1440 }),
      para('She walks out.'),
    ].join('');
    const { raw, extension } = screenplayFromDocx(docx(body));
    expect(extension).toBe('txt');
    expect(typed(raw, 'bank.txt').map(([type, text]) => [type, text])).toEqual([
      ['scene', 'INT. BANK - DAY'],
      ['action', 'Rain hammers the windows.'],
      ['character', 'BEN'],
      ['dialogue', 'Give it back.'],
      ['action', 'She walks out.'],
    ]);
  });
});

describe('Celtx and HTML import', () => {
  const html = `<html><body>
    <p class="sceneheading">INT. BANK - DAY</p>
    <p class="action">Rain.</p>
    <p class="character">ANA</p>
    <p class="parenthetical">(quietly)</p>
    <p class="dialog">Hi.</p>
    <p class="shot">BIG HEAD OF ANA</p>
  </body></html>`;

  it('reads Celtx element classes', () => {
    expect(elementsFromScreenplayHtml(html).map((element) => element.type)).toEqual(['scene', 'action', 'character', 'parenthetical', 'dialogue', 'shot']);
  });

  it('finds the script inside a .celtx project', () => {
    const project = zipSync({ 'project.rdf': strToU8('<rdf/>'), 'script-1.html': strToU8(html) });
    expect(typed(screenplayFromCeltx(project), 'bank.fdx').map(([type, text]) => [type, text])).toEqual([
      ['scene', 'INT. BANK - DAY'],
      ['action', 'Rain.'],
      ['character', 'ANA'],
      ['parenthetical', '(quietly)'],
      ['dialogue', 'Hi.'],
      ['shot', 'BIG HEAD OF ANA'],
    ]);
  });
});

describe('PDF text reconstruction', () => {
  const item = (str: string, col: number, row: number) => ({ str, x: 108 + col * 7.2, y: 720 - (row + 1) * 12 + 3, width: str.length * 7.2 });
  it('drops page numbers and revision marks, keeps scene numbers and joins wrapped lines', () => {
    const page = {
      width: 612,
      height: 792,
      items: [
        item('2.', 55, -3),
        item('7', -5, 0), item('INT. BANK - DAY', 0, 0), item('7', 63, 0),
        item('Rain hammers the tall windows of the old bank while the', 0, 2), item('*', 64, 2),
        item('clerks pretend not to notice.', 0, 3),
      ],
    };
    const { text } = screenplayFromPdfPages([page]);
    const lines = parseScreenplay(text, 'x.txt');
    expect(lines.map((line) => [line.type, line.text, line.sceneNumber])).toEqual([
      ['scene', 'INT. BANK - DAY', '7'],
      ['action', 'Rain hammers the tall windows of the old bank while the clerks pretend not to notice.', '7'],
    ]);
    expect(parseScreenplayTitlePage(text)).toBeNull();
  });
});
