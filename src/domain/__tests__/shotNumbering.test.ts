/**
 * Shot numbering for shots nobody planned.
 *
 * The rule under test is that pre-existing numbers never move: a pickup logged
 * on the day takes a number of its own between the shots around it, because a
 * shot number that has reached a slate, a continuity log and a Resolve import
 * cannot be renumbered without silently invalidating all three.
 *
 * Both conventions in use are covered. This app writes `scene/index` (`1/1`,
 * `1/2`) — what `addShot` and Renumber produce, and what every existing project
 * contains — while plenty of productions letter setups within a scene (`1A`,
 * `1B`). A pickup has to follow whatever the scene already uses; a number in
 * the other convention is ambiguous on a slate.
 */

import { describe, expect, it } from 'vitest';

import {
  insertedShotNumber,
  nextShotNumberAfter,
  takenShotNumbers,
} from '../shots/numbering';

const taken = (...values: string[]): Set<string> => new Set(values.map((v) => v.toUpperCase()));

describe('insertedShotNumber', () => {
  it('takes the next free letter after the last planned shot', () => {
    // 1A–1F planned, so the pickup is 1G — not 2, which is another scene.
    expect(insertedShotNumber('1F', undefined, taken('1A', '1B', '1C', '1D', '1E', '1F'))).toBe('1G');
  });

  it('squeezes between two neighbours without moving either', () => {
    expect(insertedShotNumber('1A', '1B', taken('1A', '1B'))).toBe('1AA');
  });

  it('falls back to a prefix when the letter run has no room left', () => {
    // Between 1A and 1AA there is no suffix by construction — 1AA is already
    // the squeeze of 1A. The scene module inherits the same limit and
    // documents it: the number returned is unique and sorts after `previous`,
    // but it will not sit between the two in a report ordered by number. The
    // honest answer at that point is that the scene wants renumbering, which
    // is a production decision, not something to fake with a number that does
    // not order.
    const result = insertedShotNumber('1A', '1AA', taken('1A', '1AA', '1B'));
    expect(taken('1A', '1AA', '1B').has(result.toUpperCase())).toBe(false);
    expect(result).toBe('A1AA');
  });

  it('sorts squeezed numbers between their neighbours', () => {
    const squeezed = insertedShotNumber('1A', '1B', taken('1A', '1B'));
    expect('1A' < squeezed).toBe(true);
    expect(squeezed < '1B').toBe(true);
  });

  it('opens an empty scene in this app’s own scene/index form', () => {
    expect(insertedShotNumber(undefined, undefined, taken(), '4')).toBe('4/1');
    expect(insertedShotNumber(undefined, undefined, taken('4/1'), '4')).toBe('4/2');
  });

  it('goes ahead of the first shot with a prefix, the script convention', () => {
    expect(insertedShotNumber(undefined, '1A', taken('1A'))).toBe('A1A');
    expect(insertedShotNumber(undefined, '1/1', taken('1/1'))).toBe('1/A1');
  });

  it('does not let another scene bound the letter run', () => {
    // Next is 2A — a different scene, so it constrains nothing here.
    expect(insertedShotNumber('1C', '2A', taken('1C', '2A'))).toBe('1D');
  });

  it('never returns a number already taken', () => {
    const existing = taken('1A', '1B', '1AA');
    const result = insertedShotNumber('1A', '1B', existing);
    expect(existing.has(result.toUpperCase())).toBe(false);
  });

  it('leaves provenance out of the number entirely', () => {
    // No slash, no marker: the Shot column exported to Resolve has to read
    // exactly what was on the slate.
    // The slash here is scene/shot notation, not a provenance marker: nothing
    // in the number says the shot was unplanned. That lives on `Shot.unplanned`.
    expect(insertedShotNumber('1F', undefined, taken('1F'))).toBe('1G');
    expect(insertedShotNumber('1/3', undefined, taken('1/3'))).toBe('1/4');
  });
});

describe('insertedShotNumber · scene/index convention', () => {
  it('counts the index on at the end of the scene', () => {
    // The app writes 1/1, 1/2, 1/3 — so the pickup after them is 1/4.
    expect(insertedShotNumber('1/3', undefined, taken('1/1', '1/2', '1/3'))).toBe('1/4');
  });

  it('letters the index to squeeze between two planned shots', () => {
    // This is the notation the app already uses for scene/shot, with the
    // insert convention borrowed from locked scene numbers.
    expect(insertedShotNumber('1/1', '1/2', taken('1/1', '1/2'))).toBe('1/1A');
    expect(insertedShotNumber('1/1A', '1/2', taken('1/1', '1/1A', '1/2'))).toBe('1/1B');
  });

  it('sorts a squeezed number between its neighbours', () => {
    const squeezed = insertedShotNumber('1/1', '1/2', taken('1/1', '1/2'));
    expect('1/1' < squeezed).toBe(true);
    expect(squeezed < '1/2').toBe(true);
  });

  it('does not let the next scene bound the index run', () => {
    expect(insertedShotNumber('1/3', '2/1', taken('1/3', '2/1'))).toBe('1/4');
  });

  it('counts on by letter once the index is already lettered', () => {
    // 1/1A is not an index that can be incremented — 1/2 may well exist — so
    // the letter run continues instead.
    expect(insertedShotNumber('1/1A', undefined, taken('1/1', '1/1A', '1/2'))).toBe('1/1B');
  });

  it('never returns a number already taken', () => {
    const existing = taken('1/1', '1/2', '1/1A');
    const result = insertedShotNumber('1/1', '1/2', existing);
    expect(existing.has(result.toUpperCase())).toBe(false);
  });

  it('follows the convention the scene already uses', () => {
    // Lettered scene stays lettered; slashed scene stays slashed. A pickup in
    // the other notation is ambiguous on a slate.
    expect(nextShotNumberAfter([{ shotNumber: '1A' }, { shotNumber: '1B' }], '1')).toBe('1C');
    expect(nextShotNumberAfter([{ shotNumber: '1/1' }, { shotNumber: '1/2' }], '1')).toBe('1/3');
  });
});

describe('nextShotNumberAfter', () => {
  it('appends to a scene list', () => {
    const shots = [{ shotNumber: '3A' }, { shotNumber: '3B' }];
    expect(nextShotNumberAfter(shots, '3')).toBe('3C');
  });

  it('numbers the first shot of an empty scene from the scene number', () => {
    expect(nextShotNumberAfter([], '7')).toBe('7/1');
  });

  it('ignores blank numbers when collecting what is taken', () => {
    expect(takenShotNumbers([{ shotNumber: '1A' }, { shotNumber: '  ' }, {}]).size).toBe(1);
  });
});
