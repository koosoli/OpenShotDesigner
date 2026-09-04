/**
 * Shared document shell for client-side production PDFs.
 *
 * Every paperwork PDF in the app (shot list, equipment manifest, and later
 * call sheets / stripboards / production packs) is built through this shell
 * so paper looks like it comes from one production office: one page-size
 * rule, one metadata rule, one footer rule, one watermark rule.
 *
 * Lifecycle: `createPdfDocument` (embeds the two standard fonts, stamps
 * metadata) -> draw pages with `addPdfPage` plus the document renderers ->
 * `finalizePdfDocument` (draws footers with the now-known page count, then
 * saves). Footers are drawn last because "Page X of Y" needs Y.
 *
 * Fonts are Helvetica / HelveticaBold standard fonts: offline-safe, never
 * embedded, always available. All drawn text passes through `sanitizePdfText`.
 */

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { sanitizePdfText } from './text';

/** Page trims in PDF points (1/72 inch). */
export const PDF_PAGE_DIMENSIONS = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
} as const;

export type PdfPageSize = keyof typeof PDF_PAGE_DIMENSIONS;
export type PdfOrientation = 'portrait' | 'landscape';

export interface PdfMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const DEFAULT_PDF_MARGINS: PdfMargins = { top: 56, bottom: 48, left: 44, right: 44 };

export interface PdfDocumentSettings {
  /** Dublin-Core-ish title, also the suggested download name's human half. */
  title: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  marginsPt?: Partial<PdfMargins>;
  /** Shown in the title block; defaults to `title` when absent. */
  productionTitle?: string;
  /** Injected for tests; defaults to now. Always rendered as UTC YYYY-MM-DD. */
  generatedAt?: Date;
  /** True prints a diagonal "DRAFT"; a string prints that text instead. */
  draft?: boolean | string;
  /** One confidentiality line in the footer, e.g. "CONFIDENTIAL - DO NOT DISTRIBUTE". */
  confidentialityLine?: string;
  /** Defaults to true. */
  showPageNumbers?: boolean;
}

export interface PdfDocumentContext {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  pageWidth: number;
  pageHeight: number;
  margins: PdfMargins;
  /** Usable width between the side margins. */
  contentWidth: number;
  /** Baseline Y where body content starts (below the top margin). */
  contentTop: number;
  title: string;
  productionTitle: string;
  generatedLabel: string;
  draftText: string | null;
  confidentialityLine: string | null;
  showPageNumbers: boolean;
}

const FOOTER_FONT_SIZE = 7.5;
const WATERMARK_FONT_SIZE = 84;

export const formatPdfDate = (date: Date): string => date.toISOString().slice(0, 10);

const resolveDraftText = (draft: boolean | string | undefined): string | null => {
  if (draft === true) return 'DRAFT';
  if (typeof draft === 'string' && draft.trim() !== '') return draft.trim().toUpperCase().slice(0, 24);
  return null;
};

/** Create the document, embed both fonts, stamp metadata. Never draws pages. */
export const createPdfDocument = async (settings: PdfDocumentSettings): Promise<PdfDocumentContext> => {
  const doc = await PDFDocument.create();
  const pageSize = settings.pageSize ?? 'A4';
  const orientation = settings.orientation ?? 'portrait';
  const base = PDF_PAGE_DIMENSIONS[pageSize];
  const pageWidth = orientation === 'landscape' ? base.height : base.width;
  const pageHeight = orientation === 'landscape' ? base.width : base.height;
  const margins: PdfMargins = { ...DEFAULT_PDF_MARGINS, ...settings.marginsPt };
  const generatedAt = settings.generatedAt ?? new Date();

  doc.setTitle(settings.title);
  doc.setAuthor(settings.author ?? '');
  if (settings.subject !== undefined) doc.setSubject(settings.subject);
  if (settings.keywords !== undefined) doc.setKeywords(settings.keywords);
  doc.setProducer('OpenShotDesigner (offline client-side PDF)');
  doc.setCreator('OpenShotDesigner (offline client-side PDF)');
  doc.setCreationDate(generatedAt);
  doc.setModificationDate(generatedAt);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  return {
    doc,
    regular,
    bold,
    pageWidth,
    pageHeight,
    margins,
    contentWidth: pageWidth - margins.left - margins.right,
    contentTop: pageHeight - margins.top,
    title: settings.title,
    productionTitle: settings.productionTitle ?? settings.title,
    generatedLabel: `Generated ${formatPdfDate(generatedAt)}`,
    draftText: resolveDraftText(settings.draft),
    confidentialityLine: settings.confidentialityLine?.trim() ? settings.confidentialityLine.trim() : null,
    showPageNumbers: settings.showPageNumbers ?? true,
  };
};

/**
 * Append a blank page and stamp the diagonal draft watermark on it, when the
 * document is a draft. Watermarks are drawn per page at creation so document
 * renderers never have to remember them.
 */
export const addPdfPage = (ctx: PdfDocumentContext): PDFPage => {
  const page = ctx.doc.addPage([ctx.pageWidth, ctx.pageHeight]);
  if (ctx.draftText !== null) {
    const text = sanitizePdfText(ctx.draftText);
    const textWidth = ctx.bold.widthOfTextAtSize(text, WATERMARK_FONT_SIZE);
    page.drawText(text, {
      x: (ctx.pageWidth - textWidth) / 2 - 30,
      y: ctx.pageHeight / 2 - WATERMARK_FONT_SIZE / 3,
      size: WATERMARK_FONT_SIZE,
      font: ctx.bold,
      color: rgb(0.55, 0.55, 0.55),
      opacity: 0.12,
      rotate: degrees(45),
    });
  }
  return page;
};

