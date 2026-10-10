/**
 * Shot list PDF.
 *
 * Printable data model (read from the app, mirrored here in minimal form):
 * - `SceneSetup.shots: Shot[]` carries sceneNumber, shotNumber, name,
 *   cameraLabel, shotSize, lensMm, cameraAngle, movement, status,
 *   framingDescription and equipmentNotes (see `src/types` and
 *   `src/utils/exportShotList.ts`, which exports the same columns to CSV).
 *
 * The PDF renders a readable subset in landscape: Scene, Shot, Name,
 * Camera, Size, Lens, Movement, Status, Notes (framing first, equipment as
 * fallback). Landscape is the default because nine columns need the width;
 * callers may override it.
 */

import { addPdfPage, createPdfDocument, drawDocumentHeader, embedProductionLogoPng, finalizePdfDocument } from './document';
import type { PdfOrientation, PdfPageSize } from './document';
import type { PDFImage } from 'pdf-lib';
import { drawPdfTable } from './tables';
import type { PdfTableColumn } from './tables';
import type { SceneSetup } from '../../types';

export interface ShotListPdfRow {
  scene: string;
  shot: string;
  name: string;
  camera: string;
  size: string;
  lens: string;
  movement: string;
  status: string;
  notes: string;
}

export interface ShotListPdfInput {
  productionTitle: string;
  /** Scope line under the heading, e.g. "Scene 4 - Night Diner". */
  subtitle?: string;
  rows: ShotListPdfRow[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
  /**
   * Storyboard column, as the shot list shows it: one frame per row (same
   * order as `rows`) at the chosen thumbnail size. Absent = no board column.
   */
  storyboards?: {
    size: ShotListBoardSize;
    /** Frame width / height. */
    aspectRatio: number;
    frames: ReadonlyArray<{ imageBytes?: Uint8Array; mimeType?: string } | undefined>;
  };
}

export type ShotListBoardSize = 'S' | 'M' | 'L' | 'XL';

/** Board column width in points per size — the shot list's S/M/L/XL. */
export const SHOT_LIST_PDF_BOARD_WIDTH: Record<ShotListBoardSize, number> = { S: 46, M: 80, L: 140, XL: 220 };

const SHOT_LIST_COLUMNS: PdfTableColumn[] = [
  { header: 'Scene', widthFrac: 7 },
  { header: 'Shot', widthFrac: 7 },
  { header: 'Name / Subject', widthFrac: 22 },
  { header: 'Cam', widthFrac: 6, align: 'center' },
  { header: 'Size', widthFrac: 8, align: 'center' },
  { header: 'Lens', widthFrac: 8, align: 'center' },
  { header: 'Movement', widthFrac: 12 },
  { header: 'Status', widthFrac: 9 },
  { header: 'Notes', widthFrac: 21 },
];

/**
 * Flatten setups (with their shots) into PDF rows in plan order, mirroring
 * the CSV exporter's column choices so paper and spreadsheet agree.
 */
export const shotListRowsFromSetups = (setups: SceneSetup[]): ShotListPdfRow[] => {
  const rows: ShotListPdfRow[] = [];
  for (const setup of setups) {
    for (const shot of setup.shots ?? []) {
      rows.push({
        scene: shot.sceneNumber || setup.sceneNumber || '',
        shot: shot.shotNumber || '',
        name: shot.name || '',
        camera: shot.cameraLabel || '',
        size: shot.shotSize || '',
        lens: shot.lensMm ? `${shot.lensMm}mm` : '',
        movement: shot.movement || '',
        status: shot.status || '',
        notes: shot.framingDescription || shot.equipmentNotes || '',
      });
    }
  }
  return rows;
};

/** Render the shot list and return the finished PDF bytes. */
export const createShotListPdf = async (input: ShotListPdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `Shot List - ${input.productionTitle}`,
    subject: 'Shot list',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const cursorY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Shot List',
    subtitle: input.subtitle ?? `${input.rows.length} shot${input.rows.length === 1 ? '' : 's'}`,
    logo,
  });

  if (input.rows.length === 0) {
    page.drawText('No shots in this selection.', {
      x: ctx.margins.left,
      y: cursorY - 12,
      size: 10,
      font: ctx.regular,
    });
  } else {
    const boards = input.storyboards;
    const images: Array<PDFImage | undefined> = [];
    if (boards) {
      for (const frame of boards.frames) {
        let image: PDFImage | undefined;
        if (frame?.imageBytes?.length) {
          const jpeg = !!frame.mimeType && /jpe?g/i.test(frame.mimeType);
          for (const attempt of jpeg ? [() => ctx.doc.embedJpg(frame.imageBytes!), () => ctx.doc.embedPng(frame.imageBytes!)] : [() => ctx.doc.embedPng(frame.imageBytes!), () => ctx.doc.embedJpg(frame.imageBytes!)]) {
            try {
              image = await attempt();
              break;
            } catch {
              // Try the other codec; a frame that embeds as neither prints blank.
            }
          }
        }
        images.push(image);
      }
    }
    const boardWidth = boards ? SHOT_LIST_PDF_BOARD_WIDTH[boards.size] : 0;
    const columns: PdfTableColumn[] = boards
      ? [{ header: 'Board', widthFrac: (boardWidth / ctx.contentWidth) * 100 }, ...SHOT_LIST_COLUMNS.map((column) => ({ ...column, widthFrac: column.widthFrac * (1 - boardWidth / ctx.contentWidth) }))]
      : SHOT_LIST_COLUMNS;
    const tableRows = input.rows.map((row) => [
      ...(boards ? [''] : []),
      row.scene,
      row.shot,
      row.name,
      row.camera,
      row.size,
      row.lens,
      row.movement,
      row.status,
      row.notes,
    ]);
    drawPdfTable(ctx, page, cursorY, columns, tableRows, boards
      ? { imageColumn: { index: 0, height: (boardWidth - 8) / (boards.aspectRatio || 16 / 9), images } }
      : undefined);
  }
  return finalizePdfDocument(ctx);
};
