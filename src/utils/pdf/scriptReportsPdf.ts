/**
 * Script breakdown reports PDF (roadmap Phase 3: script family).
 *
 * Printable data model (mirrors `ScriptReportsPrintView`, flattened so the
 * PDF layer stays React-free):
 * - Scene list: number, INT/EXT, heading, time of day, pages (eighths),
 *   cast and tagged elements.
 * - Character report: character, cast-as, scene count, scene numbers.
 * - Location report: location, scene count, scene numbers, linked flag.
 * - Element breakdown: department, element, scenes, notes (scene links are
 *   read back off the scenes so the two sections can never disagree).
 * - Day out of days: one column per shooting day (SW/W/WF/H grid) plus a
 *   working-days total, mirroring the print view's labels.
 *
 * Row mappers take structural equivalents of the domain shapes
 * (`ScriptScene`, `CharacterReport`, `ScriptLocationBreakdown`, DOOD matrix)
 * as plain data — no domain imports, not even type-only.
 *
 * Landscape A4 by default (the grids need the width); StandardFonts only
 * (offline); every drawn string passes through `sanitizePdfText` via the
 * shared shell and table renderer.
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

export interface ScriptReportPdfScene {
  sceneNumber: string;
  intExt: string;
  heading: string;
  timeOfDay: string;
  pages: string;
  cast: string;
  elements: string;
}

export interface ScriptReportPdfCharacter {
  character: string;
  castAs: string;
  sceneCount: number;
  sceneNumbers: string;
}

export interface ScriptReportPdfLocation {
  name: string;
  sceneCount: number;
  sceneNumbers: string;
  linked: string;
}

export interface ScriptReportPdfElement {
  department: string;
  element: string;
  scenes: string;
  notes: string;
}

/** Day-out-of-days cell labels, mirroring the print view (`SW/W/WF/H`). */
export type DoodPdfStatus = 'start' | 'work' | 'finish' | 'hold' | 'off';

export interface DoodPdfColumn {
  dayName: string;
  date?: string;
}

export interface DoodPdfRow {
  displayName: string;
  /** One label per column: 'SW', 'W', 'WF', 'H' or '' for off. */
  cells: string[];
  workDays: number;
}

export interface ScriptReportsPdfSections {
  scenes?: boolean;
  characters?: boolean;
  locations?: boolean;
  elements?: boolean;
  dood?: boolean;
}

