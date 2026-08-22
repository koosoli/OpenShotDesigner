/**
 * Reader for Open Fixture Library's ZIP export (`download.ofl`). Pure enough
 * to run in Node (build script) and in the browser (online refresh): it only
 * needs `Blob`, `DecompressionStream`, `TextDecoder` and typed arrays.
 *
 * Output shape matches the adapter input: `{ manufacturerKey: { fixtureKey: json } }`
 * with `manufacturer` injected from `manufacturers.json`.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const u16 = (bytes: Uint8Array, at: number): number => bytes[at] | (bytes[at + 1] << 8);
const u32 = (bytes: Uint8Array, at: number): number => (u16(bytes, at) | (u16(bytes, at + 2) << 16)) >>> 0;

const inflateRaw = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export const OFL_EXPORT_URL = 'https://open-fixture-library.org/download.ofl';

/** Parse the OFL ZIP export into the adapter's dump shape. Throws on a malformed archive. */
export const readOflExport = async (bytes: Uint8Array): Promise<Record<string, unknown>> => {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Invalid OFL ZIP export (missing central directory)');
  let cursor = u32(bytes, eocd + 16);
  const decoder = new TextDecoder();
  const files = new Map<string, unknown>();
  while (cursor < bytes.length && u32(bytes, cursor) === 0x02014b50) {
    const method = u16(bytes, cursor + 10);
    const compressedSize = u32(bytes, cursor + 20);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const localOffset = u32(bytes, cursor + 42);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const localNameLength = u16(bytes, localOffset + 26);
    const localExtraLength = u16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : undefined;
    if (data && name.endsWith('.json')) {
      try {
        files.set(name, JSON.parse(decoder.decode(data)) as unknown);
      } catch {
        // One corrupt entry must not sink the whole snapshot.
      }
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  const manufacturers = isRecord(files.get('manufacturers.json'))
    ? (files.get('manufacturers.json') as Record<string, unknown>)
    : {};
  const dump: Record<string, unknown> = {};
  for (const [pathName, json] of files) {
    const parts = pathName.split('/');
    if (parts.length !== 2 || !pathName.endsWith('.json') || parts[0] === 'schemas') continue;
    const maker = parts[0];
    if (!isRecord(json)) continue;
    const makerInfo = manufacturers[maker];
    const manufacturer = isRecord(makerInfo) && typeof makerInfo.name === 'string' ? makerInfo.name : maker;
    const group = isRecord(dump[maker]) ? (dump[maker] as Record<string, unknown>) : ((dump[maker] = {}) as Record<string, unknown>);
    group[parts[1].replace(/\.json$/, '')] = { ...json, manufacturer };
  }
  return dump;
};
