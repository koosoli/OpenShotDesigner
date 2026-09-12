/**
 * Power plan PDF.
 *
 * Printable data model (mirrors `PowerPrintView` and its
 * `buildPowerPrintModel` read-only):
 * - Supplies: name, kind, service facts, known load, apparent and rated VA,
 *   phase-leg draw — the totals a gaffer checks against the service.
 * - Circuits: supply, phase leg, power factor, load, draw, rating, headroom;
 *   overloaded circuits print OVERLOAD, never a reassuring number.
 * - Consumers: fixture, quantity, load, where the wattage came from
 *   (entered / catalogue / curated table / unknown), circuit, truss, zone.
 *
 * Unknowns print as an em dash and are counted, never totalled as zero: a
 * sheet that says "2 consumers with no wattage" is useful, one that folds
 * them silently into a total is dangerous. Landscape A4 by default.
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
import { formatQuantity } from '../../domain/documentFormat';

/** Where a consumer wattage came from, so catalogue figures read differently. */
export type PowerPdfWattsSource = 'override' | 'profile' | 'fallback' | 'unknown';

export interface PowerPdfConsumer {
  name: string;
  quantity: number;
  /** Total watts for the quantity; null when the fixture draw is unknown. */
  watts: number | null;
  wattsSource: PowerPdfWattsSource;
  circuitName?: string;
  trussLabel?: string;
  distroZone?: string;
}

export interface PowerPdfCircuit {
  name: string;
  sourceName?: string;
  phaseLeg?: 1 | 2 | 3;
  powerFactor: number;
  watts: number;
  usedA: number | null;
  /** Breaker or outlet rating; undefined prints as unknown, never as zero. */
  maxAmperesA?: number;
  headroomA: number | null;
  overloaded: boolean | null;
}

export interface PowerPdfPhaseLeg {
  leg: 1 | 2 | 3;
  watts: number;
  ampsA: number | null;
}

export interface PowerPdfSource {
  name: string;
  kind: string;
  voltageV?: number;
  ampsPerPhaseA?: number;
  phases?: 1 | 3;
  knownWatts: number;
  apparentVA: number | null;
  capacityVA: number | null;
  overCapacity: boolean | null;
  legs: PowerPdfPhaseLeg[];
}

