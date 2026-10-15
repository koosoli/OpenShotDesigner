/**
 * Final Draft (.fdx) export.
 *
 * Writes the screenplay as Final Draft XML — element types, scene numbers,
 * omitted scenes, page breaks, dual dialogue, the scenes' index-card
 * summaries and colours, and the title page — so a script written or
 * broken down here can go back to a writer who works in Final Draft. Reads
 * back through `parseFinalDraftXml`, so an export/import round trip keeps the
 * same lines.
 */
import type { ScreenplayTitlePage } from './titlePage';
import { hexToFdxColor } from './fdxParagraphs';
import { fdxLayoutXml, fdxRevisionsXml } from './fdxDocument';
import type { ScreenplayLayout } from './pagination';

export interface FdxLine {
  text: string;
  type?: string;
  sceneNumber?: string;
  omitted?: boolean;
  dual?: boolean;
  synopsis?: string;
  sceneColor?: string;
  /** Revision colour index the line was last changed in. */
  revisedIn?: number;
}

const FDX_TYPE: Record<string, string> = {
  scene: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
};

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const paragraph = (type: string, text: string, attributes = '', inner = '', indent = '    ', revision?: number): string =>
  `${indent}<Paragraph Type="${type}"${attributes}>\n${inner}${indent}  <Text${revision ? ` RevisionID="${revision}"` : ''}>${escapeXml(text)}</Text>\n${indent}</Paragraph>`;

/** A scene heading's index card: its summary and colour. */
const sceneProperties = (line: FdxLine): string => {
  const summary = line.synopsis?.trim();
  const color = line.sceneColor ? hexToFdxColor(line.sceneColor) : undefined;
  if (!summary && !color) return '';
  const colorAttribute = color ? ` Color="${color}"` : '';
  if (!summary) return `      <SceneProperties${colorAttribute}/>\n`;
  return [
    `      <SceneProperties${colorAttribute}>`,
    '        <Summary>',
    '          <Paragraph Type="General">',
    `            <Text>${escapeXml(summary)}</Text>`,
    '          </Paragraph>',
    '        </Summary>',
    '      </SceneProperties>',
    '',
  ].join('\n');
};

const isSpeech = (type: string | undefined) => type === 'parenthetical' || type === 'dialogue';

/** A script note, anchored in the paragraph it follows (Final Draft's form). */
const scriptNote = (text: string): string =>
  `<ScriptNote Color="#000000000000" ID="1" Name="" Type="Note"><Paragraph><Text>${escapeXml(text)}</Text></Paragraph></ScriptNote>`;

/** Put notes just before a written paragraph's own text (after any index card). */
const withNote = (paragraphXml: string, notes: string): string => {
  const at = paragraphXml.lastIndexOf('<Text');
  return at < 0 ? paragraphXml : `${paragraphXml.slice(0, at)}${notes}${paragraphXml.slice(at)}`;
};

const titleParagraph = (text: string, alignment: 'Center' | 'Left' = 'Center'): string =>
  `      <Paragraph Alignment="${alignment}" Type="General">\n        <Text>${escapeXml(text)}</Text>\n      </Paragraph>`;

export const serializeToFdx = (
  lines: readonly FdxLine[],
  options: {
    title?: string;
    titlePage?: ScreenplayTitlePage;
    layout?: ScreenplayLayout;
    /** The working draft's revision colour: its marks and earlier ones are written as revision sets. */
    revisionIndex?: number;
  } = {},
): string => {
  const revisionIndex = options.revisionIndex ?? 0;
  const revisionOf = (line: FdxLine) =>
    line.revisedIn !== undefined && line.revisedIn > 0 && line.revisedIn <= revisionIndex ? line.revisedIn : undefined;
  const body: string[] = [];
  let newPage = false;
  const pendingNotes: string[] = [];
  const blockEnd = (start: number): number => {
    let end = start + 1;
    while (end < lines.length && isSpeech(lines[end].type)) end += 1;
    return end;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const type = line.type ?? 'action';
    if (type === 'page-break') {
      newPage = true;
      continue;
    }
    if (type === 'note') {
      // Notes ride in the paragraph before them; one at the very start waits for the first.
      const note = scriptNote(line.text);
      if (body.length > 0) body[body.length - 1] = withNote(body[body.length - 1], note);
      else pendingNotes.push(note);
      continue;
    }
    // Dual dialogue: both speeches go inside one DualDialogue block.
    if (type === 'character') {
      const end = blockEnd(index);
      if (lines[end]?.type === 'character' && lines[end].dual) {
        const end2 = blockEnd(end);
        const inner = lines
          .slice(index, end2)
          .map((speech) => paragraph(FDX_TYPE[speech.type ?? 'dialogue'] ?? 'Dialogue', speech.text, '', '', '        ', revisionOf(speech)))
          .join('\n');
        body.push(`    <Paragraph${newPage ? ' StartsNewPage="Yes"' : ''}>\n      <DualDialogue>\n${inner}\n      </DualDialogue>\n    </Paragraph>`);
        newPage = false;
        index = end2 - 1;
        continue;
      }
    }
    const fdxType = FDX_TYPE[type] ?? 'Action';
    const attributes = [
      type === 'scene' && line.sceneNumber ? ` Number="${escapeXml(line.sceneNumber)}"` : '',
      newPage ? ' StartsNewPage="Yes"' : '',
    ].join('');
    newPage = false;
    body.push(paragraph(fdxType, line.text, attributes, type === 'scene' ? sceneProperties(line) : '', '    ', revisionOf(line)));
    // Omitted scenes keep their heading and say so underneath — the same
    // convention the importer reads back.
    if (type === 'scene' && line.omitted) body.push(paragraph('Action', 'OMITTED'));
  }

  if (pendingNotes.length > 0 && body.length > 0) body[0] = withNote(body[0], pendingNotes.join(''));

  const page = options.titlePage;
  const title = page?.title?.trim() || options.title?.trim();
  const cover: string[] = [];
  if (title) cover.push(titleParagraph(title.toUpperCase()));
  if (page?.credit) cover.push(titleParagraph(page.credit));
  if (page?.authors) for (const author of page.authors.split('\n').filter(Boolean)) cover.push(titleParagraph(author));
  if (page?.source) cover.push(titleParagraph(page.source));
  if (page?.draftLabel) cover.push(titleParagraph(page.draftLabel));
  if (page?.date) cover.push(titleParagraph(page.date));
  if (page?.contact) for (const line of page.contact.split('\n').filter(Boolean)) cover.push(titleParagraph(line, 'Left'));

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="5">',
    '  <Content>',
    ...body,
    '  </Content>',
    ...fdxLayoutXml(options.layout),
    ...fdxRevisionsXml(revisionIndex),
    ...(cover.length ? ['  <TitlePage>', '    <Content>', ...cover, '    </Content>', '  </TitlePage>'] : []),
    '</FinalDraft>',
    '',
  ].join('\n');
};
