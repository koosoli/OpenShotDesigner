import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import { createLinedScriptPdf } from '../linedScriptPdf';
import { createSidesPdf } from '../sidesPdf';
import { embedScriptFonts } from '../scriptFonts';

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const name = url.split('/').at(-1);
    if (!name || !/^CourierBadi-(Regular|Bold|Italic|BoldItalic)\.ttf$/.test(name)) throw new Error('Unexpected font request');
    const bytes = await readFile(resolve('public', 'fonts', 'courier-badi', name));
    return new Response(new Uint8Array(bytes).buffer);
  }));
});
afterAll(() => vi.unstubAllGlobals());

async function textOf(bytes: Uint8Array) {
  const task = getDocument({ data: bytes });
  const document = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= document.numPages; i++) {
    const content = await (await document.getPage(i)).getTextContent();
    pages.push(content.items.flatMap((item) => 'str' in item ? [item.str] : []).join(' '));
  }
  await task.destroy();
  return pages.join('\n');
}

describe('locally embedded screenplay fonts', () => {
  it('preserves selectable Cyrillic, Greek, accents and arrows in body and cover', async () => {
    const text = await textOf(await createLinedScriptPdf({
      productionTitle: 'Жизнь', titlePage: { enabled: true, title: 'Жизнь', authors: 'Ева' },
      lines: [{ type: 'action', text: 'Привет, мир! Ωμέγα Müller 12 € → done' }],
    }));
    expect(text).toContain('ЖИЗНЬ');
    expect(text).toContain('Ева');
    expect(text).toContain('Привет, мир! Ωμέγα Müller 12 € → done');
    expect(text).not.toContain('????');
  });
  it('retains styled text across wrapped lines and page breaks', async () => {
    const value = ('Привет, мир! '.repeat(120)).trim();
    const text = await textOf(await createLinedScriptPdf({ productionTitle: 'Styles', lines: [
      { type: 'action', text: value, styles: [{ start: 0, end: value.length, italic: true, underline: true }] },
      { type: 'action', text: 'Bold end', styles: [{ start: 0, end: 4, bold: true }] },
    ] }));
    expect(text.match(/Привет,/g)).toHaveLength(120);
    expect(text).toContain('Bold');
    expect(text).toContain('end');
  });
  it('keeps standard-font inline bold, italic and underline without a font fetch', async () => {
    const pdf = await PDFDocument.load(await createLinedScriptPdf({ productionTitle: 'Latin', lines: [{ type: 'dialogue', text: 'Bold italic', styles: [{ start: 0, end: 4, bold: true }, { start: 5, end: 11, italic: true, underline: true }] }] }));
    const resources = String(pdf.getPage(0).node.Resources());
    expect(resources).toContain('Courier-Bold');
    expect(resources).toContain('Courier-Oblique');
  });
  it('preserves Unicode and styling in performer sides and their header', async () => {
    const text = await textOf(await createSidesPdf({ productionTitle: 'Жизнь', scenes: [{ sceneId: 's', sceneNumber: '1', heading: 'INT. БАНК - DAY', omitted: false, characters: ['ЕВА'], lines: [
      { type: 'scene', text: 'INT. БАНК - DAY' }, { type: 'character', text: 'ЕВА' }, { type: 'dialogue', text: 'Привет, мир!', styles: [{ start: 0, end: 6, bold: true }] },
    ] }] }));
    expect(text).toContain('Жизнь');
    expect(text).toContain('БАНК');
    // The text extractor reports separate items at a font change; the helper adds spaces between items.
    expect(text.replace(/\s/g, '')).toContain('Привет,мир!');
  });
  it('rejects unsupported glyphs explicitly instead of silently replacing script text', async () => {
    await expect(createLinedScriptPdf({ productionTitle: 'Unsupported', lines: [{ text: 'Hello 😀' }] })).rejects.toThrow('Export cancelled');
  });
  it('uses a monospaced face matching the screenplay grid', async () => {
    const fonts = await embedScriptFonts(await PDFDocument.create(), ['Ж']);
    expect(fonts.regular.widthOfTextAtSize('М', 12)).toBeCloseTo(7.2, 1);
    expect(fonts.regular.widthOfTextAtSize('i', 12)).toBeCloseTo(fonts.boldItalic.widthOfTextAtSize('W', 12), 4);
  });
});
