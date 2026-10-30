import { ScriptElementType, ScriptLine } from '../../types';
import { parseFountainTitlePage, serializeFountainTitlePage } from '../../domain/script';
import type { ScreenplayTitlePage } from '../../domain/script';
import { fdxBodyParagraphs } from '../../domain/script/fdxParagraphs';
import { editScriptText, normalizeStyles, scriptMetadataError, uppercaseScriptText } from '../../domain/script/editing';
import { parseInlineFountain, styledFountain } from '../../domain/script/inlineFormat';

/**
 * Screenplay import + classification.
 *
 * Turns a raw .txt / .fountain / .fdx screenplay into typed lines that can be
 * laid out in standard Hollywood format (scene headings flush left, dialogue
 * indented, character cues centred, etc.) and lined for coverage.
 */

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const TRANSITION_RE = /^(FADE (IN|OUT|TO)|CUT TO|SMASH CUT|MATCH CUT|DISSOLVE TO|WIPE TO|IRIS (IN|OUT)|BACK TO|INTERCUT|THE END)\b/i;
const SHOT_RE = /^(ANGLE ON|CLOSE ON|CLOSE UP|WIDE ON|POV|INSERT|BACK TO SCENE|REVERSE ANGLE|TIGHT ON|PUSH IN|PAN TO)\b/i;
const CONTINUED_RE = /^\(?\s*(CONTINUED|CONT'D|MORE)\s*:?\s*\)?$/i;
const PAGE_NUMBER_RE = /^\d{1,3}[.)]?$/;
/**
 * Character cue: JENNA, JENNA (CONT'D), MAN'S VOICE (O.S.), BOB & RAY,
 * JENNA (WHISPERING), DISPATCHER (INTO RADIO), MARIA (IN SPANISH).
 *
 * The extension in brackets is deliberately unconstrained. It used to be a
 * whitelist of V.O./O.S./CONT'D and a handful of others, which meant a cue
 * carrying any other direction — and writers use anything — was classified as
 * ACTION. That took the speech with it (the dialogue under a non-cue is action
 * too) and kept the character out of the breakdown, the cast list, the
 * day-out-of-days, the sides and the actor-to-character link.
 *
 * What keeps action lines from matching is the surrounding guard, not this
 * pattern: a cue is upper case, at most 45 characters, does not end in a full
 * stop, and in a columnar script must be indented.
 */
const CHARACTER_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’&/#-]*(\([^)]*\)\s*)*$/iu;

/** Pull a scene number out of a slugline: "8  INT. LOFT - NIGHT  8" or "#8#". */
const extractSceneNumber = (raw: string): { text: string; sceneNumber?: string } => {
  let text = raw.trim();
  let sceneNumber: string | undefined;

  // Fountain forced scene number: INT. LOFT - NIGHT #8A#
  const fountainMatch = text.match(/#([0-9A-Za-z.-]+)#\s*$/);
  if (fountainMatch) {
    sceneNumber = fountainMatch[1];
    text = text.replace(/#[0-9A-Za-z.-]+#\s*$/, '').trim();
  }

  // Leading number ("8   INT. LOFT - NIGHT")
  const leading = text.match(/^([0-9]{1,4}[A-Za-z]{0,2})[.)]?\s{2,}(?=[A-Za-z])/);
  if (leading) {
    sceneNumber = sceneNumber || leading[1];
    text = text.slice(leading[0].length).trim();
  }

  // Trailing number ("INT. LOFT - NIGHT      8")
  const trailing = text.match(/\s{2,}([0-9]{1,4}[A-Za-z]{0,2})$/);
  if (trailing) {
    sceneNumber = sceneNumber || trailing[1];
    text = text.slice(0, text.length - trailing[0].length).trim();
  }

  return { text, sceneNumber };
};

const isUpper = (text: string) => {
  const letters = text.replace(/[^\p{L}]/gu, '');
  return letters.length > 0 && text === text.toUpperCase();
};

/**
 * The cover of an imported screenplay, when it has one.
 *
 * The block used to be stripped and thrown away, so a script that arrived with
 * its title, author and draft on the front lost all three at the door — and the
 * export invented "Author: CinePlan" in their place.
 */
export const parseScreenplayTitlePage = (raw: string): ScreenplayTitlePage | null =>
  parseFountainTitlePage(raw);

/** Drop the fountain/plain-text title page block so it doesn't pollute the body. */
const stripTitlePage = (rawLines: string[]): string[] => {
  if (!rawLines.length) return rawLines;
  const firstContent = rawLines.findIndex((line) => line.trim().length > 0);
  if (firstContent === -1) return rawLines;
  if (!/^(Title|Credit|Author|Authors|Source|Draft date|Contact|Copyright|Notes)\s*:/i.test(rawLines[firstContent].trim())) {
    return rawLines;
  }
  const divider = rawLines.findIndex((line) => /^={3,}$/.test(line.trim()));
  if (divider !== -1) return rawLines.slice(divider + 1);
  // Otherwise stop at the first blank line following the key/value block
  for (let i = firstContent; i < rawLines.length; i += 1) {
    if (rawLines[i].trim() === '' && rawLines[i + 1] && !/^\s/.test(rawLines[i + 1]) && !/^[A-Za-z ]+:/.test(rawLines[i + 1])) {
      return rawLines.slice(i + 1);
    }
  }
  return rawLines;
};

interface ParsedElement extends Pick<ScriptLine, 'styles' | 'notes' | 'bookmark' | 'alternates' | 'structure'> {
  text: string;
  type: ScriptElementType;
  sceneNumber?: string;
  omitted?: boolean;
  /** Cue of the second speaker in dual dialogue. */
  dual?: boolean;
  /** Scene heading's summary (Fountain `= …`, Final Draft index card). */
  synopsis?: string;
  sceneColor?: string;
  /** Revision colour the line was last changed in (Final Draft revision sets). */
  revisedIn?: number;
}

/** The scene heading a synopsis line belongs to: the latest one, if any. */
const attachSynopsis = (out: ParsedElement[], text: string): void => {
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (out[i].type !== 'scene') continue;
    out[i].synopsis = out[i].synopsis ? `${out[i].synopsis} ${text}` : text;
    return;
  }
};

/** `[[OMITTED]]` directly after a slugline marks that scene as cut (round-trips our Fountain export). */
const OMITTED_NOTE_RE = /^\[\[\s*OMITTED\s*\]\]$|^OMITTED$/i;

const applyOmittedNote = (out: ParsedElement[], text: string): boolean => {
  if (!OMITTED_NOTE_RE.test(text)) return false;
  const previous = out[out.length - 1];
  if (!previous || previous.type !== 'scene') return false;
  previous.omitted = true;
  return true;
};

/** Classify plain-text / fountain screenplay lines with a small state machine. */
export const parseScreenplayText = (raw: string): ParsedElement[] => {
  const rawLines = stripTitlePage(raw.replace(/\r\n?/g, '\n').split('\n'));
  const out: ParsedElement[] = [];
  let previousType: ScriptElementType | null = null;
  let currentScene: string | undefined;
  let pendingStructure: NonNullable<ScriptLine['structure']> = [];

  // If the file keeps its original column layout, indentation is the most
  // reliable signal for character / dialogue blocks.
  const indents = rawLines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)![0].length);
  const usesIndentation = indents.filter((indent) => indent >= 8).length > indents.length * 0.15;

  rawLines.forEach((rawLine) => {
    const meta = rawLine.trim().match(/^\[\[OSD-META:v1:([A-Za-z0-9+/=]+)\]\]$/);
    if (meta) {
      if (meta[1].length > 2 * 1024 * 1024) throw new Error('Screenplay metadata is too large.');
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(meta[1]), (c) => c.charCodeAt(0))));
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((k) => !['notes', 'bookmark', 'alternates'].includes(k))) throw new Error('Invalid screenplay metadata.');
      const last = out[out.length - 1];
      if (last) {
        const merged = { ...last, ...value };
        const error = scriptMetadataError({ ...merged, id: '', lineNumber: 0 });
        if (error) throw new Error(error);
        Object.assign(last, value);
      }
      return;
    }
    const section = rawLine.trim().match(/^(#{1,3})\s+(.+)$/);
    if (section) {
      if (pendingStructure.length >= 16 || section[2].length > 500) throw new Error('Screenplay structure limit reached.');
      pendingStructure.push({ id: nextId('structure'), level: section[1].length as 1 | 2 | 3, title: section[2] });
      return;
    }
    const withoutTabs = rawLine.replace(/\t/g, '    ');
    const indent = withoutTabs.match(/^\s*/)![0].length;
    const inline = parseInlineFountain(withoutTabs.trim());
    const text = inline.text;
    const beforeCount = out.length;
    const beforeText = out[out.length - 1]?.text;
    (() => {

    if (!text || text === '\f') {
      previousType = null;
      return;
    }
    if (PAGE_NUMBER_RE.test(text) || CONTINUED_RE.test(text)) return;
    if (applyOmittedNote(out, text)) return;

    // Fountain page break and synopsis lines.
    if (/^={3,}$/.test(text)) {
      out.push({ text: '', type: 'page-break', sceneNumber: currentScene });
      previousType = null;
      return;
    }
    if (/^=(?!=)/.test(text)) {
      const synopsis = text.slice(1).trim();
      if (synopsis && pendingStructure.length) {
        const point = pendingStructure[pendingStructure.length - 1];
        point.summary = [point.summary, synopsis].filter(Boolean).join('\n');
        if (point.summary.length > 8192) throw new Error('Screenplay structure summary is too large.');
      } else if (synopsis) attachSynopsis(out, synopsis);
      return;
    }

    // A shot Fountain has no syntax for, written as action with a [[shot]]
    // note (ScriptCraft's convention; other apps show it as action).
    const shotNote = text.match(/^(.*?)\s*\[\[\s*shot\s*\]\]\s*$/i);
    if (shotNote && shotNote[1].trim()) {
      out.push({ text: shotNote[1].replace(/^!/, '').trim().toUpperCase(), type: 'shot', sceneNumber: currentScene });
      previousType = 'shot';
      return;
    }

    // Fountain forced-element prefixes
    if (text.startsWith('!')) {
      out.push({ text: text.slice(1).trim(), type: 'action', sceneNumber: currentScene });
      previousType = 'action';
      return;
    }
    if (text.startsWith('@')) {
      const forced = text.slice(1).trim();
      const dual = /\^\s*$/.test(forced);
      out.push({ text: forced.replace(/\s*\^\s*$/, ''), type: 'character', sceneNumber: currentScene, ...(dual ? { dual: true } : {}) });
      previousType = 'character';
      return;
    }
    if (text.startsWith('[[') || /^NOTE:/i.test(text)) {
      out.push({ text: text.replace(/^\[\[|\]\]$/g, '').trim(), type: 'note', sceneNumber: currentScene });
      previousType = 'note';
      return;
    }

    const forcedScene = text.startsWith('.') && !text.startsWith('..');
    // Production drafts print the scene number on both sides of the slugline
    // ("8   INT. LOFT - NIGHT   8"), so strip those before matching INT./EXT.
    const sceneCandidate = extractSceneNumber(forcedScene ? text.slice(1) : text);
    if (forcedScene || SCENE_RE.test(sceneCandidate.text)) {
      currentScene = sceneCandidate.sceneNumber || currentScene;
      out.push({ text: sceneCandidate.text.toUpperCase(), type: 'scene', sceneNumber: sceneCandidate.sceneNumber });
      previousType = 'scene';
      return;
    }

    if (text.startsWith('>') || (isUpper(text) && TRANSITION_RE.test(text) && text.length < 40)) {
      out.push({ text: text.replace(/^>/, '').replace(/<$/, '').trim(), type: 'transition', sceneNumber: currentScene });
      previousType = 'transition';
      return;
    }

    if (isUpper(text) && SHOT_RE.test(text) && text.length < 60) {
      out.push({ text, type: 'shot', sceneNumber: currentScene });
      previousType = 'shot';
      return;
    }

    if (/^\(.*\)$/.test(text) && (previousType === 'character' || previousType === 'dialogue')) {
      out.push({ text, type: 'parenthetical', sceneNumber: currentScene });
      previousType = 'parenthetical';
      return;
    }

    // Fountain dual dialogue: the second cue ends with ^.
    const dualCue = /\^\s*$/.test(text);
    const cueText = dualCue ? text.replace(/\s*\^\s*$/, '') : text;
    // The name is in capitals; an extension may not be ("EDWARD (cont'd)").
    const cueName = cueText.replace(/\([^)]*\)/g, '').trim();
    const looksLikeCue =
      isUpper(cueName) &&
      cueText.length <= 45 &&
      CHARACTER_RE.test(cueText) &&
      !cueText.endsWith('.') &&
      (!usesIndentation || indent >= 8);

    if (looksLikeCue && previousType !== 'character') {
      out.push({ text: cueText.toUpperCase(), type: 'character', sceneNumber: currentScene, ...(dualCue ? { dual: true } : {}) });
      previousType = 'character';
      return;
    }

    // Lines with no blank line between them are one paragraph (Fountain's
    // rule): a hard-wrapped .txt or a script typed with line breaks reads as
    // whole speeches and action, not a paragraph per printed line.
    const last = out[out.length - 1];
    if (previousType === 'character' || previousType === 'parenthetical' || previousType === 'dialogue') {
      if (previousType === 'dialogue' && last?.type === 'dialogue') {
        last.text = `${last.text} ${text}`;
        return;
      }
      out.push({ text, type: 'dialogue', sceneNumber: currentScene });
      previousType = 'dialogue';
      return;
    }

    if (previousType === 'action' && last?.type === 'action') {
      last.text = `${last.text} ${text}`;
      return;
    }
    out.push({ text, type: 'action', sceneNumber: currentScene });
    previousType = 'action';
    })();
    const last = out[out.length - 1];
    if (!last || (out.length === beforeCount && last.text === beforeText)) return;
    if (pendingStructure.length) { last.structure = pendingStructure; pendingStructure = []; }
    if (out.length === beforeCount && beforeText !== undefined) {
      const shift = beforeText.length + 1;
      last.styles = normalizeStyles(last.text, [...(last.styles ?? []), ...inline.styles.map((s) => ({ ...s, start: s.start + shift, end: s.end + shift }))]);
    } else {
      const original = { id: '', lineNumber: 0, ...inline };
      last.styles = editScriptText(['scene', 'character', 'transition', 'shot'].includes(last.type) ? uppercaseScriptText(original) : original, last.text).styles;
    }
  });

  if (pendingStructure.length && out.length) out[out.length - 1].structure = [...(out[out.length - 1].structure ?? []), ...pendingStructure];

  return out;
};

