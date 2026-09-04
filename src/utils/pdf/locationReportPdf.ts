import { addPdfPage, createPdfDocument, drawDocumentHeader, finalizePdfDocument } from './document';
import type { PdfOrientation, PdfPageSize } from './document';
import { drawPdfTable } from './tables';
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

export interface LocationReportPdfInput {
  productionTitle: string;
  locations: LocationReportPdfRow[];
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
  return finalizePdfDocument(ctx);
};
