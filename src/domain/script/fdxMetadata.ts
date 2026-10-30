import type { ScriptAlternate, ScriptLine, ScriptNote, ScriptTextStyle } from '../../types';
import { createId } from '../ids';
import { MAX_SCRIPT_ALTERNATES, MAX_SCRIPT_NOTES, MAX_SCRIPT_STYLES, normalizeStyles, scriptMetadataError, styleRuns } from './editing';

export const escapeScriptXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const children = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name);

export function fdxTextRuns(paragraph: Element): { text: string; styles: ScriptTextStyle[] } {
  let text = '';
  const styles: ScriptTextStyle[] = [];
  for (const run of children(paragraph, 'Text')) {
    const start = text.length;
    text += run.textContent ?? '';
    const flags = (run.getAttribute('Style') ?? '').split(/[+ ,]+/);
    if (styles.length >= MAX_SCRIPT_STYLES) throw new Error('Too many screenplay style ranges.');
    if (flags.some((f) => ['Bold', 'Italic', 'Underline'].includes(f))) styles.push({ start, end: text.length, bold: flags.includes('Bold'), italic: flags.includes('Italic'), underline: flags.includes('Underline') });
  }
  if (styles.length > MAX_SCRIPT_STYLES) throw new Error('Too many screenplay style ranges.');
  return { text, styles: normalizeStyles(text, styles) };
}

export function fdxWritingMetadata(paragraph: Element, text: string): Pick<ScriptLine, 'notes' | 'bookmark' | 'alternates'> {
  const notes: ScriptNote[] = [];
  let offset = 0;
  for (const child of Array.from(paragraph.children)) {
    if (child.localName === 'Text') offset += (child.textContent ?? '').length;
    if (child.localName !== 'ScriptNote') continue;
    const content = children(child, 'Paragraph').map((p) => fdxTextRuns(p).text).join('\n');
    if (!content) continue;
    if (notes.length >= MAX_SCRIPT_NOTES) throw new Error('Too many screenplay notes.');
    const range = child.getAttribute('Range')?.match(/^(\d+),(\d+)$/);
    const start = range ? Number(range[1]) : offset < text.length ? offset : 0;
    const end = range ? start + Number(range[2]) : text.length;
    const author = child.getAttribute('Author') ?? '';
    const rawColor = child.getAttribute('Color') ?? '';
    const color = /^#[a-f\d]{6}$/i.test(rawColor) ? rawColor : /^#[a-f\d]{12}$/i.test(rawColor) ? `#${rawColor.slice(1, 3)}${rawColor.slice(5, 7)}${rawColor.slice(9, 11)}` : '#facc15';
    notes.push({ id: createId('sn'), text: content, start, end, ...(author ? { author } : {}), color });
  }
  const alternateNodes = children(paragraph, 'ScriptCraftAlternate');
  if (alternateNodes.length > MAX_SCRIPT_ALTERNATES) throw new Error('Too many dialogue alternatives.');
  const alternates: ScriptAlternate[] = alternateNodes.map((a) => ({ id: createId('alt'), ...fdxTextRuns(a) }));
  const bookmark = paragraph.getAttribute('Bookmark');
  const metadata = { ...(notes.length ? { notes } : {}), ...(alternates.length ? { alternates } : {}), ...(bookmark ? { bookmark } : {}) };
  const error = scriptMetadataError({ id: '', lineNumber: 0, text, ...metadata });
  if (error) throw new Error(error);
  return metadata;
}

export function fdxStyledText(text: string, styles: readonly ScriptTextStyle[] = [], attributes = ''): string {
  if (!text) return `<Text${attributes}></Text>`;
  return styleRuns(text, styles).map((r) => {
    const flags = [r.bold && 'Bold', r.italic && 'Italic', r.underline && 'Underline'].filter(Boolean).join('+');
    return `<Text${attributes}${flags ? ` Style="${flags}"` : ''}>${escapeScriptXml(r.text)}</Text>`;
  }).join('');
}

export function fdxAnnotations(line: Pick<ScriptLine, 'notes' | 'alternates'>): string {
  const notes = (line.notes ?? []).map((n, i) => {
    const color = n.color ?? '#facc15';
    const fdxColor = `#${color.slice(1, 3).repeat(2)}${color.slice(3, 5).repeat(2)}${color.slice(5, 7).repeat(2)}`;
    return `<ScriptNote ID="${i + 1}" Author="${escapeScriptXml(n.author ?? '')}" Color="${fdxColor}" Range="${n.start},${n.end - n.start}" Type="Note"><Paragraph>${fdxStyledText(n.text)}</Paragraph></ScriptNote>`;
  }).join('');
  return notes + (line.alternates ?? []).map((a) => `<ScriptCraftAlternate>${fdxStyledText(a.text, a.styles)}</ScriptCraftAlternate>`).join('');
}
