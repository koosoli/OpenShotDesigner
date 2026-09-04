/**
 * Logistics plan PDF.
 *
 * Printable data model (mirrors `LogisticsPrintView` and its
 * `buildLogisticsPrintModel` read-only):
 * - Load groups: one top-level container and everything nested inside it,
 *   each container with its specs, routing (day / destination), packed-item
 *   table with tick boxes, totals, and the payload/volume verdict.
 * - Gear packed into nothing yet still prints: it still has to get on a
 *   vehicle.
 * - Fleet summary: container and packed-item counts, rolled-up known weight,
 *   and how many items and top-level containers carry an unknown weight.
 *
 * Scope note: the cable domain (`src/domain/cable`) models element-port
 * connections, which need live element-name resolution to read as a printed
 * schedule; that mapping is not trivial, so this sheet covers cases and
 * containers only and says so in its subtitle when empty of cables.
 * Unknown figures print as an em dash and are never counted as zero.
 * Landscape A4 by default.
 */

import type { PDFPage } from 'pdf-lib';
import {
  addPdfPage,
  createPdfDocument,
  drawDocumentHeader,
  embedProductionLogoPng,
  finalizePdfDocument,
} from './document';
import type { PdfDocumentContext, PdfOrientation, PdfPageSize } from './document';
import { buildPdfFilename } from './filenames';
import { drawPdfTable, wrapPdfCellText } from './tables';
import type { PdfTableColumn } from './tables';
import { sanitizePdfText } from './text';

export interface LogisticsPdfItem {
  label: string;
  quantity: number;
  /** Per-unit weight; absent stays unknown and prints as an em dash. */
  unitKg?: number | null;
  /** Combined weight for the row; absent whenever the unit weight is. */
  lineKg?: number | null;
  packedVolumeL?: number | null;
  volumeIsEstimate?: boolean;
}

export interface LogisticsPdfContainer {
  name: string;
  kindLabel: string;
  /** Set for nested containers, so a loader knows what to open first. */
  parentName?: string;
  tareKg?: number | null;
  usableVolumeL?: number | null;
  maxPayloadKg?: number | null;
  /** "1200 x 800 x 600 mm" when the external dimensions are known. */
  dimensionsLabel?: string;
  notes?: string;
  /** Shoot day this container travels on; absent when nothing routes it yet. */
  dayLabel?: string;
  /** Where it is going. */
  locationLabel?: string;
  items: LogisticsPdfItem[];
  totalWeightKg?: number | null;
  totalVolumeL?: number | null;
  /** Preformatted payload verdict, e.g. "Within payload - 42% of 500 kg". */
  verdict?: string;
}

export interface LogisticsPdfGroup {
  title: string;
  containers: LogisticsPdfContainer[];
}

export interface LogisticsPdfFleetSummary {
  containerCount: number;
  itemCount: number;
  knownWeightKg: number;
  topLevelWithUnknownWeight: number;
  unknownWeightItemCount: number;
}

