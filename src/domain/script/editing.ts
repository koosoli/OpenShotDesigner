/** Browser-native counterparts of ScriptCraft's editing concepts. No remote code or HTML. */
import type { ScriptLine, ScriptNote, ScriptTextStyle } from '../../types';

export const MAX_SCRIPT_STYLES = 2048;
export const MAX_SCRIPT_NOTES = 64;
export const MAX_SCRIPT_ALTERNATES = 16;
export const MAX_SCRIPT_NOTE_TEXT = 8192;
export const MAX_SCRIPT_ALTERNATE_TEXT = 65536;
export type StyleFlag = 'bold' | 'italic' | 'underline';
const FLAGS: StyleFlag[] = ['bold', 'italic', 'underline'];

/** Snap a UTF-16 position away from the middle of a surrogate pair. */
export function textBoundary(text: string, at: number, right = false): number {
  const n = Math.max(0, Math.min(text.length, Number.isFinite(at) ? Math.trunc(at) : 0));
  if (n > 0 && n < text.length && /[\uDC00-\uDFFF]/.test(text[n]) && /[\uD800-\uDBFF]/.test(text[n - 1])) return n + (right ? 1 : -1);
  return n;
}

export function styleRuns(text: string, spans: readonly ScriptTextStyle[] = []): Array<ScriptTextStyle & { text: string }> {
  if (spans.length > MAX_SCRIPT_STYLES * 3 + 3) throw new Error('Too many formatting ranges in this paragraph.');
  const safe = spans.filter((s) => Number.isInteger(s.start) && Number.isInteger(s.end) && s.start < s.end);
  const cuts = new Set([0, text.length]);
  for (const s of safe) { cuts.add(textBoundary(text, s.start)); cuts.add(textBoundary(text, s.end, true)); }
  const sorted = [...cuts].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((start, i) => {
    const end = sorted[i + 1];
    const covering = safe.filter((s) => s.start <= start && s.end >= end);
    return { start, end, text: text.slice(start, end), ...Object.fromEntries(FLAGS.filter((f) => covering.some((s) => s[f] === true)).map((f) => [f, true])) };
  });
}

export function normalizeStyles(text: string, styles: readonly ScriptTextStyle[] = []): ScriptTextStyle[] {
  const out: ScriptTextStyle[] = [];
  for (const { text: _text, ...run } of styleRuns(text, styles)) {
    if (!FLAGS.some((f) => run[f])) continue;
    const last = out[out.length - 1];
    if (last && last.end === run.start && FLAGS.every((f) => !!last[f] === !!run[f])) last.end = run.end;
    else out.push(run);
  }
  if (out.length > MAX_SCRIPT_STYLES) throw new Error('Too many formatting ranges in this paragraph.');
  return out;
}

export function toggleTextStyle(line: ScriptLine, start: number, end: number, flag: StyleFlag): ScriptLine {
  const a = textBoundary(line.text, Math.min(start, end));
  const b = textBoundary(line.text, Math.max(start, end), true);
  if (a === b) return line;
  const runs = styleRuns(line.text, line.styles);
  const on = !runs.filter((r) => r.start < b && r.end > a).every((r) => r[flag]);
  const parts: ScriptTextStyle[] = [];
  for (const r of runs) {
    const cuts = [...new Set([r.start, r.end, Math.max(r.start, Math.min(r.end, a)), Math.max(r.start, Math.min(r.end, b))])].sort((x, y) => x - y);
    for (let i = 0; i < cuts.length - 1; i++) parts.push({ ...r, start: cuts[i], end: cuts[i + 1], ...(cuts[i] >= a && cuts[i + 1] <= b ? { [flag]: on } : {}) });
  }
  return { ...line, styles: normalizeStyles(line.text, parts) };
}

