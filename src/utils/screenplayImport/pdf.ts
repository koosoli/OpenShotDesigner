/**
 * Read the positioned text of a PDF with pdf.js. Loaded only when a PDF is
 * imported, so the library never weighs on the app's first load.
 */
import type { PdfPageText } from './pdfText';

export interface PdfReadResult {
  pages: PdfPageText[];
  /**
   * Pages (1-based) whose text pdf.js could not read in full: a damaged
   * content stream stops the page part-way, and pdf.js only says so in the
   * console. The importer passes them on so the user knows what to check.
   */
  damagedPages: number[];
}

/** pdf.js reports an unreadable page as `… during "GetTextContent: page N" …` (N 0-based). */
const DAMAGED_PAGE = /GetTextContent: page (\d+)/;

export const readPdfPages = async (data: ArrayBuffer): Promise<PdfReadResult> => {
  // The worker code runs on the page (importing it registers
  // `globalThis.pdfjsWorker`, which pdf.js then uses in place of a Web
  // Worker). An import takes a moment either way, and this way pdf.js's
  // warnings about damaged pages reach this page — from a Web Worker they
  // never did — and there is no separate worker file to fetch.
  const [pdfjs] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs')]);

  const damaged = new Set<number>();
  const listen = (original: (...args: unknown[]) => void) => (...args: unknown[]) => {
    const match = DAMAGED_PAGE.exec(args.map(String).join(' '));
    if (match) damaged.add(Number(match[1]) + 1);
    original(...args);
  };
  const { log, warn } = console;
  console.log = listen(log);
  console.warn = listen(warn);

  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  try {
    const document = await task.promise;
    const pages: PdfPageText[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const [x0, y0, x1, y1] = page.view;
      const content = await page.getTextContent();
      const items: PdfPageText['items'] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        // Text set at an angle is a watermark or a stamp, never the script.
        const rotated = Math.abs(item.transform[1]) > 0.01 || Math.abs(item.transform[2]) > 0.01;
        items.push({ str: item.str, x: item.transform[4] - x0, y: item.transform[5] - y0, width: item.width, ...(rotated ? { rotated: true } : {}) });
      }
      pages.push({ width: x1 - x0, height: y1 - y0, items });
      page.cleanup();
    }
    return { pages, damagedPages: [...damaged].sort((a, b) => a - b) };
  } finally {
    console.log = log;
    console.warn = warn;
    void task.destroy();
  }
};
