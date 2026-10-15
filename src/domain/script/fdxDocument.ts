/**
 * The parts of a Final Draft (.fdx) file around the script body: its title
 * page, its page setup, and its revision sets — read on import and written
 * on export, so a script that goes to Final Draft and back keeps them.
 *
 * Forms follow ScriptCraft's survey of files Final Draft itself saved
 * (docs/fdx-format.md in https://github.com/NoJuanNobody/scriptcraft):
 * `<TitlePage><Content><Paragraph Alignment>` lines, `<PageLayout><PageSize>`,
 * `<MoresAndContinueds><DialogueBreaks AutomaticCharacterContinueds>`, and
 * `<Revisions ActiveSet><Revision ID Name Color PageColor/>` with
 * `RevisionID` on the text runs that set changed.
 */
import { REVISION_COLORS } from './revisionColors';
import { fdxColorToHex, hexToFdxColor } from './fdxParagraphs';
import type { ScreenplayLayout } from './pagination';
import type { ScreenplayTitlePage } from './titlePage';

export interface FdxDocumentSettings {
  titlePage?: ScreenplayTitlePage;
  layout?: ScreenplayLayout;
  /** Revision colour index (domain/script/revisionColors) of the file's active set. */
  activeRevision?: number;
}

const children = (node: Element | null | undefined, name: string): Element[] =>
  node ? Array.from(node.children).filter((child) => child.localName === name) : [];

const ownText = (paragraph: Element): string =>
  children(paragraph, 'Text').map((node) => node.textContent || '').join('').replace(/\s+/g, ' ').trim();

/**
 * Revision set ID → this app's colour index. Final Draft names its sets after
 * their colour ("Pink Rev. (10/12/26)"), which is matched first; failing
 * that, the page colour; failing that, the set's position.
 */
export const fdxRevisionColorIndex = (doc: Document): Map<string, number> => {
  const map = new Map<string, number>();
  const sets = Array.from(doc.querySelectorAll('Revisions > Revision'));
  sets.forEach((set, position) => {
    const id = set.getAttribute('ID');
    if (!id) return;
    const name = (set.getAttribute('Name') ?? '').toLowerCase();
    const round = /\b(2nd|second)\b/.test(name) ? 1 : /\b(3rd|third)\b/.test(name) ? 2 : 0;
    let index = REVISION_COLORS.findIndex((color) => new RegExp(`\\b${color.label.toLowerCase()}\\b`).test(name));
    if (index < 0) {
      const page = fdxColorToHex(set.getAttribute('PageColor'));
      index = page ? REVISION_COLORS.findIndex((color) => color.hex.toLowerCase() === page) : -1;
    }
    if (index < 0) index = Math.min(position + 1, REVISION_COLORS.length - 1);
    map.set(id, round * REVISION_COLORS.length + index);
  });
  return map;
};

/** The revision colour a paragraph's text was last changed in, if any. */
export const fdxParagraphRevision = (paragraph: Element, colorById: ReadonlyMap<string, number>): number | undefined => {
  let latest: number | undefined;
  for (const run of children(paragraph, 'Text')) {
    const id = run.getAttribute('RevisionID');
    if (!id || id === '0') continue;
    const index = colorById.get(id);
    if (index !== undefined && index > 0 && (latest === undefined || index > latest)) latest = index;
  }
  return latest;
};

const CREDIT_RE = /^(written|screenplay|teleplay|story|script)?\s*by\b|^written$|^by$/i;
const SOURCE_RE = /^(based on|adapted from|inspired by)\b/i;
const DRAFT_RE = /\b(draft|revision|rev\.|shooting script|polish)\b/i;
const DATE_RE = /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{4})\b/i;
const COPYRIGHT_RE = /^(©|\(c\)|copyright)/i;

/** A Final Draft cover as this app's fields; Final Draft keeps it as free lines. */
export const fdxTitlePage = (doc: Document): ScreenplayTitlePage | undefined => {
  const content = children(doc.querySelector('FinalDraft > TitlePage'), 'Content')[0];
  return titlePageFromLines(
    children(content, 'Paragraph').map((paragraph) => ({
      align: (paragraph.getAttribute('Alignment') ?? 'Left').toLowerCase() === 'center'
        ? 'center' as const
        : (paragraph.getAttribute('Alignment') ?? '').toLowerCase() === 'right' ? 'right' as const : 'left' as const,
      text: ownText(paragraph),
    })),
  );
};

/**
 * A cover's fields from its lines as laid out (Final Draft's title page, the
 * first page of a PDF): the first centred line is the title, a "Written by"
 * line the credit, the centred names under it the authors, "Based on…" the
 * source; left-aligned lines are the contact, right-aligned ones the draft
 * and date.
 */
export const titlePageFromLines = (
  input: ReadonlyArray<{ align: 'left' | 'center' | 'right'; text: string }>,
): ScreenplayTitlePage | undefined => {
  const lines = input.filter((line) => line.text.trim());
  if (lines.length === 0) return undefined;
  const page: ScreenplayTitlePage = {};
  const authors: string[] = [];
  const contact: string[] = [];
  let afterCredit = false;
  for (const line of lines) {
    const text = line.text.trim();
    if (COPYRIGHT_RE.test(text)) {
      page.copyright = text;
      continue;
    }
    if (line.align === 'center') {
      if (!page.title) page.title = text;
      else if (CREDIT_RE.test(text) && !page.credit) {
        page.credit = text;
        afterCredit = true;
      } else if (SOURCE_RE.test(text) && !page.source) page.source = text;
      else if (DRAFT_RE.test(text) && !page.draftLabel) page.draftLabel = text;
      else if (authors.length > 0 && DATE_RE.test(text) && !page.date) page.date = text;
      else if (afterCredit || authors.length === 0) authors.push(text);
      else page.notes = page.notes ? `${page.notes}\n${text}` : text;
      continue;
    }
    if (line.align === 'right') {
      if (DRAFT_RE.test(text) && !page.draftLabel) page.draftLabel = text;
      else if (DATE_RE.test(text) && !page.date) page.date = text;
      else if (!page.draftLabel) page.draftLabel = text;
      else page.date = page.date ? `${page.date} ${text}` : text;
      continue;
    }
    contact.push(text);
  }
  if (authors.length) page.authors = authors.join('\n');
  if (contact.length) page.contact = contact.join('\n');
  return page;
};

