/**
 * Text the app's own importer reads, built from what another format gave us.
 *
 * Formats that already know each paragraph's element (Word styles, Celtx
 * classes) become Final Draft XML: the FDX reader keeps element types exactly,
 * where Fountain would leave a short all-caps line of dialogue ("NO!") to be
 * guessed at. Formats that only know where text sits on the page (PDF) become
 * indented plain text, which the text importer reads by its columns, with the
 * cover as a Fountain title block.
 */
import { serializeToFdx } from '../../domain/script';
import type { ScreenplayTitlePage } from '../../domain/script';

export type ImportedElementType =
  | 'scene'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot';

export interface ImportedElement {
  type: ImportedElementType;
  text: string;
}

/** A Fountain title block (`Title:`, `Credit:`…), or '' when there is no cover. */
export const fountainTitleBlock = (page: ScreenplayTitlePage | undefined): string => {
  if (!page) return '';
  const field = (key: string, value: string | undefined) => {
    const lines = (value ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    return lines.length === 1 ? [`${key}: ${lines[0]}`] : [`${key}:`, ...lines.map((line) => `    ${line}`)];
  };
  const out = [
    ...field('Title', page.title),
    ...field('Credit', page.credit),
    ...field('Author', page.authors),
    ...field('Source', page.source),
    ...field('Draft date', [page.draftLabel, page.date].filter(Boolean).join('\n')),
    ...field('Contact', page.contact),
    ...field('Copyright', page.copyright),
    ...field('Notes', page.notes),
  ];
  return out.length ? `${out.join('\n')}\n\n===\n\n` : '';
};

/** Final Draft XML for typed elements, so every element reads back as itself. */
export const fdxFromElements = (elements: readonly ImportedElement[], titlePage?: ScreenplayTitlePage): string =>
  serializeToFdx(
    elements
      .map((element) => ({ type: element.type, text: element.text.replace(/\s+/g, ' ').trim() }))
      .filter((element) => element.text),
    titlePage ? { titlePage } : {},
  );

/** What a style or class name means, e.g. "Scene Heading", "sceneheading", "dialog". */
export const elementForStyleName = (name: string): ImportedElementType | undefined => {
  const key = name.toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return undefined;
  if (/^(sceneheading|scene|slugline|sluglines)$/.test(key)) return 'scene';
  if (/^(action|description|general|scenedescription)$/.test(key)) return 'action';
  if (/^(character|charactername|char|cue)$/.test(key)) return 'character';
  if (/^(parenthetical|paren|parentheticals|wryly)$/.test(key)) return 'parenthetical';
  if (/^(dialogue|dialog)$/.test(key)) return 'dialogue';
  if (/^(transition|trans)$/.test(key)) return 'transition';
  if (/^(shot|camera)$/.test(key)) return 'shot';
  return undefined;
};