export interface PdfHeaderLogo {
  image: PDFImage;
  width: number;
  height: number;
}

const HEADER_LOGO_MAX_HEIGHT = 34;
const HEADER_LOGO_MAX_WIDTH = 130;

/**
 * Embed a production logo PNG for the title block. Never throws: missing or
 * corrupt bytes yield null and the paperwork prints without a logo, because a
 * broken image must not cost a driver their truck manifest.
 */
export const embedProductionLogoPng = async (
  doc: PDFDocument,
  pngBytes: Uint8Array | undefined,
): Promise<PdfHeaderLogo | null> => {
  if (pngBytes === undefined || pngBytes.length === 0) return null;
  try {
    const image = await doc.embedPng(pngBytes);
    const scale = Math.min(1, HEADER_LOGO_MAX_HEIGHT / image.height, HEADER_LOGO_MAX_WIDTH / image.width);
    return { image, width: image.width * scale, height: image.height * scale };
  } catch {
    return null;
  }
};

export interface PdfHeaderOptions {
  productionTitle: string;
  documentTitle: string;
  subtitle?: string;
  logo?: PdfHeaderLogo | null;
}

/**
 * Draw the shared title block (production, document kind, subtitle, logo,
 * hairline rule) and return the Y where body content starts.
 */
export const drawDocumentHeader = (
  ctx: PdfDocumentContext,
  page: PDFPage,
  cursorY: number,
  options: PdfHeaderOptions,
): number => {
  const { margins, contentWidth } = ctx;
  let y = cursorY;
  const logoWidth = options.logo?.width ?? 0;
  const textWidth = contentWidth - (logoWidth > 0 ? logoWidth + 12 : 0);

  const productionTitle = sanitizePdfText(options.productionTitle);
  page.drawText(productionTitle, {
    x: margins.left,
    y: y - 16,
    size: 16,
    font: ctx.bold,
    color: rgb(0.1, 0.1, 0.1),
    maxWidth: textWidth,
  });
  y -= 20;

  page.drawText(sanitizePdfText(options.documentTitle), {
    x: margins.left,
    y: y - 12,
    size: 11,
    font: ctx.bold,
    color: rgb(0.25, 0.25, 0.25),
    maxWidth: textWidth,
  });
  y -= 16;

  if (options.subtitle !== undefined && options.subtitle.trim() !== '') {
    page.drawText(sanitizePdfText(options.subtitle), {
      x: margins.left,
      y: y - 9,
      size: 9,
      font: ctx.regular,
      color: rgb(0.35, 0.35, 0.35),
      maxWidth: textWidth,
    });
    y -= 13;
  }

  if (options.logo) {
    page.drawImage(options.logo.image, {
      x: margins.left + contentWidth - options.logo.width,
      y: y - 2,
      width: options.logo.width,
      height: options.logo.height,
    });
  }

  y -= 6;
  page.drawLine({
    start: { x: margins.left, y },
    end: { x: margins.left + contentWidth, y },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  return y - 10;
};

const truncateToWidth = (font: PDFFont, text: string, size: number, maxWidth: number): string => {
  const ellipsis = '\u2026';
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && font.widthOfTextAtSize(`${text.slice(0, end)}${ellipsis}`, size) > maxWidth) end -= 1;
  return `${text.slice(0, end)}${ellipsis}`;
};

/** Footer: generated date left, confidentiality centre, page numbers right. */
const drawPdfFooter = (ctx: PdfDocumentContext, page: PDFPage, pageNumber: number, pageCount: number): void => {
  const gray = rgb(0.42, 0.42, 0.42);
  const baseline = ctx.margins.bottom - 18;
  page.drawText(sanitizePdfText(ctx.generatedLabel), {
    x: ctx.margins.left,
    y: baseline,
    size: FOOTER_FONT_SIZE,
    font: ctx.regular,
    color: gray,
  });
  if (ctx.showPageNumbers) {
    const label = sanitizePdfText(`Page ${pageNumber} of ${pageCount}`);
    const width = ctx.regular.widthOfTextAtSize(label, FOOTER_FONT_SIZE);
    page.drawText(label, {
      x: ctx.pageWidth - ctx.margins.right - width,
      y: baseline,
      size: FOOTER_FONT_SIZE,
      font: ctx.regular,
      color: gray,
    });
  }
  if (ctx.confidentialityLine !== null) {
    const label = truncateToWidth(
      ctx.regular,
      sanitizePdfText(ctx.confidentialityLine),
      FOOTER_FONT_SIZE,
      ctx.contentWidth - 190,
    );
    const width = ctx.regular.widthOfTextAtSize(label, FOOTER_FONT_SIZE);
    page.drawText(label, {
      x: (ctx.pageWidth - width) / 2,
      y: baseline,
      size: FOOTER_FONT_SIZE,
      font: ctx.regular,
      color: gray,
    });
  }
};

/**
 * Draw footers on every page (the count is only known now) and save.
 * Object streams stay off so each content stream is individually flate-coded
 * and stays inspectable; the size cost on text paperwork is negligible.
 */
export const finalizePdfDocument = async (ctx: PdfDocumentContext): Promise<Uint8Array> => {
  const pages = ctx.doc.getPages();
  pages.forEach((page, index) => drawPdfFooter(ctx, page, index + 1, pages.length));
  return ctx.doc.save({ useObjectStreams: false });
};
