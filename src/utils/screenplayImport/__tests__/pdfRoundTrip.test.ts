import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createLinedScriptPdf } from '../../pdf';
import { screenplayFromPdfPages } from '../pdfText';
import type { PdfPageText } from '../pdfText';
import { parseScreenplay, parseScreenplayTitlePage } from '../../../components/script/screenplayParser';
import { fountainTitleBlock } from '../output';

/** The same reading as ./pdf.ts, with pdf.js's Node build. */
const readPages = async (bytes: Uint8Array): Promise<PdfPageText[]> => {
  const document = await getDocument({ data: bytes }).promise;
  const pages: PdfPageText[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const [x0, y0, x1, y1] = page.view;
    const content = await page.getTextContent();
    pages.push({
      width: x1 - x0,
      height: y1 - y0,
      items: content.items.flatMap((item) => ('str' in item && item.str ? [{ str: item.str, x: item.transform[4] - x0, y: item.transform[5] - y0, width: item.width }] : [])),
    });
  }
  return pages;
};

const SCRIPT = [
  { type: 'scene', text: 'INT. BANK - DAY', sceneNumber: '1' },
  { type: 'action', text: 'Rain hammers the tall windows of the old bank while the clerks pretend not to notice anything at all.' },
  { type: 'character', text: 'ANA' },
  { type: 'parenthetical', text: '(quietly)' },
  { type: 'dialogue', text: 'Give it back before anyone notices it was ever gone.' },
  { type: 'character', text: 'BEN' },
  { type: 'dialogue', text: 'NO!' },
  { type: 'transition', text: 'CUT TO:' },
  { type: 'scene', text: 'EXT. STREET - NIGHT', sceneNumber: '2' },
  ...Array.from({ length: 18 }, (_, i) => ({ type: 'action', text: `Beat ${i}.` })),
  { type: 'character', text: 'MARGO' },
  { type: 'dialogue', text: 'This is a sentence that goes on. '.repeat(20).trim() },
];

describe('PDF import', () => {
  it('reads back a screenplay this app printed, (MORE) and (CONT\'D) folded away', async () => {
    const pdf = await createLinedScriptPdf({
      productionTitle: 'Round Trip',
      lines: SCRIPT,
      titlePage: { enabled: true, title: 'The Bank Job', credit: 'Written by', authors: 'Ada Writer', contact: 'ada@example.com' },
      generatedAt: new Date('2026-10-15T08:00:00Z'),
    });
    const { text, titlePage } = screenplayFromPdfPages(await readPages(pdf));
    expect(titlePage).toMatchObject({ title: 'THE BANK JOB', credit: 'Written by', authors: 'Ada Writer', contact: 'ada@example.com' });

    const raw = `${fountainTitleBlock(titlePage)}${text}`;
    expect(parseScreenplayTitlePage(raw)?.title).toBe('THE BANK JOB');
    const lines = parseScreenplay(raw, 'bank.txt');
    const typed = lines.map((line) => [line.type, line.text]);
    expect(typed.slice(0, 9)).toEqual([
      ['scene', 'INT. BANK - DAY'],
      ['action', SCRIPT[1].text],
      ['character', 'ANA'],
      ['parenthetical', '(quietly)'],
      ['dialogue', SCRIPT[4].text],
      ['character', 'BEN'],
      ['dialogue', 'NO!'],
      ['transition', 'CUT TO:'],
      ['scene', 'EXT. STREET - NIGHT'],
    ]);
    expect(lines.filter((line) => line.type === 'scene').map((line) => line.sceneNumber)).toEqual(['1', '2']);
    // The long speech split over two pages comes back as one speech.
    expect(lines.filter((line) => line.type === 'character').map((line) => line.text)).toEqual(['ANA', 'BEN', 'MARGO']);
    expect(lines.at(-1)).toMatchObject({ type: 'dialogue', text: SCRIPT.at(-1)!.text });
    expect(typed.some(([, value]) => /MORE|CONT'D|Round Trip|^\d+\.$/.test(value ?? ''))).toBe(false);
  });

  it('reads dual dialogue back into two speeches side by side', async () => {
    const pdf = await createLinedScriptPdf({
      productionTitle: 'Dual',
      lines: [
        { type: 'scene', text: 'INT. BANK - DAY', sceneNumber: '1' },
        { type: 'action', text: 'They speak at once.' },
        { type: 'character', text: 'ANA' },
        { type: 'parenthetical', text: '(shouting)' },
        { type: 'dialogue', text: 'Give it back before anyone notices it was ever gone.' },
        { type: 'character', text: 'BEN', dual: true },
        { type: 'dialogue', text: 'Never, not in a hundred years.' },
        { type: 'action', text: 'Silence.' },
      ],
      generatedAt: new Date('2026-10-15T08:00:00Z'),
    });
    const { text } = screenplayFromPdfPages(await readPages(pdf));
    const lines = parseScreenplay(text, 'dual.txt');
    expect(lines.map((line) => [line.type, line.text, line.dual ?? false])).toEqual([
      ['scene', 'INT. BANK - DAY', false],
      ['action', 'They speak at once.', false],
      ['character', 'ANA', false],
      ['parenthetical', '(shouting)', false],
      ['dialogue', 'Give it back before anyone notices it was ever gone.', false],
      ['character', 'BEN', true],
      ['dialogue', 'Never, not in a hundred years.', false],
      ['action', 'Silence.', false],
    ]);
  });
});