/** One replacement; annotations and styles follow the surviving text. */
export function replaceScriptRange(line: ScriptLine, start: number, end: number, insert: string): ScriptLine {
  const a = textBoundary(line.text, start), b = Math.max(a, textBoundary(line.text, end, true));
  const text = line.text.slice(0, a) + insert + line.text.slice(b);
  if (text === line.text) return line;
  const shift = insert.length - (b - a);
  const map = (n: number, right: boolean) => n < a || (n === a && !right) ? n : n >= b ? n + shift : a + (right ? insert.length : 0);
  const styles = (line.styles ?? []).flatMap((s) => {
    const from = map(s.start, false), to = map(s.end, true);
    return to > from ? [{ ...s, start: from, end: to }] : [];
  });
  const notes = line.notes?.map((n) => ({ ...n, start: map(n.start, false), end: map(n.end, true) }));
  return { ...line, text, ...(line.styles ? { styles: normalizeStyles(text, styles) } : {}), ...(notes ? { notes } : {}) };
}

/** Textarea edits can be paste, deletion or a replacement rather than one keystroke. */
export function editScriptText(line: ScriptLine, text: string): ScriptLine {
  if (text === line.text) return line;
  let a = 0, oldEnd = line.text.length, newEnd = text.length;
  while (a < oldEnd && a < newEnd && line.text[a] === text[a]) a++;
  a = textBoundary(line.text, a);
  while (oldEnd > a && newEnd > a && line.text[oldEnd - 1] === text[newEnd - 1]) { oldEnd--; newEnd--; }
  if (textBoundary(line.text, oldEnd) !== oldEnd) { oldEnd++; newEnd++; }
  return replaceScriptRange(line, a, oldEnd, text.slice(a, newEnd));
}

/** Unicode capitals can expand (ß -> SS); map every original boundary, not one coarse edit. */
export function uppercaseScriptText<T extends Pick<ScriptLine, 'text' | 'styles' | 'notes'>>(line: T): T {
  const offsets = new Map<number, number>([[0, 0]]);
  let text = '', position = 0;
  for (const char of line.text) {
    text += char.toUpperCase(); position += char.length; offsets.set(position, text.length);
  }
  if (text === line.text) return line;
  const at = (offset: number) => offsets.get(offset) ?? text.length;
  return { ...line, text, ...(line.styles ? { styles: line.styles.map((s) => ({ ...s, start: at(s.start), end: at(s.end) })) } : {}), ...(line.notes ? { notes: line.notes.map((n) => ({ ...n, start: at(n.start), end: at(n.end) })) } : {}) };
}

/** Used on paragraph split: a ranged note crossing the split stays on both surviving parts. */
export function sliceScriptLine(line: ScriptLine, start: number, end: number): ScriptLine {
  const a = textBoundary(line.text, start), b = textBoundary(line.text, end, true);
  const text = line.text.slice(a, b);
  const notes = line.notes?.filter((n) => n.end >= a && n.start <= b).map((n) => ({ ...n, start: Math.max(0, n.start - a), end: Math.min(b - a, n.end - a) }));
  return { ...line, text, ...(line.styles ? { styles: normalizeStyles(text, line.styles.map((s) => ({ ...s, start: s.start - a, end: s.end - a }))) } : {}), ...(notes ? { notes } : {}) };
}

export interface ScriptSearchHit { lineId: string; start: number; end: number }
export function findScriptText(lines: readonly ScriptLine[], query: string, matchCase = false): ScriptSearchHit[] {
  if (!query || query.length > 500) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'gu' : 'giu');
  const hits: ScriptSearchHit[] = [];
  for (const line of lines) {
    for (const hit of line.text.matchAll(pattern)) {
      hits.push({ lineId: line.id, start: hit.index, end: hit.index + hit[0].length });
      if (hits.length === 10000) return hits;
    }
  }
  return hits;
}

export function replaceScriptHits(lines: readonly ScriptLine[], hits: readonly ScriptSearchHit[], insert: string): ScriptLine[] {
  const byId = new Map<string, ScriptSearchHit[]>();
  for (const h of hits) { const group = byId.get(h.lineId) ?? []; group.push(h); byId.set(h.lineId, group); }
  return lines.map((line) => (byId.get(line.id) ?? []).sort((a, b) => b.start - a.start).reduce((current, h) => replaceScriptRange(current, h.start, h.end, insert), line));
}

