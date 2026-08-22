/**
 * A static OpenStreetMap picture for a call sheet (plan §16, rules 29–30).
 *
 * A sheet that only carries a link is no use to someone standing in a car park
 * with no signal, and a printed sheet cannot be clicked at all. So the map has
 * to become an image, once, and then belong to the project.
 *
 * OSM publishes no static-image API, so this composes one from map tiles: work
 * out which tiles cover the pin at a given zoom, fetch them, draw them onto a
 * canvas, mark the pin, and burn the attribution into the picture. The result
 * goes to the asset store like any other image (rule 26) — fetched once,
 * printed offline, and travelling with an exported package.
 *
 * Deliberate limits:
 *
 *  - **Attribution is drawn into the image, not printed beside it.** A caption
 *    in the page can be removed by a later layout change or lost when someone
 *    screenshots the sheet; the tiles' licence follows the pixels (rule 29).
 *  - **Small and low zoom by default.** OSM's tile policy asks that its
 *    volunteer-funded servers not be used for bulk fetching. Six tiles per
 *    location, once, is a reasonable ask; a live slippy map on every sheet is
 *    not, which is also why this is opt-in per sheet.
 *  - **Everything here degrades.** Offline, blocked, or tainted canvas: the
 *    caller gets a reason, the sheet keeps the address and the link, and
 *    nothing throws into a print path (rule 30).
 */

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

const TILE_SIZE = 256;

export interface StaticMapOptions {
  lat: number;
  lng: number;
  /** 1–19. Higher is closer; 15 shows a few streets around the pin. */
  zoom?: number;
  /** Tiles across and down. Kept small on purpose — see the note above. */
  tilesX?: number;
  tilesY?: number;
}

export type StaticMapResult =
  | { status: 'ok'; blob: Blob; width: number; height: number; attribution: string }
  | { status: 'unavailable'; reason: string };

/** Slippy-map tile x for a longitude, as a float so the pin can sit mid-tile. */
export const lngToTileX = (lng: number, zoom: number): number =>
  ((lng + 180) / 360) * 2 ** zoom;

/** Slippy-map tile y for a latitude (Web Mercator). */
export const latToTileY = (lat: number, zoom: number): number => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
};

export const tileUrl = (x: number, y: number, z: number): string =>
  OSM_TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

/**
 * The tile grid covering a pin, and where the pin sits inside the composed
 * image. Pure, so the arithmetic is testable without a network or a canvas.
 */
export const tileGridFor = ({
  lat,
  lng,
  zoom = 15,
  tilesX = 3,
  tilesY = 2,
}: StaticMapOptions): {
  zoom: number;
  tiles: Array<{ x: number; y: number; z: number; dx: number; dy: number }>;
  width: number;
  height: number;
  pin: { x: number; y: number };
} => {
  const centreX = lngToTileX(lng, zoom);
  const centreY = latToTileY(lat, zoom);

  // Top-left tile index such that the centre tile sits in the middle of the grid.
  const originX = Math.floor(centreX) - Math.floor(tilesX / 2);
  const originY = Math.floor(centreY) - Math.floor(tilesY / 2);

  const span = 2 ** zoom;
  const tiles: Array<{ x: number; y: number; z: number; dx: number; dy: number }> = [];
  for (let row = 0; row < tilesY; row += 1) {
    for (let column = 0; column < tilesX; column += 1) {
      tiles.push({
        // X wraps around the antimeridian; Y does not — there is no tile above
        // the north pole, and asking for one returns an error page.
        x: ((originX + column) % span + span) % span,
        y: originY + row,
        z: zoom,
        dx: column * TILE_SIZE,
        dy: row * TILE_SIZE,
      });
    }
  }

  return {
    zoom,
    tiles: tiles.filter((tile) => tile.y >= 0 && tile.y < span),
    width: tilesX * TILE_SIZE,
    height: tilesY * TILE_SIZE,
    pin: {
      x: (centreX - originX) * TILE_SIZE,
      y: (centreY - originY) * TILE_SIZE,
    },
  };
};
