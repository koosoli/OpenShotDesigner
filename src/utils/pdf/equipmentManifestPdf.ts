/**
 * Equipment manifest PDF.
 *
 * Printable data model (read from the app, mirrored here in minimal form):
 * - `EquipmentItem` / `MasterEquipmentItem` (see `src/types` and
 *   `src/utils/equipmentList.ts`): category, name, brand, model, quantity,
 *   roleOrFunction, specs, plus usedInSetups / maxConcurrentQuantity on the
 *   all-scenes master rows. The CSV exporter (`exportEquipmentCsv.ts`)
 *   prints the same fields, so paper and spreadsheet agree.
 *
 * The PDF renders portrait: Department, Item, Brand / Model, Qty, Role,
 * Specs, Used In. Portrait fits a gear list; quantities centre-align.
 */

import { describeSceneUsage, isMasterEquipmentItem } from '../../domain/equipment';
import type { EquipmentItem } from '../../types';
import { getCategoryMeta } from '../equipmentList';
import { addPdfPage, createPdfDocument, drawDocumentHeader, embedProductionLogoPng, finalizePdfDocument } from './document';
import type { PdfOrientation, PdfPageSize } from './document';
import { drawPdfTable } from './tables';
import type { PdfTableColumn } from './tables';

export interface EquipmentManifestPdfItem {
  department: string;
  name: string;
  brand: string;
  model: string;
  quantity: number;
  role: string;
  specs: string;
  usage: string;
}

export interface EquipmentManifestPdfInput {
  productionTitle: string;
  /** Scope line, e.g. "Scene 4 - Night Diner" or "Master package - 6 scenes". */
  scopeLabel?: string;
  items: EquipmentManifestPdfItem[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

const MANIFEST_COLUMNS: PdfTableColumn[] = [
  { header: 'Department', widthFrac: 13 },
  { header: 'Item', widthFrac: 23 },
  { header: 'Brand / Model', widthFrac: 18 },
  { header: 'Qty', widthFrac: 6, align: 'center' },
  { header: 'Role / Function', widthFrac: 14 },
  { header: 'Specs', widthFrac: 14 },
  { header: 'Used In', widthFrac: 12 },
];

/**
 * Map plan equipment rows (single-scene or all-scenes master) to PDF rows.
 * Master rows gain their scene usage ("Scene 4 (x2)"), mirroring the CSV.
 */
export const equipmentManifestItemsFromEquipmentItems = (
  items: EquipmentItem[],
): EquipmentManifestPdfItem[] =>
  items.map((item) => ({
    department: getCategoryMeta(item.category).label,
    name: item.name,
    brand: item.brand ?? '',
    model: item.model ?? '',
    quantity: item.quantity,
    role: item.roleOrFunction ?? '',
    specs: item.specs ?? '',
    usage: isMasterEquipmentItem(item) ? describeSceneUsage(item, { sceneLabel: 'Sc', times: 'x' }).join('; ') : '',
  }));

/** Render the equipment manifest and return the finished PDF bytes. */
export const createEquipmentManifestPdf = async (input: EquipmentManifestPdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `Equipment Manifest - ${input.productionTitle}`,
    subject: 'Equipment manifest',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'portrait',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const cursorY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Equipment Manifest',
    subtitle: input.scopeLabel ?? `${input.items.length} item${input.items.length === 1 ? '' : 's'}`,
    logo,
  });

  if (input.items.length === 0) {
    page.drawText('No equipment in this selection.', {
      x: ctx.margins.left,
      y: cursorY - 12,
      size: 10,
      font: ctx.regular,
    });
  } else {
    const tableRows = input.items.map((item) => [
      item.department,
      item.name,
      [item.brand, item.model].filter((part) => part !== '').join(' '),
      String(item.quantity),
      item.role,
      item.specs,
      item.usage,
    ]);
    drawPdfTable(ctx, page, cursorY, MANIFEST_COLUMNS, tableRows);
  }
  return finalizePdfDocument(ctx);
};
