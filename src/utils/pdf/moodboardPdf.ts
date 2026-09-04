/**
 * Mood-board PDF: reference cards as an image grid with captions.
 *
 * Same visual language as the storyboard contact sheet (grid + caption
 * lines), but captioned by card text rather than shot numbers, and with its
 * own filename slug so a board never downloads named as a storyboard.
 */
import { PDFDocument, rgb, type PDFImage } from 'pdf-lib';
import type { PdfDocumentContext } from './document';
import {
  addPdfPage,
  createPdfDocument,
  drawDocumentHeader,
  embedProductionLogoPng,
  finalizePdfDocument,
} from './document';
import { buildPdfFilename } from './filenames';
import { sanitizePdfText } from './text';
import { wrapPdfCellText } from './tables';
import type { PDFPage } from 'pdf-lib';

export interface MoodboardPdfCard {
  /** Raw raster bytes; absent renders as an empty card box. */
  imageBytes?: Uint8Array;
  /** Image codec hint; defaults to PNG. */
  mimeType?: string;
  /** Card caption and tags, joined by the caller. */
  caption?: string;
}

export interface MoodboardPdfInput {
  productionTitle: string;
  boardTitle?: string;
  cards: MoodboardPdfCard[];
  columns?: 2 | 3;
  pageSize?: import('./document').PdfPageSize;
  orientation?: import('./document').PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface MoodboardPdfFilenameInput {
  productionTitle: string;
  boardTitle?: string;
  date?: string;
}

/** `my-film_moodboard_look-dev.pdf`. */
export const buildMoodboardPdfFilename = (input: MoodboardPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'moodboard',
    ...(input.boardTitle === undefined || input.boardTitle.trim() === ''
      ? {}
      : { qualifier: input.boardTitle }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const CELL_GAP = 10;
const IMAGE_ASPECT = 4 / 3;
const CAPTION_SIZE = 7.5;
const MAX_CAPTION_LINES = 2;

const embedCardImage = async (
  doc: PDFDocument,
  card: MoodboardPdfCard,
): Promise<PDFImage | null> => {
  if (card.imageBytes === undefined || card.imageBytes.length === 0) return null;
  const wantsJpeg = card.mimeType !== undefined && /jpe?g/i.test(card.mimeType);
  const attempts: Array<() => Promise<PDFImage>> = wantsJpeg
    ? [() => doc.embedJpg(card.imageBytes as Uint8Array), () => doc.embedPng(card.imageBytes as Uint8Array)]
    : [() => doc.embedPng(card.imageBytes as Uint8Array), () => doc.embedJpg(card.imageBytes as Uint8Array)];
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

/** Render the mood board and return the finished PDF bytes. */
export const createMoodboardPdf = async (input: MoodboardPdfInput): Promise<Uint8Array> => {
  const columns = input.columns === 2 ? 2 : 3;
  const ctx = await createPdfDocument({
    title: `Moodboard - ${input.productionTitle}`,
    subject: 'Moodboard',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const images: Array<PDFImage | null> = [];
  for (const card of input.cards) {
    images.push(await embedCardImage(ctx.doc, card));
  }

  let page = addPdfPage(ctx);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Moodboard',
    subtitle: input.boardTitle ?? `${input.cards.length} card${input.cards.length === 1 ? '' : 's'}`,
    logo,
  });

  if (input.cards.length === 0) {
    page.drawText('No cards on this board yet.', {
      x: ctx.margins.left,
      y: headerY - 12,
      size: 10,
      font: ctx.regular,
    });
    return finalizePdfDocument(ctx);
  }

  const cellWidth = (ctx.contentWidth - CELL_GAP * (columns - 1)) / columns;
  const imageHeight = cellWidth / IMAGE_ASPECT;
  const cellHeight = imageHeight + CAPTION_SIZE * MAX_CAPTION_LINES + 8;
  const boxColor = rgb(0.6, 0.6, 0.6);
  const muted = rgb(0.35, 0.35, 0.35);

  const drawCard = (
    target: PDFPage,
    card: MoodboardPdfCard,
    image: PDFImage | null,
    x: number,
    top: number,
    targetCtx: PdfDocumentContext,
  ): void => {
    const imageBottom = top - imageHeight;
    target.drawRectangle({ x, y: imageBottom, width: cellWidth, height: imageHeight, borderColor: boxColor, borderWidth: 0.75 });
    if (image !== null) {
      const scale = Math.min((cellWidth - 2) / image.width, (imageHeight - 2) / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      try {
        target.drawImage(image, {
          x: x + (cellWidth - width) / 2,
          y: imageBottom + (imageHeight - height) / 2,
          width,
          height,
        });
      } catch {
        // The box already reads as an empty card; nothing more to do.
      }
    }
    const lines = card.caption
      ? wrapPdfCellText(targetCtx.regular, card.caption.trim(), cellWidth - 2, CAPTION_SIZE).slice(0, MAX_CAPTION_LINES)
      : [];
    lines.forEach((line, index) => {
      target.drawText(sanitizePdfText(line), {
        x: x + 1,
        y: imageBottom - 4 - CAPTION_SIZE * (index + 1),
        size: CAPTION_SIZE,
        font: targetCtx.regular,
        color: muted,
      });
    });
  };

  let cursorY = headerY;
  input.cards.forEach((card, index) => {
    const position = index % columns;
    if (position === 0 && cursorY - cellHeight < ctx.margins.bottom) {
      page = addPdfPage(ctx);
      cursorY = ctx.contentTop;
    }
    drawCard(page, card, images[index], ctx.margins.left + position * (cellWidth + CELL_GAP), cursorY, ctx);
    if (position === columns - 1 || index === input.cards.length - 1) {
      cursorY -= cellHeight + CELL_GAP;
    }
  });

  return finalizePdfDocument(ctx);
};
