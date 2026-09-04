/**
 * Storyboard contact sheet PDF.
 *
 * An image grid (2 or 3 columns, 3 by default) of storyboard frames: each
 * cell carries the frame raster when one is supplied, the shot number, and
 * a short caption. PNG and JPEG rasters embed via `embedPng` / `embedJpg`
 * with a per-frame try/catch, so one corrupt frame degrades to an empty
 * frame box instead of killing the whole sheet; frames with no bytes at
 * all render as empty boxes by design (not-yet-boarded shots stay visible
 * as gaps in the sequence). Landscape A4 by default.
 */

import { rgb } from 'pdf-lib';
import type { PDFFont, PDFDocument, PDFImage, PDFPage } from 'pdf-lib';
import {
  addPdfPage,
  createPdfDocument,
  drawDocumentHeader,
  embedProductionLogoPng,
  finalizePdfDocument,
} from './document';
import type { PdfDocumentContext, PdfOrientation, PdfPageSize } from './document';
import { buildPdfFilename } from './filenames';
import { wrapPdfCellText } from './tables';
import { sanitizePdfText } from './text';

export interface StoryboardPdfFrame {
  /** Raw raster bytes; absent renders as an empty frame box. */
  imageBytes?: Uint8Array;
  /** Image codec hint; defaults to PNG. */
  mimeType?: string;
  shotNumber?: string;
  caption?: string;
}

export interface StoryboardPdfInput {
  productionTitle: string;
  /** Scope line under the heading, e.g. "Scene 4 - Night Diner". */
  subtitle?: string;
  frames: StoryboardPdfFrame[];
  /** Grid columns; defaults to 3. Anything else falls back to 3. */
  columns?: 2 | 3;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface StoryboardPdfFilenameInput {
  productionTitle: string;
  sceneName?: string;
  date?: string;
}

/** `my-film_storyboard_scene-4.pdf`. */
export const buildStoryboardPdfFilename = (input: StoryboardPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'storyboard',
    ...(input.sceneName === undefined ? {} : { qualifier: input.sceneName }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const CELL_GAP = 10;
const IMAGE_ASPECT = 16 / 9;
const SHOT_LABEL_SIZE = 8.5;
const CAPTION_SIZE = 7.5;
const MAX_CAPTION_LINES = 2;

/**
 * Embed one frame raster. Never throws: missing or corrupt bytes yield
 * null and the cell renders as an empty frame box.
 */
const embedFrameImage = async (
  doc: PDFDocument,
  frame: StoryboardPdfFrame,
): Promise<PDFImage | null> => {
  if (frame.imageBytes === undefined || frame.imageBytes.length === 0) return null;
  const wantsJpeg = frame.mimeType !== undefined && /jpe?g/i.test(frame.mimeType);
  const attempts: Array<() => Promise<PDFImage>> = wantsJpeg
    ? [() => doc.embedJpg(frame.imageBytes as Uint8Array), () => doc.embedPng(frame.imageBytes as Uint8Array)]
    : [() => doc.embedPng(frame.imageBytes as Uint8Array), () => doc.embedJpg(frame.imageBytes as Uint8Array)];
  for (const attempt of attempts) {
    try {
      const image = await attempt();
      if (image.width > 0 && image.height > 0) return image;
    } catch {
      // Next codec, then the empty-box fallback below.
    }
  }
  return null;
};

const captionLines = (font: PDFFont, caption: string | undefined, maxWidth: number): string[] => {
  if (caption === undefined || caption.trim() === '') return [];
  return wrapPdfCellText(font, caption.trim(), maxWidth, CAPTION_SIZE).slice(0, MAX_CAPTION_LINES);
};

interface CellGeometry {
  cellWidth: number;
  imageHeight: number;
  cellHeight: number;
}

const drawFrameCell = (
  ctx: PdfDocumentContext,
  page: PDFPage,
  frame: StoryboardPdfFrame,
  image: PDFImage | null,
  x: number,
  top: number,
  geometry: CellGeometry,
): void => {
  const { cellWidth, imageHeight } = geometry;
  const ink = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.35, 0.35, 0.35);
  const boxColor = rgb(0.6, 0.6, 0.6);

  const imageTop = top;
  const imageBottom = imageTop - imageHeight;
  page.drawRectangle({
    x,
    y: imageBottom,
    width: cellWidth,
    height: imageHeight,
    borderColor: boxColor,
    borderWidth: 0.75,
  });
  if (image !== null) {
    // Contain-fit inside the frame box, honouring the box border.
    const inset = 1;
    const fitWidth = cellWidth - inset * 2;
    const fitHeight = imageHeight - inset * 2;
    const scale = Math.min(fitWidth / image.width, fitHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    try {
      page.drawImage(image, {
        x: x + (cellWidth - width) / 2,
        y: imageBottom + (imageHeight - height) / 2,
        width,
        height,
      });
    } catch {
      // The box already reads as an empty frame; nothing more to do.
    }
  }

  let textY = imageBottom - 3;
  const textWidth = cellWidth - 2;
  if (frame.shotNumber && frame.shotNumber.trim() !== '') {
    page.drawText(sanitizePdfText(frame.shotNumber.trim()), {
      x: x + 1,
      y: textY - SHOT_LABEL_SIZE,
      size: SHOT_LABEL_SIZE,
      font: ctx.bold,
      color: ink,
      maxWidth: textWidth,
    });
    textY -= SHOT_LABEL_SIZE + 3;
  }
  const lines = captionLines(ctx.regular, frame.caption, textWidth);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: x + 1,
      y: textY - CAPTION_SIZE * (index + 1) + 1,
      size: CAPTION_SIZE,
      font: ctx.regular,
      color: muted,
    });
  });
};

