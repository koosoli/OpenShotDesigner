/**
 * A scene heading as the editor's three controls see it: the INT/EXT prefix,
 * the set (location and any sub-locations), and the time of day.
 *
 * Unlike `parseSceneHeading`, which reads a heading for the breakdown and
 * folds every interior/exterior combination into one value, this keeps the
 * prefix exactly as chosen — INT./EXT. and EXT./INT. are different headings
 * on the page — and gives the text back unchanged apart from what was edited.
 *
 * Also the vocabularies the screenplay editor offers in its pickers: times of
 * day, transitions, character cue extensions, parentheticals and shot calls.
 */

export const SCENE_PREFIXES = ['INT.', 'EXT.', 'INT./EXT.', 'EXT./INT.', 'I/E.', 'EST.'] as const;

/** The usual times of day, most common first. */
export const TIMES_OF_DAY = [
  'DAY',
  'NIGHT',
  'MORNING',
  'AFTERNOON',
  'EVENING',
  'DAWN',
  'DUSK',
  'SUNRISE',
  'SUNSET',
  'MAGIC HOUR',
  'CONTINUOUS',
  'LATER',
  'MOMENTS LATER',
  'SAME TIME',
  'NEXT DAY',
] as const;

export const TRANSITIONS = [
  'CUT TO:',
  'SMASH CUT TO:',
  'MATCH CUT TO:',
  'JUMP CUT TO:',
  'DISSOLVE TO:',
  'FADE TO BLACK.',
  'FADE OUT.',
  'FADE IN:',
  'INTERCUT WITH:',
  'BACK TO:',
  'TIME CUT:',
] as const;

/** Character cue extensions, as they print after the name. */
export const CUE_EXTENSIONS = ["V.O.", 'O.S.', 'O.C.', "CONT'D", 'PRE-LAP', 'FILTERED', 'ON PHONE', 'INTO PHONE', 'SUBTITLED'] as const;

export const PARENTHETICALS = [
  '(beat)',
  '(pause)',
  '(then)',
  '(continuing)',
  '(sotto voce)',
  '(whispering)',
  '(shouting)',
  '(to herself)',
  '(to himself)',
  '(into phone)',
  '(off screen)',
  '(in Spanish; subtitled)',
] as const;

export const SHOT_CALLS = [
  'ANGLE ON',
  'CLOSE ON',
  'CLOSE-UP',
  'WIDE SHOT',
  'INSERT',
  'POV',
  'OVER THE SHOULDER',
  'TRACKING SHOT',
  'AERIAL SHOT',
  'BACK TO SCENE',
  'SERIES OF SHOTS',
  'MONTAGE',
  'END MONTAGE',
] as const;

export interface SceneHeadingParts {
  /** Canonical prefix ("INT.", "EXT./INT."…), or '' when the heading has none. */
  prefix: string;
  /** Location and sub-locations, as written ("JOHN'S APARTMENT - KITCHEN"). */
  body: string;
  /** Time of day, or '' when the last segment is not one. */
  time: string;
}

const PREFIX_PATTERNS: Array<[RegExp, string]> = [
  [/^(?:INT(?:ERIOR)?\.?\s*\/\s*EXT(?:ERIOR)?\.?|INT[-. ]EXT\.?)(?=\s|$)/i, 'INT./EXT.'],
  [/^(?:EXT(?:ERIOR)?\.?\s*\/\s*INT(?:ERIOR)?\.?|EXT[-. ]INT\.?)(?=\s|$)/i, 'EXT./INT.'],
  [/^I\s*\/\s*E\.?(?=\s|$)/i, 'I/E.'],
  [/^INT(?:ERIOR)?\.?(?=\s|$)/i, 'INT.'],
  [/^EXT(?:ERIOR)?\.?(?=\s|$)/i, 'EXT.'],
  [/^EST(?:ABLISHING)?\.?(?=\s|$)/i, 'EST.'],
];

const SEPARATOR = /\s+[–—-]\s+/;
const TIME_SET = new Set<string>(TIMES_OF_DAY);
/** Times beyond the presets that are still clearly a time ("LATE AFTERNOON", "PRE-DAWN"). */
const TIME_WORD = /^(?:(?:EARLY|LATE|PRE-?|MID-?)\s*)?(?:DAY|NIGHT|MORNING|AFTERNOON|EVENING|DAWN|DUSK|SUNRISE|SUNSET|NOON|MIDNIGHT|TWILIGHT)$|^(?:GOLDEN|BLUE|MAGIC) HOUR$|^(?:MOMENTS |A FEW MINUTES |SOME TIME )?LATER$|^CONTINUOUS$|^SAME (?:TIME|NIGHT|DAY)$|^(?:NEXT|THE NEXT) (?:DAY|MORNING|NIGHT)$|^NIGHTFALL$|^DAYBREAK$/i;

export const isTimeOfDay = (segment: string): boolean => {
  const upper = segment.trim().toUpperCase();
  return TIME_SET.has(upper) || TIME_WORD.test(upper);
};

export const splitSceneHeading = (text: string): SceneHeadingParts => {
  let rest = text.replace(/\s+/g, ' ').trim();
  let prefix = '';
  for (const [pattern, canonical] of PREFIX_PATTERNS) {
    const match = rest.match(pattern);
    if (match) {
      prefix = canonical;
      rest = rest.slice(match[0].length).trim();
      break;
    }
  }
  const segments = rest.split(SEPARATOR);
  let time = '';
  if (segments.length > 1 && isTimeOfDay(segments[segments.length - 1])) {
    time = segments.pop()!.trim().toUpperCase();
  }
  return { prefix, body: segments.join(' - ').trim(), time };
};

