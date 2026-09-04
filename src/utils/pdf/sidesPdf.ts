/**
 * Script sides PDF (roadmap Phase 3: script family).
 *
 * Printable data model (mirrors `ScriptSidesPrintView` and the `ScriptSides`
 * domain from `src/domain/script/sides.ts`, flattened so the PDF layer stays
 * React-free):
 * - One block per scene in shooting order: scene header, screenplay lines in
 *   monospace flow with the print view's Courier column layout (character at
 *   column 22, dialogue at 10, parenthetical at 16, transitions right), and a
 *   cast line. Omitted scenes print their `SCENE n — OMITTED` slug only.
 * - Optional character filter: keeps the scenes where the character has a cue
 *   (mirrors `buildScriptSides`), and names the file after them.
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
import { wrapPdfCellText } from './tables';
import { sanitizePdfText } from './text';
import type { PDFPage } from 'pdf-lib';

/** One screenplay line inside a sides scene, mirroring `SidesLine`. */
export interface SidesPdfLine {
  type?: string;
  text: string;
}

/** One scene block in the sides, mirroring `SidesScene`. */
export interface SidesPdfScene {
  sceneId: string;
  sceneNumber: string;
  heading: string;
  omitted: boolean;
  lines: SidesPdfLine[];
  /** Canonical character names with dialogue in this scene. */
  characters: string[];
}

export interface SidesPdfInput {
  productionTitle: string;
  /** Scope line, e.g. "Day 3 - 2026-09-14". */
  subtitle?: string;
  scenes: SidesPdfScene[];
  /** Scenes kept for one performer, e.g. "JOHN". Names the file qualifier. */
  characterFilter?: string;
  missingSceneIds?: string[];
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

export interface SidesPdfFilenameInput {
  productionTitle: string;
  characterFilter?: string;
  date?: string;
}

/** `my-film_sides_john.pdf`, or `my-film_sides_all-scenes.pdf` unfiltered. */
export const buildSidesPdfFilename = (input: SidesPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'sides',
    qualifier: input.characterFilter ?? 'all-scenes',
    ...(input.date === undefined ? {} : { date: input.date }),
  });

/** Source line shape accepted by the sides mapper (structural `SidesLine`). */
export interface SidesPdfSourceLine {
  id: string;
  type?: string;
  text: string;
  sceneNumber?: string;
  omitted?: boolean;
}

export interface SidesPdfMapperOptions {
  /** Scenes to include, in the order given (shooting order). Omit for every scene. */
  sceneIds?: readonly string[];
  /** Keep only scenes where this character has a cue. */
  character?: string;
  /** Drop omitted scenes entirely instead of printing their OMITTED slug. */
  skipOmitted?: boolean;
}

const KNOWN_CUE_EXTENSION = /^(V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|PRE-?LAP|SUBTITLED?|FILTERED|ON PHONE)$/;

/** Canonical cue name: trimmed, whitespace-collapsed, uppercased, extension stripped. */
const canonicalCueName = (raw: string): string => {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  const trailing = collapsed.match(/\(([^()]*)\)\s*$/);
  const body =
    trailing && KNOWN_CUE_EXTENSION.test(trailing[1].replace(/\s+/g, ' ').trim().toUpperCase())
      ? collapsed.slice(0, trailing.index).replace(/\s+/g, ' ').trim()
      : collapsed;
  return body.toUpperCase();
};

const charactersInLines = (lines: readonly SidesPdfSourceLine[]): string[] => {
  const names = new Set<string>();
  for (const line of lines) {
    if (line.type !== 'character') continue;
    const name = canonicalCueName(line.text);
    if (name) names.add(name);
  }
  return [...names];
};

/**
 * Split raw script lines into sides scenes, mirroring `buildScriptSides`
 * (scene chunks, shooting-order selection, character filter, omitted slugs).
 * Lines before the first slugline form no scene and are dropped, as in print.
 */
export const sidesPdfScenesFromLines = (
  lines: readonly SidesPdfSourceLine[],
  options: SidesPdfMapperOptions = {},
): { scenes: SidesPdfScene[]; missingSceneIds: string[] } => {
  const chunks: Array<{ id: string; lines: SidesPdfSourceLine[] }> = [];
  for (const line of lines) {
    if (line.type === 'scene') {
      chunks.push({ id: line.id, lines: [line] });
      continue;
    }
    const current = chunks[chunks.length - 1];
    if (current) current.lines.push(line);
  }
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk] as const));
  const wanted = options.character ? canonicalCueName(options.character) : undefined;
  const order = options.sceneIds ? [...options.sceneIds] : chunks.map((chunk) => chunk.id);
  const numbers = new Map<string, string>();
  chunks.forEach((chunk, index) => {
    numbers.set(chunk.id, chunk.lines[0].sceneNumber || String(index + 1));
  });

  const scenes: SidesPdfScene[] = [];
  const missingSceneIds: string[] = [];
  for (const sceneId of order) {
    const chunk = byId.get(sceneId);
    if (!chunk) {
      missingSceneIds.push(sceneId);
      continue;
    }
    const heading = chunk.lines[0];
    const omitted = heading.omitted === true;
    if (omitted && options.skipOmitted) continue;
    const characters = charactersInLines(chunk.lines);
    if (wanted && !characters.includes(wanted)) continue;
    const sceneNumber = numbers.get(sceneId) ?? '';
    scenes.push({
      sceneId,
      sceneNumber,
      heading: omitted ? `SCENE ${sceneNumber} — OMITTED` : heading.text,
      omitted,
      lines: omitted
        ? [{ type: 'scene', text: `SCENE ${sceneNumber} — OMITTED` }]
        : chunk.lines.map((line) => ({ type: line.type, text: line.text })),
      characters,
    });
  }
  return { scenes, missingSceneIds };
};

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