/**
 * Paper, automatic (CONT'D), scene CONTINUED marks and the multi-camera format
 * (double-spaced dialogue), when the file says.
 */
export const fdxLayout = (doc: Document): ScreenplayLayout | undefined => {
  const size = doc.querySelector('PageLayout > PageSize');
  const breaks = doc.querySelector('MoresAndContinueds > DialogueBreaks');
  const sceneBreaks = doc.querySelector('MoresAndContinueds > SceneBreaks');
  const dialogue = Array.from(doc.querySelectorAll('ElementSettings')).find((setting) => setting.getAttribute('Type') === 'Dialogue');
  const layout: ScreenplayLayout = {};
  const height = Number(size?.getAttribute('Height'));
  if (Number.isFinite(height) && height > 11.3) layout.paper = 'a4';
  if (breaks?.getAttribute('AutomaticCharacterContinueds') === 'No') layout.autoContd = false;
  if (sceneBreaks?.getAttribute('SceneBottomOfPage') === 'Yes' || sceneBreaks?.getAttribute('SceneTopOfNext') === 'Yes') layout.sceneContinued = true;
  if (Number(dialogue?.querySelector('ParagraphSpec')?.getAttribute('Spacing')) >= 2) layout.format = 'multicam';
  return size || breaks || sceneBreaks || dialogue ? layout : undefined;
};

/** Everything around the body of a Final Draft file; empty for anything else. */
export const parseFdxDocument = (raw: string): FdxDocumentSettings => {
  if (!/<FinalDraft/i.test(raw.slice(0, 2000))) return {};
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (doc.querySelector('parsererror')) return {};
  const out: FdxDocumentSettings = {};
  const titlePage = fdxTitlePage(doc);
  if (titlePage) out.titlePage = titlePage;
  const layout = fdxLayout(doc);
  if (layout) out.layout = layout;
  const activeSet = doc.querySelector('Revisions')?.getAttribute('ActiveSet');
  const active = activeSet ? fdxRevisionColorIndex(doc).get(activeSet) : undefined;
  if (active !== undefined && active > 0) out.activeRevision = active;
  return out;
};

/** `<PageLayout>` and `<MoresAndContinueds>` for export. */
export const fdxLayoutXml = (layout: ScreenplayLayout | undefined): string[] => {
  const a4 = layout?.paper === 'a4';
  const auto = layout?.autoContd === false ? 'No' : 'Yes';
  const scene = layout?.sceneContinued ? 'Yes' : 'No';
  return [
    // Multi-camera: double-spaced dialogue and a new page for every scene.
    ...(layout?.format === 'multicam'
      ? [
          '  <ElementSettings Type="Dialogue">',
          '    <ParagraphSpec Spacing="2" StartsNewPage="No"/>',
          '  </ElementSettings>',
          '  <ElementSettings Type="Scene Heading">',
          '    <ParagraphSpec Spacing="1" StartsNewPage="Yes"/>',
          '  </ElementSettings>',
        ]
      : []),
    `  <PageLayout BottomMargin="72" FooterMargin="36" HeaderMargin="36" TopMargin="72">`,
    `    <PageSize Height="${a4 ? '11.69' : '11.00'}" Width="${a4 ? '8.27' : '8.50'}"/>`,
    '  </PageLayout>',
    '  <MoresAndContinueds>',
    `    <DialogueBreaks AutomaticCharacterContinueds="${auto}" BottomOfPage="Yes" DialogueBottom="(MORE)" DialogueTop="(CONT'D)" TopOfNext="Yes"/>`,
    `    <SceneBreaks ContinuedNumber="No" SceneBottom="(CONTINUED)" SceneBottomOfPage="${scene}" SceneTop="CONTINUED:" SceneTopOfNext="${scene}"/>`,
    '  </MoresAndContinueds>',
  ];
};

/** `<Revisions>` with one set per colour up to the working draft's, for export. */
export const fdxRevisionsXml = (activeIndex: number): string[] => {
  if (!(activeIndex > 0)) return [];
  const sets: string[] = [];
  for (let index = 1; index <= activeIndex; index += 1) {
    const base = REVISION_COLORS[index % REVISION_COLORS.length];
    const round = Math.floor(index / REVISION_COLORS.length);
    const name = `${round > 0 ? `${round + 1}${round === 1 ? 'nd' : round === 2 ? 'rd' : 'th'} ` : ''}${base.label} Rev.`;
    sets.push(`    <Revision Color="#000000000000" FullRevision="No" ID="${index}" Mark="*" Name="${name}" PageColor="${hexToFdxColor(base.hex) ?? '#FFFFFFFFFFFF'}" Style=""/>`);
  }
  return [`  <Revisions ActiveSet="${activeIndex}" Location="7.75" RevisionMode="No" RevisionsShown="Active" ShowAllMarks="No" ShowAllSets="No" ShowPageColor="No">`, ...sets, '  </Revisions>'];
};
