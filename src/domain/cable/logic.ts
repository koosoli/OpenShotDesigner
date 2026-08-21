/**
 * Pure cable domain logic (plan §20): routed lengths, stock-length
 * recommendations, cable manifests and connection compatibility validation.
 *
 * No React, no persistence, no side effects — unit-testable per AGENTS.md.
 * Canonical length unit is meters (src/domain/units.ts).
 */

import type { CableProfile, ConnectorType, SignalType } from './types';
import type { ValidationIssue } from '../validation';
import { issue } from '../validation';
import { convertLength } from '../units';

export interface PointPx {
  x: number;
  y: number;
}

/**
 * Physical length of a routed polyline in meters, including slack.
 *
 * `pixelsPerUnit` is the canvas scale (how many pixels one grid unit spans);
 * `unit` says what physical quantity one grid unit represents. Returns null
 * when the scale is unknown or non-positive — never silently substitutes 0
 * (AGENTS.md rule 13).
 */
export const routeLengthM = (
  pointsPx: Array<PointPx>,
  pixelsPerUnit: number,
  unit: 'm' | 'ft',
  slackPercent = 15,
): number | null => {
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) return null;
  if (pointsPx.length < 2) return 0;

  let px = 0;
  for (let i = 1; i < pointsPx.length; i++) {
    const dx = pointsPx[i].x - pointsPx[i - 1].x;
    const dy = pointsPx[i].y - pointsPx[i - 1].y;
    px += Math.sqrt(dx * dx + dy * dy);
  }

  const units = px / pixelsPerUnit;
  const meters = convertLength(units, unit, 'm');
  return meters * (1 + slackPercent / 100);
};

/** Smallest standard stocked length that covers `requiredM`, else null. */
export const recommendStockLength = (
  requiredM: number,
  standardLengthsM: number[],
): number | null => {
  if (!standardLengthsM || standardLengthsM.length === 0) return null;
  const sorted = [...standardLengthsM].sort((a, b) => a - b);
  for (const len of sorted) {
    if (len >= requiredM) return len;
  }
  return null;
};

export interface ManifestRow {
  profileName: string;
  lengthM: number;
  quantity: number;
}

export interface CableRequirement {
  profile: CableProfile;
  requiredM: number;
}

export interface ManifestOptions {
  /** Project-level override of the stocked lengths, else profile defaults. */
  standardLengthsOverrideM?: number[];
}

const effectiveStandardLengths = (
  profile: CableProfile,
  options?: ManifestOptions,
): number[] => options?.standardLengthsOverrideM ?? profile.standardLengthsM ?? [];

/**
 * Requirements that cannot be satisfied from any stocked length of their
 * profile (no standard lengths defined, or requirement exceeds longest stock).
 */
export const findUnmatchedRequirements = (
  rows: Array<CableRequirement>,
  options?: ManifestOptions,
): Array<CableRequirement> =>
  rows.filter(
    (row) => recommendStockLength(row.requiredM, effectiveStandardLengths(row.profile, options)) === null,
  );

/**
 * Group requirements by profile and map each onto its recommended stock
 * length, summing quantities per (profile, length). Unmatched requirements
 * are excluded here — surface them via `findUnmatchedRequirements`.
 */
export const buildCableManifest = (
  rows: Array<CableRequirement>,
  options?: ManifestOptions,
): ManifestRow[] => {
  const grouped = new Map<string, { profileName: string; lengthM: number; quantity: number }>();

  for (const row of rows) {
    const lengthM = recommendStockLength(row.requiredM, effectiveStandardLengths(row.profile, options));
    if (lengthM === null) continue;
    const key = `${row.profile.id}::${lengthM}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      grouped.set(key, { profileName: row.profile.name, lengthM, quantity: 1 });
    }
  }

  return [...grouped.values()].sort(
    (a, b) => a.profileName.localeCompare(b.profileName) || a.lengthM - b.lengthM,
  );
};

export interface ConnectionEndpointInfo {
  connectorType?: ConnectorType;
  signalType?: SignalType;
  direction?: 'input' | 'output' | 'bidirectional';
}

/**
 * Compatibility warnings between two connection endpoints, optionally against
 * a cable profile. Adapters are always allowed: mismatches are warnings,
 * never errors — nothing here blocks a user from connecting anything.
 */
export const validateConnectionCompatibility = (
  a: ConnectionEndpointInfo,
  b: ConnectionEndpointInfo,
  profile?: CableProfile,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (a.connectorType && b.connectorType && a.connectorType !== b.connectorType) {
    issues.push(
      issue(
        'warning',
        'CABLE_CONNECTOR_MISMATCH',
        `Connector mismatch: ${a.connectorType} → ${b.connectorType}. An adapter is required.`,
      ),
    );
  }

  if (
    (a.direction === 'output' && b.direction === 'output') ||
    (a.direction === 'input' && b.direction === 'input')
  ) {
    issues.push(
      issue(
        'warning',
        'CABLE_DIRECTION_MISMATCH',
        `Both ends are ${a.direction}; expected output → input.`,
      ),
    );
  }

  if (profile?.supportedSignalTypes?.length) {
    for (const [end, label] of [
      [a.signalType, 'End A'],
      [b.signalType, 'End B'],
    ] as const) {
      if (end && !profile.supportedSignalTypes.includes(end)) {
        issues.push(
          issue(
            'warning',
            'CABLE_SIGNAL_NOT_SUPPORTED',
            `${label} signal ${end} is not supported by cable "${profile.name}" (${profile.supportedSignalTypes.join(', ')}).`,
          ),
        );
      }
    }
  }

  return issues;
};
