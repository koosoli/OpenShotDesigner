/**
 * Shared client-side PDF layer (offline, real text, no server).
 *
 * Document shell and table engine plus the first two paperwork documents
 * (shot list, equipment manifest), production-safe filenames, and the ZIP
 * helper reserved for future Production Packs.
 */

export {
  DEFAULT_PDF_MARGINS,
  PDF_PAGE_DIMENSIONS,
  addPdfPage,
  createPdfDocument,
  drawDocumentHeader,
  embedProductionLogoPng,
  finalizePdfDocument,
  formatPdfDate,
} from './document';
export type {
  PdfDocumentContext,
  PdfDocumentSettings,
  PdfHeaderLogo,
  PdfHeaderOptions,
  PdfMargins,
  PdfOrientation,
  PdfPageSize,
} from './document';
export {
  createEquipmentManifestPdf,
  equipmentManifestItemsFromEquipmentItems,
} from './equipmentManifestPdf';
export type { EquipmentManifestPdfInput, EquipmentManifestPdfItem } from './equipmentManifestPdf';
export { buildPdfFilename, slugifyPdfSegment } from './filenames';
export type { PdfFilenameInput } from './filenames';
export { createShotListPdf, shotListRowsFromSetups } from './shotListPdf';
export type { ShotListPdfInput, ShotListPdfRow } from './shotListPdf';
export { drawPdfTable, paginateTableRows, wrapPdfCellText } from './tables';
export type { PdfTableColumn, PdfTableResult, PdfTableStyle } from './tables';
export { PDF_UNENCODABLE_REPLACEMENT, isWinAnsiPrintable, sanitizePdfText } from './text';
export { zipPdfs } from './zip';