/** Whole scene blocks move, preserving all source IDs and production references. */
export function moveScriptScene(lines: readonly ScriptLine[], id: string, direction: -1 | 1): ScriptLine[] {
  const starts = lines.map((l, i) => l.type === 'scene' ? i : -1).filter((i) => i >= 0);
  const n = starts.findIndex((i) => lines[i].id === id), other = n + direction;
  if (n < 0 || other < 0 || other >= starts.length) return [...lines];
  const lo = Math.min(n, other), hi = Math.max(n, other);
  const a = starts[lo], b = starts[hi], c = starts[hi + 1] ?? lines.length;
  return [...lines.slice(0, a), ...lines.slice(b, c), ...lines.slice(a, b), ...lines.slice(c)];
}

export function chooseScriptAlternate(line: ScriptLine, id: string): ScriptLine {
  const alt = line.alternates?.find((a) => a.id === id);
  if (!alt) return line;
  const changed = editScriptText(line, alt.text);
  return { ...changed, styles: alt.styles, alternates: line.alternates?.map((a) => a.id === id ? { id: a.id, text: line.text, ...(line.styles ? { styles: line.styles } : {}) } : a) };
}

/** Validate file metadata at the trust boundary. No recursive or arbitrary style objects. */
export function scriptMetadataError(line: ScriptLine): string | null {
  const range = (r: { start: number; end: number }, text: string) => Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end >= r.start && r.end <= text.length && textBoundary(text, r.start) === r.start && textBoundary(text, r.end) === r.end;
  const stylesValid = (styles: ScriptTextStyle[] | undefined, text: string) => styles === undefined || (Array.isArray(styles) && styles.length <= MAX_SCRIPT_STYLES && styles.every((s) => s && range(s, text) && Object.keys(s).every((k) => ['start', 'end', ...FLAGS].includes(k)) && FLAGS.every((f) => s[f] === undefined || typeof s[f] === 'boolean')));
  if (!stylesValid(line.styles, line.text)) return 'Invalid screenplay style ranges.';
  if (line.bookmark !== undefined && (typeof line.bookmark !== 'string' || line.bookmark.length > 120)) return 'Invalid screenplay bookmark.';
  const idsUnique = (items: Array<{ id: string }>) => items.every((x) => typeof x.id === 'string' && x.id.length > 0 && x.id.length <= 160) && new Set(items.map((x) => x.id)).size === items.length;
  if (line.notes !== undefined && (!Array.isArray(line.notes) || line.notes.length > MAX_SCRIPT_NOTES || !line.notes.every((n: ScriptNote) => n && typeof n.text === 'string' && n.text.length <= MAX_SCRIPT_NOTE_TEXT && (n.author === undefined || (typeof n.author === 'string' && n.author.length <= 120)) && (n.color === undefined || (typeof n.color === 'string' && /^#[0-9a-f]{6}$/i.test(n.color))) && range(n, line.text)) || !idsUnique(line.notes))) return 'Invalid screenplay notes.';
  if (line.alternates !== undefined && (!Array.isArray(line.alternates) || line.alternates.length > MAX_SCRIPT_ALTERNATES || !line.alternates.every((a) => a && typeof a.text === 'string' && a.text.length <= MAX_SCRIPT_ALTERNATE_TEXT && stylesValid(a.styles, a.text)) || !idsUnique(line.alternates))) return 'Invalid dialogue alternatives.';
  if (line.structure !== undefined && (!Array.isArray(line.structure) || line.structure.length > 16 || !line.structure.every((s) => s && [1, 2, 3].includes(s.level) && typeof s.title === 'string' && s.title.length <= 500 && (s.summary === undefined || (typeof s.summary === 'string' && s.summary.length <= 8192))) || !idsUnique(line.structure))) return 'Invalid screenplay structure.';
  return null;
}
