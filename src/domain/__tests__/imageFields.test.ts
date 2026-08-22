import { describe, expect, it } from 'vitest';
import { imageFieldsOf, inlineImageBytes, inlineImagesIn, isAssetRef, isInlineImage } from '../media';

const INLINE = 'data:image/jpeg;base64,AAAA';
const ASSET = 'asset-sha256-abc123';

const projectWithImages = () => ({
  logo: INLINE,
  setups: [
    {
      name: 'Sc 1',
      backgroundImages: [{ url: INLINE }, { url: ASSET }],
      shots: [
        {
          shotNumber: '1A',
          storyboardImage: INLINE,
          storyboardImageEnd: ASSET,
          storyboardFrames: { start: { image: INLINE }, 'wp-2': { image: ASSET } },
        },
        { shotNumber: '1B' },
      ],
    },
  ],
  avScriptRows: [{ shotNumber: '3', storyboardImage: INLINE }],
});

describe('image reference forms', () => {
  it('tells an asset id from an inline image', () => {
    expect(isAssetRef(ASSET)).toBe(true);
    expect(isAssetRef(INLINE)).toBe(false);
    expect(isInlineImage(INLINE)).toBe(true);
    expect(isInlineImage(ASSET)).toBe(false);
  });

  it('treats absent as neither', () => {
    expect(isAssetRef(undefined)).toBe(false);
    expect(isInlineImage(undefined)).toBe(false);
    expect(inlineImageBytes(undefined)).toBe(0);
  });

  /**
   * The project pays the encoded length, because that is what it stores — the
   * point of the measurement is what the file weighs, not what the picture
   * would weigh decoded.
   */
  it('measures what the project actually carries', () => {
    expect(inlineImageBytes(INLINE)).toBe(INLINE.length);
    expect(inlineImageBytes(ASSET)).toBe(0);
  });
});

describe('imageFieldsOf', () => {
  it('finds every image-bearing field, in both forms', () => {
    const fields = imageFieldsOf(projectWithImages());
    expect(fields).toHaveLength(8);
  });

  it('names each one so a report can say what moved', () => {
    const paths = imageFieldsOf(projectWithImages()).map((f) => f.path);
    expect(paths).toContain('logo');
    expect(paths).toContain('Sc 1 · background 1');
    expect(paths).toContain('Sc 1 · shot 1A · board');
    expect(paths).toContain('Sc 1 · shot 1A · frame start');
    expect(paths).toContain('AV row 3');
  });

  it('skips fields that hold nothing rather than reporting empty ones', () => {
    const paths = imageFieldsOf(projectWithImages()).map((f) => f.path);
    expect(paths.some((p) => p.includes('1B'))).toBe(false);
  });

  it('writes back through the setter it hands out', () => {
    const project = projectWithImages();
    const field = imageFieldsOf(project).find((f) => f.path === 'Sc 1 · shot 1A · board')!;
    field.set('asset-sha256-new');
    expect(project.setups[0].shots[0].storyboardImage).toBe('asset-sha256-new');
  });

  it('gives storyboards and background plates different downscale policies', () => {
    const fields = imageFieldsOf(projectWithImages());
    const board = fields.find((f) => f.path.includes('board'))!;
    const plate = fields.find((f) => f.path.includes('background'))!;
    const logo = fields.find((f) => f.path === 'logo')!;
    // Plates are traced over at canvas zoom, so they keep more than a board.
    expect(plate.policy.maxSize).toBeGreaterThan(board.policy.maxSize);
    // A logo on a white masthead needs its transparency.
    expect(logo.policy.keepAlpha).toBe(true);
    expect(board.policy.keepAlpha).toBeUndefined();
  });

  it('copes with a project that has no media at all', () => {
    expect(imageFieldsOf({})).toEqual([]);
    expect(imageFieldsOf({ setups: [{ shots: [] }] })).toEqual([]);
  });
});

describe('inlineImagesIn', () => {
  it('counts only what is still inline, and what it costs', () => {
    const report = inlineImagesIn(projectWithImages());
    expect(report.count).toBe(5);
    expect(report.bytes).toBe(INLINE.length * 5);
    expect(report.paths).toContain('AV row 3');
    expect(report.paths.some((p) => p.includes('frame wp-2'))).toBe(false);
  });

  it('reports nothing for a fully migrated project', () => {
    const report = inlineImagesIn({ logo: ASSET, setups: [{ shots: [{ storyboardImage: ASSET }] }] });
    expect(report).toEqual({ count: 0, bytes: 0, paths: [] });
  });
});
