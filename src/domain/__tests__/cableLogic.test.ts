import { describe, expect, it } from 'vitest';

import type { CableProfile } from '../cable/types';
import { DEFAULT_CABLE_PROFILES } from '../cable/profiles';
import {
  buildCableManifest,
  findUnmatchedRequirements,
  recommendStockLength,
  routeLengthM,
  validateConnectionCompatibility,
} from '../cable/logic';

const px = (x: number, y: number) => ({ x, y });

describe('routeLengthM', () => {
  it('returns null when scale is unknown or non-positive', () => {
    expect(routeLengthM([px(0, 0), px(30, 0)], 0, 'm')).toBeNull();
    expect(routeLengthM([px(0, 0), px(30, 0)], -5, 'm')).toBeNull();
    expect(routeLengthM([px(0, 0), px(30, 0)], NaN, 'm')).toBeNull();
  });

  it('computes a known polyline in meters with default 15% slack', () => {
    // 3-4-5 right triangle legs: (0,0)->(300,400) = 500px, ->(600,400) = 300px
    const points = [px(0, 0), px(300, 400), px(600, 400)];
    const meters = routeLengthM(points, 100, 'm');
    expect(meters).not.toBeNull();
    expect(meters!).toBeCloseTo(8 * 1.15, 10);
  });

  it('applies custom slack percent', () => {
    const meters = routeLengthM([px(0, 0), px(0, 100)], 100, 'm', 50);
    expect(meters).toBeCloseTo(1.5, 10);
  });

  it('converts feet grid units to canonical meters', () => {
    // 1 unit = 1 ft; 6 units of straight run with no slack
    const meters = routeLengthM([px(0, 0), px(6, 0)], 1, 'ft', 0);
    expect(meters).toBeCloseTo(6 * 0.3048, 6);
  });

  it('handles degenerate inputs without throwing', () => {
    expect(routeLengthM([], 100, 'm')).toBe(0);
    expect(routeLengthM([px(1, 1)], 100, 'm')).toBe(0);
  });
});

describe('recommendStockLength', () => {
  const stock = [5, 10, 20, 30, 50];

  it('picks the smallest stock length that covers the requirement', () => {
    expect(recommendStockLength(12, stock)).toBe(20);
    expect(recommendStockLength(5, stock)).toBe(5);
    expect(recommendStockLength(49.9, stock)).toBe(50);
  });

  it('returns null when requirement exceeds the longest stock length', () => {
    expect(recommendStockLength(51, stock)).toBeNull();
  });

  it('is robust to unsorted lists and empty lists', () => {
    expect(recommendStockLength(12, [50, 5, 20, 10])).toBe(20);
    expect(recommendStockLength(1, [])).toBeNull();
  });
});

describe('buildCableManifest / findUnmatchedRequirements', () => {
  const sdi: CableProfile = {
    id: 'sdi',
    name: 'SDI 12G',
    standardLengthsM: [5, 10, 25, 50],
  };
  const dmx: CableProfile = {
    id: 'dmx',
    name: 'DMX XLR5',
    standardLengthsM: [1, 5, 10],
  };
  const noStock: CableProfile = {
    id: 'custom',
    name: 'Custom unobtainium link',
  };

  it('groups requirements by profile and recommended stock length', () => {
    const manifest = buildCableManifest([
      { profile: sdi, requiredM: 8 },
      { profile: sdi, requiredM: 9 },
      { profile: sdi, requiredM: 22 },
      { profile: dmx, requiredM: 4 },
    ]);
    expect(manifest).toEqual([
      { profileName: 'DMX XLR5', lengthM: 5, quantity: 1 },
      { profileName: 'SDI 12G', lengthM: 10, quantity: 2 },
      { profileName: 'SDI 12G', lengthM: 25, quantity: 1 },
    ]);
  });

  it('honors project-level standard-length overrides', () => {
    const manifest = buildCableManifest([{ profile: sdi, requiredM: 8 }], {
      standardLengthsOverrideM: [7, 15],
    });
    expect(manifest).toEqual([{ profileName: 'SDI 12G', lengthM: 15, quantity: 1 }]);
  });

  it('reports unmatched requirements separately and excludes them from the manifest', () => {
    const rows = [
      { profile: sdi, requiredM: 80 },
      { profile: noStock, requiredM: 3 },
      { profile: dmx, requiredM: 4 },
    ];
    const unmatched = findUnmatchedRequirements(rows);
    expect(unmatched.map((r) => r.profile.id)).toEqual(['sdi', 'custom']);

    const manifest = buildCableManifest(rows);
    expect(manifest).toEqual([{ profileName: 'DMX XLR5', lengthM: 5, quantity: 1 }]);
  });

  it('respects overrides when deciding unmatched too', () => {
    const unmatched = findUnmatchedRequirements([{ profile: sdi, requiredM: 60 }], {
      standardLengthsOverrideM: [70, 100],
    });
    expect(unmatched).toHaveLength(0);
  });

  it('ships a realistic curated catalog', () => {
    expect(DEFAULT_CABLE_PROFILES.length).toBeGreaterThanOrEqual(12);
    for (const profile of DEFAULT_CABLE_PROFILES) {
      expect(profile.id).toBeTruthy();
      expect(profile.name).toBeTruthy();
      expect(profile.connectorA).toBeDefined();
      expect(profile.connectorB).toBeDefined();
      expect(profile.supportedSignalTypes?.length ?? 0).toBeGreaterThan(0);
      expect(profile.standardLengthsM?.length ?? 0).toBeGreaterThan(0);
      expect(profile.weightPerMeterKg).toBeGreaterThan(0);
    }
  });
});

