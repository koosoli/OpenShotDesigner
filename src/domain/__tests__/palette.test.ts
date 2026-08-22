import { describe, it, expect } from 'vitest';
import { dominantColorsFromRgba, mergePalettes } from '../moodboard/palette';

const px = (r: number, g: number, b: number, a = 255): number[] => [r, g, b, a];

describe('dominantColorsFromRgba', () => {
  it('returns empty for empty or truncated input — never a fabricated color', () => {
    expect(dominantColorsFromRgba([], 5)).toEqual([]);
    expect(dominantColorsFromRgba([10, 20, 30], 5)).toEqual([]);
  });

  it('finds the most frequent quantized color first', () => {
    const pixels = [
      ...Array(50).fill(null).flatMap(() => px(200, 30, 40)), // strong red
      ...Array(5).fill(null).flatMap(() => px(30, 200, 60)), // green minority
    ];
    const palette = dominantColorsFromRgba(pixels, 2);
    expect(palette[0]).toBe('#c02020');
  });

  it('skips fully transparent pixels and near-white/near-black extremes', () => {
    const pixels = [
      ...Array(20).fill(null).flatMap(() => px(250, 250, 250)),
      ...Array(20).fill(null).flatMap(() => px(4, 4, 4)),
      ...Array(20).fill(null).flatMap(() => px(10, 10, 10, 0)),
      ...Array(6).fill(null).flatMap(() => px(180, 120, 30)),
    ];
    expect(dominantColorsFromRgba(pixels, 3)).toEqual(['#c08020']);
    expect(dominantColorsFromRgba(pixels, 3)[0]).toBe('#c08020');
  });

  it('clamps count and de-duplicates via quantization', () => {
    const pixels = [
      ...Array(10).fill(null).flatMap(() => px(100, 100, 100)),
      ...Array(10).fill(null).flatMap(() => px(104, 98, 102)), // same bucket
    ];
    const palette = dominantColorsFromRgba(pixels, 99);
    expect(palette).toHaveLength(1);
  });
});

describe('mergePalettes', () => {
  it('merges in order and de-duplicates case-insensitively up to count', () => {
    expect(mergePalettes([['#AABBCC', '#112233'], ['#aabbcc', '#445566']], 3)).toEqual([
      '#AABBCC',
      '#112233',
      '#445566',
    ]);
  });

  it('returns fewer colors when sources are smaller than the requested count', () => {
    expect(mergePalettes([['#101010']], 8)).toEqual(['#101010']);
    expect(mergePalettes([], 8)).toEqual([]);
  });
});
