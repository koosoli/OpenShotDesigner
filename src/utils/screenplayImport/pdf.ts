/**
 * Read the positioned text of a PDF with pdf.js. Loaded only when a PDF is
 * imported, so the library never weighs on the app's first load.
 */
import type { PdfPageText } from './pdfText';

export const readPdfPages = async (data: ArrayBuffer): Promise<PdfPageText[]> => {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const document = await task.promise;
  try {
    const pages: PdfPageText[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const [x0, y0, x1, y1] = page.view;
      const content = await page.getTextContent();
      const items: PdfPageText['items'] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        items.push({ str: item.str, x: item.transform[4] - x0, y: item.transform[5] - y0, width: item.width });
      }
      pages.push({ width: x1 - x0, height: y1 - y0, items });
      page.cleanup();
    }
    return pages;
  } finally {
    void task.destroy();
  }
};
