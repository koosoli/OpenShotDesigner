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
 * The first letter run at or after `previous` that is free and still sorts
 * below `limit` (null = unbounded), or null when no such run exists.
 *
 * Two stages, because the obvious increment usually works and the fallback is
 * the interesting case: `3A` next to `3B` cannot take `3B`, so it extends into
 * `3AA`, which sorts between them. Termination is guaranteed in both
 * directions — `nextSuffix` is strictly increasing, so the search either
 * passes `limit` and stops, or runs out of `taken`, which is finite.
 */
const squeezeLetters = (
  previous: string,
  limit: string | null,
  free: (letters: string) => boolean,
): string | null => {
  const ordered = (value: string): boolean => limit === null || value < limit;
  const simple = nextSuffix(previous);
  if (ordered(simple) && free(simple)) return simple;
  let extended = `${previous}A`;
  while (ordered(extended)) {
    if (free(extended)) return extended;
    extended = nextSuffix(extended);
  }
  return null;
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
  // A number has two letter runs and they mean opposite things. A SUFFIX means
  // "inserted after": 3, 3A, 3AA, 3B. A PREFIX means "inserted before": A1 is
  // the scene added ahead of 1, and A3A the one added ahead of 3A. Both run in
  // plain string order (A < AA < AB < B), which is exactly the script
  // convention, and `compareSceneNumbers` in the reports orders by the same
  // rules.

  // Prefixes first: when the two neighbours describe the SAME slot and differ
  // only in prefix, the insert belongs in the prefix run. Between A1 and 1 the
  // answer is B1 — reaching for a suffix here produced A1A, which sorts after
  // 1 and printed the scene in the wrong place in the breakdown.
  if (after.base === prev.base && after.suffix === prev.suffix && prev.prefix !== after.prefix) {
    // An unprefixed neighbour is the slot itself, so there is no upper bound
    // to stay below — every prefixed number sorts before it.
    const limit = after.prefix === '' ? null : after.prefix;
    const prefix = squeezeLetters(prev.prefix, limit, (value) =>
      free(`${value}${prev.base}${prev.suffix}`),
    );
    if (prefix !== null) return `${prefix}${prev.base}${prev.suffix}`;
  }

  // Otherwise walk the suffix run. Only a neighbour in the same slot bounds it.
  const sameSlot = after.base === prev.base && after.prefix === prev.prefix;
  const suffix = squeezeLetters(prev.suffix, sameSlot ? after.suffix : null, (value) =>
    free(`${prev.prefix}${prev.base}${value}`),
  );
  if (suffix !== null) return `${prev.prefix}${prev.base}${suffix}`;

  // No suffix fits. Between 3 and 3A there is none by construction: every
  // suffix of 3 sorts at or above "A". So use the other run and insert
  // immediately BEFORE the next heading instead: 3, A3A, 3A.
  //
  // This is also where the scheme runs out. Asked to insert between 3 and an
  // already-squeezed A3A there is no number at all: the suffix run has no room
  // between "" and "A", and anything prefixed sorts ahead of 3 rather than
  // after it. The number returned is still unique and still sorts after
  // `previous`, but it will sit after `next` in a report ordered by number.
  // Once a script carries prefixed numbers this is not exotic — every later
  // insert placed immediately ahead of one lands here — so it is documented
  // and tested rather than hidden. The honest answer at that point is that the
  // script wants renumbering, which is a decision for the production office,
  // not something to fake here by inventing a number that does not order
  // (plan rule 13).
  const nextNumber = `${after.prefix}${after.base}${after.suffix}`;
  let prefix = 'A';
  while (!free(`${prefix}${nextNumber}`)) prefix = nextSuffix(prefix);
  return `${prefix}${nextNumber}`;
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
