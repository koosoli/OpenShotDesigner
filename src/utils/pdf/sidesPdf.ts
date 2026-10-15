/**
 * Script sides PDF (roadmap Phase 3: script family).
 *
 * Printable data model (mirrors `ScriptSidesPrintView` and the `ScriptSides`
 * domain from `src/domain/script/sides.ts`, flattened so the PDF layer stays
 * React-free):
 * - Every scene in shooting order, set in 10pt Courier on the screenplay's
 *   columns and page rules (see `createSidesPdf`), each followed by a cast
 *   line. Omitted scenes print their `SCENE n — OMITTED` slug only.
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
import type { PdfOrientation, PdfPageSize } from './document';
import { buildPdfFilename } from './filenames';
import { sanitizePdfText } from './text';
import { paginateScreenplay } from '../../domain/script/pagination';
import { StandardFonts, rgb } from 'pdf-lib';

const HIGHLIGHT = rgb(1, 0.93, 0.45);

/** One screenplay line inside a sides scene, mirroring `SidesLine`. */
export interface SidesPdfLine {
  type?: string;
  text: string;
  /** On a character cue: dual dialogue, beside the speech above. */
  dual?: boolean;
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
  /**
   * Highlight this character's cues and speeches, the way an actor marks
   * their sides. Defaults to `characterFilter`; pass `null` to switch it off.
   */
  highlightCharacter?: string | null;
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
  /** Automatic (CONT'D) on a repeated speaker, as the project sets it. Default on. */
  autoContd?: boolean;
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
  dual?: boolean;
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
        : chunk.lines.map((line) => ({ type: line.type, text: line.text, ...(line.dual ? { dual: true } : {}) })),
      characters,
    });
  }
  return { scenes, missingSceneIds };
};

/** Sides are set in 10pt Courier: 60 columns are 5", leaving room for scene numbers. */
const SIDES_SIZE = 10;
const SIDES_COLUMN = SIDES_SIZE * 0.6;
const SIDES_LINE = 11.5;

/** Type style per element; the columns come from the shared screenplay layout. */
const STYLE: Record<string, { bold: boolean; upper: boolean }> = {
  scene: { bold: true, upper: true },
  character: { bold: false, upper: true },
  transition: { bold: false, upper: true },
  shot: { bold: true, upper: true },
};

