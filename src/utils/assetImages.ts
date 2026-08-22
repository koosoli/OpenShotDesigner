import { useEffect, useState } from 'react';
import { createIdbAssetStore } from '../domain/storage/idbAssetStore';
import { isAssetRef } from '../domain/media';

/**
 * Project images that live in the asset store, not in project state (rule 26).
 *
 * Three surfaces need the same thing — crew headshots, storyboard frames and
 * call-sheet location maps — and the mood board had already solved it once in
 * its own file. Doing it a fourth time by copy would mean four caches, four
 * object-URL lifetimes and four chances to accidentally put base64 back into
 * the project.
 *
 * Why it matters that these are not data URLs: project state is snapshotted for
 * undo and copied wholesale on duplicate. A 200 kB base64 headshot on forty
 * crew is 8 MB inside every one of those copies, and it is the same 8 MB in the
 * IndexedDB record the app rewrites on every edit. Asset ids are ~50 bytes and
 * the bytes are stored once, content-addressed, so two people sharing a
 * headshot share the blob.
 *
 * Ids are `asset-sha256-…`, which `collectAssetIds` finds anywhere in the
 * project JSON — so anything stored through here travels in an exported
 * package without further work.
 */
export const assetImageStore = createIdbAssetStore();

/**
 * Object URLs, kept for the session.
 *
 * Revoking on unmount looks tidier and is wrong here: the same headshot appears
 * on the crew list, the contact sheet and the call sheet, and a component
 * unmounting would pull the image out from under the other two. They are a few
 * dozen bytes of bookkeeping each and the browser reclaims them with the page.
 */
const urlCache = new Map<string, string>();

/** Drop a cached URL, for when the underlying asset is replaced. */
export const forgetAssetUrl = (assetId: string): void => {
  const url = urlCache.get(assetId);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(assetId);
  }
};

/** Resolve one asset id to a displayable URL, or null when it is not there. */
export const assetImageUrl = async (assetId: string): Promise<string | null> => {
  const cached = urlCache.get(assetId);
  if (cached) return cached;
  try {
    const blob = await assetImageStore.get(assetId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(assetId, url);
    return url;
  } catch {
    return null;
  }
};

export interface StoreImageOptions {
  /** Longest edge in pixels after downscaling. */
  maxSize?: number;
  /** JPEG quality 0–1. Ignored when `keepAlpha` is set. */
  quality?: number;
  /**
   * Encode as PNG to preserve transparency. Costs size, so it is opt-in: a
   * headshot or a map has no alpha worth keeping, a logo does.
   */
  keepAlpha?: boolean;
  /** Recorded in the asset metadata — where the bytes came from (rule 35). */
  source?: string;
}

/** Canvas → Blob with a data-URL fallback for engines lacking toBlob. */
const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
        type,
        quality,
      );
      return;
    }
    try {
      const dataUrl = canvas.toDataURL(type, quality);
      const [, base64] = dataUrl.split(',');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type }));
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Could not encode the image.'));
    }
  });

/** Load a source into an <img>, from a File/Blob or a URL. */
const loadImage = (source: Blob | string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = typeof source === 'string' ? undefined : URL.createObjectURL(source);
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('That file is not a readable image.'));
    };
    if (typeof source === 'string') img.crossOrigin = 'anonymous';
    img.src = objectUrl ?? (source as string);
  });

/**
 * Downscale an image and put it in the asset store, returning its id.
 *
 * Downscaling before storing rather than on display is deliberate: the store is
 * content-addressed, so the same photo uploaded twice at the same size is one
 * blob, and nobody's 12 MP phone picture ever reaches the database.
 */
export const storeImageAsset = async (
  file: Blob,
  options: StoreImageOptions = {},
): Promise<{ assetId: string; width: number; height: number }> => {
  const { maxSize = 1280, quality = 0.85, keepAlpha = false, source } = options;
  const img = await loadImage(file);

  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');

  if (!keepAlpha) {
    // JPEG has no alpha; without a backing, a transparent PNG comes out black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);

  const type = keepAlpha ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, type, quality);
  const ref = await assetImageStore.put(blob, {
    width,
    height,
    ...(source ? { source } : {}),
  });
  return { assetId: ref.id, width, height };
};

/**
 * Displayable URLs for a set of asset ids, keyed by id.
 *
 * Takes ids rather than the records that hold them, so one hook serves people,
 * shots and days without knowing anything about them.
 */
export const useAssetImageSrcs = (assetIds: ReadonlyArray<string | undefined>): Record<string, string | null> => {
  const ids = assetIds.filter((id): id is string => !!id);
  const signature = [...new Set(ids)].sort().join('|');
  const [srcs, setSrcs] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string | null> = {};
      for (const id of new Set(signature ? signature.split('|') : [])) {
        next[id] = await assetImageUrl(id);
      }
      if (!cancelled) setSrcs(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [signature]);

  return srcs;
};

/** One id's URL, for the many places that only ever show a single image. */
export const useAssetImageSrc = (assetId?: string): string | null => {
  const srcs = useAssetImageSrcs([assetId]);
  return assetId ? srcs[assetId] ?? null : null;
};

/**
 * Resolve image references that may be EITHER an asset id or a legacy inline
 * data URL, keyed by the reference itself.
 *
 * Every storyboard, background plate and AV row held a data URL until the media
 * migration, and a project can be half-migrated — the pass is forgiving and an
 * image it could not decode keeps its inline value forever. So readers cannot
 * assume one form, and `src={ref}` cannot simply be replaced with a lookup.
 * Passing a data URL straight through costs nothing: it already is a usable
 * src.
 */
export const useImageRefSrcs = (
  refs: ReadonlyArray<string | undefined>,
): Record<string, string | null> => {
  const assetIds = refs.filter((ref): ref is string => isAssetRef(ref));
  const resolved = useAssetImageSrcs(assetIds);

  const out: Record<string, string | null> = {};
  for (const ref of refs) {
    if (!ref) continue;
    out[ref] = isAssetRef(ref) ? resolved[ref] ?? null : ref;
  }
  return out;
};

/** One reference, in whichever form it is stored. */
export const useImageRefSrc = (ref?: string): string | null => {
  const srcs = useImageRefSrcs([ref]);
  return ref ? srcs[ref] ?? null : null;
};
