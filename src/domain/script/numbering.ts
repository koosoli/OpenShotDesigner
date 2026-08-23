/**
 * Scene numbering (plan §12).
 *
 * Two regimes, and a production moves from the first to the second exactly
 * once, when the script is "locked" for scheduling:
 *
 *  - AUTO: headings are numbered by position, 1..n, recomputed on every edit.
 *    Insert a scene in the middle and everything after it shifts. Fine while
 *    the script is still being written, because nothing refers to the numbers
 *    yet.
 *  - LOCKED: every heading carries an explicit production number that never
 *    changes. A scene inserted between 3 and 4 becomes 3A, the next one 3B; a
 *    scene cut stays in place as OMITTED (see `omission.ts`); a scene removed
 *    for good leaves a gap. Breakdowns, the stripboard, call sheets and every
 *    department's paperwork refer to scenes by number, so a renumber at this
 *    stage would silently invalidate all of it.
 *
 * Omitted headings count in both regimes: an OMITTED slugline is still a line
 * in the script and still owns its number.
 *
 * Pure functions over the minimal line shape — no React, no I/O.
 */

export interface NumberableLine {
  id: string;
  type?: string;
  sceneNumber?: string;
  omitted?: boolean;
}

const isHeading = (line: NumberableLine): boolean => line.type === 'scene';

/** "12A" → base 12, suffix "A"; "12" → base 12; "A1" → base 1, prefix "A". */
export const parseSceneNumber = (
  value: string | undefined,
): { base: number; suffix: string; prefix: string } | null => {
  const text = (value ?? '').trim().toUpperCase();
  const match = /^([A-Z]*)(\d+)([A-Z]*)$/.exec(text);
  if (!match) return null;
  return { prefix: match[1], base: Number(match[2]), suffix: match[3] };
};

const nextSuffix = (suffix: string): string => {
  // "" → A, A → B … Z → ZA. Double letters are the convention for a scene
  // squeezed between 3A and 3B (3AA), and they sort between them.
  if (!suffix) return 'A';
  const last = suffix[suffix.length - 1];
  if (last === 'Z') return `${suffix}A`;
  return suffix.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
};

/**
 * The number for a heading inserted between `previous` and `next`, avoiding
 * anything in `taken`. After the last scene the number simply counts on;
 * before the first it takes an A-prefix ("A1"), the script convention for a
 * scene added ahead of scene 1.
 */
export const insertedSceneNumber = (
  previous: string | undefined,
  next: string | undefined,
  taken: ReadonlySet<string>,
): string => {
  const free = (candidate: string): boolean => !taken.has(candidate.toUpperCase());
  const prev = parseSceneNumber(previous);
  if (!prev) {
    const after = parseSceneNumber(next);
    if (!after) {
      // A script with no usable numbers at all: start at 1 and climb past anything taken.
      let n = 1;
      while (!free(String(n))) n += 1;
      return String(n);
    }
    let prefix = 'A';
    while (!free(`${prefix}${after.base}`)) prefix = nextSuffix(prefix);
    return `${prefix}${after.base}`;
  }
  const after = parseSceneNumber(next);
  if (!after) {
    // At the end: count on from the highest base anywhere in the script.
    let n = prev.base + 1;
    for (const value of taken) {
      const parsed = parseSceneNumber(value);
      if (parsed && parsed.base >= n) n = parsed.base + 1;
    }
    return String(n);
  }
  // Suffixes order as plain strings: A < AA < AB < B, which is exactly the
  // script convention (3AA sits between 3A and 3B). When the next heading
  // shares the base, the new suffix must also sort before its suffix.
  const sameBase = after.base === prev.base && after.prefix === prev.prefix;
  const valid = (suffix: string): boolean =>
    free(`${prev.prefix}${prev.base}${suffix}`) && (!sameBase || suffix < after.suffix);
  let suffix = nextSuffix(prev.suffix);
  if (!valid(suffix)) {
    // Squeeze in by extending the previous suffix: 3A → 3AA, 3AB, …
    suffix = `${prev.suffix}A`;
    while (!valid(suffix)) suffix = nextSuffix(suffix);
  }
  return `${prev.prefix}${prev.base}${suffix}`;
};

/** Copy each heading's number onto the body lines beneath it. */
export const propagateSceneNumbers = <T extends NumberableLine>(lines: readonly T[]): T[] => {
  let current: string | undefined;
  return lines.map((line) => {
    if (isHeading(line)) {
      current = line.sceneNumber;
      return line;
    }
    if (line.sceneNumber === current) return line;
    const next = { ...line };
    if (current === undefined) delete next.sceneNumber;
    else next.sceneNumber = current;
    return next;
  });
};

/** AUTO regime: every heading numbered by position, then propagated. */
export const renumberScenes = <T extends NumberableLine>(lines: readonly T[]): T[] => {
  let ordinal = 0;
  return propagateSceneNumbers(
    lines.map((line) => {
      if (!isHeading(line)) return line;
      ordinal += 1;
      const number = String(ordinal);
      return line.sceneNumber === number ? line : { ...line, sceneNumber: number };
    }),
  );
};

/**
 * LOCKED regime: keep every explicit number; give a heading that has none —
 * or one that repeats an earlier heading's number, which an insert-by-copy
 * produces — a number between its neighbours.
 */
export const assignMissingSceneNumbers = <T extends NumberableLine>(lines: readonly T[]): T[] => {
  const headings = lines.map((line, index) => ({ line, index })).filter(({ line }) => isHeading(line));
  const taken = new Set<string>();
  const assigned = new Map<number, string>();
  // First pass: claim every explicit number in script order, so a duplicate
  // later in the script is the one that gets renamed, not the original.
  for (const { line, index } of headings) {
    const number = line.sceneNumber?.trim().toUpperCase();
    if (number && !taken.has(number)) {
      taken.add(number);
      assigned.set(index, (line.sceneNumber as string).trim());
    }
  }
  for (let h = 0; h < headings.length; h += 1) {
    const { index } = headings[h];
    if (assigned.has(index)) continue;
    const previous = h > 0 ? assigned.get(headings[h - 1].index) : undefined;
    // The next heading that already has a settled number.
    let next: string | undefined;
    for (let k = h + 1; k < headings.length; k += 1) {
      const candidate = assigned.get(headings[k].index);
      if (candidate) {
        next = candidate;
        break;
      }
    }
    const number = insertedSceneNumber(previous, next, taken);
    taken.add(number.toUpperCase());
    assigned.set(index, number);
  }
  return propagateSceneNumbers(
    lines.map((line, index) => {
      if (!isHeading(line)) return line;
      const number = assigned.get(index);
      return line.sceneNumber === number ? line : { ...line, sceneNumber: number };
    }),
  );
};

/** The regime's normalisation, applied to every edit. */
export const normaliseSceneNumbers = <T extends NumberableLine>(lines: readonly T[], locked: boolean): T[] =>
  locked ? assignMissingSceneNumbers(lines) : renumberScenes(lines);

/**
 * True when the headings carry numbers worth keeping: any that is not simply
 * its own ordinal. An imported production script with "12A" in it is locked
 * on arrival rather than quietly renumbered on the first keystroke.
 */
export const hasProductionSceneNumbers = (lines: readonly NumberableLine[]): boolean => {
  let ordinal = 0;
  for (const line of lines) {
    if (!isHeading(line)) continue;
    ordinal += 1;
    const number = line.sceneNumber?.trim();
    if (number && number !== String(ordinal)) return true;
  }
  return false;
};