/**
 * Render the script sides and return the finished PDF bytes.
 *
 * The scenes are laid out by the same rules as the screenplay
 * (domain/script/pagination), on the sides' compact page: a speech that runs
 * over a page gets (MORE) and its cue again as (CONT'D), dual dialogue sits
 * side by side, a repeated speaker gets (CONT'D), and headings and cues are
 * never stranded at the foot of a page. The highlighted performer's cues and
 * speeches are marked the way an actor marks their sides.
 */
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
  const fonts = {
    regular: await ctx.doc.embedFont(StandardFonts.Courier),
    bold: await ctx.doc.embedFont(StandardFonts.CourierBold),
  };
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const firstPage = addPdfPage(ctx);
  const subtitle =
    input.subtitle ??
    (input.characterFilter ? `Sides for ${input.characterFilter}` : `${input.scenes.length} scene${input.scenes.length === 1 ? '' : 's'}`);
  const headerY = drawDocumentHeader(ctx, firstPage, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Script Sides',
    subtitle,
    logo,
  });

  if (input.scenes.length === 0) {
    firstPage.drawText(
      sanitizePdfText(
        input.characterFilter
          ? `No scenes selected for these sides (no scenes with dialogue for ${input.characterFilter}).`
          : 'No scenes selected for these sides.',
      ),
      { x: ctx.margins.left, y: headerY - 12, size: 10, font: ctx.regular },
    );
    return finalizePdfDocument(ctx);
  }

  // One script: every scene in shooting order, its cast under it.
  const lines: Array<{ id: string; type?: string; text: string; omitted?: boolean; dual?: boolean; sceneNumber?: string; cast?: boolean }> = [];
  input.scenes.forEach((scene, sceneIndex) => {
    if (scene.omitted) {
      lines.push({ id: `s${sceneIndex}`, type: 'scene', text: scene.heading, omitted: true, sceneNumber: scene.sceneNumber });
      return;
    }
    scene.lines.forEach((line, index) => {
      lines.push({
        id: `s${sceneIndex}-${index}`,
        text: line.text,
        ...(line.type ? { type: line.type } : {}),
        ...(line.dual ? { dual: true } : {}),
        ...(line.type === 'scene' ? { sceneNumber: scene.sceneNumber } : {}),
      });
    });
    if (scene.characters.length > 0) lines.push({ id: `s${sceneIndex}-cast`, type: 'action', text: `Cast: ${scene.characters.join(', ')}`, cast: true });
  });

  // The speeches the highlighted performer speaks: their cue and what follows it.
  const highlight = input.highlightCharacter === null ? undefined : input.highlightCharacter ?? input.characterFilter;
  const highlightName = highlight ? canonicalCueName(highlight) : undefined;
  const highlighted = new Set<number>();
  let speaking = false;
  lines.forEach((line, index) => {
    if (line.type === 'character') speaking = !!highlightName && canonicalCueName(line.text) === highlightName;
    else if (line.type !== 'dialogue' && line.type !== 'parenthetical') speaking = false;
    if (speaking) highlighted.add(index);
  });

  // The first page holds the title block: a blank paragraph fills its room.
  const left = ctx.margins.left + 18;
  const bodyTop = ctx.contentTop;
  const rowsPerPage = Math.floor((bodyTop - ctx.margins.bottom) / SIDES_LINE);
  const titleRows = Math.max(1, Math.ceil((bodyTop - headerY) / SIDES_LINE));
  const spacer = { id: 'title-block', type: 'action', text: Array.from({ length: titleRows }, () => '').join('\n') };
  const { pages } = paginateScreenplay([spacer, ...lines], { rowsPerPage, autoContd: input.autoContd !== false });

  pages.forEach((laid, pageIndex) => {
    const page = pageIndex === 0 ? firstPage : addPdfPage(ctx);
    for (const line of laid.lines) {
      if (line.index === 0) continue;
      const source = lines[line.index - 1];
      const style = STYLE[line.type] ?? { bold: false, upper: false };
      const text = sanitizePdfText(`${line.kind === 'body' && style.upper ? line.text.toUpperCase() : line.text}${line.suffix ?? ''}`);
      if (!text) continue;
      const marked = highlighted.has(line.index - 1) && line.kind !== 'more';
      const bold = line.kind === 'omitted' || (line.kind === 'body' && style.bold) || (line.type === 'character' && marked);
      const font = source?.cast ? ctx.regular : bold ? fonts.bold : fonts.regular;
      const size = source?.cast ? 8.5 : SIDES_SIZE;
      const x = left + line.col * SIDES_COLUMN;
      const y = bodyTop - SIDES_LINE * (line.row + 1) + 3;
      if (marked) {
        page.drawRectangle({ x: x - 1.5, y: y - 2.5, width: font.widthOfTextAtSize(text, size) + 3, height: SIDES_LINE - 0.5, color: HIGHLIGHT });
      }
      page.drawText(text, { x, y, size, font });
      if (line.first && line.type === 'scene' && source?.sceneNumber) {
        page.drawText(sanitizePdfText(source.sceneNumber), { x: ctx.margins.left - 4, y, size: SIDES_SIZE, font: fonts.bold });
      }
    }
  });

  if ((input.missingSceneIds ?? []).length > 0) {
    const last = ctx.doc.getPage(ctx.doc.getPageCount() - 1);
    const note = `${(input.missingSceneIds ?? []).length} requested scene(s) no longer exist in the script.`;
    last.drawText(sanitizePdfText(note), { x: ctx.margins.left, y: ctx.margins.bottom + 4, size: 8.5, font: ctx.regular });
  }
  return finalizePdfDocument(ctx);
};
