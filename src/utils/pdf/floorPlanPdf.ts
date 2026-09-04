/**
 * Floor plan PDF.
 *
 * A full-page embedded plan image (PNG or JPEG bytes supplied by the
 * caller: an exported canvas snapshot, a scanned location plan, or any
 * raster the production works from) under the shared title block, which
 * carries the production, scene, scale and date facts a crew reads first.
 *
 * Resilience rule, mirroring `embedProductionLogoPng` in `document.ts`:
 * corrupt or missing image bytes never throw. The sheet then prints the
 * title block alone with a placeholder line, because a broken raster must
 * not cost the company a location plan on the morning of the shoot.
 * Landscape A4 by default.
 */

import { rgb } from 'pdf-lib';
import type { PDFDocument, PDFImage } from 'pdf-lib';
import {
  addPdfPage,
  createPdfDocument,
  drawDocumentHeader,
  embedProductionLogoPng,
  finalizePdfDocument,
} from './document';
import type { PdfOrientation, PdfPageSize } from './document';
import { buildPdfFilename } from './filenames';
import { sanitizePdfText } from './text';

export interface FloorPlanPdfInput {
  productionTitle: string;
  sceneName?: string;
  /** Drawing scale as printed, e.g. "1:50". */
  scale?: string;
  /** Plan date in YYYY-MM-DD; anything else is dropped, never mangled. */
  date?: string;
  /** Raw raster bytes for the plan; corrupt bytes print the sheet without it. */
  imageBytes?: Uint8Array;
  /** Image codec hint; defaults to PNG. */
  mimeType?: string;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface FloorPlanPdfFilenameInput {
  productionTitle: string;
  sceneName?: string;
  date?: string;
}

/** `my-film_floor-plan_scene-4.pdf`. */
export const buildFloorPlanPdfFilename = (input: FloorPlanPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'floor-plan',
    ...(input.sceneName === undefined ? {} : { qualifier: input.sceneName }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

interface FittedImage {
  image: PDFImage;
  width: number;
  height: number;
}

/**
 * Embed the plan raster for a full-page fit. Never throws: missing or
 * corrupt bytes yield null and the sheet prints without the image. JPEG is
 * tried when the MIME type says so, with a PNG fallback, because exports
 * do not always arrive labelled correctly.
 */
const embedFloorPlanImage = async (
  doc: PDFDocument,
  imageBytes: Uint8Array | undefined,
  mimeType: string | undefined,
): Promise<FittedImage | null> => {
  if (imageBytes === undefined || imageBytes.length === 0) return null;
  const wantsJpeg = mimeType !== undefined && /jpe?g/i.test(mimeType);
  const attempts: Array<() => Promise<PDFImage>> = wantsJpeg
    ? [() => doc.embedJpg(imageBytes), () => doc.embedPng(imageBytes)]
    : [() => doc.embedPng(imageBytes), () => doc.embedJpg(imageBytes)];
  for (const attempt of attempts) {
    try {
      const image = await attempt();
      if (image.width > 0 && image.height > 0) return { image, width: image.width, height: image.height };
    } catch {
      // Try the next codec; a broken raster must not fail the export.
    }
  }
  return null;
};

/** Render the floor plan sheet and return the finished PDF bytes. */
export const createFloorPlanPdf = async (input: FloorPlanPdfInput): Promise<Uint8Array> => {
  const subtitleBits = [
    input.sceneName && input.sceneName.trim() !== '' ? input.sceneName.trim() : null,
    input.scale && input.scale.trim() !== '' ? `Scale ${input.scale.trim()}` : null,
    input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null,
  ].filter((bit): bit is string => bit !== null);

  const ctx = await createPdfDocument({
    title: `Floor Plan - ${input.productionTitle}`,
    subject: 'Floor plan',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const planImage = await embedFloorPlanImage(ctx.doc, input.imageBytes, input.mimeType);
  const page = addPdfPage(ctx);
  const cursorY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Floor Plan',
    subtitle: subtitleBits.join('  |  ') || undefined,
    logo,
  });

  const frameTop = cursorY;
  const frameBottom = ctx.margins.bottom + 8;
  const frameHeight = frameTop - frameBottom;
  if (frameHeight <= 0) return finalizePdfDocument(ctx);

  if (planImage === null) {
    page.drawText(sanitizePdfText('No floor plan image embedded.'), {
      x: ctx.margins.left,
      y: frameTop - 14,
      size: 10,
      font: ctx.regular,
      color: rgb(0.35, 0.35, 0.35),
    });
    return finalizePdfDocument(ctx);
  }

  // Contain-fit into the frame between the title block and the footer zone.
  const scale = Math.min(1, ctx.contentWidth / planImage.width, frameHeight / planImage.height);
  const width = planImage.width * scale;
  const height = planImage.height * scale;
  const x = ctx.margins.left + (ctx.contentWidth - width) / 2;
  const y = frameBottom + (frameHeight - height) / 2;
  try {
    page.drawImage(planImage.image, { x, y, width, height });
  } catch {
    page.drawText(sanitizePdfText('No floor plan image embedded.'), {
      x: ctx.margins.left,
      y: frameTop - 14,
      size: 10,
      font: ctx.regular,
      color: rgb(0.35, 0.35, 0.35),
    });
    return finalizePdfDocument(ctx);
  }
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.55, 0.55, 0.55),
    borderWidth: 0.75,
  });
  return finalizePdfDocument(ctx);
};