export interface PowerPdfInput {
  productionTitle: string;
  sceneName?: string;
  consumers: PowerPdfConsumer[];
  circuits: PowerPdfCircuit[];
  sources: PowerPdfSource[];
  /** Null when nothing could be totalled at all — never printed as 0. */
  totalKnownWatts: number | null;
  unknownConsumerCount: number;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface PowerPdfFilenameInput {
  productionTitle: string;
  sceneName?: string;
  date?: string;
}

/** `my-film_power-plan_scene-4.pdf`. */
export const buildPowerPdfFilename = (input: PowerPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'power-plan',
    ...(input.sceneName === undefined ? {} : { qualifier: input.sceneName }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const SOURCE_COLUMNS: PdfTableColumn[] = [
  { header: 'Supply', widthFrac: 18 },
  { header: 'Type', widthFrac: 12 },
  { header: 'Service', widthFrac: 18, align: 'center' },
  { header: 'Known load', widthFrac: 12, align: 'center' },
  { header: 'Apparent', widthFrac: 12, align: 'center' },
  { header: 'Rating', widthFrac: 12, align: 'center' },
  { header: 'Phase legs', widthFrac: 16 },
];

const CIRCUIT_COLUMNS: PdfTableColumn[] = [
  { header: 'Circuit', widthFrac: 18 },
  { header: 'Supply', widthFrac: 16 },
  { header: 'Leg', widthFrac: 7, align: 'center' },
  { header: 'pf', widthFrac: 7, align: 'center' },
  { header: 'Load', widthFrac: 13, align: 'center' },
  { header: 'Draw', widthFrac: 12, align: 'center' },
  { header: 'Rating', widthFrac: 12, align: 'center' },
  { header: 'Headroom', widthFrac: 15, align: 'center' },
];

const CONSUMER_COLUMNS: PdfTableColumn[] = [
  { header: 'Fixture', widthFrac: 24 },
  { header: 'Qty', widthFrac: 7, align: 'center' },
  { header: 'Load', widthFrac: 12, align: 'center' },
  { header: 'Wattage from', widthFrac: 14 },
  { header: 'Circuit', widthFrac: 15 },
  { header: 'Truss', widthFrac: 14 },
  { header: 'Distro zone', widthFrac: 14 },
];

const SECTION_TITLE_SIZE = 11;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const BLOCK_GAP = 6;
const SECTION_GAP = 10;

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

const WATTS_SOURCE_LABELS: Record<PowerPdfWattsSource, string> = {
  override: 'Entered',
  profile: 'Catalogue',
  fallback: 'Curated table',
  unknown: 'Unknown',
};

const formatWatts = (watts: number | null): string =>
  watts === null ? '---' : `${formatQuantity(Math.round(watts))} W`;

const formatAmps = (amps: number | null): string =>
  amps === null ? '---' : `${amps.toFixed(1)} A`;

const formatVA = (va: number | null): string =>
  va === null ? '---' : `${formatQuantity(Math.round(va))} VA`;

const formatService = (source: PowerPdfSource): string => {
  const bits = [
    source.voltageV === undefined ? null : `${source.voltageV} V`,
    source.ampsPerPhaseA === undefined ? null : `${source.ampsPerPhaseA} A`,
    source.phases === undefined ? null : `${source.phases}Ph`,
  ].filter((bit): bit is string => bit !== null);
  return bits.length > 0 ? bits.join(' - ') : '---';
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

/** Single "Label: value" line; kept in one drawText call so values stay searchable. */
const drawKeyValue = (ctx: PdfDocumentContext, cursor: PageCursor, label: string, value: string): PageCursor => {
  const placed = ensureSpace(ctx, cursor, BODY_LINE_HEIGHT + 2);
  placed.page.drawText(sanitizePdfText(`${label}: ${value}`), {
    x: ctx.margins.left,
    y: placed.cursorY - BODY_SIZE,
    size: BODY_SIZE,
    font: ctx.regular,
  });
  return { page: placed.page, cursorY: placed.cursorY - BODY_LINE_HEIGHT };
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

/** Render the power plan and return the finished PDF bytes. */
export const createPowerPdf = async (input: PowerPdfInput): Promise<Uint8Array> => {
  const subtitleBits = [
    input.sceneName && input.sceneName.trim() !== '' ? input.sceneName.trim() : null,
    `${input.consumers.length} consumer${input.consumers.length === 1 ? '' : 's'}`,
    `Known load ${formatWatts(input.totalKnownWatts)}`,
    input.unknownConsumerCount > 0 ? `+ ${input.unknownConsumerCount} unknown` : null,
  ].filter((bit): bit is string => bit !== null);

  const ctx = await createPdfDocument({
    title: `Power Plan - ${input.productionTitle}`,
    subject: 'Power plan',
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
    documentTitle: 'Power Plan',
    subtitle: subtitleBits.join('  |  '),
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  cursor = drawSectionTitle(ctx, cursor, 'Supplies');
  cursor = drawTableBlock(
    ctx,
    cursor,
    SOURCE_COLUMNS,
    input.sources.map((source) => [
      source.name,
      source.kind,
      formatService(source),
      formatWatts(source.knownWatts),
      formatVA(source.apparentVA),
      source.overCapacity === true ? `${formatVA(source.capacityVA)} OVER` : formatVA(source.capacityVA),
      source.legs.length === 0
        ? '---'
        : source.legs.map((leg) => `L${leg.leg} ${formatAmps(leg.ampsA)}`).join(' - '),
    ]),
    'No supplies recorded.',
  );
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  cursor = drawSectionTitle(ctx, cursor, 'Circuits');
  cursor = drawTableBlock(
    ctx,
    cursor,
    CIRCUIT_COLUMNS,
    input.circuits.map((circuit) => [
      circuit.name,
      circuit.sourceName ?? '---',
      circuit.phaseLeg === undefined ? '---' : `L${circuit.phaseLeg}`,
      circuit.powerFactor === 1 ? '---' : String(circuit.powerFactor),
      formatWatts(circuit.watts),
      formatAmps(circuit.usedA),
      circuit.maxAmperesA === undefined ? '---' : `${circuit.maxAmperesA} A`,
      circuit.overloaded === true ? 'OVERLOAD' : formatAmps(circuit.headroomA),
    ]),
    'No circuits recorded.',
  );
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  cursor = drawSectionTitle(ctx, cursor, 'Consumers');
  cursor = drawTableBlock(
    ctx,
    cursor,
    CONSUMER_COLUMNS,
    input.consumers.map((consumer) => [
      consumer.name,
      String(consumer.quantity),
      formatWatts(consumer.watts),
      WATTS_SOURCE_LABELS[consumer.wattsSource],
      consumer.circuitName ?? 'Unassigned',
      consumer.trussLabel ?? '---',
      consumer.distroZone ?? '---',
    ]),
    'No consumers - no lights on the plan and none added by hand.',
  );
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  cursor = drawKeyValue(ctx, cursor, 'Known load total', formatWatts(input.totalKnownWatts));
  if (input.unknownConsumerCount > 0) {
    cursor = drawBodyLines(
      ctx,
      cursor,
      `${input.unknownConsumerCount} consumer${input.unknownConsumerCount === 1 ? ' has' : 's have'} no known wattage and ${input.unknownConsumerCount === 1 ? 'is' : 'are'} NOT included in any total on this sheet.`,
    );
  }
  drawBodyLines(
    ctx,
    cursor,
    'Planning aid only - verify loads against fixture manuals and a qualified electrician.',
  );

  return finalizePdfDocument(ctx);
};
