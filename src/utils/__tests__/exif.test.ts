import { describe, expect, it } from 'vitest';
import { parseExif } from '../exif';

/**
 * Build a minimal big-endian JPEG: SOI, APP1 "Exif" with IFD0 → Exif IFD
 * (DateTimeOriginal) and GPS IFD (lat/lng/refs/direction).
 */
const buildJpeg = (opts: { south?: boolean; west?: boolean } = {}): ArrayBuffer => {
  const tiff: number[] = [];
  const u16 = (v: number) => tiff.push((v >> 8) & 255, v & 255);
  const u32 = (v: number) => tiff.push((v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255);
  const at = (offset: number, v: number) => {
    tiff[offset] = (v >>> 24) & 255; tiff[offset + 1] = (v >> 16) & 255; tiff[offset + 2] = (v >> 8) & 255; tiff[offset + 3] = v & 255;
  };
  // Header
  u16(0x4d4d); u16(42); u32(8);
  // IFD0 at 8: 2 entries
  u16(2);
  u16(0x8769); u16(4); u32(1); const exifPtr = tiff.length; u32(0);
  u16(0x8825); u16(4); u32(1); const gpsPtr = tiff.length; u32(0);
  u32(0);
  // Exif IFD
  at(exifPtr, tiff.length);
  u16(1);
  u16(0x9003); u16(2); u32(20); const datePtr = tiff.length; u32(0);
  u32(0);
  at(datePtr, tiff.length);
  for (const ch of '2026:05:04 14:22:10') tiff.push(ch.charCodeAt(0));
  tiff.push(0);
  // GPS IFD
  at(gpsPtr, tiff.length);
  u16(5);
  u16(1); u16(2); u32(2); tiff.push(opts.south ? 83 : 78, 0, 0, 0);
  u16(2); u16(5); u32(3); const latPtr = tiff.length; u32(0);
  u16(3); u16(2); u32(2); tiff.push(opts.west ? 87 : 69, 0, 0, 0);
  u16(4); u16(5); u32(3); const lngPtr = tiff.length; u32(0);
  u16(0x11); u16(5); u32(1); const dirPtr = tiff.length; u32(0);
  u32(0);
  const rational = (n: number, d: number) => { u32(n); u32(d); };
  at(latPtr, tiff.length); rational(52, 1); rational(30, 1); rational(0, 1);
  at(lngPtr, tiff.length); rational(13, 1); rational(24, 1); rational(36, 1);
  at(dirPtr, tiff.length); rational(2705, 10);

  const app1Length = 2 + 6 + tiff.length;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (app1Length >> 8) & 255, app1Length & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
};

describe('parseExif', () => {
  it('reads the capture time, GPS position and heading', () => {
    const exif = parseExif(buildJpeg());
    expect(exif.takenAt).toBe('2026-05-04T14:22:10');
    expect(exif.lat).toBeCloseTo(52.5, 5);
    expect(exif.lng).toBeCloseTo(13.41, 5);
    expect(exif.heading).toBe(271);
  });

  it('applies south and west references', () => {
    const exif = parseExif(buildJpeg({ south: true, west: true }));
    expect(exif.lat).toBeCloseTo(-52.5, 5);
    expect(exif.lng).toBeCloseTo(-13.41, 5);
  });

  it('returns nothing for non-JPEG or garbage bytes', () => {
    expect(parseExif(new Uint8Array([1, 2, 3, 4]).buffer)).toEqual({});
    expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 1, 2]).buffer)).toEqual({});
  });
});
