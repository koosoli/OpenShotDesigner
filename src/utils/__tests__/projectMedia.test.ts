import { describe, expect, it } from 'vitest';
import { applyMediaReplacements } from '../projectMedia';
import { inlineImagesIn } from '../../domain/media';
import type { Project } from '../../types';

const INLINE_A = 'data:image/jpeg;base64,AAAA';
const INLINE_B = 'data:image/jpeg;base64,BBBB';

const project = (): Project =>
  ({
    id: 'p',
    title: 'T',
    logo: INLINE_A,
    setups: [
      {
        id: 's1',
        name: 'Sc 1',
        backgroundImages: [{ id: 'b', url: INLINE_B }],
        shots: [{ id: 'sh1', shotNumber: '1A', storyboardImage: INLINE_A }],
      },
    ],
  }) as unknown as Project;

/**
 * The migration itself needs a canvas and a real image decoder, so it is
 * exercised in the browser. What is testable here — and what actually carries
 * the risk of losing someone's storyboards — is applying the result.
 */
describe('applyMediaReplacements', () => {
  it('swaps every field holding the migrated bytes, wherever they are', () => {
    const { project: next, applied } = applyMediaReplacements(project(), {
      [INLINE_A]: 'asset-sha256-aaa',
      [INLINE_B]: 'asset-sha256-bbb',
    });
    expect(applied).toBe(3);
    expect(next.logo).toBe('asset-sha256-aaa');
    expect(next.setups[0].shots[0].storyboardImage).toBe('asset-sha256-aaa');
    expect(next.setups[0].backgroundImages![0].url).toBe('asset-sha256-bbb');
    expect(inlineImagesIn(next).count).toBe(0);
  });

  /**
   * The pass is asynchronous and the user keeps working. Applying a stale whole
   * project would discard their edits; applying replacements cannot, and doing
   * it twice has to be harmless.
   */
  it('is idempotent — a field already holding an id matches no key', () => {
    const once = applyMediaReplacements(project(), { [INLINE_A]: 'asset-sha256-aaa' });
    const twice = applyMediaReplacements(once.project, { [INLINE_A]: 'asset-sha256-aaa' });
    expect(twice.applied).toBe(0);
    expect(twice.project).toBe(once.project);
  });

  it('leaves images it was given no replacement for alone', () => {
    const { project: next } = applyMediaReplacements(project(), { [INLINE_A]: 'asset-sha256-aaa' });
    expect(next.setups[0].backgroundImages![0].url).toBe(INLINE_B);
    expect(inlineImagesIn(next).count).toBe(1);
  });

  it('returns the original object untouched when there is nothing to do', () => {
    const original = project();
    const result = applyMediaReplacements(original, {});
    expect(result.project).toBe(original);
    expect(result.applied).toBe(0);
  });

  it('does not mutate the project it was given', () => {
    const original = project();
    applyMediaReplacements(original, { [INLINE_A]: 'asset-sha256-aaa' });
    expect(original.logo).toBe(INLINE_A);
  });
});