describe('validateConnectionCompatibility', () => {
  it('warns on connector mismatch but never errors (adapters allowed)', () => {
    const issues = validateConnectionCompatibility(
      { connectorType: 'HDMI' },
      { connectorType: 'BNC' },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', code: 'CABLE_CONNECTOR_MISMATCH' });
  });

  it('stays silent when connectors match or are unknown', () => {
    expect(validateConnectionCompatibility({ connectorType: 'BNC' }, { connectorType: 'BNC' })).toEqual([]);
    expect(validateConnectionCompatibility({}, { connectorType: 'BNC' })).toEqual([]);
  });

  it('warns on output→output and input→input when directions are known', () => {
    const outOut = validateConnectionCompatibility(
      { direction: 'output' },
      { direction: 'output' },
    );
    expect(outOut).toHaveLength(1);
    expect(outOut[0].code).toBe('CABLE_DIRECTION_MISMATCH');

    const inIn = validateConnectionCompatibility(
      { direction: 'input' },
      { direction: 'input' },
    );
    expect(inIn[0].code).toBe('CABLE_DIRECTION_MISMATCH');

    const ok = validateConnectionCompatibility(
      { direction: 'output' },
      { direction: 'input' },
    );
    expect(ok).toEqual([]);
  });

  it('warns when an endpoint signal is not supported by the cable profile', () => {
    const profile: CableProfile = {
      id: 'dmx',
      name: 'DMX XLR5',
      supportedSignalTypes: ['DMX512'],
    };
    const issues = validateConnectionCompatibility(
      { signalType: 'DMX512' },
      { signalType: 'ANALOG_AUDIO' },
      profile,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', code: 'CABLE_SIGNAL_NOT_SUPPORTED' });
    expect(issues[0].message).toContain('End B');
  });

  it('passes clean for fully compatible endpoints against a profile', () => {
    const issues = validateConnectionCompatibility(
      { connectorType: 'XLR5', signalType: 'DMX512', direction: 'output' },
      { connectorType: 'XLR5', signalType: 'DMX512', direction: 'input' },
      { id: 'dmx', name: 'DMX XLR5', supportedSignalTypes: ['DMX512'] },
    );
    expect(issues).toEqual([]);
  });

  it('never returns errors — only warnings', () => {
    const worstCase = validateConnectionCompatibility(
      { connectorType: 'SCHUKO', signalType: 'POWER_AC', direction: 'input' },
      { connectorType: 'CEE63', signalType: 'SDI', direction: 'input' },
      { id: 'x', name: 'X', supportedSignalTypes: ['DMX512'] },
    );
    expect(worstCase.length).toBeGreaterThan(0);
    expect(worstCase.every((i) => i.severity === 'warning')).toBe(true);
  });
});