const FDX_TYPE_MAP: Record<string, ScriptElementType> = {
  'Scene Heading': 'scene',
  Action: 'action',
  Character: 'character',
  Parenthetical: 'parenthetical',
  Dialogue: 'dialogue',
  Singing: 'dialogue',
  Transition: 'transition',
  Shot: 'shot',
  General: 'action',
};

/** Final Draft XML keeps element types (and often scene numbers) explicitly. */
export const parseFinalDraftXml = (raw: string): ParsedElement[] => {
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (doc.querySelector('parsererror')) return parseScreenplayText(raw);

  const out: ParsedElement[] = [];
  let currentScene: string | undefined;

  // Only the script body: a Final Draft file's <TitlePage> holds paragraphs
  // too, and reading those imported the cover as action lines. Dual dialogue
  // and the scene headings' index cards are read by fdxBodyParagraphs.
  let pendingStructure: NonNullable<ScriptLine['structure']> = [];
  fdxBodyParagraphs(doc).forEach(({ element: paragraph, type: fdxType, text, dual, summary, color, revision, notes, styles, bookmark, alternates }) => {
    const metadata = { ...(notes ? { notes } : {}), ...(styles?.length ? { styles } : {}), ...(bookmark ? { bookmark } : {}), ...(alternates ? { alternates } : {}), ...(pendingStructure.length ? { structure: pendingStructure } : {}) };
    if (!text) {
      if (notes?.length || bookmark || alternates?.length) { out.push({ text, type: FDX_TYPE_MAP[fdxType] ?? 'action', ...metadata }); pendingStructure = []; }
      return;
    }
    if (applyOmittedNote(out, text)) {
      return;
    }
    const revised = revision !== undefined ? { revisedIn: revision } : {};
    if (fdxType === 'Summary' && pendingStructure.length) {
      const point = pendingStructure[pendingStructure.length - 1];
      point.summary = [point.summary, text].filter(Boolean).join('\n');
      if (point.summary.length > 8192) throw new Error('Screenplay structure summary is too large.');
      return;
    }

    // Final Draft's outline (acts, sequences and their summaries) is hidden in
    // the script; keep them as non-printing structure points.
    if (/^Outline/i.test(fdxType)) {
      const level = Math.max(1, Math.min(3, Number(fdxType.match(/\d/)?.[0] ?? 1))) as 1 | 2 | 3;
      if (pendingStructure.length >= 16 || text.length > 500) throw new Error('Screenplay structure limit reached.');
      pendingStructure.push({ id: nextId('structure'), title: text, level });
      return;
    }
    const type = FDX_TYPE_MAP[fdxType] || 'action';
    if (type === 'scene') {
      const attrNumber = paragraph.getAttribute('Number') || undefined;
      const { text: headingText, sceneNumber } = extractSceneNumber(text);
      currentScene = attrNumber || sceneNumber || currentScene;
      out.push({
        ...(summary ? { synopsis: summary } : {}),
        ...(color ? { sceneColor: color } : {}),
        ...revised,
        ...uppercaseScriptText(editScriptText({ id: '', lineNumber: 0, text, ...metadata }, headingText)),
        // Only writing metadata from the adjusted line; retain the scene type below.
        type,
        sceneNumber: attrNumber || sceneNumber,
      });
      pendingStructure = [];
      return;
    }
    out.push({ text, type, sceneNumber: currentScene, ...(type === 'character' && dual ? { dual: true } : {}), ...revised, ...metadata });
    pendingStructure = [];
  });

  if (pendingStructure.length && out.length) out[out.length - 1].structure = [...(out[out.length - 1].structure ?? []), ...pendingStructure];

  return out.length ? out : parseScreenplayText(raw);
};