/** Render the storyboard contact sheet and return the finished PDF bytes. */
export const createStoryboardPdf = async (input: StoryboardPdfInput): Promise<Uint8Array> => {
  const columns = input.columns === 2 ? 2 : 3;
  const ctx = await createPdfDocument({
    title: `Storyboard - ${input.productionTitle}`,
    subject: 'Storyboard',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  // Embed up front so a corrupt frame fails here, inside its own try/catch,
  // and never interrupts pagination below.
  const images: Array<PDFImage | null> = [];
  for (const frame of input.frames) {
    images.push(await embedFrameImage(ctx.doc, frame));
  }

  let page = addPdfPage(ctx);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Storyboard',
    subtitle: input.subtitle ?? `${input.frames.length} frame${input.frames.length === 1 ? '' : 's'}`,
    logo,
  });

  if (input.frames.length === 0) {
    page.drawText('No storyboard frames in this selection.', {
      x: ctx.margins.left,
      y: headerY - 12,
      size: 10,
      font: ctx.regular,
    });
    return finalizePdfDocument(ctx);
  }

  const cellWidth = (ctx.contentWidth - CELL_GAP * (columns - 1)) / columns;
  const imageHeight = cellWidth / IMAGE_ASPECT;
  // Room for a shot-number line plus two caption lines under the image.
  const textHeight = SHOT_LABEL_SIZE + 3 + CAPTION_SIZE * MAX_CAPTION_LINES + 6;
  const cellHeight = imageHeight + textHeight;
  const geometry: CellGeometry = { cellWidth, imageHeight, cellHeight };

  let cursorY = headerY;
  input.frames.forEach((frame, index) => {
    const position = index % columns;
    if (position === 0) {
      if (cursorY - cellHeight < ctx.margins.bottom) {
        page = addPdfPage(ctx);
        cursorY = ctx.contentTop;
      }
    }
    const x = ctx.margins.left + position * (cellWidth + CELL_GAP);
    const top = cursorY;
    drawFrameCell(ctx, page, frame, images[index], x, top, geometry);
    if (position === columns - 1 || index === input.frames.length - 1) {
      cursorY = top - cellHeight - CELL_GAP;
    }
  });

  return finalizePdfDocument(ctx);
};
