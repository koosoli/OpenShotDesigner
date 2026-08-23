import { describe, expect, it } from 'vitest';
import {
  assignMissingSceneNumbers,
  hasProductionSceneNumbers,
  insertedSceneNumber,
  normaliseSceneNumbers,
  parseSceneNumber,
  propagateSceneNumbers,
  renumberScenes,
} from '../script';
import { compareSceneNumbers } from '../reports/breakdown';

const h = (id: string, sceneNumber?: string, omitted?: boolean) => ({
  id,
  type: 'scene',
  ...(sceneNumber ? { sceneNumber } : {}),
  ...(omitted ? { omitted } : {}),
});
const a = (id: string, sceneNumber?: string) => ({ id, type: 'action', ...(sceneNumber ? { sceneNumber } : {}) });
const numbers = (lines: Array<{ type?: string; sceneNumber?: string }>) =>
  lines.filter((l) => l.type === 'scene').map((l) => l.sceneNumber);

describe('parseSceneNumber', () => {
  it('reads plain, suffixed and prefixed numbers', () => {
    expect(parseSceneNumber('12')).toEqual({ prefix: '', base: 12, suffix: '' });
    expect(parseSceneNumber('12a')).toEqual({ prefix: '', base: 12, suffix: 'A' });
    expect(parseSceneNumber('A1')).toEqual({ prefix: 'A', base: 1, suffix: '' });
    expect(parseSceneNumber('')).toBeNull();
    expect(parseSceneNumber('twelve')).toBeNull();
  });
});

