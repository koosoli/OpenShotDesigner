/**
 * The script paragraphs of a Final Draft (.fdx) document, read the same way
 * by every importer.
 *
 * Two shapes needed care. Dual dialogue is a paragraph wrapping a
 * `<DualDialogue>` that holds the two speeches as paragraphs of its own;
 * reading the outer paragraph's text glued both speakers into one action line.
 * And a scene heading carries its index card (`<SceneProperties>` with a
 * `<Summary>` of paragraphs) inside it, whose text was appended to the
 * slugline. Only a paragraph's own `<Text>` runs are its text.
 */
import { fdxParagraphRevision, fdxRevisionColorIndex } from './fdxDocument';
import type { ScriptLine, ScriptTextStyle } from '../../types';
import { fdxTextRuns, fdxWritingMetadata } from './fdxMetadata';

export interface FdxParagraph {
  element: Element;
  type: string;
  text: string;
  /** The second speaker of a DualDialogue block (set on its cue). */
  dual?: boolean;
  /** Scene heading's index-card summary. */
  summary?: string;
  /** Scene heading's index-card colour, as #rrggbb. */
  color?: string;
  /** Revision colour index (revisionColors) its text was last changed in. */
  revision?: number;
  /** Script notes anchored in the paragraph ("Author: text"). */
  notes?: ScriptLine['notes'];
  styles?: ScriptTextStyle[];
  bookmark?: string;
  alternates?: ScriptLine['alternates'];
}

const ownText = (paragraph: Element): string =>
  Array.from(paragraph.children)
    .filter((child) => child.localName === 'Text')
    .map((node) => node.textContent || '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

/** Final Draft writes 48-bit colours ("#FFFF00000000"); keep the top byte of each channel. */
export const fdxColorToHex = (raw: string | null | undefined): string | undefined => {
  const hex = (raw ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{12}$/i.test(hex)) return `#${hex.slice(0, 2)}${hex.slice(4, 6)}${hex.slice(8, 10)}`.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`.toLowerCase();
  return undefined;
};

/** #rrggbb → Final Draft's 48-bit form. */
export const hexToFdxColor = (hex: string): string | undefined => {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return undefined;
  return `#${clean.slice(0, 2)}${clean.slice(0, 2)}${clean.slice(2, 4)}${clean.slice(2, 4)}${clean.slice(4, 6)}${clean.slice(4, 6)}`.toUpperCase();
};

const sceneCard = (paragraph: Element): Pick<FdxParagraph, 'summary' | 'color'> => {
  const properties = Array.from(paragraph.children).find((child) => child.localName === 'SceneProperties');
  if (!properties) return {};
  const summaryNode = Array.from(properties.children).find((child) => child.localName === 'Summary');
  const summary = summaryNode
    ? Array.from(summaryNode.children)
        .filter((child) => child.localName === 'Paragraph')
        .map(ownText)
        .filter(Boolean)
        .join(' ')
        .trim()
    : '';
  const color = fdxColorToHex(properties.getAttribute('Color'));
  return { ...(summary ? { summary } : {}), ...(color ? { color } : {}) };
};

/** Body paragraphs in reading order, dual dialogue flattened (its second cue marked). */
export const fdxBodyParagraphs = (doc: Document): FdxParagraph[] => {
  const body = doc.querySelector('FinalDraft > Content') ?? doc.documentElement;
  const colorById = fdxRevisionColorIndex(doc);
  const revisionOf = (paragraph: Element) => {
    const revision = colorById.size ? fdxParagraphRevision(paragraph, colorById) : undefined;
    const runs = fdxTextRuns(paragraph);
    return { ...(revision !== undefined ? { revision } : {}), ...runs, ...fdxWritingMetadata(paragraph, runs.text) };
  };
  const out: FdxParagraph[] = [];
  for (const paragraph of Array.from(body.querySelectorAll(':scope > Paragraph'))) {
    const dual = Array.from(paragraph.children).find((child) => child.localName === 'DualDialogue');
    if (dual) {
      let cues = 0;
      for (const inner of Array.from(dual.children).filter((child) => child.localName === 'Paragraph')) {
        const type = inner.getAttribute('Type') || '';
        if (type === 'Character') cues += 1;
        out.push({ element: inner, type, ...(type === 'Character' && cues === 2 ? { dual: true } : {}), ...revisionOf(inner) });
      }
      continue;
    }
    const type = paragraph.getAttribute('Type') || '';
    out.push({ element: paragraph, type, ...(type === 'Scene Heading' ? sceneCard(paragraph) : {}), ...revisionOf(paragraph) });
  }
  return out;
};
