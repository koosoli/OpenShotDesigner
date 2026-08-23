/**
 * Camera letters must be unique on a setup.
 *
 * The letter reaches the shot list, the call sheet, the slate and the
 * `Camera #` column of the Resolve metadata export, so two cameras sharing one
 * is not cosmetic — it makes two setups claim to be the same camera, and the
 * metadata import cannot tell them apart afterwards.
 */
import { describe, expect, it } from 'vitest';
import { nextCameraLabel, usedCameraLabels } from '../plan/cameraLabels';

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