/** Parse a screenplay file into numbered, typed script lines. */
export const parseScreenplay = (raw: string, fileName = ''): ScriptLine[] => {
  const isFdx = fileName.toLowerCase().endsWith('.fdx') || /<FinalDraft/i.test(raw.slice(0, 2000));
  const elements = isFdx ? parseFinalDraftXml(raw) : parseScreenplayText(raw);

  // Carry the last seen scene number forward so every line knows its scene.
  let currentScene: string | undefined;
  let sceneCounter = 0;

  return elements.map((element, index) => {
    if (element.type === 'scene') {
      sceneCounter += 1;
      currentScene = element.sceneNumber || String(sceneCounter);
    }
    const line: ScriptLine = {
      id: nextId('sl'),
      lineNumber: index + 1,
      text: element.text,
      type: element.type,
      sceneNumber: currentScene,
      isSceneHeading: element.type === 'scene',
    };
    if (element.omitted) line.omitted = true;
    if (element.dual) line.dual = true;
    if (element.synopsis) line.synopsis = element.synopsis;
    if (element.sceneColor) line.sceneColor = element.sceneColor;
    if (element.revisedIn !== undefined) line.revisedIn = element.revisedIn;
    for (const key of ['styles', 'notes', 'bookmark', 'alternates', 'structure'] as const) {
      if (element[key] !== undefined) Object.assign(line, { [key]: element[key] });
    }
    const metadataError = scriptMetadataError(line);
    if (metadataError) throw new Error(metadataError);
    return line;
  });
};

