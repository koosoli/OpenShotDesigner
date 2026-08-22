/**
 * Mood-board collage palette extraction (plan §25).
 *
 * Pure pixel-bucketing math only — no DOM, no canvas. The UI samples image
 * pixels (skipping near-transparent ones) and feeds RGBA tuples into
 * `dominantColorsFromRgba`, which returns the most common quantized colors
 * as hex strings, brightest-first within frequency ties for stable output.
 * Missing/empty input yields an empty palette — never a fabricated color.
 */

/** Quantize one channel to 4-bit-per-step buckets (17-value grid). */
const quantize = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value / 32) * 32));

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;

/**
 * Dominant colors from raw RGBA bytes (alpha ignored except fully-transparent
 * pixels, which are skipped). `count` clamps to 1..10.
 */
export const dominantColorsFromRgba = (
  rgba: ArrayLike<number>,
  count = 6,
): string[] => {
  if (!rgba || rgba.length < 4) return [];
  const wanted = Math.max(1, Math.min(10, Math.floor(count)));

  const buckets = new Map<number, { r: number; g: number; b: number; weight: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const alpha = rgba[i + 3];
    if (alpha < 128) continue;
    // Skip near-white and near-black extremes so paper/backgrounds do not
    // dominate the palette; they are rarely the "look" of a reference.
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (min >= 240 || max <= 16) continue;

    const qr = quantize(r);
    const qg = quantize(g);
    const qb = quantize(b);
    // Weight saturated colors higher — they define the mood more than grays.
    const saturation = max === min ? 0 : (max - min) / max;
    const weight = 1 + saturation;
    const key = (qr << 16) | (qg << 8) | qb;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += qr * weight;
      bucket.g += qg * weight;
      bucket.b += qb * weight;
      bucket.weight += weight;
    } else {
      buckets.set(key, { r: qr * weight, g: qg * weight, b: qb * weight, weight });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, wanted)
    .map((bucket) => toHex(
      Math.round(bucket.r / bucket.weight),
      Math.round(bucket.g / bucket.weight),
      Math.round(bucket.b / bucket.weight),
    ));
};

/** Merge palettes from several images, preserving order and de-duplicating. */
export const mergePalettes = (palettes: string[][], count = 8): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const palette of palettes) {
    for (const color of palette) {
      const key = color.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(color);
      if (out.length >= Math.max(1, count)) return out;
    }
  }
  return out;
};
