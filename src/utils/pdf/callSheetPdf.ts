/**
 * Call sheet PDF (roadmap Phase 3: THE production document).
 *
 * Printable data model (mirrors `CallSheetData` from
 * `src/domain/reports/callSheet.ts`, flattened so the PDF layer stays
 * React-free):
 * - Header: production title, day name, date, crew call, planned wrap,
 *   revision label (`REV n`) or `DRAFT` status.
 * - Shooting schedule: strips with scene number, slugline, label, location,
 *   start time and estimate, grouped under scene headings.
 * - Cast and crew tables with individual call times and call notes.
 * - Locations, transport pick-ups, weather / safety / logistics notes.
 *
 * Portrait A4 by default; StandardFonts only (offline); every drawn string
 * passes through `sanitizePdfText` via the shared shell and table renderer.
 */

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
import type { PDFPage } from 'pdf-lib';

/** One shooting-schedule strip on the call sheet. */
export interface CallSheetPdfStrip {
  /** Scene number the strip belongs to; groups strips under one heading. */
  scene?: string;
  /** Slugline the strip shoots under, e.g. "INT. LIVING ROOM - DAY". */
  slugline?: string;
  /** Strip label, e.g. "Sc 4 - Night Diner" or "Lunch". */
  label: string;
  location?: string;
  /** Derived clock time, e.g. "08:30". */
  start?: string;
  estimatedMinutes?: number;
  kind?: string;
}

/** One cast or crew line with their individual call. */
export interface CallSheetPdfPerson {
  name: string;
  role?: string;
  department?: string;
  /** Personal call time; absent means the general crew call applies. */
  callTime?: string;
  callNote?: string;
  phone?: string;
  pickup?: string;
}

/** One shooting location on the call sheet. */
export interface CallSheetPdfLocation {
  name: string;
  address?: string;
}

export interface CallSheetPdfPickup {
  name: string;
  role?: string;
  time?: string;
  location?: string;
  notes?: string;
}