/** Scene number covering a given line (falls back to the nearest earlier scene). */
export const sceneNumberForLine = (lines: ScriptLine[], lineId: string): string | undefined => {
  const index = lines.findIndex((line) => line.id === lineId);
  if (index === -1) return undefined;
  for (let i = index; i >= 0; i -= 1) {
    if (lines[i].sceneNumber) return lines[i].sceneNumber;
  }
  return undefined;
};

/** Clean a parenthetical string ensuring it has single enclosing parentheses. */
export const formatParenthetical = (text: string): string => {
  const inner = text
    .replace(/^\s*\(+/, '')
    .replace(/\)+\s*$/, '')
    .replace(/[()]/g, '')
    .trim();
  return inner ? `(${inner})` : '()';
};

/**
 * Serialize typed script lines to clean Fountain plain text format.
 */
export const serializeToFountain = (
  lines: ScriptLine[],
  title?: string,
  titlePage?: ScreenplayTitlePage,
): string => {
  const out: string[] = [];
  // The production's own cover when it has one. Failing that the title alone —
  // never an invented author, which is what this used to write.
  const cover = serializeFountainTitlePage(titlePage, title);
  if (cover) out.push(cover);
  else if (title) out.push(`Title: ${title}\n\n===\n\n`);

  lines.forEach((line) => {
    line.structure?.forEach((s) => {
      out.push(`\n${'#'.repeat(s.level)} ${s.title}\n`);
      if (s.summary) out.push(s.summary.split('\n').map((text) => `= ${text}\n`).join(''));
    });
    const text = styledFountain(line.text || '', line.styles).trim();
    if (!text && line.type !== 'page-break') return;

    switch (line.type) {
      case 'scene': {
        const sceneNum = line.sceneNumber ? ` #${line.sceneNumber}#` : '';
        const isStandardPrefix = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i.test(text);
        const prefix = isStandardPrefix ? '' : '.';
        out.push(`\n${prefix}${text.toUpperCase()}${sceneNum}\n`);
        if (line.synopsis?.trim()) out.push(`= ${line.synopsis.trim()}\n`);
        if (line.omitted) {
          // Parked body is kept as boneyard so a round trip never loses it.
          out.push('[[OMITTED]]\n');
          if (line.omittedBody?.length) {
            out.push(`/*\n${line.omittedBody.map((parked) => parked.text).join('\n')}\n*/\n`);
          }
        }
        break;
      }
      case 'character':
        out.push(`\n${text.toUpperCase()}${line.dual ? ' ^' : ''}\n`);
        break;
      case 'parenthetical':
        out.push(`${formatParenthetical(text)}\n`);
        break;
      case 'dialogue':
        out.push(`${text}\n`);
        break;
      case 'transition':
        out.push(`\n> ${text.toUpperCase()}\n`);
        break;
      case 'shot': {
        // A standard shot call reads back as a shot; anything else would read
        // as a character cue, so it is forced to action and tagged [[shot]].
        const upper = text.toUpperCase();
        out.push(SHOT_RE.test(upper) && upper.length < 60 ? `\n${upper}\n` : `\n!${upper} [[shot]]\n`);
        break;
      }
      case 'note':
        out.push(`\n[[ ${text} ]]\n`);
        break;
      case 'page-break':
        out.push(`\n===\n`);
        break;
      case 'action':
      default:
        out.push(`\n${text}\n`);
        break;
    }
    if (line.notes?.length || line.bookmark || line.alternates?.length) {
      const metadata = JSON.stringify({ ...(line.notes?.length ? { notes: line.notes } : {}), ...(line.bookmark ? { bookmark: line.bookmark } : {}), ...(line.alternates?.length ? { alternates: line.alternates } : {}) });
      const bytes = new TextEncoder().encode(metadata);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      out.push(`[[OSD-META:v1:${btoa(binary)}]]\n`);
    }
  });

  return out.join('').trim() + '\n';
};

