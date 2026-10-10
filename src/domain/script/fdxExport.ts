/**
 * Final Draft (.fdx) export.
 *
 * Writes the screenplay as Final Draft XML — element types, scene numbers,
 * omitted scenes, page breaks and the title page — so a script written or
 * broken down here can go back to a writer who works in Final Draft. Reads
 * back through `parseFinalDraftXml`, so an export/import round trip keeps the
 * same lines.
 */
import type { ScreenplayTitlePage } from './titlePage';

export interface FdxLine {
  text: string;
  type?: string;
  sceneNumber?: string;
  omitted?: boolean;
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

const paragraph = (type: string, text: string, attributes = ''): string =>
  `    <Paragraph Type="${type}"${attributes}>\n      <Text>${escapeXml(text)}</Text>\n    </Paragraph>`;

const titleParagraph = (text: string, alignment: 'Center' | 'Left' = 'Center'): string =>
  `      <Paragraph Alignment="${alignment}" Type="General">\n        <Text>${escapeXml(text)}</Text>\n      </Paragraph>`;

export const serializeToFdx = (
  lines: readonly FdxLine[],
  options: { title?: string; titlePage?: ScreenplayTitlePage } = {},
): string => {
  const body: string[] = [];
  let newPage = false;
  for (const line of lines) {
    const type = line.type ?? 'action';
    if (type === 'page-break') {
      newPage = true;
      continue;
    }
    if (type === 'note') continue;
    const fdxType = FDX_TYPE[type] ?? 'Action';
    const attributes = [
      type === 'scene' && line.sceneNumber ? ` Number="${escapeXml(line.sceneNumber)}"` : '',
      newPage ? ' StartsNewPage="Yes"' : '',
    ].join('');
    newPage = false;
    body.push(paragraph(fdxType, line.text, attributes));
    // Omitted scenes keep their heading and say so underneath — the same
    // convention the importer reads back.
    if (type === 'scene' && line.omitted) body.push(paragraph('Action', 'OMITTED'));
  }

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
    ...(cover.length ? ['  <TitlePage>', '    <Content>', ...cover, '    </Content>', '  </TitlePage>'] : []),
    '</FinalDraft>',
    '',
  ].join('\n');
};