export interface ScriptReportsPdfInput {
  productionTitle: string;
  scenes?: ScriptReportPdfScene[];
  characters?: ScriptReportPdfCharacter[];
  locations?: ScriptReportPdfLocation[];
  elements?: ScriptReportPdfElement[];
  doodColumns?: DoodPdfColumn[];
  doodRows?: DoodPdfRow[];
  sections?: ScriptReportsPdfSections;
  /** True prints a DRAFT watermark; a string prints that label instead. */
  draft?: boolean | string;
  /** Explicit lifecycle alternative to `draft`. */
  isDraft?: boolean;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface ScriptReportsPdfFilenameInput {
  productionTitle: string;
  date?: string;
}

/** `my-film_script-breakdown.pdf`. */
export const buildScriptReportsPdfFilename = (input: ScriptReportsPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'script-breakdown',
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const SCENE_COLUMNS: PdfTableColumn[] = [
  { header: 'Sc.', widthFrac: 7, align: 'center' },
  { header: 'I/E', widthFrac: 7, align: 'center' },
  { header: 'Heading', widthFrac: 30 },
  { header: 'Time', widthFrac: 10 },
  { header: 'Pages', widthFrac: 8, align: 'center' },
  { header: 'Cast', widthFrac: 16 },
  { header: 'Elements', widthFrac: 22 },
];

const CHARACTER_COLUMNS: PdfTableColumn[] = [
  { header: 'Character', widthFrac: 24 },
  { header: 'Cast As', widthFrac: 24 },
  { header: 'Scenes', widthFrac: 9, align: 'center' },
  { header: 'Scene Numbers', widthFrac: 43 },
];

const LOCATION_COLUMNS: PdfTableColumn[] = [
  { header: 'Location', widthFrac: 34 },
  { header: 'Scenes', widthFrac: 10, align: 'center' },
  { header: 'Scene Numbers', widthFrac: 44 },
  { header: 'Linked', widthFrac: 12, align: 'center' },
];

const ELEMENT_COLUMNS: PdfTableColumn[] = [
  { header: 'Department', widthFrac: 20 },
  { header: 'Element', widthFrac: 28 },
  { header: 'Scenes', widthFrac: 24 },
  { header: 'Notes', widthFrac: 28 },
];

const DOOD_LABEL: Record<DoodPdfStatus, string> = { start: 'SW', work: 'W', finish: 'WF', hold: 'H', off: '' };
const INT_EXT_LABEL: Record<string, string> = { INT: 'INT', EXT: 'EXT', INT_EXT: 'I/E', OTHER: 'EST' };

/** Structural scene shape (mirrors `ScriptScene` fields the report reads). */
export interface ScriptReportSceneSource {
  sceneNumber: string;
  heading: string;
  intExt?: string;
  timeOfDay?: string | null;
  pageLengthEighths?: number;
  omitted?: boolean;
  characterIds: readonly string[];
  breakdownItemIds: readonly string[];
}

/**
 * Map plan scenes to report rows: INT/EXT labels, eighths pages, cast names
 * and tagged element names resolved off ids like the print view.
 */
export const scriptReportScenesFromScenes = (
  scenes: readonly ScriptReportSceneSource[],
  characters: readonly { id: string; canonicalName: string }[],
  breakdownItems: readonly { id: string; name: string }[],
): ScriptReportPdfScene[] => {
  const characterName = (id: string): string => characters.find((c) => c.id === id)?.canonicalName ?? '—';
  const itemName = (id: string): string | undefined => breakdownItems.find((i) => i.id === id)?.name;
  return scenes.map((scene) => ({
    sceneNumber: scene.sceneNumber,
    intExt: scene.intExt ? (INT_EXT_LABEL[scene.intExt] ?? '') : '',
    heading: scene.omitted ? `${scene.heading} (OMITTED)` : scene.heading,
    timeOfDay: scene.timeOfDay ?? '—',
    pages: scene.pageLengthEighths !== undefined ? `${scene.pageLengthEighths}/8` : '—',
    cast: scene.characterIds.map(characterName).join(', ') || '—',
    elements: scene.breakdownItemIds.map(itemName).filter((name): name is string => !!name).join(', ') || '—',
  }));
};

/** Structural character-report shape (mirrors `CharacterReport`). */
export interface ScriptReportCharacterSource {
  character?: { canonicalName: string };
  castPerson?: { displayName: string };
  scenes: readonly { sceneNumber: string }[];
}

/** Map character reports to rows: cast-as, scene count, scene numbers. */
export const scriptReportCharactersFromReports = (
  reports: readonly ScriptReportCharacterSource[],
): ScriptReportPdfCharacter[] =>
  reports.map((report) => ({
    character: report.character?.canonicalName ?? '—',
    castAs: report.castPerson?.displayName ?? 'not cast',
    sceneCount: report.scenes.length,
    sceneNumbers: report.scenes.map((scene) => scene.sceneNumber).join(', '),
  }));

/** Structural location-breakdown shape (mirrors `ScriptLocationBreakdown`). */
export interface ScriptReportLocationSource {
  name: string;
  locationId?: string;
  scenes: readonly { sceneNumber: string }[];
}

/** Map location breakdowns to rows. */
export const scriptReportLocationsFromBreakdown = (
  locations: readonly ScriptReportLocationSource[],
): ScriptReportPdfLocation[] =>
  locations.map((location) => ({
    name: location.name,
    sceneCount: location.scenes.length,
    sceneNumbers: location.scenes.map((scene) => scene.sceneNumber).join(', '),
    linked: location.locationId ? 'Yes' : '—',
  }));

/** Structural breakdown-item shape (mirrors `BreakdownItem`). */
export interface ScriptReportElementSource {
  id: string;
  category: string;
  name: string;
  notes?: string;
}

/**
 * Map tagged elements to rows. Scene numbers are read back off the scenes
 * (like the print view) so the two sections can never disagree.
 */
export const scriptReportElementsFromItems = (
  items: readonly ScriptReportElementSource[],
  scenes: readonly { sceneNumber: string; breakdownItemIds: readonly string[] }[],
): ScriptReportPdfElement[] => {
  const sceneNumbersByItemId = new Map<string, string[]>();
  for (const scene of scenes) {
    for (const id of scene.breakdownItemIds) {
      const bucket = sceneNumbersByItemId.get(id);
      if (bucket) bucket.push(scene.sceneNumber);
      else sceneNumbersByItemId.set(id, [scene.sceneNumber]);
    }
  }
  return items.map((item) => ({
    department: item.category.replace(/_/g, ' ').toUpperCase(),
    element: item.name,
    scenes: (sceneNumbersByItemId.get(item.id) ?? []).join(', ') || '—',
    notes: item.notes ?? '',
  }));
};

/** Structural DOOD shape (mirrors `deriveDood` output). */
export interface DoodPdfSource {
  columns: readonly { dayName: string; date?: string }[];
  rows: readonly { displayName: string; cells: readonly { status: DoodPdfStatus }[] }[];
}

/** Map the day-out-of-days matrix to printable labels plus working totals. */
export const doodPdfFromDood = (dood: DoodPdfSource): { columns: DoodPdfColumn[]; rows: DoodPdfRow[] } => ({
  columns: dood.columns.map((column) => ({
    dayName: column.dayName,
    ...(column.date === undefined ? {} : { date: column.date }),
  })),
  rows: dood.rows.map((row) => ({
    displayName: row.displayName,
    cells: row.cells.map((cell) => DOOD_LABEL[cell.status] ?? ''),
    workDays: row.cells.filter((cell) => cell.status !== 'off' && cell.status !== 'hold').length,
  })),
});

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

const SECTION_TITLE_SIZE = 11;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const SECTION_GAP = 10;
const BLOCK_GAP = 6;

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

const drawPlaceholder = (ctx: PdfDocumentContext, cursor: PageCursor, text: string): PageCursor => {
  const lines = wrapPdfCellText(ctx.regular, text, ctx.contentWidth, BODY_SIZE);
  const placed = ensureSpace(ctx, cursor, lines.length * BODY_LINE_HEIGHT + BLOCK_GAP);
  lines.forEach((line, index) => {
    placed.page.drawText(line, {
      x: ctx.margins.left,
      y: placed.cursorY - BODY_LINE_HEIGHT * (index + 1) + 3,
      size: BODY_SIZE,
      font: ctx.regular,
    });
  });
  return {
    page: placed.page,
    cursorY: placed.cursorY - lines.length * BODY_LINE_HEIGHT - SECTION_GAP + BLOCK_GAP,
  };
};

const drawTableBlock = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  columns: PdfTableColumn[],
  rows: string[][],
  placeholder: string,
): PageCursor => {
  if (rows.length === 0) return drawPlaceholder(ctx, cursor, placeholder);
  const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, columns, rows);
  return { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
};

const drawDood = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  columns: DoodPdfColumn[],
  rows: DoodPdfRow[],
): PageCursor => {
  let placed = drawSectionTitle(ctx, cursor, `Day Out of Days - ${columns.length} shooting days`);
  if (columns.length === 0) return drawPlaceholder(ctx, placed, 'No shooting days scheduled yet.');
  const dayFrac = columns.length > 0 ? 64 / columns.length : 0;
  const doodColumns: PdfTableColumn[] = [
    { header: 'Character / Performer', widthFrac: 28 },
    ...columns.map((column): PdfTableColumn => ({
      header: column.date ? `${column.dayName}\n${column.date.slice(5)}` : column.dayName,
      widthFrac: dayFrac,
      align: 'center',
    })),
    { header: 'Days', widthFrac: 8, align: 'center' },
  ];
  const tableRows = rows.map((row) => [row.displayName, ...row.cells, String(row.workDays)]);
  placed = drawTableBlock(ctx, placed, doodColumns, tableRows, 'No characters in the day out of days.');
  const legend = 'SW = start work - W = work - H = hold - WF = work finish. Derived from scene strips on each shooting day.';
  const legendLines = wrapPdfCellText(ctx.regular, legend, ctx.contentWidth, 8);
  const legendPlaced = ensureSpace(ctx, placed, legendLines.length * 8 * 1.35);
  legendLines.forEach((line, index) => {
    legendPlaced.page.drawText(line, {
      x: ctx.margins.left,
      y: legendPlaced.cursorY - 8 * 1.35 * (index + 1) + 3,
      size: 8,
      font: ctx.regular,
    });
  });
  return {
    page: legendPlaced.page,
    cursorY: legendPlaced.cursorY - legendLines.length * 8 * 1.35 - SECTION_GAP + BLOCK_GAP,
  };
};