export const composeSceneHeading = (parts: SceneHeadingParts): string => {
  const head = [parts.prefix, parts.body.trim()].filter(Boolean).join(' ');
  return parts.time ? `${head} - ${parts.time}` : head;
};

/**
 * What the location field typed means for the whole heading: a prefix or time
 * typed into it ("EXT. STREET - DAY" pasted whole) is taken up by the pickers
 * instead of being doubled.
 *
 * While typing (`complete` false) a prefix only counts once a space follows
 * it, and a time is left alone — otherwise "EXT" would be snatched from
 * "EXTRA'S ROOM" and "DAY" from "DAY ROOM" before the word is finished. On
 * leaving the field or pasting (`complete` true) both are read.
 *
 * Returns the new heading, the location text left for the field, and the
 * prefix and time it settled on.
 */
export const headingFromBodyInput = (
  current: SceneHeadingParts,
  typed: string,
  options: { complete?: boolean } = {},
): SceneHeadingParts & { text: string } => {
  let body = typed.replace(/^\s+/, '');
  let prefix = current.prefix;
  for (const [pattern, canonical] of PREFIX_PATTERNS) {
    const match = body.match(pattern);
    if (!match) continue;
    const after = body.slice(match[0].length);
    if (options.complete || /^\s/.test(after)) {
      prefix = canonical;
      body = after.replace(/^\s+/, '');
    }
    break;
  }
  let time = current.time;
  if (options.complete) {
    const segments = body.split(SEPARATOR);
    if (segments.length > 1 && isTimeOfDay(segments[segments.length - 1])) {
      time = segments.pop()!.trim().toUpperCase();
      body = segments.join(' - ');
    }
  }
  return { text: composeSceneHeading({ prefix, body: body.trim(), time }), prefix, body, time };
};

/** Replace the location (first segment of the body), keeping sub-locations. */
export const withHeadingLocation = (text: string, location: string): string => {
  const parts = splitSceneHeading(text);
  const [, ...sub] = parts.body ? parts.body.split(SEPARATOR) : [];
  return composeSceneHeading({ ...parts, body: [location.trim().toUpperCase(), ...sub].filter(Boolean).join(' - ') });
};

/** Times used in this screenplay that are not presets ("LATE AFTERNOON"), for the picker. */
export const customTimesIn = (headings: readonly string[]): string[] => {
  const extra = new Set<string>();
  for (const heading of headings) {
    const { time } = splitSceneHeading(heading);
    if (time && !TIME_SET.has(time)) extra.add(time);
  }
  return [...extra].sort();
};

// --- Character cue extensions -----------------------------------------------

const EXTENSION_RE = /\s*\(([^()]*)\)\s*$/;

/** "ALEX (V.O.) (CONT'D)" -> name "ALEX", extensions ["V.O.", "CONT'D"]. */
export const splitCue = (cue: string): { name: string; extensions: string[] } => {
  let rest = cue.trim();
  const extensions: string[] = [];
  for (let match = rest.match(EXTENSION_RE); match; match = rest.match(EXTENSION_RE)) {
    extensions.unshift(match[1].trim().toUpperCase());
    rest = rest.slice(0, match.index).trim();
  }
  return { name: rest, extensions };
};

/** Add the extension, or take it off when it is already there. */
export const toggleCueExtension = (cue: string, extension: string): string => {
  const { name, extensions } = splitCue(cue);
  const upper = extension.toUpperCase();
  const next = extensions.includes(upper) ? extensions.filter((entry) => entry !== upper) : [...extensions, upper];
  return [name, ...next.map((entry) => `(${entry})`)].filter(Boolean).join(' ');
};

// --- Keyboard suggestions -----------------------------------------------------

/**
 * Presets that fit what has been typed: all of them for an empty line,
 * otherwise those containing the text — never the one already typed in full.
 */
export const matchingPresets = (presets: readonly string[], typed: string): string[] => {
  const query = typed.trim().toLowerCase();
  if (!query) return [...presets];
  return presets.filter((preset) => preset.toLowerCase().includes(query) && preset.toLowerCase() !== query);
};

/** The extension being typed at the end of a cue ("ALEX (v" -> "v"), or null. */
export const cueExtensionQuery = (cue: string): string | null => {
  const match = cue.match(/\(([^()]*)$/);
  return match ? match[1] : null;
};

/** Finish the extension being typed: "ALEX (v" + "V.O." -> "ALEX (V.O.)". */
export const completeCueExtension = (cue: string, extension: string): string =>
  `${cue.replace(/\s*\([^()]*$/, '')} (${extension})`;

/**
 * The time being typed at the end of the set field ("LIVING ROOM - DU" ->
 * "DU"; "LIVING ROOM - " -> ""), or null when no separator has been typed.
 */
export const typedTimeQuery = (body: string): string | null => {
  const match = body.match(/\s[–—-]\s*([^–—-]*)$/);
  return match ? match[1].trimStart() : null;
};

/** The set field with the typed time segment taken off. */
export const withoutTypedTime = (body: string): string => body.replace(/\s[–—-]\s*[^–—-]*$/, '');

/** Step through a list of values, wrapping, from the current one. */
export const cycleValue = <T,>(values: readonly T[], current: T, step: 1 | -1): T => {
  const index = values.indexOf(current);
  return values[(index + step + values.length) % values.length];
};
