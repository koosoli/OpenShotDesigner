/**
 * Production-safe PDF filenames.
 *
 * Paperwork files travel: they land in Downloads folders, mail attachments
 * and shared drives on Windows, macOS and Linux. So the rule is stricter
 * than the download helper's: lowercase kebab-case segments joined by
 * underscores, always ending in `.pdf`.
 *
 * Example: `my-film_call-sheet_day-04_rev-2.pdf`
 * from production "My Film", document "call-sheet", qualifier "day-04",
 * revision 2.
 */

export interface PdfFilenameInput {
  /** Production title, e.g. "My Film". */
  production: string;
  /** Document kind, e.g. "call-sheet", "shot-list", "equipment-manifest". */
  document: string;
  /** Extra scope, e.g. "day-04", "scene-7", "all-scenes". */
  qualifier?: string;
  /** Bare revision: 2 becomes "rev-2". A string already starting with "rev-" is kept as is. */
  revision?: number | string;
  /** Shoot date in YYYY-MM-DD; anything else is dropped, never mangled. */
  date?: string;
}

const MAX_SEGMENT_LENGTH = 60;

/** Lowercase ASCII slug; accented letters fold (e-acute -> e), the rest is cut. */
export const slugifyPdfSegment = (raw: string | undefined, fallback: string): string => {
  const folded = (raw ?? '')
    .normalize('NFD')
    // Combining-mark range U+0300-U+036F as escapes: invisible in source, so
    // a literal here would be unreviewable and fragile across editors.
    .replace(/[\u0300-\u036f]/g, '');
  const slug = folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SEGMENT_LENGTH)
    .replace(/-+$/g, '');
  return slug === '' ? fallback : slug;
};

const normaliseRevision = (revision: number | string | undefined): string | null => {
  if (revision === undefined) return null;
  if (typeof revision === 'number') {
    if (!Number.isFinite(revision)) return null;
    return `rev-${Math.trunc(revision)}`;
  }
  const slug = slugifyPdfSegment(revision, '');
  if (slug === '') return null;
  return slug.startsWith('rev-') ? slug : `rev-${slug}`;
};

/** Build `production_document_qualifier_rev-n.pdf`, omitting absent parts. */
export const buildPdfFilename = (input: PdfFilenameInput): string => {
  const segments = [
    slugifyPdfSegment(input.production, 'untitled-production'),
    slugifyPdfSegment(input.document, 'document'),
  ];
  if (input.qualifier !== undefined && input.qualifier.trim() !== '') {
    segments.push(slugifyPdfSegment(input.qualifier, 'section'));
  }
  const revision = normaliseRevision(input.revision);
  if (revision !== null) segments.push(revision);
  if (input.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) segments.push(input.date);
  return `${segments.join('_')}.pdf`;
};