/** Courier column grid from the print view: 60 columns, offsets in characters. */
const FLOW_LAYOUT: Record<string, { left: number; width: number; size: number; bold: boolean; upper: boolean }> = {
  scene: { left: 0, width: 60, size: 10, bold: true, upper: true },
  action: { left: 0, width: 60, size: 9, bold: false, upper: false },
  character: { left: 22, width: 38, size: 9.5, bold: true, upper: true },
  parenthetical: { left: 16, width: 25, size: 8.5, bold: false, upper: false },
  dialogue: { left: 10, width: 35, size: 9, bold: false, upper: false },
  transition: { left: 40, width: 20, size: 9, bold: false, upper: true },
  shot: { left: 0, width: 60, size: 9, bold: true, upper: true },
  note: { left: 0, width: 60, size: 8.5, bold: false, upper: false },
};

const FLOW_LINE_HEIGHT_FACTOR = 1.35;
const SCENE_TITLE_SIZE = 8.5;

/** New page when fewer than `needed` points remain above the footer zone. */
const ensureSpace = (ctx: PdfDocumentContext, cursor: PageCursor, needed: number): PageCursor => {
  if (cursor.cursorY - needed < ctx.margins.bottom) {
    const page = addPdfPage(ctx);
    return { page, cursorY: ctx.contentTop };
  }
  return cursor;
};

/** One wrapped flow line; kept in single drawText calls so text stays searchable. */
const drawFlowLine = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  text: string,
  leftChars: number,
  widthChars: number,
  size: number,
  bold: boolean,
): PageCursor => {
  const x = ctx.margins.left + (leftChars / 60) * ctx.contentWidth;
  const maxWidth = (widthChars / 60) * ctx.contentWidth;
  const font = bold ? ctx.bold : ctx.regular;
  const lines = wrapPdfCellText(font, text, maxWidth, size);
  const lineHeight = size * FLOW_LINE_HEIGHT_FACTOR;
  const placed = ensureSpace(ctx, cursor, lines.length * lineHeight);
  lines.forEach((line, index) => {
    placed.page.drawText(line, {
      x,
      y: placed.cursorY - lineHeight * (index + 1) + 3,
      size,
      font,
    });
  });
  return { page: placed.page, cursorY: placed.cursorY - lines.length * lineHeight };
};

const layoutFor = (type: string | undefined): { left: number; width: number; size: number; bold: boolean; upper: boolean } =>
  FLOW_LAYOUT[type ?? 'action'] ?? FLOW_LAYOUT.action;

const drawSceneBlock = (ctx: PdfDocumentContext, cursor: PageCursor, scene: SidesPdfScene): PageCursor => {
  // Scene band: number, heading cue and cast stay on one page with the first line.
  let placed = ensureSpace(ctx, cursor, 64);
  const band = scene.omitted
    ? `SCENE ${scene.sceneNumber} — OMITTED`
    : `SCENE ${scene.sceneNumber}`;
  placed.page.drawText(sanitizePdfText(band), {
    x: ctx.margins.left,
    y: placed.cursorY - SCENE_TITLE_SIZE,
    size: SCENE_TITLE_SIZE,
    font: ctx.bold,
  });
  placed = { page: placed.page, cursorY: placed.cursorY - SCENE_TITLE_SIZE - 5 };

  for (const line of scene.lines) {
    const layout = layoutFor(line.type);
    const text = layout.upper ? line.text.toUpperCase() : line.text;
    // Small gap before cues and sluglines, none inside a speech.
    const gap = line.type === 'character' || line.type === 'scene' ? 5 : 2;
    placed = { page: placed.page, cursorY: placed.cursorY - gap };
    placed = drawFlowLine(ctx, placed, text, layout.left, layout.width, layout.size, layout.bold);
  }

  if (scene.characters.length > 0 && !scene.omitted) {
    placed = { page: placed.page, cursorY: placed.cursorY - 3 };
    placed = drawFlowLine(ctx, placed, `Cast: ${scene.characters.join(', ')}`, 0, 60, 8, false);
  }
  return { page: placed.page, cursorY: placed.cursorY - 10 };
};

/** Render the script sides and return the finished PDF bytes. */
export const createSidesPdf = async (input: SidesPdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `Sides - ${input.productionTitle}`,
    subject: 'Script sides',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'portrait',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft ?? input.isDraft ?? false,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const subtitle =
    input.subtitle ??
    (input.characterFilter ? `Sides for ${input.characterFilter}` : `${input.scenes.length} scene${input.scenes.length === 1 ? '' : 's'}`);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Script Sides',
    subtitle,
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  if (input.scenes.length === 0) {
    cursor.page.drawText(
      sanitizePdfText(
        input.characterFilter
          ? `No scenes selected for these sides (no scenes with dialogue for ${input.characterFilter}).`
          : 'No scenes selected for these sides.',
      ),
      { x: ctx.margins.left, y: cursor.cursorY - 12, size: 10, font: ctx.regular },
    );
  } else {
    for (const scene of input.scenes) {
      cursor = drawSceneBlock(ctx, cursor, scene);
    }
    if ((input.missingSceneIds ?? []).length > 0) {
      const note = `${(input.missingSceneIds ?? []).length} requested scene(s) no longer exist in the script.`;
      cursor = ensureSpace(ctx, cursor, 20);
      cursor.page.drawText(sanitizePdfText(note), {
        x: ctx.margins.left,
        y: cursor.cursorY - 10,
        size: 8.5,
        font: ctx.regular,
      });
    }
  }
  return finalizePdfDocument(ctx);
};
