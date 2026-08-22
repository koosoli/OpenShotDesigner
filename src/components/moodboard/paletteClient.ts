/**
 * Browser-side palette sampling for mood boards: loads images, downsamples
 * them on a canvas and feeds raw RGBA into the pure domain quantizer
 * (`domain/moodboard/palette`). DOM-dependent on purpose — the math itself
 * stays in the domain layer with unit tests.
 */

import { dominantColorsFromRgba, mergePalettes } from '../../domain/moodboard';

const SAMPLE_EDGE = 64;

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function sampleRgba(img: HTMLImageElement): Uint8ClampedArray | null {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const w = Math.max(1, Math.round((img.naturalWidth || SAMPLE_EDGE) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || SAMPLE_EDGE) * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  try {
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    // Cross-origin taint — skip this image rather than failing the whole run.
    return null;
  }
}

/**
 * Extract a merged dominant-color palette across all loadable sources.
 * Unloadable (offline/blocked) images are skipped; an all-failed run simply
 * yields an empty palette.
 */
export const extractBoardPalette = async (
  sources: Array<string | null | undefined>,
  count = 8,
): Promise<string[]> => {
  const palettes: string[][] = [];
  for (const src of sources) {
    if (!src) continue;
    const img = await loadImage(src);
    if (!img) continue;
    const rgba = sampleRgba(img);
    if (!rgba) continue;
    palettes.push(dominantColorsFromRgba(rgba, 6));
  }
  return mergePalettes(palettes, count);
};
