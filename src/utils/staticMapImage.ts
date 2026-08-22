import {
  OSM_ATTRIBUTION,
  tileGridFor,
  tileUrl,
} from '../domain/locations/staticMap';
import type { StaticMapOptions, StaticMapResult } from '../domain/locations/staticMap';
import { assetImageStore } from './assetImages';

/**
 * Fetch OSM tiles and compose them into one picture.
 *
 * The arithmetic lives in `domain/locations/staticMap.ts` and is tested there;
 * this is the part that touches the network and a canvas, and it exists to keep
 * both of those out of the domain.
 *
 * Every failure path returns `unavailable` with a reason rather than throwing.
 * This runs behind a button on a call sheet, and a call sheet that cannot be
 * printed because a tile server was slow is a worse outcome than a call sheet
 * with no map on it (rule 30).
 */

const loadTile = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    // Required for a canvas we intend to read back; without it the canvas is
    // tainted and toBlob throws a SecurityError.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

const drawPin = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#dc2626';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
};

/**
 * Attribution burned into the picture.
 *
 * In the image rather than beside it because the licence follows the pixels: a
 * caption in the page can be dropped by a later layout change or lost when
 * someone photographs the sheet, and the credit has to survive both (rule 29).
 */
const drawAttribution = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  const text = OSM_ATTRIBUTION;
  ctx.save();
  ctx.font = '11px sans-serif';
  const metrics = ctx.measureText(text);
  const padding = 4;
  const boxWidth = metrics.width + padding * 2;
  const boxHeight = 16;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillRect(width - boxWidth, height - boxHeight, boxWidth, boxHeight);
  ctx.fillStyle = '#0f172a';
  ctx.fillText(text, width - boxWidth + padding, height - 4.5);
  ctx.restore();
};

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.86);
        return;
      }
      resolve(null);
    } catch {
      // Tainted canvas — a tile server that answered without CORS headers.
      resolve(null);
    }
  });

/** Compose a static map picture for a pin. Never throws. */
export const composeStaticMap = async (options: StaticMapOptions): Promise<StaticMapResult> => {
  if (typeof document === 'undefined') {
    return { status: 'unavailable', reason: 'Map images need a browser.' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'unavailable', reason: 'You are offline — connect once to fetch the map.' };
  }

  const grid = tileGridFor(options);
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { status: 'unavailable', reason: 'This browser cannot compose images.' };

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, grid.width, grid.height);

  const images = await Promise.all(grid.tiles.map((tile) => loadTile(tileUrl(tile.x, tile.y, tile.z))));
  const loaded = images.filter(Boolean).length;
  if (loaded === 0) {
    return { status: 'unavailable', reason: 'No map tiles could be fetched.' };
  }

  images.forEach((img, index) => {
    if (!img) return;
    const tile = grid.tiles[index];
    ctx.drawImage(img, tile.dx, tile.dy);
  });

  drawPin(ctx, grid.pin.x, grid.pin.y);
  drawAttribution(ctx, grid.width, grid.height);

  const blob = await canvasToBlob(canvas);
  if (!blob) {
    return { status: 'unavailable', reason: 'The map image could not be encoded.' };
  }

  return {
    status: 'ok',
    blob,
    width: grid.width,
    height: grid.height,
    attribution: OSM_ATTRIBUTION,
  };
};

/**
 * Compose a map for a pin and store it, returning the asset id.
 *
 * Once stored the sheet needs no network at all — which is the point, since
 * the sheet is read at a location, often on a phone with one bar.
 */
export const captureLocationMap = async (
  options: StaticMapOptions,
): Promise<{ status: 'ok'; assetId: string } | { status: 'unavailable'; reason: string }> => {
  const result = await composeStaticMap(options);
  if (result.status !== 'ok') return result;
  const ref = await assetImageStore.put(result.blob, {
    width: result.width,
    height: result.height,
    source: `openstreetmap:${options.lat},${options.lng}`,
  });
  return { status: 'ok', assetId: ref.id };
};