export interface LogisticsPdfInput {
  productionTitle: string;
  /** Single-day scope, e.g. "Day 3 - Warehouse"; absent means the whole production. */
  scopeLabel?: string;
  groups: LogisticsPdfGroup[];
  /** Gear packed into nothing yet. */
  unassignedItems: LogisticsPdfItem[];
  fleet?: LogisticsPdfFleetSummary;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface LogisticsPdfFilenameInput {
  productionTitle: string;
  scopeLabel?: string;
  date?: string;
}

/** `my-film_logistics-plan.pdf`. */
export const buildLogisticsPdfFilename = (input: LogisticsPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'logistics-plan',
    ...(input.scopeLabel === undefined ? {} : { qualifier: input.scopeLabel }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const ITEM_COLUMNS: PdfTableColumn[] = [
  { header: 'Tick', widthFrac: 6, align: 'center' },
  { header: 'Item', widthFrac: 46 },
  { header: 'Qty', widthFrac: 8, align: 'center' },
  { header: 'Unit', widthFrac: 13, align: 'center' },
  { header: 'Line', widthFrac: 13, align: 'center' },
  { header: 'Volume', widthFrac: 14, align: 'center' },
];

const SECTION_TITLE_SIZE = 11;
const GROUP_TITLE_SIZE = 10;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const BLOCK_GAP = 6;
const SECTION_GAP = 10;

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

/** "12.5 kg" / em dash for anything unknown: blanks never print as 0. */
export const formatLogisticsKg = (kg: number | null | undefined): string =>
  kg === null || kg === undefined ? '---' : `${Number(kg.toFixed(2))} kg`;

const formatLiters = (liters: number | null | undefined): string =>
  liters === null || liters === undefined ? '---' : `${Number(liters.toFixed(1))} L`;

const formatItemVolume = (item: LogisticsPdfItem): string => {
  if (item.packedVolumeL === null || item.packedVolumeL === undefined) return '---';
  const base = formatLiters(item.packedVolumeL);
  return item.volumeIsEstimate === true ? `${base} est.` : base;
};

/** New page when fewer than `needed` points remain above the footer zone. */
const ensureSpace = (ctx: PdfDocumentContext, cursor: PageCursor, needed: number): PageCursor => {
  if (cursor.cursorY - needed < ctx.margins.bottom) {
    const page = addPdfPage(ctx);
    return { page, cursorY: ctx.contentTop };
  }
  return cursor;
};

const drawSectionTitle = (ctx: PdfDocumentContext, cursor: PageCursor, title: string): PageCursor => {
  const placed = ensureSpace(ctx, cursor, 34);
  placed.page.drawText(sanitizePdfText(title), {
    x: ctx.margins.left,
    y: placed.cursorY - SECTION_TITLE_SIZE,
    size: SECTION_TITLE_SIZE,
    font: ctx.bold,
  });
  return { page: placed.page, cursorY: placed.cursorY - SECTION_TITLE_SIZE - BLOCK_GAP };
};

const drawBodyLines = (ctx: PdfDocumentContext, cursor: PageCursor, text: string): PageCursor => {
  const lines = wrapPdfCellText(ctx.regular, text, ctx.contentWidth, BODY_SIZE);
  const needed = lines.length * BODY_LINE_HEIGHT + BLOCK_GAP;
  const placed = ensureSpace(ctx, cursor, needed);
  lines.forEach((line, index) => {
    placed.page.drawText(line, {
      x: ctx.margins.left,
      y: placed.cursorY - BODY_LINE_HEIGHT * (index + 1) + 3,
      size: BODY_SIZE,
      font: ctx.regular,
    });
  });
  return { page: placed.page, cursorY: placed.cursorY - lines.length * BODY_LINE_HEIGHT - 2 };
};

const drawTableBlock = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  columns: PdfTableColumn[],
  rows: string[][],
  placeholder: string,
): PageCursor => {
  if (rows.length === 0) return drawBodyLines(ctx, cursor, placeholder);
  const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, columns, rows);
  return { page: result.page, cursorY: result.cursorY };
};

const toItemRow = (item: LogisticsPdfItem): string[] => [
  '[ ]',
  item.label.trim() === '' ? 'Untitled item' : item.label,
  String(item.quantity),
  formatLogisticsKg(item.unitKg),
  formatLogisticsKg(item.lineKg),
  formatItemVolume(item),
];

const drawContainer = (ctx: PdfDocumentContext, cursor: PageCursor, container: LogisticsPdfContainer): PageCursor => {
  const specs = [
    `TARE ${formatLogisticsKg(container.tareKg)}`,
    `MAX ${formatLogisticsKg(container.maxPayloadKg)}`,
    formatLiters(container.usableVolumeL),
    container.dimensionsLabel ?? null,
  ].filter((bit): bit is string => bit !== null);
  let placed = ensureSpace(ctx, cursor, GROUP_TITLE_SIZE + 26);
  placed.page.drawText(
    sanitizePdfText(
      `${container.kindLabel} - ${container.name}${container.parentName ? ` (in ${container.parentName})` : ''}`,
    ),
    {
      x: ctx.margins.left,
      y: placed.cursorY - GROUP_TITLE_SIZE,
      size: GROUP_TITLE_SIZE,
      font: ctx.bold,
    },
  );
  placed = { page: placed.page, cursorY: placed.cursorY - GROUP_TITLE_SIZE - 2 };
  placed = drawBodyLines(ctx, placed, specs.join(' - '));
  placed = drawBodyLines(
    ctx,
    placed,
    `Day: ${container.dayLabel ?? 'not routed'} - To: ${container.locationLabel ?? 'not set'}`,
  );
  if (container.notes && container.notes.trim() !== '') {
    placed = drawBodyLines(ctx, placed, container.notes.trim());
  }
  placed = drawTableBlock(
    ctx,
    placed,
    ITEM_COLUMNS,
    container.items.map(toItemRow),
    'Nothing packed in here yet.',
  );
  placed = drawBodyLines(
    ctx,
    placed,
    `Total incl. tare: ${formatLogisticsKg(container.totalWeightKg)} - ${formatLiters(container.totalVolumeL)}`,
  );
  if (container.verdict && container.verdict.trim() !== '') {
    placed = drawBodyLines(ctx, placed, container.verdict.trim());
  }
  return { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };
};

/** Render the logistics plan and return the finished PDF bytes. */
export const createLogisticsPdf = async (input: LogisticsPdfInput): Promise<Uint8Array> => {
  const containerCount = input.groups.reduce((sum, group) => sum + group.containers.length, 0);
  const subtitleBits = [
    input.scopeLabel && input.scopeLabel.trim() !== '' ? input.scopeLabel.trim() : null,
    `${containerCount} container${containerCount === 1 ? '' : 's'} - ${input.unassignedItems.length} unpacked`,
  ].filter((bit): bit is string => bit !== null);

  const ctx = await createPdfDocument({
    title: `Logistics Plan - ${input.productionTitle}`,
    subject: 'Logistics plan',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Logistics Plan',
    subtitle: subtitleBits.join('  |  '),
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  if (input.fleet) {
    cursor = drawBodyLines(
      ctx,
      cursor,
      `Known weight incl. nested (top level): ${formatLogisticsKg(input.fleet.knownWeightKg)} - ` +
        `Items without a weight: ${input.fleet.unknownWeightItemCount} - ` +
        `Top-level containers with unknown weight: ${input.fleet.topLevelWithUnknownWeight}`,
    );
  }

  if (input.groups.length === 0) {
    cursor = drawBodyLines(ctx, cursor, 'No containers packed yet.');
  } else {
    for (const group of input.groups) {
      cursor = drawSectionTitle(ctx, cursor, group.title);
      for (const container of group.containers) {
        cursor = drawContainer(ctx, cursor, container);
      }
    }
  }

  if (input.unassignedItems.length > 0) {
    cursor = drawSectionTitle(ctx, cursor, 'Not packed yet');
    cursor = drawTableBlock(
      ctx,
      cursor,
      ITEM_COLUMNS,
      input.unassignedItems.map(toItemRow),
      'Everything is packed.',
    );
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  drawBodyLines(
    ctx,
    cursor,
    'Unknown values print as an em dash and are never counted as zero.',
  );

  return finalizePdfDocument(ctx);
};