export interface CallSheetPdfInput {
  productionTitle: string;
  dayName: string;
  date?: string;
  crewCall?: string;
  plannedWrap?: string;
  /** True until the day is marked final; drives the DRAFT watermark. */
  isDraft?: boolean;
  /** Explicit lifecycle alternative to `isDraft`. */
  status?: 'draft' | 'final';
  /** Latest issued revision; prints as "REV n" in the header and filename. */
  revision?: number;
  issuedAt?: string;
  schedule?: CallSheetPdfStrip[];
  cast?: CallSheetPdfPerson[];
  crew?: CallSheetPdfPerson[];
  locations?: CallSheetPdfLocation[];
  pickups?: CallSheetPdfPickup[];
  weatherSummary?: string;
  safetyNotes?: string;
  generalNotes?: string;
  parking?: string;
  unitBase?: string;
  walkieChannels?: string;
  nearestHospital?: string;
  totalEstimatedMinutes?: number | null;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface CallSheetPdfFilenameInput {
  productionTitle: string;
  dayName: string;
  revision?: number;
  date?: string;
}

/** `my-film_call-sheet_day-04_rev-2.pdf`; drafts carry no revision segment. */
export const buildCallSheetPdfFilename = (input: CallSheetPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'call-sheet',
    qualifier: input.dayName,
    ...(input.revision === undefined ? {} : { revision: input.revision }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

/** Header/footer status stamp: "REV n", or "DRAFT" for unissued sheets. */
export const callSheetRevisionLabel = (input: Pick<CallSheetPdfInput, 'isDraft' | 'status' | 'revision'>): string => {
  if (input.revision !== undefined) return `REV ${input.revision}`;
  return resolveIsDraft(input) ? 'DRAFT' : 'FINAL';
};

const resolveIsDraft = (input: Pick<CallSheetPdfInput, 'isDraft' | 'status'>): boolean =>
  input.isDraft ?? (input.status !== undefined ? input.status === 'draft' : false);

const SECTION_TITLE_SIZE = 11;
const GROUP_TITLE_SIZE = 9.5;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const SECTION_GAP = 10;
const BLOCK_GAP = 6;

const SCHEDULE_COLUMNS: PdfTableColumn[] = [
  { header: 'Start', widthFrac: 11, align: 'center' },
  { header: 'Scene', widthFrac: 9, align: 'center' },
  { header: 'Strip', widthFrac: 42 },
  { header: 'Location', widthFrac: 24 },
  { header: 'Est.', widthFrac: 14, align: 'center' },
];

const CAST_COLUMNS: PdfTableColumn[] = [
  { header: 'Name', widthFrac: 26 },
  { header: 'Role', widthFrac: 24 },
  { header: 'Call', widthFrac: 11, align: 'center' },
  { header: 'Note / Pick-up', widthFrac: 23 },
  { header: 'Phone', widthFrac: 16 },
];

const CREW_COLUMNS: PdfTableColumn[] = [
  { header: 'Name', widthFrac: 28 },
  { header: 'Department / Role', widthFrac: 30 },
  { header: 'Call', widthFrac: 11, align: 'center' },
  { header: 'Contact / Note', widthFrac: 31 },
];

const LOCATION_COLUMNS: PdfTableColumn[] = [
  { header: 'Location', widthFrac: 34 },
  { header: 'Address', widthFrac: 66 },
];

const PICKUP_COLUMNS: PdfTableColumn[] = [
  { header: 'Name', widthFrac: 24 },
  { header: 'Time', widthFrac: 11, align: 'center' },
  { header: 'Pick-up Point', widthFrac: 32 },
  { header: 'Notes', widthFrac: 33 },
];

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

const formatEstimate = (minutes: number | undefined): string =>
  minutes === undefined ? '' : minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;

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

/** Single "Label: value" line; kept in one drawText call so tokens stay contiguous. */
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

const drawPlaceholder = (ctx: PdfDocumentContext, cursor: PageCursor, text: string): PageCursor =>
  drawBodyLines(ctx, cursor, text);

const drawTableBlock = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  columns: PdfTableColumn[],
  rows: string[][],
  placeholder: string,
): PageCursor => {
  if (rows.length === 0) return drawPlaceholder(ctx, cursor, placeholder);
  const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, columns, rows);
  return { page: result.page, cursorY: result.cursorY };
};

const stripGroupKey = (strip: CallSheetPdfStrip): string => `${strip.scene ?? ''}|${strip.slugline ?? ''}`;

const stripGroupHeading = (strip: CallSheetPdfStrip): string | undefined => {
  if (strip.slugline && strip.slugline.trim() !== '') {
    return strip.scene && strip.scene.trim() !== ''
      ? `Sc ${strip.scene.trim()} - ${strip.slugline.trim()}`
      : strip.slugline.trim();
  }
  if (strip.scene && strip.scene.trim() !== '') return `Sc ${strip.scene.trim()}`;
  return undefined;
};

interface StripGroup {
  heading: string | undefined;
  strips: CallSheetPdfStrip[];
}

/** Consecutive strips under one scene/slugline share a heading; unslated strips pass through. */
const groupScheduleStrips = (strips: CallSheetPdfStrip[]): StripGroup[] => {
  const groups: StripGroup[] = [];
  for (const strip of strips) {
    const heading = stripGroupHeading(strip);
    const key = stripGroupKey(strip);
    const current = groups[groups.length - 1];
    if (heading === undefined) {
      if (current && current.heading === undefined) current.strips.push(strip);
      else groups.push({ heading: undefined, strips: [strip] });
      continue;
    }
    if (current && current.heading !== undefined && stripGroupKey(current.strips[0]) === key) {
      current.strips.push(strip);
    } else {
      groups.push({ heading, strips: [strip] });
    }
  }
  return groups;
};

const drawSchedule = (ctx: PdfDocumentContext, cursor: PageCursor, strips: CallSheetPdfStrip[]): PageCursor => {
  let placed = drawSectionTitle(ctx, cursor, 'Shooting Schedule');
  if (strips.length === 0) return drawPlaceholder(ctx, placed, 'No strips scheduled for this day.');
  for (const group of groupScheduleStrips(strips)) {
    if (group.heading !== undefined) {
      placed = ensureSpace(ctx, placed, GROUP_TITLE_SIZE + 26);
      placed.page.drawText(sanitizePdfText(group.heading), {
        x: ctx.margins.left,
        y: placed.cursorY - GROUP_TITLE_SIZE,
        size: GROUP_TITLE_SIZE,
        font: ctx.bold,
      });
      placed = { page: placed.page, cursorY: placed.cursorY - GROUP_TITLE_SIZE - 4 };
    }
    const rows = group.strips.map((strip) => [
      strip.start ?? '',
      strip.scene ?? '',
      strip.label,
      strip.location ?? '',
      formatEstimate(strip.estimatedMinutes),
    ]);
    placed = drawTableBlock(ctx, placed, SCHEDULE_COLUMNS, rows, 'No strips in this group.');
  }
  return { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };
};

const personNote = (person: CallSheetPdfPerson): string =>
  [person.callNote, person.pickup].filter((part) => part && part.trim() !== '').join(' / ');

const drawPeople = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  title: string,
  columns: PdfTableColumn[],
  people: CallSheetPdfPerson[],
  toRow: (person: CallSheetPdfPerson) => string[],
  emptyText: string,
): PageCursor => {
  const headed = drawSectionTitle(ctx, cursor, title);
  const placed = drawTableBlock(ctx, headed, columns, people.map(toRow), emptyText);
  return { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };
};

