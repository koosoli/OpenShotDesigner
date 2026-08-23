/**
 * The screenplay title page (plan §12.1).
 *
 * A script that leaves the building needs a cover: what it is, who wrote it,
 * which draft, and who to ring. The fields are Fountain's standard title-page
 * keys — Title, Credit, Author, Source, Draft date, Contact, Copyright, Notes —
 * because the app already imports and exports Fountain, and using anything else
 * would mean a title page that survives a round trip in one direction only.
 *
 * Everything is optional and absent-safe. A production with no title page
 * simply prints no cover, and one that fills in a title alone gets a cover with
 * a title on it (rule 13: missing stays missing, never a placeholder).
 *
 * Pure: no React, no I/O.
 */

export interface ScreenplayTitlePage {
  /** Print a cover at all. Absent = no. */
  enabled?: boolean;
  /** Defaults to the project's script title when blank. */
  title?: string;
  /** The line above the author: "Written by", "Screenplay by". */
  credit?: string;
  /** Author name(s), one per line. */
  authors?: string;
  /** "Based on the novel by …". */
  source?: string;
  /**
   * Which draft this is: "First Draft", "Blue Revision", "Shooting Script".
   * Independent of {@link draft} — a locked shooting script is still a named
   * draft, it is simply not a work in progress.
   */
  draftLabel?: string;
  /** Free text, stored exactly as typed; scripts date their drafts many ways. */
  date?: string;
  /** Contact block, bottom-left by convention: agency, address, phone. */
  contact?: string;
  copyright?: string;
  notes?: string;
  /**
   * Mark the script as a working draft: a DRAFT stamp on the cover and a
   * watermark on every printed page. ABSENT MEANS NOT A DRAFT, deliberately —
   * the opposite of a call sheet, where an unfinished sheet going out looking
   * final is the expensive mistake. Here the expensive mistake is stamping
   * DRAFT across a script that is being sent to a financier, so it is off
   * until someone asks for it.
   */
  draft?: boolean;
}

const trimmed = (value: string | undefined): string | undefined => {
  const text = value?.trim();
  return text || undefined;
};

/** True when the cover would print something beyond an empty page. */
export const hasTitlePageContent = (page: ScreenplayTitlePage | undefined, fallbackTitle?: string): boolean => {
  if (!page) return false;
  return Boolean(
    trimmed(page.title) ||
      trimmed(fallbackTitle) ||
      trimmed(page.credit) ||
      trimmed(page.authors) ||
      trimmed(page.source) ||
      trimmed(page.draftLabel) ||
      trimmed(page.date) ||
      trimmed(page.contact) ||
      trimmed(page.copyright) ||
      trimmed(page.notes),
  );
};

/** What actually prints, with the project's script title standing in for a blank one. */
export interface ResolvedTitlePage {
  title: string;
  credit?: string;
  authors: string[];
  source?: string;
  draftLabel?: string;
  date?: string;
  contact: string[];
  copyright?: string;
  notes?: string;
  draft: boolean;
}

export const resolveTitlePage = (
  page: ScreenplayTitlePage | undefined,
  fallbackTitle?: string,
): ResolvedTitlePage => {
  const lines = (value: string | undefined): string[] =>
    (value ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  return {
    title: trimmed(page?.title) ?? trimmed(fallbackTitle) ?? 'Untitled',
    credit: trimmed(page?.credit),
    authors: lines(page?.authors),
    source: trimmed(page?.source),
    draftLabel: trimmed(page?.draftLabel),
    date: trimmed(page?.date),
    contact: lines(page?.contact),
    copyright: trimmed(page?.copyright),
    notes: trimmed(page?.notes),
    draft: page?.draft === true,
  };
};

/**
 * Read a Fountain title-page block: `Key: value` pairs, with indented
 * continuation lines belonging to the key above, ended by `===` or by the
 * first blank line that is not inside a value.
 *
 * Returns `null` when the text does not start with a title page, so a caller
 * can tell "no cover in this file" from "an empty one".
 */
export const parseFountainTitlePage = (raw: string): ScreenplayTitlePage | null => {
  const rawLines = raw.replace(/\r\n?/g, '\n').split('\n');
  const firstContent = rawLines.findIndex((line) => line.trim().length > 0);
  if (firstContent === -1) return null;
  const KEY = /^([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/;
  if (!KEY.test(rawLines[firstContent].trim())) return null;

  const values = new Map<string, string[]>();
  let key: string | null = null;
  for (let i = firstContent; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    if (/^={3,}$/.test(line.trim())) break;
    const match = KEY.exec(line.trim());
    if (match && !/^\s/.test(line)) {
      key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      values.set(key, value ? [value] : []);
      continue;
    }
    if (!line.trim()) {
      // A blank line ends the block unless the next line continues a value.
      const next = rawLines[i + 1];
      if (!next || !/^\s+\S/.test(next)) break;
      continue;
    }
    if (key && /^\s+\S/.test(line)) values.get(key)?.push(line.trim());
  }
  if (values.size === 0) return null;

  const get = (...names: string[]): string | undefined => {
    for (const name of names) {
      const value = values.get(name);
      if (value && value.length) return value.join('\n');
    }
    return undefined;
  };

  const page: ScreenplayTitlePage = { enabled: true };
  const assign = (field: keyof ScreenplayTitlePage, value: string | undefined) => {
    if (value) (page as Record<string, unknown>)[field] = value;
  };
  assign('title', get('title'));
  assign('credit', get('credit'));
  assign('authors', get('author', 'authors'));
  assign('source', get('source'));
  assign('draftLabel', get('draft date', 'draft'));
  assign('date', get('date'));
  assign('contact', get('contact'));
  assign('copyright', get('copyright'));
  assign('notes', get('notes'));
  return page;
};

/** The Fountain title-page block for this cover, or '' when there is nothing to write. */
export const serializeFountainTitlePage = (
  page: ScreenplayTitlePage | undefined,
  fallbackTitle?: string,
): string => {
  if (!page?.enabled || !hasTitlePageContent(page, fallbackTitle)) return '';
  const resolved = resolveTitlePage(page, fallbackTitle);
  const out: string[] = [`Title: ${resolved.title}`];
  const block = (key: string, value: string | undefined) => {
    if (!value) return;
    const [first, ...rest] = value.split('\n');
    out.push(`${key}: ${first}`);
    for (const line of rest) out.push(`\t${line}`);
  };
  block('Credit', resolved.credit);
  block('Author', resolved.authors.join('\n'));
  block('Source', resolved.source);
  block('Draft date', [resolved.draftLabel, resolved.draft ? 'DRAFT' : undefined].filter(Boolean).join(' · ') || undefined);
  block('Date', resolved.date);
  block('Contact', resolved.contact.join('\n'));
  block('Copyright', resolved.copyright);
  block('Notes', resolved.notes);
  return `${out.join('\n')}\n\n===\n\n`;
};
