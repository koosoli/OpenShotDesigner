/**
 * Crew + cast contact sheet PDF (roadmap Phase 3: people report).
 *
 * Printable data model (mirrors `CrewSheetPrintView` over `CrewSheetData`
 * from `domain/reports/crewSheet`, plus the cast list from
 * `ContactListPrintView`):
 * - Show-day timeline (time + item), crew grouped by department with
 *   Name / Role / Phone / Email columns, and the cast list
 *   (Character / Performer / Phone / Email). Phone and email columns are the
 *   point of the sheet: the office copy carries every number held, while the
 *   private number never leaves the contacts module.
 *
 * Phone fallback mirrors `callSheetPhone` (production number first, then the
 * work number; the private number is never printed) without importing
 * runtime domain code, keeping this layer React-free.
 *
 * Portrait A4 by default (roster tables read fine narrow); StandardFonts
 * only (offline); every drawn string passes through `sanitizePdfText` via
 * the shared shell and table renderer.
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
import { drawPdfTable } from './tables';
import type { PdfTableColumn } from './tables';
import { sanitizePdfText } from './text';
import type { PDFPage } from 'pdf-lib';
import type { CastAssignment, Person } from '../../domain/people';
import type { CrewSheetData } from '../../domain/reports/crewSheet';
import type { Character } from '../../domain/script/types';

export interface CrewSheetPdfTimelineEntry {
  /** "HH:MM" when the cue carries a parseable planned start. */
  start?: string;
  label: string;
}

export interface CrewSheetPdfMember {
  name: string;
  role?: string;
  phone?: string;
  email?: string;
}

export interface CrewSheetPdfDepartment {
  name: string;
  members: CrewSheetPdfMember[];
}

export interface CrewSheetPdfCastEntry {
  character: string;
  performer: string;
  phone?: string;
  email?: string;
}

