/**
 * Letters must be unique on a setup, for cameras and for actors.
 *
 * A camera's letter reaches the shot list, the call sheet, the slate and the
 * `Camera #` column of the Resolve metadata export, so two cameras sharing one
 * is not cosmetic — it makes two setups claim to be the same camera, and the
 * metadata import cannot tell them apart afterwards. An actor's letter is what
 * the floor plan uses to say which marker is which person, so a duplicate there
 * defeats the plan's whole purpose.
 *
 * Both were computed by counting, which is correct only while nothing is ever
 * deleted.
 */
import { describe, expect, it } from 'vitest';
import { nextActorLetter, nextCameraLabel, usedCameraLabels } from '../plan/cameraLabels';

const cams = (...labels: (string | undefined)[]) => labels.map((cameraLabel) => ({ cameraLabel }));

describe('nextCameraLabel', () => {
  it('starts user-created cameras at B, leaving A as the shared default', () => {
    expect(nextCameraLabel(cams('A'))).toBe('B');
    expect(nextCameraLabel([])).toBe('B');
  });

  it('counts an unlabelled camera as A', () => {
    expect(nextCameraLabel(cams(undefined))).toBe('B');
    expect(nextCameraLabel(cams(undefined, 'B'))).toBe('C');
  });

  /**
   * The regression this exists for: counting cameras instead of reading which
   * letters are taken. With A and C on the plan (B struck), a count of 2
   * proposed "C" — a duplicate.
   */
  it('fills the gap left by a deleted camera instead of duplicating', () => {
    expect(nextCameraLabel(cams('A', 'C'))).toBe('B');
    expect(nextCameraLabel(cams('A', 'B', 'D'))).toBe('C');
  });

  it('never returns a letter already in use', () => {
    for (const existing of [cams('A'), cams('A', 'B'), cams('A', 'C', 'D'), cams('B', 'C')]) {
      const used = usedCameraLabels(existing);
      expect(used.has(nextCameraLabel(existing))).toBe(false);
    }
  });

  it('ignores case when deciding what is taken', () => {
    expect(nextCameraLabel(cams('a', 'b'))).toBe('C');
  });

  it('walks the alphabet and wraps only once it is exhausted', () => {
    const all = Array.from({ length: 26 }, (_, i) => ({
      cameraLabel: String.fromCharCode(65 + i),
    }));
    // 26 cameras on one setup: the scheme has run out, and a duplicate is a
    // more honest answer than an empty label.
    expect(nextCameraLabel(all)).toBe('A');

    const missingZ = all.filter((camera) => camera.cameraLabel !== 'Z');
    expect(nextCameraLabel(missingZ)).toBe('Z');
  });
});

describe('nextActorLetter', () => {
  const actors = (...letters: (string | undefined)[]) =>
    letters.map((characterLetter) => ({ characterLetter }));

  /** No shared default actor the way Camera A is the default camera. */
  it('starts at A', () => {
    expect(nextActorLetter([])).toBe('A');
    expect(nextActorLetter(actors('A'))).toBe('B');
  });

  it('fills the gap left by a deleted actor instead of duplicating', () => {
    expect(nextActorLetter(actors('A', 'C'))).toBe('B');
  });

  /**
   * Actors can be named rather than lettered — "JOHN" is a valid character
   * letter per the type. A name occupies no single letter, so it must not
   * block one or be mistaken for one.
   */
  it('ignores named actors and blanks when choosing a letter', () => {
    expect(nextActorLetter(actors('JOHN', 'A'))).toBe('B');
    expect(nextActorLetter(actors(undefined, ''))).toBe('A');
  });

  it('never returns a letter already in use', () => {
    for (const existing of [actors('A'), actors('A', 'B'), actors('B', 'D')]) {
      const used = new Set(existing.map((actor) => actor.characterLetter));
      expect(used.has(nextActorLetter(existing))).toBe(false);
    }
  });
});