/** Render the script breakdown reports and return the finished PDF bytes. */
export const createScriptReportsPdf = async (input: ScriptReportsPdfInput): Promise<Uint8Array> => {
  const sections: Required<ScriptReportsPdfSections> = {
    scenes: input.sections?.scenes ?? true,
    characters: input.sections?.characters ?? true,
    locations: input.sections?.locations ?? true,
    elements: input.sections?.elements ?? true,
    dood: input.sections?.dood ?? true,
  };
  const scenes = input.scenes ?? [];
  const characters = input.characters ?? [];
  const locations = input.locations ?? [];
  const elements = input.elements ?? [];
  const doodColumns = input.doodColumns ?? [];
  const doodRows = input.doodRows ?? [];
  const ctx = await createPdfDocument({
    title: `Script Breakdown - ${input.productionTitle}`,
    subject: 'Script breakdown',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft ?? input.isDraft ?? false,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Script Breakdown',
    subtitle: `${scenes.length} scene${scenes.length === 1 ? '' : 's'} - ${characters.length} characters - ${locations.length} locations`,
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  if (sections.scenes) {
    cursor = drawSectionTitle(ctx, cursor, `Scene List - ${scenes.length} scenes`);
    cursor = drawTableBlock(
      ctx,
      cursor,
      SCENE_COLUMNS,
      scenes.map((scene) => [scene.sceneNumber, scene.intExt, scene.heading, scene.timeOfDay, scene.pages, scene.cast, scene.elements]),
      'No scenes in this report.',
    );
  }
  if (sections.characters) {
    cursor = drawSectionTitle(ctx, cursor, `Character Report - ${characters.length} speaking characters`);
    cursor = drawTableBlock(
      ctx,
      cursor,
      CHARACTER_COLUMNS,
      characters.map((entry) => [entry.character, entry.castAs, String(entry.sceneCount), entry.sceneNumbers]),
      'No speaking characters in this report.',
    );
  }
  if (sections.locations) {
    cursor = drawSectionTitle(ctx, cursor, `Location Report - ${locations.length} locations`);
    cursor = drawTableBlock(
      ctx,
      cursor,
      LOCATION_COLUMNS,
      locations.map((entry) => [entry.name, String(entry.sceneCount), entry.sceneNumbers, entry.linked]),
      'No locations in this report.',
    );
  }
  if (sections.elements) {
    cursor = drawSectionTitle(ctx, cursor, `Element Breakdown - ${elements.length} elements`);
    cursor = drawTableBlock(
      ctx,
      cursor,
      ELEMENT_COLUMNS,
      elements.map((item) => [item.department, item.element, item.scenes, item.notes]),
      'Nothing tagged yet.',
    );
  }
  if (sections.dood) {
    drawDood(ctx, cursor, doodColumns, doodRows);
  }

  return finalizePdfDocument(ctx);
};