export interface CrewSheetPdfInput {
  productionTitle: string;
  dayName?: string;
  date?: string;
  venue?: string;
  timeline?: CrewSheetPdfTimelineEntry[];
  departments: CrewSheetPdfDepartment[];
  /** Cast list (character <-> performer links); empty prints as one line. */
  cast?: CrewSheetPdfCastEntry[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface CrewSheetPdfFilenameInput {
  productionTitle: string;
  qualifier?: string;
  date?: string;
}

/** `my-film_crew-sheet_day-04.pdf`. */
export const buildCrewSheetPdfFilename = (input: CrewSheetPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'crew-sheet',
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

/** `my-film_contact-sheet.pdf`: the same sheet filed as a contact list. */
export const buildContactSheetPdfFilename = (input: CrewSheetPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'contact-sheet',
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const DEPARTMENT_LABELS: Record<string, string> = {
  camera: 'Camera',
  lighting: 'Lighting',
  audio: 'Audio',
  video: 'Video',
  stage: 'Stage',
  production: 'Production',
  other: 'Other',
};

/** The number the unit rings: production handset first, work number fallback. */
const unitPhoneFor = (person: Person): string | undefined => {
  const production = person.productionPhone?.trim();
  if (production) return production;
  const work = person.phone?.trim();
  return work ? work : undefined;
};

/**
 * Map a derived crew sheet onto PDF departments (print order, non-empty
 * buckets only). Contacts outside the buckets are preserved, not dropped.
 */
export const crewSheetDepartmentsFromCrewSheet = (sheet: CrewSheetData): CrewSheetPdfDepartment[] => {
  const departments: CrewSheetPdfDepartment[] = [];
  for (const [bucket, members] of Object.entries(sheet.departments)) {
    if (members.length === 0) continue;
    departments.push({
      name: DEPARTMENT_LABELS[bucket] ?? bucket,
      members: members.map((person) => ({
        name: person.displayName,
        ...(person.role === undefined ? {} : { role: person.role }),
        ...(unitPhoneFor(person) === undefined ? {} : { phone: unitPhoneFor(person) }),
        ...(person.email === undefined ? {} : { email: person.email }),
      })),
    });
  }
  return departments;
};

/**
 * Map people + characters + cast assignments onto PDF cast rows, sorted by
 * character name like `ContactListPrintView`. Uncast characters print as
 * "not cast" rather than vanishing.
 */
export const crewSheetCastFromContactList = (
  people: Person[],
  characters: Character[],
  assignments: CastAssignment[],
): CrewSheetPdfCastEntry[] =>
  characters
    .map((character) => {
      const assignment = assignments.find((candidate) => candidate.characterId === character.id);
      const person = assignment ? people.find((candidate) => candidate.id === assignment.personId) : undefined;
      return {
        character: character.canonicalName,
        performer: person?.displayName ?? 'not cast',
        ...(person && unitPhoneFor(person) !== undefined ? { phone: unitPhoneFor(person) } : {}),
        ...(person?.email !== undefined ? { email: person.email } : {}),
      };
    })
    .sort((a, b) => a.character.localeCompare(b.character));

const SECTION_TITLE_SIZE = 11;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const SECTION_GAP = 10;
const BLOCK_GAP = 6;

const TIMELINE_COLUMNS: PdfTableColumn[] = [
  { header: 'Time', widthFrac: 22, align: 'center' },
  { header: 'Item', widthFrac: 78 },
];

const CREW_COLUMNS: PdfTableColumn[] = [
  { header: 'Name', widthFrac: 28 },
  { header: 'Role', widthFrac: 26 },
  { header: 'Phone', widthFrac: 23 },
  { header: 'Email', widthFrac: 23 },
];

const CAST_COLUMNS: PdfTableColumn[] = [
  { header: 'Character', widthFrac: 28 },
  { header: 'Performer', widthFrac: 28 },
  { header: 'Phone', widthFrac: 22 },
  { header: 'Email', widthFrac: 22 },
];

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

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

const drawTableBlock = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  columns: PdfTableColumn[],
  rows: string[][],
  placeholder: string,
): PageCursor => {
  if (rows.length === 0) {
    return drawKeyValue(ctx, cursor, 'None', placeholder);
  }
  const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, columns, rows);
  return { page: result.page, cursorY: result.cursorY };
};

/** Render the crew + cast contact sheet and return the finished PDF bytes. */
export const createCrewSheetPdf = async (input: CrewSheetPdfInput): Promise<Uint8Array> => {
  const scopeBits = [
    input.dayName && input.dayName.trim() !== '' ? input.dayName.trim() : null,
    input.date && input.date.trim() !== '' ? input.date.trim() : null,
    input.venue && input.venue.trim() !== '' ? input.venue.trim() : null,
  ].filter((bit): bit is string => bit !== null);
  const ctx = await createPdfDocument({
    title: `Crew Sheet - ${input.productionTitle}`,
    subject: 'Crew sheet',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'portrait',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Crew Sheet',
    subtitle: scopeBits.join('  |  '),
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  cursor = drawSectionTitle(ctx, cursor, 'Show day timeline');
  cursor = drawTableBlock(
    ctx,
    cursor,
    TIMELINE_COLUMNS,
    (input.timeline ?? []).map((entry) => [entry.start ?? '-', entry.label]),
    'No run-of-show cues for this day.',
  );
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  for (const department of input.departments) {
    cursor = drawSectionTitle(ctx, cursor, department.name);
    cursor = drawTableBlock(
      ctx,
      cursor,
      CREW_COLUMNS,
      department.members.map((member) => [member.name, member.role ?? '-', member.phone ?? '-', member.email ?? '-']),
      'No crew in this department.',
    );
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  }
  if (input.departments.length === 0) {
    cursor = drawSectionTitle(ctx, cursor, 'Contacts');
    cursor = drawKeyValue(ctx, cursor, 'Contacts', 'No crew listed.');
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  cursor = drawSectionTitle(ctx, cursor, 'Cast list');
  cursor = drawTableBlock(
    ctx,
    cursor,
    CAST_COLUMNS,
    (input.cast ?? []).map((entry) => [
      entry.character,
      entry.performer,
      entry.phone ?? '-',
      entry.email ?? '-',
    ]),
    'No cast list for this production.',
  );

  return finalizePdfDocument(ctx);
};
