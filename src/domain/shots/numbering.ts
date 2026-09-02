/**
 * Shot numbering, and what happens when a shot nobody planned gets shot.
 *
 * A shot number reaches a slate, a continuity log and a DaVinci Resolve
 * metadata import. Once it has, it is a production number in exactly the sense
 * `domain/script/numbering.ts` means it for locked scenes: renumbering it
 * silently invalidates paperwork that has already left the building. So an
 * unplanned shot never renumbers the shots around it — it takes a number of
 * its own between them.
 *
 * ## Two conventions, both real
 *
 * This app writes shot numbers as `scene/index` — `1/1`, `1/2`, `1/3` — which
 * is what `addShot` and the Renumber action produce and what every existing
 * project therefore contains. Plenty of productions instead letter their
 * setups within a scene: `1A`, `1B`, `1C`. Both are in use, so both are
 * supported, and the rule is to FOLLOW WHAT THE SCENE ALREADY USES rather than
 * to impose one. An insert that reads `1A` in a scene numbered `1/1, 1/2` is
 * wrong in the only way that matters — it is ambiguous on a slate.
 *
 * The letter algebra underneath is the scene module's, imported rather than
 * copied. What differs between the two conventions is only where the letters
 * attach and what "append at the end" means:
 *
 *  - `scene/index`: the index is a number, so appending counts on — after
 *    `1/3` comes `1/4`. Squeezing between `1/1` and `1/2` letters the index:
 *    `1/1A`, then `1/1B`, then `1/1AA` between those two.
 *  - `sceneLetter`: the letters are the shot, so appending takes the next free
 *    letter — after `1F` comes `1G`, never `2`, which is another scene.
 *
 * Provenance is deliberately NOT encoded in either. Whether a shot was planned
 * or picked up on the day lives in `Shot.unplanned`, because a number that
 * encoded its own history would have to change if the shot were later added to
 * the plan, and because the `Shot` column exported to Resolve has to read
 * exactly what was on the slate.
 *
 * Pure functions over strings — no React, no I/O.
 */

import { nextSuffix, parseSceneNumber, squeezeLetters } from '../script/numbering';

export interface ParsedShotNumber {
  /** The scene part of a `scene/index` number; absent for `1A` forms. */
  scene?: string;
  prefix: string;
  base: number;
  suffix: string;
}

/**
 * Parse either convention: `1/2`, `1/2A`, `2A`, `A1`, `12`.
 *
 * Returns null for anything else — a number nobody can parse is one nobody
 * should try to increment either.
 */
export const parseShotNumber = (value: string | undefined): ParsedShotNumber | null => {
  const text = (value ?? '').trim().toUpperCase();
  if (!text) return null;
  const slash = text.lastIndexOf('/');
  if (slash === -1) {
    const parsed = parseSceneNumber(text);
    return parsed ? { ...parsed } : null;
  }
  const scene = text.slice(0, slash).trim();
  const parsed = parseSceneNumber(text.slice(slash + 1));
  if (!scene || !parsed) return null;
  return { scene, ...parsed };
};

const render = (parsed: ParsedShotNumber): string =>
  `${parsed.scene ? `${parsed.scene}/` : ''}${parsed.prefix}${parsed.base}${parsed.suffix}`;

/** Every shot number already in use in a scene, upper-cased for comparison. */
export const takenShotNumbers = (shots: readonly { shotNumber?: string }[]): Set<string> =>
  new Set(
    shots
      .map((shot) => (shot.shotNumber ?? '').trim().toUpperCase())
      .filter((value) => value.length > 0),
  );

/**
 * The number for a shot inserted between `previous` and `next`, avoiding
 * anything in `taken` (compared case-insensitively, as the scene module does).
 *
 * `previous`/`next` are the neighbours in shot order; either may be absent at
 * the ends of the list. `sceneNumber` supplies the scene when there is no
 * previous shot to take it from — a scene whose very first shot is an
 * unplanned insert still needs to be called something.
 */
export const insertedShotNumber = (
  previous: string | undefined,
  next: string | undefined,
  taken: ReadonlySet<string>,
  sceneNumber?: string,
): string => {
  const free = (candidate: string): boolean => !taken.has(candidate.toUpperCase());
  const prev = parseShotNumber(previous);
  const after = parseShotNumber(next);

  if (!prev) {
    // Nothing to follow. Adopt the convention of the shot ahead when there is
    // one; otherwise open the scene in this app's own `scene/index` form.
    if (after) {
      let prefix = 'A';
      while (!free(render({ ...after, prefix }))) prefix = nextSuffix(prefix);
      return render({ ...after, prefix });
    }
    const scene = (sceneNumber ?? '1').trim() || '1';
    let index = 1;
    while (!free(`${scene}/${index}`)) index += 1;
    return `${scene}/${index}`;
  }

  // Only a neighbour in the same slot bounds the letter run. A next shot in a
  // different scene — or a different index — constrains nothing here.
  const sameSlot =
    !!after &&
    after.scene === prev.scene &&
    after.base === prev.base &&
    after.prefix === prev.prefix;

  // At the end of the scene: how to count on depends on the convention.
  const endOfScene = !after || after.scene !== prev.scene;
  if (endOfScene) {
    if (prev.scene !== undefined && prev.suffix === '') {
      // `scene/index`: the index is a number, so count it on — 1/3 → 1/4.
      let index = prev.base + 1;
      while (!free(`${prev.scene}/${index}`)) index += 1;
      return `${prev.scene}/${index}`;
    }
    // Lettered setups (or a squeezed `1/1A`): take the next free letter, never
    // the next number — `2` would be another scene's shot.
    const suffix = squeezeLetters(prev.suffix, null, (value) =>
      free(render({ ...prev, suffix: value })),
    );
    if (suffix !== null) return render({ ...prev, suffix });
  }

  // Between two shots in the same scene: letter the previous one. 1/1 and 1/2
  // gives 1/1A; 1A and 1B gives 1AA, which sorts between them.
  const suffix = squeezeLetters(prev.suffix, sameSlot ? after.suffix : null, (value) =>
    free(render({ ...prev, suffix: value })),
  );
  if (suffix !== null) return render({ ...prev, suffix });

  // No suffix fits — the case `1/1` then `1/1A`, where every suffix of the
  // former sorts at or above "A". Insert immediately ahead of `next` instead,
  // the way the scene module does. The number is unique and sorts after
  // `previous`, but it will not sit between the two in a report ordered by
  // number; at that point the honest answer is that the scene wants
  // renumbering, which is a production decision, not something to fake here
  // with a number that does not order.
  const target = after ?? prev;
  let prefix = 'A';
  while (!free(render({ ...target, prefix }))) prefix = nextSuffix(prefix);
  return render({ ...target, prefix });
};

/**
 * The number to give a shot appended to the end of `shots` — the ordinary case
 * when an unplanned shot is logged on the day. Convenience over `insertedShotNumber` so
 * callers do not have to find the last shot themselves.
 */
export const nextShotNumberAfter = (
  shots: readonly { shotNumber?: string }[],
  sceneNumber?: string,
): string =>
  insertedShotNumber(
    shots.length > 0 ? shots[shots.length - 1].shotNumber : undefined,
    undefined,
    takenShotNumbers(shots),
    sceneNumber,
  );
