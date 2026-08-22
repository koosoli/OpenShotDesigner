/**
 * User-authored fixture profiles (plan §17: OFL covers catalog gear; anything
 * missing gets authored locally). Workspace templates stored in localStorage —
 * deliberately NOT project state, mirroring the assemblies pattern (§6.5).
 * Missing technical fields stay undefined (rule 13); nothing is inferred.
 */

import type { FixtureProfile } from './types';

const STORAGE_KEY = 'custom_fixture_profiles_v1';

interface CustomFixtureDraft {
  id?: string;
  manufacturer: string;
  model: string;
  categories?: string;
  weightKg?: number;
  powerWatts?: number;
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  /** One mode per line: "Mode name = channel count" */
  modesText?: string;
}

export interface CustomFixtureProfile extends FixtureProfile {
  source: { provider: 'manual'; sourceId: string } & Record<string, unknown>;
}

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export const parseCustomModes = (modesText: string | undefined): CustomFixtureProfile['modes'] => {
  if (!modesText?.trim()) return [];
  return modesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [rawName, rawCount] = line.split('=');
      const name = (rawName ?? '').trim() || `Mode ${index + 1}`;
      const count = Number((rawCount ?? '').trim());
      return {
        id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `mode-${index + 1}`}`,
        name,
        channelCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
      };
    });
};

export const buildCustomFixtureProfile = (draft: CustomFixtureDraft): CustomFixtureProfile | null => {
  if (!draft.manufacturer.trim() || !draft.model.trim()) return null;
  const dimensions =
    [draft.widthMm, draft.heightMm, draft.depthMm].every(isPositive)
      ? { widthMm: draft.widthMm, heightMm: draft.heightMm, depthMm: draft.depthMm }
      : undefined;
  return {
    id: `manual:${draft.manufacturer.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${draft.model
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}`,
    category: 'lighting',
    manufacturer: draft.manufacturer.trim(),
    model: draft.model.trim(),
    ...(dimensions ? { dimensions } : {}),
    ...(isPositive(draft.weightKg) ? { weightKg: draft.weightKg } : {}),
    ...(isPositive(draft.powerWatts) ? { powerWatts: draft.powerWatts } : {}),
    categories: (draft.categories ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    modes: parseCustomModes(draft.modesText),
    source: { provider: 'manual', sourceId: 'user' },
  };
};

export const loadCustomFixtureProfiles = (): FixtureProfile[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is FixtureProfile => !!(p && typeof p.id === 'string' && typeof p.model === 'string')
    );
  } catch {
    return [];
  }
};

export const saveCustomFixtureProfiles = (profiles: FixtureProfile[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // Storage unavailable — saving degrades silently like assemblies do.
  }
};

export const upsertCustomFixtureProfile = (profile: FixtureProfile): void => {
  const existing = loadCustomFixtureProfiles().filter((p) => p.id !== profile.id);
  saveCustomFixtureProfiles([...existing, profile]);
};

export const deleteCustomFixtureProfile = (id: string): void => {
  saveCustomFixtureProfiles(loadCustomFixtureProfiles().filter((p) => p.id !== id));
};
