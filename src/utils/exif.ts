/**
 * Just enough EXIF to place a scout photo: when it was taken, where, and
 * which way the camera faced.
 *
 * Read from the ORIGINAL file bytes — the asset store re-encodes images
 * through a canvas, which drops every tag. JPEG only (APP1 "Exif" segment);
 * anything else, or anything malformed, returns an empty result rather than
 * throwing, because a photo without metadata is still a photo.
 */

export interface PhotoExif {
  /** ISO-ish local timestamp "2026-05-04T14:22:10" (EXIF has no zone). */
  takenAt?: string;
  lat?: number;
  lng?: number;
  /** Compass direction the camera faced, degrees. */
  heading?: number;
}

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LNG_REF = 0x0003;
const GPS_LNG = 0x0004;
const GPS_IMG_DIRECTION = 0x0011;

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

interface Entry {
  type: number;
  count: number;
  /** Offset of the value (inline or pointed-to), relative to the DataView. */
  valueOffset: number;
}

/** Parse EXIF out of a JPEG's bytes. */
export const parseExif = (buffer: ArrayBuffer): PhotoExif => {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {};
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      const length = view.getUint16(offset + 2);
      if ((marker & 0xff00) !== 0xff00 || length < 2) return {};
      // APP1 with "Exif\0\0"
      if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
        return parseTiff(new DataView(buffer, offset + 10, Math.min(length - 8, view.byteLength - offset - 10)));
      }
      if (marker === 0xffda) return {}; // start of scan: no EXIF before the image data
      offset += 2 + length;
    }
    return {};
  } catch {
    return {};
  }
};

const parseTiff = (tiff: DataView): PhotoExif => {
  const order = tiff.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return {};
  const little = order === 0x4949;
  const u16 = (at: number) => tiff.getUint16(at, little);
  const u32 = (at: number) => tiff.getUint32(at, little);

  const readIfd = (at: number): Map<number, Entry> => {
    const entries = new Map<number, Entry>();
    if (at <= 0 || at + 2 > tiff.byteLength) return entries;
    const count = u16(at);
    for (let i = 0; i < count; i += 1) {
      const base = at + 2 + i * 12;
      if (base + 12 > tiff.byteLength) break;
      const tag = u16(base);
      const type = u16(base + 2);
      const n = u32(base + 4);
      const size = (TYPE_SIZE[type] ?? 1) * n;
      entries.set(tag, { type, count: n, valueOffset: size <= 4 ? base + 8 : u32(base + 8) });
    }
    return entries;
  };

  const ascii = (entry?: Entry): string | undefined => {
    if (!entry || entry.type !== 2) return undefined;
    let text = '';
    for (let i = 0; i < entry.count && entry.valueOffset + i < tiff.byteLength; i += 1) {
      const code = tiff.getUint8(entry.valueOffset + i);
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    return text;
  };

  const rationals = (entry?: Entry): number[] | undefined => {
    if (!entry || entry.type !== 5) return undefined;
    const out: number[] = [];
    for (let i = 0; i < entry.count; i += 1) {
      const at = entry.valueOffset + i * 8;
      if (at + 8 > tiff.byteLength) return undefined;
      const denominator = u32(at + 4);
      out.push(denominator === 0 ? 0 : u32(at) / denominator);
    }
    return out;
  };

  const result: PhotoExif = {};
  const ifd0 = readIfd(u32(4));

  const exifPointer = ifd0.get(TAG_EXIF_IFD);
  const exifIfd = exifPointer ? readIfd(u32(exifPointer.valueOffset)) : new Map<number, Entry>();
  const stamp = ascii(exifIfd.get(TAG_DATETIME_ORIGINAL)) ?? ascii(ifd0.get(TAG_DATETIME));
  const match = stamp?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (match && match[1] !== '0000') {
    result.takenAt = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
  }

  const gpsPointer = ifd0.get(TAG_GPS_IFD);
  if (gpsPointer) {
    const gps = readIfd(u32(gpsPointer.valueOffset));
    const toDegrees = (parts?: number[]) =>
      parts && parts.length >= 3 ? parts[0] + parts[1] / 60 + parts[2] / 3600 : undefined;
    const lat = toDegrees(rationals(gps.get(GPS_LAT)));
    const lng = toDegrees(rationals(gps.get(GPS_LNG)));
    if (lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      result.lat = ascii(gps.get(GPS_LAT_REF))?.toUpperCase() === 'S' ? -lat : lat;
      result.lng = ascii(gps.get(GPS_LNG_REF))?.toUpperCase() === 'W' ? -lng : lng;
    }
    const direction = rationals(gps.get(GPS_IMG_DIRECTION))?.[0];
    if (direction !== undefined && Number.isFinite(direction)) result.heading = Math.round(direction) % 360;
  }
  return result;
};

/** Read EXIF from a picked file. Never throws. */
export const readPhotoExif = async (file: Blob): Promise<PhotoExif> => {
  try {
    // EXIF lives in the first 64 KB of a JPEG.
    return parseExif(await file.slice(0, 128 * 1024).arrayBuffer());
  } catch {
    return {};
  }
};
