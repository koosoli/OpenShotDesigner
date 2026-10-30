import type { ScriptTextStyle } from '../../types';
import { MAX_SCRIPT_STYLES, normalizeStyles, styleRuns } from './editing';

/** Fountain emphasis only; markup is never interpreted as HTML. */
export function parseInlineFountain(input: string): { text: string; styles: ScriptTextStyle[] } {
  let text = '', bold = false, italic = false, underline = false;
  const spans: ScriptTextStyle[] = [];
  const stack: Array<{ marker: string; bold: boolean; italic: boolean; underline: boolean }> = [];
  const append = (char: string) => {
    const start = text.length;
    text += char;
    if (!bold && !italic && !underline) return;
    const last = spans[spans.length - 1];
    if (last && last.end === start && !!last.bold === bold && !!last.italic === italic && !!last.underline === underline) last.end = text.length;
    else spans.push({ start, end: text.length, bold, italic, underline });
  };
  for (let i = 0; i < input.length;) {
    if (input[i] === '\\' && /[\\*_]/.test(input[i + 1] ?? '')) {
      append(input[i + 1]); i += 2;
      continue;
    }
    const top = stack[stack.length - 1];
    if (top && input.startsWith(top.marker, i)) {
      stack.pop(); bold = top.bold; italic = top.italic; underline = top.underline;
      i += top.marker.length; continue;
    }
    const marker = input.startsWith('***', i) ? '***' : input.startsWith('**', i) ? '**' : /[*_]/.test(input[i]) ? input[i] : '';
    if (marker && input.indexOf(marker, i + marker.length) >= 0) {
      stack.push({ marker, bold, italic, underline });
      if (marker.includes('*')) { if (marker.length >= 2) bold = !bold; if (marker.length % 2 === 1) italic = !italic; }
      else underline = !underline;
      i += marker.length; continue;
    }
    const char = String.fromCodePoint(input.codePointAt(i)!);
    append(char); i += char.length;
  }
  if (spans.length > MAX_SCRIPT_STYLES) throw new Error('Too many screenplay style ranges.');
  return { text, styles: normalizeStyles(text, spans) };
}

export function styledFountain(text: string, styles: readonly ScriptTextStyle[] = []): string {
  return styleRuns(text, styles).map((run) => {
    const escaped = run.text.replace(/[\\*_]/g, '\\$&');
    const stars = '*'.repeat((run.bold ? 2 : 0) + (run.italic ? 1 : 0));
    const mark = `${run.underline ? '_' : ''}${stars}`;
    return `${mark}${escaped}${[...mark].reverse().join('')}`;
  }).join('');
}
