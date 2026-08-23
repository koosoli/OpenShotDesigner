/**
 * v21 → v22 adds one optional, absent-safe group:
 *
 *  - `Project.titlePage` — the screenplay's cover (Fountain's standard
 *    title-page keys, plus whether it prints and whether it is a draft).
 *
 * Nothing is backfilled. A project with no cover prints none, which is what
 * every project did before this field existed.
 *
 * Values already present are normalised so the cover never renders `[object
 * Object]` or a stray `true`:
 *  - every text field must be a string; anything else is dropped,
 *  - blank strings are dropped rather than stored as empty,
 *  - `enabled` and `draft` are kept only when they are booleans, and `draft`
 *    is dropped when false, since absent already means "not a draft",
 *  - a cover with nothing left in it is removed entirely.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const TEXT_FIELDS = [
  'title',
  'credit',
  'authors',
  'source',
  'draftLabel',
  'date',
  'contact',
  'copyright',
  'notes',
] as const;

export const normalizeTitlePage = (raw: unknown): UnknownRecord | undefined => {
  if (!isRecord(raw)) return undefined;
  const next: UnknownRecord = {};
  for (const field of TEXT_FIELDS) {
    const value = raw[field];
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) next[field] = value;
  }
  if (typeof raw.enabled === 'boolean') next.enabled = raw.enabled;
  // Absent already means "not a draft", so `false` is stored as nothing.
  if (raw.draft === true) next.draft = true;
  return Object.keys(next).length > 0 ? next : undefined;
};

export const migrateV21ToV22 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 22 };
  const record = project as unknown as UnknownRecord;
  if ('titlePage' in raw) {
    const normalised = normalizeTitlePage(raw.titlePage);
    if (normalised === undefined) delete record.titlePage;
    else record.titlePage = normalised;
  }
  return project;
};
