import { BackgroundImage } from '../types';
import { storeImageAsset, whenAssetImagesSettled } from './assetImages';

/**
 * Image loaders (rule 26).
 *
 * These used to return base64 data URLs that went straight into project state.
 * They now downscale and put the bytes in the content-addressed asset store,
 * returning an asset id in the same string field — so every call site kept
 * working unchanged, and every reader already accepts both forms.
 *
 * The background loader is the one that mattered most: it did no downscaling at
 * all, so a phone photo of a floor plan went into the project at full
 * resolution, and stayed there inside every undo snapshot and every duplicate.
 */

/**
 * Reads an image file (screenshot, blueprint, scout photo) and produces a
 * BackgroundImage object with sensible default sizing for the floor plan canvas.
 */
export async function loadBackgroundImageFile(file: File): Promise<BackgroundImage> {
  const { assetId, width: storedWidth, height: storedHeight } = await storeImageAsset(file, {
    // Reference plates are traced over at canvas zoom, so they keep more detail
    // than a storyboard — but not the 12 MP the camera produced.
    maxSize: 2400,
    quality: 0.86,
    source: `background:${file.name}`,
  });

  const aspect = storedWidth / storedHeight || 1;
  const defaultWidth = 800;

  return {
    url: assetId,
    name: file.name,
    x: 50,
    y: 50,
    width: Math.round(defaultWidth),
    height: Math.round(defaultWidth / aspect),
    opacity: 0.5,
    locked: false,
    visible: true,
    naturalWidth: storedWidth,
    naturalHeight: storedHeight,
  };
}

/**
 * Reads a production logo, keeping its transparency, and stores it.
 *
 * PNG rather than JPEG because a logo on a white call-sheet masthead needs its
 * alpha; the size cost is small at 320 px.
 */
export async function loadLogoFile(
  file: File,
  maxSize = 320,
): Promise<{ ref: string; name: string }> {
  const { assetId } = await storeImageAsset(file, {
    maxSize,
    keepAlpha: true,
    source: `logo:${file.name}`,
  });
  return { ref: assetId, name: file.name };
}

/**
 * Reads a photo (camera roll, webcam grab, scan) for a storyboard frame and
 * stores it, returning its asset id.
 *
 * The long edge is capped and it is re-encoded as JPEG: a storyboard is looked
 * at, never zoomed into, so 1280 px is already more than the largest place one
 * is shown.
 */
export async function loadStoryboardImageFile(
  file: File,
  maxSize = 1280,
  quality = 0.82,
): Promise<string> {
  const { assetId } = await storeImageAsset(file, {
    maxSize,
    quality,
    source: `storyboard:${file.name}`,
  });
  return assetId;
}

/**
 * Resolve once every `<img>` inside `root` has finished loading (or failed).
 *
 * Print paths mount a hidden document and call `window.print()` on a short
 * timer. That races image decoding: a production logo supplied as a data URL is
 * usually fast, but "usually" is not "always", and when it loses the race the
 * printed page comes out with the logo missing and no error anywhere. Waiting
 * for the images first makes the printout deterministic.
 *
 * Never rejects, and never waits longer than `timeoutMs` — a broken or slow
 * image must not be able to stop someone printing a call sheet.
 */
export async function waitForImages(root: ParentNode | null, timeoutMs = 3000): Promise<void> {
  if (!root) return;
  // Asset-backed images are not in the DOM until their blob URL arrives, so
  // there would be nothing to wait for yet.
  await whenAssetImagesSettled();
  return waitForDomImages(root, timeoutMs);
}

function waitForDomImages(root: ParentNode, timeoutMs: number): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  const pending = images.filter((img) => !img.complete || img.naturalWidth === 0);
  if (pending.length === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);

    let remaining = pending.length;
    const one = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
    };
    for (const img of pending) {
      img.addEventListener('load', one, { once: true });
      img.addEventListener('error', one, { once: true });
    }
  });
}
