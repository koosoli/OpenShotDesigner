import type { PDFImage } from 'pdf-lib';
import { addPdfPage, createPdfDocument, drawDocumentHeader, finalizePdfDocument } from './document';
import type { PdfDocumentContext, PdfOrientation, PdfPageSize } from './document';
import { drawPdfTable, wrapPdfCellText } from './tables';
import { sanitizePdfText } from './text';
import type { PdfTableColumn } from './tables';

export interface LocationReportPdfRow {
  name: string;
  type: string;
  address: string;
  timeZone: string;
  contacts: string;
  scenes: string;
  mapPin: string;
  notes: string;
}

/** One scouted location's page: the recce answers and its photos. */
export interface LocationScoutPdfPage {
  name: string;
  /** "Shortlisted · 4/5 · candidate for LIVING ROOM". */
  summary?: string;
  fields: Array<[label: string, value: string]>;
  photos: Array<{ imageBytes?: Uint8Array; mimeType?: string; caption?: string }>;
}

export interface LocationReportPdfInput {
  productionTitle: string;
  locations: LocationReportPdfRow[];
  /** Scout pages, one per scouted location, after the overview table. */
  scoutPages?: LocationScoutPdfPage[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
}

const COLUMNS: PdfTableColumn[] = [
  { header: 'Location', widthFrac: 17 },
  { header: 'Type', widthFrac: 9 },
  { header: 'Address', widthFrac: 20 },
  { header: 'Time zone', widthFrac: 12 },
  { header: 'Contacts', widthFrac: 15 },
  { header: 'Scenes', widthFrac: 7, align: 'center' },
  { header: 'Map pin', widthFrac: 10 },
  { header: 'Notes', widthFrac: 10 },
];

export const createLocationReportPdf = async (input: LocationReportPdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `Location Report - ${input.productionTitle}`,
    subject: 'Production locations',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
  });
  const page = addPdfPage(ctx);
  const cursorY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Location Report',
    subtitle: `${input.locations.length} location${input.locations.length === 1 ? '' : 's'}`,
  });

  if (input.locations.length === 0) {
    page.drawText('No locations in this production.', { x: ctx.margins.left, y: cursorY - 12, size: 10, font: ctx.regular });
  } else {
    drawPdfTable(ctx, page, cursorY, COLUMNS, input.locations.map((location) => [
      location.name,
      location.type,
      location.address,
      location.timeZone,
      location.contacts,
      location.scenes,
      location.mapPin,
      location.notes,
    ]));
  }
  for (const scout of input.scoutPages ?? []) await drawScoutPage(ctx, scout);
  return finalizePdfDocument(ctx);
};

const embedPhoto = async (ctx: PdfDocumentContext, bytes?: Uint8Array, mimeType?: string): Promise<PDFImage | null> => {
  if (!bytes?.length) return null;
  const jpeg = !!mimeType && /jpe?g/i.test(mimeType);
  for (const attempt of jpeg ? [() => ctx.doc.embedJpg(bytes), () => ctx.doc.embedPng(bytes)] : [() => ctx.doc.embedPng(bytes), () => ctx.doc.embedJpg(bytes)]) {
    try {
      return await attempt();
    } catch {
      // Try the other codec.
    }
  }
  return null;
};

const PHOTO_COLUMNS = 3;
const PHOTO_GAP = 10;
const CAPTION_SIZE = 7.5;

const drawScoutPage = async (ctx: PdfDocumentContext, scout: LocationScoutPdfPage): Promise<void> => {
  let page = addPdfPage(ctx);
  let cursorY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: ctx.productionTitle,
    documentTitle: `Location scout - ${scout.name}`,
    ...(scout.summary ? { subtitle: scout.summary } : {}),
  });
  if (scout.fields.length) {
    const result = drawPdfTable(
      ctx,
      page,
      cursorY,
      [{ header: 'Item', widthFrac: 22 }, { header: 'Notes', widthFrac: 78 }],
      scout.fields.map(([label, value]) => [label, value]),
    );
    page = result.page;
    cursorY = result.cursorY - 12;
  }
  const cellWidth = (ctx.contentWidth - PHOTO_GAP * (PHOTO_COLUMNS - 1)) / PHOTO_COLUMNS;
  const imageHeight = cellWidth * 0.75;
  const cellHeight = imageHeight + CAPTION_SIZE * 2.6 + PHOTO_GAP;
  let column = 0;
  for (const photo of scout.photos) {
    const image = await embedPhoto(ctx, photo.imageBytes, photo.mimeType);
    if (!image) continue;
    if (column === 0 && cursorY - cellHeight < ctx.margins.bottom) {
      page = addPdfPage(ctx);
      cursorY = ctx.contentTop;
    }
    const x = ctx.margins.left + column * (cellWidth + PHOTO_GAP);
    const scale = Math.min(cellWidth / image.width, imageHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: x + (cellWidth - width) / 2, y: cursorY - imageHeight + (imageHeight - height) / 2, width, height });
    if (photo.caption) {
      const lines = wrapPdfCellText(ctx.regular, sanitizePdfText(photo.caption), cellWidth, CAPTION_SIZE).slice(0, 2);
      lines.forEach((line, index) => {
        page.drawText(line, { x, y: cursorY - imageHeight - CAPTION_SIZE * 1.3 * (index + 1), size: CAPTION_SIZE, font: ctx.regular });
      });
    }
    column += 1;
    if (column === PHOTO_COLUMNS) {
      column = 0;
      cursorY -= cellHeight;
    }
  }
};