const drawNotes = (ctx: PdfDocumentContext, cursor: PageCursor, input: CallSheetPdfInput): PageCursor => {
  let placed = drawSectionTitle(ctx, cursor, 'Weather, Safety & Notes');
  const blocks: Array<{ label: string; value: string | undefined }> = [
    { label: 'Weather', value: input.weatherSummary },
    { label: 'Safety', value: input.safetyNotes },
    { label: 'General notes', value: input.generalNotes },
    { label: 'Nearest hospital', value: input.nearestHospital },
    { label: 'Unit base', value: input.unitBase },
    { label: 'Parking', value: input.parking },
    { label: 'Walkie channels', value: input.walkieChannels },
  ];
  let drawn = 0;
  for (const block of blocks) {
    if (!block.value || block.value.trim() === '') continue;
    placed = drawKeyValue(ctx, placed, block.label, block.value.trim());
    drawn += 1;
  }
  if (drawn === 0) placed = drawPlaceholder(ctx, placed, 'No weather, safety or general notes recorded.');
  return { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };
};

/** Render the call sheet and return the finished PDF bytes. */
export const createCallSheetPdf = async (input: CallSheetPdfInput): Promise<Uint8Array> => {
  const isDraft = resolveIsDraft(input);
  const revisionLabel = callSheetRevisionLabel({ ...input, isDraft });
  const headerBits = [
    input.date && input.date.trim() !== '' ? input.date.trim() : null,
    input.crewCall && input.crewCall.trim() !== '' ? `Crew Call ${input.crewCall.trim()}` : null,
    revisionLabel,
  ].filter((bit): bit is string => bit !== null);

  const ctx = await createPdfDocument({
    title: `Call Sheet - ${input.productionTitle} - ${input.dayName}`,
    subject: 'Call sheet',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'portrait',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: isDraft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: `Call Sheet - ${input.dayName}`,
    subtitle: headerBits.join('  |  '),
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  // Header block: the day at a glance. Each fact is one drawText call so
  // values (crew call, wrap) stay searchable as contiguous tokens.
  cursor = drawSectionTitle(ctx, cursor, 'Day Details');
  cursor = drawKeyValue(ctx, cursor, 'Day', input.dayName);
  if (input.date && input.date.trim() !== '') cursor = drawKeyValue(ctx, cursor, 'Date', input.date.trim());
  if (input.crewCall && input.crewCall.trim() !== '') cursor = drawKeyValue(ctx, cursor, 'Crew Call', input.crewCall.trim());
  if (input.plannedWrap && input.plannedWrap.trim() !== '') {
    cursor = drawKeyValue(ctx, cursor, 'Planned Wrap', input.plannedWrap.trim());
  }
  cursor = drawKeyValue(ctx, cursor, 'Status', revisionLabel);
  if (input.issuedAt && input.issuedAt.trim() !== '') cursor = drawKeyValue(ctx, cursor, 'Issued', input.issuedAt.trim());
  if (input.totalEstimatedMinutes !== undefined && input.totalEstimatedMinutes !== null) {
    cursor = drawKeyValue(ctx, cursor, 'Estimated shooting time', formatEstimate(input.totalEstimatedMinutes));
  }
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  cursor = drawSchedule(ctx, cursor, input.schedule ?? []);

  cursor = drawPeople(ctx, cursor, 'Cast', CAST_COLUMNS, input.cast ?? [], (person) => [
    person.name,
    person.role ?? '',
    person.callTime ?? '',
    personNote(person),
    person.phone ?? '',
  ], 'No cast called for this day.');

  cursor = drawPeople(
    ctx,
    cursor,
    'Crew',
    CREW_COLUMNS,
    input.crew ?? [],
    (person) => [
      person.name,
      [person.department, person.role].filter((part) => part && part.trim() !== '').join(' / '),
      person.callTime ?? '',
      [person.phone, person.callNote, person.pickup].filter((part) => part && part.trim() !== '').join(' / '),
    ],
    'No crew listed for this day.',
  );

  cursor = drawSectionTitle(ctx, cursor, 'Locations');
  cursor = drawTableBlock(
    ctx,
    cursor,
    LOCATION_COLUMNS,
    (input.locations ?? []).map((location) => [location.name, location.address ?? '']),
    'No locations linked to this day.',
  );
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  cursor = drawSectionTitle(ctx, cursor, 'Transport & Pick-ups');
  cursor = drawTableBlock(
    ctx,
    cursor,
    PICKUP_COLUMNS,
    (input.pickups ?? []).map((pickup) => [
      pickup.role && pickup.role.trim() !== '' ? `${pickup.name} (${pickup.role.trim()})` : pickup.name,
      pickup.time ?? '',
      pickup.location ?? '',
      pickup.notes ?? '',
    ]),
    'No arranged pick-ups for this day.',
  );
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  drawNotes(ctx, cursor, input);

  return finalizePdfDocument(ctx);
};
