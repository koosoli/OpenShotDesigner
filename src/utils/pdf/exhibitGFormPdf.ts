/**
 * The performers production time report laid out like the union form
 * (SAG-AFTRA Exhibit G): US Letter landscape, a header block with the
 * production and day, column groups for work time, meals and travel time,
 * and a signature column the performers sign on set.
 *
 * Laid out from the form's published structure, not a copy of the form
 * itself — it is the working copy a 2nd AD fills and gets signed. Where an
 * agreement requires the official form, the numbers transfer one to one.
 */
import { rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import { addPdfPage, createPdfDocument, finalizePdfDocument } from './document';
import type { PdfDocumentContext } from './document';
import { wrapPdfCellText } from './tables';
import { sanitizePdfText } from './text';
import { exhibitGTotals, exhibitGWarnings } from '../../domain/reports/exhibitG';
import type { PerformerTimeEntry, PerformerTimeReport } from '../../domain/reports/exhibitG';

export interface ExhibitGFormPdfInput {
  productionTitle: string;
  productionCompany?: string;
  productionNumber?: string;
  dayName: string;
  date?: string;
  /** "Day 3 of 20". */
  dayOfTotal?: string;
  location?: string;
  crewCall?: string;
  report: PerformerTimeReport;
  /** The previous shooting day's sheet, so a short rest (forced call) is flagged. */
  previous?: { report: PerformerTimeReport; daysBetween: number };
  /** Blank lines to leave for walk-ons added by hand (default: fill the page). */
  minimumRows?: number;
}

interface FormColumn {
  header: string;
  width: number;
  value: (entry: PerformerTimeEntry, extra: { mp: number; forced: boolean }) => string;
  align?: 'left' | 'center';
}

interface FormGroup {
  label: string;
  columns: FormColumn[];
}

const time = (key: keyof PerformerTimeEntry) => (entry: PerformerTimeEntry) => (entry[key] as string | undefined) ?? '';

const GROUPS: FormGroup[] = [
  {
    label: '',
    columns: [
      { header: 'Cast #', width: 26, value: (entry) => (entry.castNumber === undefined ? '' : String(entry.castNumber)), align: 'center' },
      { header: 'Performer / character', width: 118, value: (entry) => [entry.name, entry.role ? `(${entry.role})` : ''].filter(Boolean).join(' '), align: 'left' },
      { header: 'Status', width: 30, value: (entry) => entry.status ?? '', align: 'center' },
      { header: 'Minor', width: 26, value: (entry) => (entry.minor ? 'M' : ''), align: 'center' },
    ],
  },
  {
    label: 'WORK TIME',
    columns: [
      { header: 'Report make-up / ward.', width: 38, value: time('reportMakeup') },
      { header: 'Report on set', width: 34, value: time('reportOnSet') },
      { header: 'Dismiss on set', width: 34, value: time('dismissOnSet') },
      { header: 'Dismiss make-up / ward.', width: 38, value: time('dismissMakeup') },
    ],
  },
  {
    label: 'MEALS',
    columns: [
      { header: '1st out', width: 30, value: time('meal1Out') },
      { header: '1st in', width: 30, value: time('meal1In') },
      { header: '2nd out', width: 30, value: time('meal2Out') },
      { header: '2nd in', width: 30, value: time('meal2In') },
    ],
  },
  {
    label: 'TRAVEL TIME',
    columns: [
      { header: 'Leave for location', width: 32, value: time('travelOutLeave') },
      { header: 'Arrive on location', width: 32, value: time('travelOutArrive') },
      { header: 'Leave location', width: 32, value: time('travelBackLeave') },
      { header: 'Arrive at studio', width: 32, value: time('travelBackArrive') },
    ],
  },
  {
    label: '',
    columns: [
      { header: 'Stunt adj.', width: 32, value: (entry) => entry.adjustment ?? '' },
      { header: 'Forced call', width: 28, value: (_entry, extra) => (extra.forced ? 'YES' : '') },
      { header: 'No. of MPs', width: 26, value: (_entry, extra) => (extra.mp ? String(extra.mp) : '') },
      { header: 'Ward. outfits', width: 28, value: (entry) => (entry.outfits === undefined ? '' : String(entry.outfits)) },
      { header: "Performer's signature", width: 0, value: (entry) => entry.initials ?? '', align: 'left' },
    ],
  },
];

const GRID = rgb(0.25, 0.25, 0.25);
const SHADE = rgb(0.9, 0.9, 0.9);

const text = (ctx: PdfDocumentContext, page: PDFPage, value: string, x: number, y: number, size: number, bold = false) =>
  page.drawText(sanitizePdfText(value), { x, y, size, font: bold ? ctx.bold : ctx.regular });

const box = (page: PDFPage, x: number, y: number, width: number, height: number, fill?: ReturnType<typeof rgb>) =>
  page.drawRectangle({ x, y, width, height, borderColor: GRID, borderWidth: 0.6, ...(fill ? { color: fill } : {}) });

/** A labelled field box in the header block. */
const field = (ctx: PdfDocumentContext, page: PDFPage, label: string, value: string, x: number, y: number, width: number) => {
  box(page, x, y, width, 26);
  text(ctx, page, label.toUpperCase(), x + 3, y + 18, 5.5, true);
  const fitted = wrapPdfCellText(ctx.regular, value, width - 6, 9)[0] ?? '';
  text(ctx, page, fitted, x + 3, y + 5, 9);
};

export const createExhibitGFormPdf = async (input: ExhibitGFormPdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `Performers Production Time Report - ${input.productionTitle}`,
    subject: 'SAG-AFTRA Exhibit G',
    pageSize: 'Letter',
    orientation: 'landscape',
    marginsPt: { top: 28, bottom: 30, left: 24, right: 24 },
    productionTitle: input.productionTitle,
  });
  const left = ctx.margins.left;
  const width = ctx.contentWidth;

  // Fixed widths, with the signature column taking what is left.
  const columns = GROUPS.flatMap((group) => group.columns);
  const fixed = columns.reduce((sum, column) => sum + column.width, 0);
  const signature = columns[columns.length - 1];
  signature.width = Math.max(60, width - fixed);

  const warnings = exhibitGWarnings(input.report, input.previous);
  const forcedIds = new Set(warnings.filter((warning) => warning.kind === 'forced_call').map((warning) => warning.entryId));

  const ROW = 19;
  const drawPageFrame = (page: PDFPage): number => {
    let y = ctx.pageHeight - ctx.margins.top;
    const title = 'PERFORMERS PRODUCTION TIME REPORT';
    text(ctx, page, title, left + width / 2 - ctx.bold.widthOfTextAtSize(title, 13) / 2, y - 12, 13, true);
    const sub = 'SAG-AFTRA Exhibit G - working copy';
    text(ctx, page, sub, left + width / 2 - ctx.regular.widthOfTextAtSize(sub, 7.5) / 2, y - 23, 7.5);
    y -= 32;

    const quarter = width / 4;
    field(ctx, page, 'Production', input.productionTitle, left, y - 26, quarter * 2);
    field(ctx, page, 'Prod. no.', input.productionNumber ?? '', left + quarter * 2, y - 26, quarter * 0.6);
    field(ctx, page, 'Date', input.date ?? '', left + quarter * 2.6, y - 26, quarter * 0.7);
    field(ctx, page, 'Shooting day', input.dayOfTotal ?? input.dayName, left + quarter * 3.3, y - 26, quarter * 0.7);
    y -= 26;
    field(ctx, page, 'Production company / employer', input.productionCompany ?? '', left, y - 26, quarter * 2);
    field(ctx, page, 'Studio / location', input.location ?? '', left + quarter * 2, y - 26, quarter * 1.3);
    field(ctx, page, 'Shooting call', input.crewCall ?? '', left + quarter * 3.3, y - 26, quarter * 0.7);
    y -= 34;

    // Group row, then column headers.
    let x = left;
    for (const group of GROUPS) {
      const groupWidth = group.columns.reduce((sum, column) => sum + column.width, 0);
      if (group.label) {
        box(page, x, y - 11, groupWidth, 11, SHADE);
        text(ctx, page, group.label, x + groupWidth / 2 - ctx.bold.widthOfTextAtSize(group.label, 6.5) / 2, y - 8.5, 6.5, true);
      }
      x += groupWidth;
    }
    y -= 11;
    x = left;
    for (const column of columns) {
      box(page, x, y - 24, column.width, 24, SHADE);
      const lines = wrapPdfCellText(ctx.bold, column.header, column.width - 4, 5.8).slice(0, 3);
      lines.forEach((line, index) => text(ctx, page, line, x + 2, y - 8 - index * 7, 5.8, true));
      x += column.width;
    }
    return y - 24;
  };

  const drawRow = (page: PDFPage, y: number, entry?: PerformerTimeEntry) => {
    let x = left;
    const extra = entry
      ? { mp: exhibitGTotals(entry, input.report.limits).mealPenalties, forced: forcedIds.has(entry.id) }
      : { mp: 0, forced: false };
    for (const column of columns) {
      box(page, x, y - ROW, column.width, ROW);
      if (entry) {
        const value = column.value(entry, extra);
        if (value) {
          const fitted = wrapPdfCellText(ctx.regular, value, column.width - 4, 7.5)[0] ?? '';
          const textWidth = ctx.regular.widthOfTextAtSize(sanitizePdfText(fitted), 7.5);
          const tx = column.align === 'left' ? x + 2 : x + (column.width - textWidth) / 2;
          text(ctx, page, fitted, tx, y - 12.5, 7.5);
        }
      }
      x += column.width;
    }
  };

  const footerSpace = 46;
  let page = addPdfPage(ctx);
  let y = drawPageFrame(page);
  const entries = input.report.entries;
  let drawn = 0;
  while (drawn < entries.length) {
    if (y - ROW < ctx.margins.bottom + footerSpace) {
      page = addPdfPage(ctx);
      y = drawPageFrame(page);
    }
    drawRow(page, y, entries[drawn]);
    y -= ROW;
    drawn += 1;
  }
  // Blank lines for performers added by hand, down to the footer.
  const minimum = input.minimumRows ?? Number.POSITIVE_INFINITY;
  let blanks = 0;
  while (y - ROW >= ctx.margins.bottom + footerSpace && (drawn + blanks < minimum || minimum === Number.POSITIVE_INFINITY)) {
    drawRow(page, y);
    y -= ROW;
    blanks += 1;
    if (minimum === Number.POSITIVE_INFINITY && blanks >= 30) break;
  }

  const footY = ctx.margins.bottom + footerSpace - 14;
  text(ctx, page, 'Production representative: ______________________________   Signature: ______________________________   Date: ____________', left, footY, 8);
  const legend = `Status: W work, SW start-work, WF work-finish, SWF start-work-finish, H hold, T travel, R rehearsal, F fitting. MPs computed from the times above; check against your agreement.${input.report.preparedBy ? `  Prepared by ${input.report.preparedBy}.` : ''}`;
  wrapPdfCellText(ctx.regular, legend, width, 6.5).slice(0, 2).forEach((line, index) => text(ctx, page, line, left, footY - 12 - index * 8, 6.5));

  return finalizePdfDocument(ctx);
};
