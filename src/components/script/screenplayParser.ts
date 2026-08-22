import { ScriptElementType, ScriptLine } from '../../types';

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
/** Character cue: JENNA, JENNA (CONT'D), MAN'S VOICE (O.S.), BOB & RAY */
const CHARACTER_RE = /^[A-Z0-9][A-Z0-9 .,'’&/#-]*(\((V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|PRE-?LAP|SUBTITLED?|filtered|on phone)[^)]*\)\s*)*$/i;

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

const stripFountainEmphasis = (text: string) =>
  text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1');

const isUpper = (text: string) => {
  const letters = text.replace(/[^A-Za-z]/g, '');
  return letters.length > 0 && text === text.toUpperCase();
};

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

interface ParsedElement {
  text: string;
  type: ScriptElementType;
  sceneNumber?: string;
  omitted?: boolean;
}

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

  // If the file keeps its original column layout, indentation is the most
  // reliable signal for character / dialogue blocks.
  const indents = rawLines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)![0].length);
  const usesIndentation = indents.filter((indent) => indent >= 8).length > indents.length * 0.15;

  rawLines.forEach((rawLine) => {
    const withoutTabs = rawLine.replace(/\t/g, '    ');
    const indent = withoutTabs.match(/^\s*/)![0].length;
    const text = stripFountainEmphasis(withoutTabs.trim());

    if (!text || text === '\f') {
      previousType = null;
      return;
    }
    if (PAGE_NUMBER_RE.test(text) || CONTINUED_RE.test(text)) return;
    if (applyOmittedNote(out, text)) return;

    // Fountain forced-element prefixes
    if (text.startsWith('!')) {
      out.push({ text: text.slice(1).trim(), type: 'action', sceneNumber: currentScene });
      previousType = 'action';
      return;
    }
    if (text.startsWith('@')) {
      out.push({ text: text.slice(1).trim(), type: 'character', sceneNumber: currentScene });
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

    const looksLikeCue =
      isUpper(text) &&
      text.length <= 45 &&
      CHARACTER_RE.test(text) &&
      !text.endsWith('.') &&
      (!usesIndentation || indent >= 8);

    if (looksLikeCue && previousType !== 'character') {
      out.push({ text, type: 'character', sceneNumber: currentScene });
      previousType = 'character';
      return;
    }

    if (previousType === 'character' || previousType === 'parenthetical' || previousType === 'dialogue') {
      out.push({ text, type: 'dialogue', sceneNumber: currentScene });
      previousType = 'dialogue';
      return;
    }

    out.push({ text, type: 'action', sceneNumber: currentScene });
    previousType = 'action';
  });

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

  Array.from(doc.querySelectorAll('Paragraph')).forEach((paragraph) => {
    const text = Array.from(paragraph.querySelectorAll('Text'))
      .map((node) => node.textContent || '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return;
    if (applyOmittedNote(out, text)) return;

    const type = FDX_TYPE_MAP[paragraph.getAttribute('Type') || ''] || 'action';
    if (type === 'scene') {
      const attrNumber = paragraph.getAttribute('Number') || undefined;
      const { text: headingText, sceneNumber } = extractSceneNumber(text);
      currentScene = attrNumber || sceneNumber || currentScene;
      out.push({ text: headingText.toUpperCase(), type, sceneNumber: attrNumber || sceneNumber });
      return;
    }
    out.push({ text, type, sceneNumber: currentScene });
  });

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
  let inner = text
    .replace(/^\s*\(+/, '')
    .replace(/\)+\s*$/, '')
    .replace(/[()]/g, '')
    .trim();
  return inner ? `(${inner})` : '()';
};

/**
 * Serialize typed script lines to clean Fountain plain text format.
 */
export const serializeToFountain = (lines: ScriptLine[], title?: string): string => {
  const out: string[] = [];
  if (title) {
    out.push(`Title: ${title}\nCredit: Written by\nAuthor: CinePlan\n\n===\n\n`);
  }

  let prevType: ScriptElementType | undefined;

  lines.forEach((line) => {
    const text = (line.text || '').trim();
    if (!text) return;

    switch (line.type) {
      case 'scene': {
        const sceneNum = line.sceneNumber ? ` #${line.sceneNumber}#` : '';
        const isStandardPrefix = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i.test(text);
        const prefix = isStandardPrefix ? '' : '.';
        out.push(`\n${prefix}${text.toUpperCase()}${sceneNum}\n`);
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
        out.push(`\n${text.toUpperCase()}\n`);
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
      case 'shot':
        out.push(`\n${text.toUpperCase()}\n`);
        break;
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
    prevType = line.type;
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
