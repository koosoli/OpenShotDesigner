import { describe, expect, it } from 'vitest';
import { OSM_ATTRIBUTION, latToTileY, lngToTileX, tileGridFor, tileUrl } from '../locations';

/**
 * The tile arithmetic, tested without a network or a canvas. Getting this wrong
 * produces a map of somewhere else, which on a call sheet is worse than no map.
 */
describe('slippy-map tile arithmetic', () => {
  it('puts the prime meridian and the equator at the middle of the world', () => {
    // At zoom 1 the world is 2×2 tiles, so (0, 0) is the corner of all four.
    expect(lngToTileX(0, 1)).toBeCloseTo(1, 6);
    expect(latToTileY(0, 1)).toBeCloseTo(1, 6);
  });

  it('maps the antimeridian to the edges', () => {
    expect(lngToTileX(-180, 4)).toBeCloseTo(0, 6);
    expect(lngToTileX(180, 4)).toBeCloseTo(16, 6);
  });

  it('puts higher latitudes nearer the top', () => {
    expect(latToTileY(60, 8)).toBeLessThan(latToTileY(10, 8));
  });

  it('builds the documented tile URL', () => {
    expect(tileUrl(1, 2, 3)).toBe('https://tile.openstreetmap.org/3/1/2.png');
  });
});

describe('tileGridFor', () => {
  const berlin = { lat: 52.52, lng: 13.405 };

  it('returns a full grid with pixel offsets for each tile', () => {
    const grid = tileGridFor({ ...berlin, zoom: 15, tilesX: 3, tilesY: 2 });
    expect(grid.tiles).toHaveLength(6);
    expect(grid.width).toBe(768);
    expect(grid.height).toBe(512);
    expect(grid.tiles.map((t) => [t.dx, t.dy])).toEqual([
      [0, 0], [256, 0], [512, 0],
      [0, 256], [256, 256], [512, 256],
    ]);
  });

  it('places the pin inside the composed image', () => {
    const grid = tileGridFor({ ...berlin, zoom: 15 });
    expect(grid.pin.x).toBeGreaterThan(0);
    expect(grid.pin.x).toBeLessThan(grid.width);
    expect(grid.pin.y).toBeGreaterThan(0);
    expect(grid.pin.y).toBeLessThan(grid.height);
  });

  it('keeps every tile inside the world at that zoom', () => {
    const grid = tileGridFor({ ...berlin, zoom: 15 });
    for (const tile of grid.tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(2 ** 15);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeLessThan(2 ** 15);
    }
  });

  /**
   * X wraps around the antimeridian, so a location on the edge still gets a
   * full grid rather than tile index -1, which the server answers with an
   * error page that would draw as a broken square.
   */
  it('wraps the tile grid across the antimeridian', () => {
    const grid = tileGridFor({ lat: 0, lng: -179.99, zoom: 4, tilesX: 3, tilesY: 1 });
    expect(grid.tiles).toHaveLength(3);
    expect(grid.tiles.every((tile) => tile.x >= 0 && tile.x < 16)).toBe(true);
    expect(grid.tiles.map((tile) => tile.x)).toContain(15);
  });

  /**
   * Y does not wrap — there is no tile above the north pole. Asking for one
   * returns an error page, so those rows are dropped and the grid is short.
   */
  it('drops rows that fall off the top of the world instead of requesting them', () => {
    const grid = tileGridFor({ lat: 85, lng: 0, zoom: 1, tilesX: 2, tilesY: 4 });
    expect(grid.tiles.every((tile) => tile.y >= 0 && tile.y < 2)).toBe(true);
    expect(grid.tiles.length).toBeLessThan(8);
  });

  it('shows a smaller area as zoom increases', () => {
    const near = tileGridFor({ ...berlin, zoom: 17 });
    const far = tileGridFor({ ...berlin, zoom: 12 });
    // Same pixel size, but each tile covers less ground at higher zoom.
    expect(near.width).toBe(far.width);
    expect(near.tiles[0].z).toBe(17);
    expect(far.tiles[0].z).toBe(12);
  });

  it('credits OpenStreetMap', () => {
    expect(OSM_ATTRIBUTION).toMatch(/OpenStreetMap/);
  });
});
