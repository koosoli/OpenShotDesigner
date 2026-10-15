/**
 * A screenplay from a Word document (.docx).
 *
 * Screenwriting apps that export to Word (Final Draft, WriterDuet, Highland,
 * Fade In) give every paragraph a style named after its element — "Scene
 * Heading", "Character", "Dialogue" — which is read directly. A document typed
 * by hand has no such styles; then its paragraph indents stand in for the
 * columns, as with a PDF. Text before the first page break, when no scene
 * comes before it, is the cover.
 */
import { strFromU8, unzipSync } from 'fflate';
import { titlePageFromLines } from '../../domain/script/fdxDocument';
import type { ScreenplayTitlePage } from '../../domain/script';
import { elementForStyleName, fdxFromElements, fountainTitleBlock } from './output';
import type { ImportedElement, ImportedElementType } from './output';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const SCENE_START = /^\s*(\d+[A-Z]{0,2}\.?\s+)?(INT|EXT|EST|I\/E)[.\s/]/i;

interface WordParagraph {
  text: string;
  type?: ImportedElementType;
  /** Left indent in twips (1/1440"). */
  left: number;
  align: 'left' | 'center' | 'right';
  pageBreakBefore: boolean;
}

const attr = (element: Element | undefined, name: string): string | null =>
  element ? element.getAttributeNS(W, name) ?? element.getAttribute(`w:${name}`) : null;

const first = (element: Element, name: string): Element | undefined => element.getElementsByTagNameNS(W, name)[0];

const paragraphsOf = (documentXml: string, stylesXml: string | undefined): WordParagraph[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const styleNames = new Map<string, string>();
  if (stylesXml) {
    const styles = parser.parseFromString(stylesXml, 'application/xml');
    for (const style of Array.from(styles.getElementsByTagNameNS(W, 'style'))) {
      const id = attr(style, 'styleId');
      const name = attr(first(style, 'name'), 'val');
      if (id && name) styleNames.set(id, name);
    }
  }
  const out: WordParagraph[] = [];
  let breakPending = false;
  for (const paragraph of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
    const properties = first(paragraph, 'pPr');
    const styleId = attr(properties && first(properties, 'pStyle'), 'val') ?? '';
    const type = elementForStyleName(styleNames.get(styleId) ?? '') ?? elementForStyleName(styleId);
    const indent = properties && first(properties, 'ind');
    const left = Number(attr(indent, 'left') ?? attr(indent, 'start') ?? 0) || 0;
    const jc = (attr(properties && first(properties, 'jc'), 'val') ?? '').toLowerCase();
    let text = '';
    let pageBreak = breakPending || !!(properties && first(properties, 'pageBreakBefore'));
    breakPending = false;
    const walk = (node: Element) => {
      for (const child of Array.from(node.children)) {
        if (child.namespaceURI !== W) continue;
        if (child.localName === 't') text += child.textContent ?? '';
        else if (child.localName === 'tab') text += '\t';
        else if (child.localName === 'br') {
          if (attr(child, 'type') === 'page') {
            if (text.trim()) breakPending = true;
            else pageBreak = true;
          } else text += '\n';
        } else if (child.localName !== 'pPr' && child.localName !== 'rPr') walk(child);
      }
    };
    walk(paragraph);
    out.push({
      text: text.replace(/\t/g, ' ').trim(),
      ...(type ? { type } : {}),
      left,
      align: jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : 'left',
      pageBreakBefore: pageBreak,
    });
  }
  return out;
};

export interface DocxScreenplay {
  /** Text for the importer, and the file name that tells it how to read it. */
  raw: string;
  extension: 'fdx' | 'txt';
}

export const screenplayFromDocx = (data: Uint8Array): DocxScreenplay => {
  const files = unzipSync(data, { filter: (file) => file.name === 'word/document.xml' || file.name === 'word/styles.xml' });
  const documentXml = files['word/document.xml'];
  if (!documentXml) return { raw: '', extension: 'txt' };
  const paragraphs = paragraphsOf(strFromU8(documentXml), files['word/styles.xml'] ? strFromU8(files['word/styles.xml']) : undefined);

  // The cover: what comes before the first page break, if no scene does.
  let titlePage: ScreenplayTitlePage | undefined;
  let body = paragraphs;
  const breakAt = paragraphs.findIndex((paragraph, index) => index > 0 && paragraph.pageBreakBefore);
  const firstScene = paragraphs.findIndex((paragraph) => paragraph.type === 'scene' || SCENE_START.test(paragraph.text));
  if (breakAt > 0 && (firstScene === -1 || firstScene >= breakAt)) {
    titlePage = titlePageFromLines(paragraphs.slice(0, breakAt).map((paragraph) => ({ align: paragraph.align, text: paragraph.text })));
    body = paragraphs.slice(breakAt);
  }
  const written = body.filter((paragraph) => paragraph.text);

  // Styled by a screenwriting app: take the styles at their word.
  const styled = written.filter((paragraph) => paragraph.type).length;
  if (written.length > 0 && styled >= written.length * 0.4) {
    const elements: ImportedElement[] = written.map((paragraph) => ({ type: paragraph.type ?? 'action', text: paragraph.text }));
    return { raw: fdxFromElements(elements, titlePage), extension: 'fdx' };
  }

  // Typed by hand: indents become columns (144 twips = one Courier column).
  const margin = written.length ? Math.min(...written.map((paragraph) => paragraph.left)) : 0;
  const lines: string[] = [];
  let previousIndent = 0;
  for (const paragraph of written) {
    const indent = paragraph.align === 'right' ? 45 : Math.max(0, Math.round((paragraph.left - margin) / 144));
    const isCue = indent >= 15 && paragraph.text === paragraph.text.toUpperCase() && /[A-Z]/.test(paragraph.text);
    // A speech stays together; everything else stands apart.
    const inSpeech = indent >= 8 && !isCue && previousIndent >= 8;
    if (lines.length > 0 && !inSpeech) lines.push('');
    for (const part of paragraph.text.split('\n')) lines.push(`${' '.repeat(indent)}${part.trim()}`);
    previousIndent = indent;
  }
  return { raw: `${fountainTitleBlock(titlePage)}${lines.join('\n')}\n`, extension: 'txt' };
};