describe('insertedSceneNumber (locked regime)', () => {
  it('a scene between 3 and 4 is 3A, the next 3B', () => {
    expect(insertedSceneNumber('3', '4', new Set(['3', '4']))).toBe('3A');
    expect(insertedSceneNumber('3A', '4', new Set(['3', '3A', '4']))).toBe('3B');
  });
  it('a scene squeezed between 3A and 3B is 3AA', () => {
    expect(insertedSceneNumber('3A', '3B', new Set(['3A', '3B']))).toBe('3AA');
  });
  it('skips a suffix that is already taken', () => {
    expect(insertedSceneNumber('3', '4', new Set(['3', '3A', '3B', '4']))).toBe('3C');
  });
  it('counts on past the highest number at the end', () => {
    expect(insertedSceneNumber('12', undefined, new Set(['12', '12A', '14']))).toBe('15');
  });
  it('takes an A-prefix ahead of scene 1', () => {
    expect(insertedSceneNumber(undefined, '1', new Set(['1']))).toBe('A1');
    expect(insertedSceneNumber(undefined, '1', new Set(['1', 'A1']))).toBe('B1');
  });
  it('starts at 1 in an empty script', () => {
    expect(insertedSceneNumber(undefined, undefined, new Set())).toBe('1');
  });
  it('prefixes the next number when no suffix fits between 3 and 3A', () => {
    // Every suffix of 3 sorts at or above "A", so there is nothing between
    // "3" and "3A" in suffix space. Used to spin forever.
    expect(insertedSceneNumber('3', '3A', new Set(['3', '3A', '4']))).toBe('A3A');
    expect(insertedSceneNumber('3', '3A', new Set(['3', '3A', 'A3A', '4']))).toBe('B3A');
  });
  it('terminates when the neighbours are out of order', () => {
    expect(insertedSceneNumber('3B', '3A', new Set(['3A', '3B']))).toBe('A3A');
  });
  /**
   * The real contract, not just "it returned something": an inserted number
   * has to be free, and it has to SORT between the two scenes it was inserted
   * between — `compareSceneNumbers` is what the breakdown report orders by, so
   * a number that does not is a scene that prints in the wrong place.
   */
  it('every neighbour pair in a locked script lands between its neighbours', () => {
    const pool = ['1', '2', '3', '3A', '3B', '3AA', 'A1', '12', '12A', 'Z9'];
    const taken = new Set(pool);
    const ordered = [...pool].sort(compareSceneNumbers);
    for (let i = 0; i < ordered.length; i += 1) {
      // Only genuinely adjacent pairs: a scene is inserted between neighbours,
      // and asking for one between 1 and 12 is not a question the caller asks.
      const previous = ordered[i];
      const next = ordered[i + 1];
      const result = insertedSceneNumber(previous, next, taken);
      expect(taken.has(result.toUpperCase())).toBe(false);
      expect(compareSceneNumbers(previous, result)).toBeLessThan(0);
      if (next !== undefined) {
        expect(compareSceneNumbers(result, next)).toBeLessThan(0);
      }
    }
  });

  /**
   * The invariant has to survive being used, not just used once: a locked
   * script accumulates inserts, and each one has to stay in its slot as later
   * ones land around it. Seeded so a failure is reproducible.
   */
  it('holds through a long run of inserts into a locked script', () => {
    let seed = 20260823;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    let scenes = ['1', '2', '3', '4', '5'];
    let exhaustedGaps = 0;
    const taken = new Set(scenes);
    for (let step = 0; step < 300; step += 1) {
      // Insert between a random adjacent pair, or before the first scene.
      const at = rnd(scenes.length);
      const previous = at === 0 ? undefined : scenes[at - 1];
      const next = scenes[at];
      const result = insertedSceneNumber(previous, next, taken);

      // Always: a fresh number that sorts after the scene it follows.
      expect(taken.has(result.toUpperCase())).toBe(false);
      if (previous !== undefined) expect(compareSceneNumbers(previous, result)).toBeLessThan(0);

      // And before the scene it precedes, except in the one case the scheme
      // cannot express — a gap already closed by a prefixed number, where no
      // number exists between the neighbours at all. Anything else failing
      // here is a real ordering bug, so the exception is pinned narrowly.
      if (next !== undefined && compareSceneNumbers(result, next) >= 0) {
        exhaustedGaps += 1;
        expect(parseSceneNumber(next)?.prefix).not.toBe('');
      }

      taken.add(result.toUpperCase());
      scenes = [...scenes.slice(0, at), result, ...scenes.slice(at)];
    }
    // Every number is distinct, and the run really did exercise the ordinary
    // path — most of these inserts placed cleanly between their neighbours,
    // so the loop is testing the ordering rule and not just the exception.
    expect(new Set(scenes).size).toBe(scenes.length);
    expect(300 - exhaustedGaps).toBeGreaterThan(150);
  });

  /**
   * The documented limit of the scheme, pinned so it cannot change silently.
   * Between 3 and A3A there is no number: the suffix run has no room between
   * "" and "A", and any prefix sorts ahead of 3. The result is still unique
   * and still follows 3; it just cannot also precede A3A.
   *
   * This is not exotic once a script has been squeezed: every later insert
   * immediately ahead of a prefixed number lands here too.
   */
  it('returns a unique number even where the scheme has no room left', () => {
    const taken = new Set(['3', 'A3A', '3A']);
    const result = insertedSceneNumber('3', 'A3A', taken);
    expect(taken.has(result)).toBe(false);
    expect(compareSceneNumbers('3', result)).toBeLessThan(0);
  });

  it('a scene added before the first one sorts before it', () => {
    const result = insertedSceneNumber(undefined, '1', new Set(['1']));
    expect(compareSceneNumbers(result, '1')).toBeLessThan(0);
  });
});

describe('renumberScenes (auto regime)', () => {
  it('numbers by position and carries the number onto body lines', () => {
    const lines = [h('s1', '7'), a('b1'), h('s2'), a('b2', 'stale'), h('s3', '2')];
    const out = renumberScenes(lines);
    expect(numbers(out)).toEqual(['1', '2', '3']);
    expect(out[1].sceneNumber).toBe('1');
    expect(out[3].sceneNumber).toBe('2');
  });
  it('an omitted heading keeps its slot, so nothing after it shifts', () => {
    expect(numbers(renumberScenes([h('s1'), h('s2', undefined, true), h('s3')]))).toEqual(['1', '2', '3']);
  });
  it('returns the same line objects when nothing changes', () => {
    const lines = [h('s1', '1'), a('b1', '1')];
    const out = renumberScenes(lines);
    expect(out[0]).toBe(lines[0]);
    expect(out[1]).toBe(lines[1]);
  });
});

