/**
 * Image bytes for PDF embedding, from an asset id or a data URL.
 *
 * Its own module so a panel exporting one PDF does not pull the whole export
 * studio (and every print view it imports) into its chunk.
 */
import { createIdbAssetStore } from '../../domain/storage/idbAssetStore';
import { isAssetRef } from '../../domain/media/imageRef';

export interface ResolvedImage {
  bytes: Uint8Array;
  mimeType: string;
}

/** Asset id, data URL or nothing -> raster bytes. Never throws. */
export const resolvePdfImageBytes = async (ref?: string): Promise<ResolvedImage | null> => {
  try {
    if (!ref) return null;
    if (ref.startsWith('data:')) {
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(ref);
      if (!match || match[2] !== ';base64') return null;
      const binary = atob(match[3]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, mimeType: match[1] || 'application/octet-stream' };
    }
    if (!isAssetRef(ref)) return null;
    const blob = await createIdbAssetStore().get(ref);
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type || 'application/octet-stream' };
  } catch {
    return null;
  }
};

const isEmbeddable = (mimeType: string): boolean => /^image\/(png|jpe?g)$/i.test(mimeType);

/** Draw any browser-decodable image onto a canvas and return PNG bytes. */
const rasterize = async (src: string, maxSize: number): Promise<ResolvedImage | null> => {
  if (typeof document === 'undefined') return null;
  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('decode failed'));
  });
  image.src = src;
  await loaded;
  const width = image.naturalWidth || 640;
  const height = image.naturalHeight || 360;
  const scale = Math.min(1, maxSize / Math.max(width, height)) || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/png' };
};

/**
 * Like `resolvePdfImageBytes`, but always returns something a PDF can embed:
 * PNG and JPEG pass through, anything else the browser can show (an SVG
 * sketch, a WebP from a phone) is redrawn as PNG. Never throws.
 */
export const resolvePdfRasterBytes = async (ref?: string, maxSize = 1600): Promise<ResolvedImage | null> => {
  try {
    if (!ref) return null;
    const resolved = await resolvePdfImageBytes(ref);
    if (resolved && isEmbeddable(resolved.mimeType)) return resolved;
    if (ref.startsWith('data:')) return await rasterize(ref, maxSize);
    if (!resolved) return null;
    const url = URL.createObjectURL(new Blob([resolved.bytes as BlobPart], { type: resolved.mimeType }));
    try {
      return await rasterize(url, maxSize);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
};
