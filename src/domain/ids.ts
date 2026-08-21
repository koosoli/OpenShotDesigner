/**
 * Central ID service (plan §3.1).
 *
 * Every persistent entity gets its id from here — never hand-roll ids in
 * components or utilities. Backed by `crypto.randomUUID()` with a safe
 * fallback for environments where it is unavailable.
 */

const FALLBACK_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
let fallbackCounter = 0;

const randomFallback = (): string => {
  fallbackCounter = (fallbackCounter + 1) % Number.MAX_SAFE_INTEGER;
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += FALLBACK_ALPHABET[Math.floor(Math.random() * FALLBACK_ALPHABET.length)];
  }
  return `${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${out}`;
};

const uuid = (): string => {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    // Set version/variant bits for a valid-looking v4 UUID.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return randomFallback();
};

/**
 * Create a globally unique id for an entity kind, e.g. `createId("shot")`.
 * Shape: `<prefix>-<uuid>`.
 */
export const createId = (prefix: string): string => `${prefix}-${uuid()}`;

/** True when `id` looks like one produced by {@link createId} (optionally for a given prefix). */
export const isGeneratedId = (id: string, prefix?: string): boolean => {
  if (!prefix) return /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return id.startsWith(`${prefix}-`) && isGeneratedId(id);
};

/** Well-known entity prefixes, kept here so call sites stay consistent. */
export const IdPrefixes = {
  project: 'proj',
  setup: 'setup',
  shot: 'shot',
  camera: 'cam',
  actor: 'actor',
  light: 'light',
  element: 'el',
  waypoint: 'wp',
  pathPoint: 'cpp',
  scriptLine: 'line',
  scriptMark: 'mark',
  avRow: 'av',
  backgroundImage: 'bg',
  equipment: 'eq',
  packageItem: 'pkg',
  location: 'loc',
  person: 'person',
  character: 'char',
  segment: 'seg',
  cue: 'cue',
  productionDay: 'day',
  scheduleBlock: 'block',
  calendarEvent: 'event',
  asset: 'asset',
  comment: 'comment',
  revision: 'rev',
} as const;