describe('assignMissingSceneNumbers (locked regime)', () => {
  it('keeps explicit numbers and leaves a gap where a scene was removed', () => {
    expect(numbers(assignMissingSceneNumbers([h('s1', '1'), h('s3', '3'), h('s4', '4')]))).toEqual(['1', '3', '4']);
  });
  it('gives an inserted heading a letter between its neighbours', () => {
    const out = assignMissingSceneNumbers([h('s1', '1'), h('new'), h('s2', '2'), a('b')]);
    expect(numbers(out)).toEqual(['1', '1A', '2']);
    expect(out[3].sceneNumber).toBe('2');
  });
  it('renames the later of two headings that claim one number', () => {
    // Pasted or imported text can repeat a number; the first occurrence keeps
    // it. (The editor itself never inserts a numbered heading, so an Enter on
    // scene 3 arrives here unnumbered and becomes 3A.) A duplicate at the end counts on.
    expect(numbers(assignMissingSceneNumbers([h('s3', '3'), h('dup', '4'), h('s4', '4')]))).toEqual(['3', '4', '5']);
  });
  it('numbers two consecutive inserts 3A then 3B', () => {
    expect(numbers(assignMissingSceneNumbers([h('s3', '3'), h('x'), h('y'), h('s4', '4')]))).toEqual(['3', '3A', '3B', '4']);
  });
  it('appends at the end by counting on', () => {
    expect(numbers(assignMissingSceneNumbers([h('s1', '1'), h('s2', '2'), h('new')]))).toEqual(['1', '2', '3']);
  });
});

describe('normaliseSceneNumbers', () => {
  const lines = [h('s1', '1'), h('new'), h('s2', '2')];
  it('picks the regime', () => {
    expect(numbers(normaliseSceneNumbers(lines, false))).toEqual(['1', '2', '3']);
    expect(numbers(normaliseSceneNumbers(lines, true))).toEqual(['1', '1A', '2']);
  });
});

describe('propagateSceneNumbers', () => {
  it('clears a body number that precedes any heading', () => {
    const out = propagateSceneNumbers([a('b0', '9'), h('s1', '1'), a('b1')]);
    expect(out[0].sceneNumber).toBeUndefined();
    expect(out[2].sceneNumber).toBe('1');
  });
});

describe('hasProductionSceneNumbers', () => {
  it('is false for unnumbered or simply sequential scripts', () => {
    expect(hasProductionSceneNumbers([h('s1'), h('s2')])).toBe(false);
    expect(hasProductionSceneNumbers([h('s1', '1'), h('s2', '2')])).toBe(false);
  });
  it('is true when a number is not its own ordinal', () => {
    expect(hasProductionSceneNumbers([h('s1', '1'), h('s2', '1A'), h('s3', '2')])).toBe(true);
    expect(hasProductionSceneNumbers([h('s1', '1'), h('s2', '3')])).toBe(true);
  });
});

/**
 * A scene added straight after an omitted one. The omitted heading is still a
 * heading and still owns its number, so the newcomer is lettered off it rather
 * than taking it or shifting everything below.
 */
describe('inserting after an omitted scene', () => {
  it('letters the new scene off the omitted number and leaves the rest alone', () => {
    const lines = [h('s1', '1'), h('s2', '2', true), h('new'), h('s3', '3')];
    expect(numbers(assignMissingSceneNumbers(lines))).toEqual(['1', '2', '2A', '3']);
  });

  it('numbers on past the omitted scene when it is the last one', () => {
    expect(numbers(assignMissingSceneNumbers([h('s1', '1'), h('s2', '2', true), h('new')]))).toEqual(['1', '2', '3']);
  });

  it('an omitted scene still takes a slot when numbering by position', () => {
    expect(numbers(renumberScenes([h('s1'), h('s2', undefined, true), h('new')]))).toEqual(['1', '2', '3']);
  });
});
