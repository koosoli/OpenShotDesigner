/**
 * Truss & rigging domain types (plan §11).
 *
 * Planning aid only — never a structural safety certification (rule 15).
 * Canonical units: mm / kg (rule 14). Missing technical data stays
 * `undefined`/`null` — never silently substituted with 0 (rule 13).
 */

export interface TrussProfile {
  id: string;
  manufacturer?: string;
  model?: string;
  geometry: 'box' | 'triangle' | 'ladder' | 'other';
  lengthMm?: number; // canonical mm
  widthMm?: number;
  heightMm?: number;
  selfWeightKg?: number; // canonical kg
  source?: {
    provider?: string;
    sourceId?: string;
    version?: string;
    retrievedAt?: string;
    license?: string;
  };
}

export interface TrussElement {
  id: string;
  /** Optional human label (e.g. "Upstage overhead run"). */
  label?: string;
  profileId?: string;
  x: number;
  y: number;
  rotation: number;
  lengthOverrideMm?: number;
}

export type RiggingItemKind =
  | 'motor'
  | 'hang_point'
  | 'drop'
  | 'clamp'
  | 'safety'
  | 'bridle'
  | 'note';

export interface RiggingItem {
  id: string;
  kind: RiggingItemKind;
  trussElementId?: string;
  /** Along the truss from its origin. */
  positionMm?: number;
  /**
   * User-entered planned load in kg where applicable
   * (motors carry capacity, not load).
   */
  capacityKg?: number;
  label?: string;
  notes?: string;
}

/** Any equipment with known weight can be a planned suspended load — NOT lighting-only (plan §11.5). */
export interface SuspendedLoad {
  id: string;
  trussElementId: string;
  label: string;
  /** Unknown stays undefined — NEVER 0 (rule 13). */
  weightKg?: number;
  quantity: number;
  source?: 'profile' | 'manual' | 'unknown';
}