/**
 * Parse an AV script from 2-column or tab-delimited text/CSV.
 */
export const parseAVScriptText = (raw: string): import('../../types').AVScriptRow[] => {
  const rows: import('../../types').AVScriptRow[] = [];
  const lines = raw.split(/\r?\n/);
  let shotIndex = 1;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Check for tab or CSV separator
    let parts: string[] = [];
    if (trimmed.includes('\t')) {
      parts = trimmed.split('\t');
    } else if (trimmed.includes(' | ')) {
      parts = trimmed.split(' | ');
    } else if (trimmed.includes(';')) {
      parts = trimmed.split(';');
    } else {
      parts = [trimmed];
    }

    if (parts.length >= 2) {
      const shotName = parts[0].trim();
      const video = parts[1].trim();
      const audio = parts[2] ? parts[2].trim() : '';
      rows.push({
        id: nextId('av'),
        shotNumber: String(shotIndex++),
        shotName,
        video,
        audio,
      });
    } else {
      rows.push({
        id: nextId('av'),
        shotNumber: String(shotIndex++),
        shotName: `Shot ${shotIndex - 1}`,
        video: parts[0].trim(),
        audio: '',
      });
    }
  });

  return rows.length ? rows : [
    { id: nextId('av'), shotNumber: '1', shotName: 'WS - Establishing', video: 'Wide exterior shot of the building at sunrise.', audio: 'MUSIC: Upbeat ambient intro track begins to swell.' },
    { id: nextId('av'), shotNumber: '2', shotName: 'MS - Presenter', video: 'Presenter walks into frame, gesturing toward camera.', audio: 'PRESENTER (V.O.)\nWelcome to the future of cinematic production planning.' },
  ];
};

/**
 * Serialize AV Script rows to clean 2-Column Markdown / Plain Text.
 */
export const serializeAVToPlainText = (rows: import('../../types').AVScriptRow[], title?: string): string => {
  const out: string[] = [];
  if (title) {
    out.push(`# AV SCRIPT: ${title.toUpperCase()}\n\n`);
  }
  out.push('| SHOT # | SHOT NAME / SIZE | VIDEO (VISUALS & CAMERA) | AUDIO (VO, DIALOGUE, SFX) | EST. TIME |\n');
  out.push('|---|---|---|---|---|\n');
  rows.forEach((r) => {
    const size = r.shotSize ? ` [${r.shotSize}]` : '';
    const name = (r.shotName || '') + size;
    const v = (r.video || '').replace(/[\r\n]+/g, ' ');
    const a = (r.audio || '').replace(/[\r\n]+/g, ' / ');
    const t = r.durationSec ? `${r.durationSec}s` : '-';
    out.push(`| ${r.shotNumber} | ${name} | ${v} | ${a} | ${t} |\n`);
  });
  return out.join('');
};
