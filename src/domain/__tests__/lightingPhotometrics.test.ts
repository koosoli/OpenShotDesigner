import { describe, expect, it } from 'vitest';
import {
  buildPhotometricMarkers,
  calculateIlluminance,
  footCandlesToLux,
  luxToFootCandles,
} from '../lighting';
import type { LightModifier, LightPhotometricReference } from '../lighting';

const reference: LightPhotometricReference = {
  illuminanceLux: 1000,
  distanceMm: 1000,
  referenceIntensityPercent: 100,
  modifierBasis: 'current_modifier_stack',
  sourceKind: 'measured',
};

describe('lighting photometrics', () => {
  it('applies inverse square distance and the explicit linear dimmer approximation', () => {
    const result = calculateIlluminance(reference, 2000, 50);
    expect(result.lux).toBeCloseTo(125);
    expect(result.footCandles).toBeCloseTo(11.61, 1);
    expect(result.warnings[0]).toContain('approximation');
  });

  it('converts lux and foot-candles reversibly', () => {
    expect(footCandlesToLux(luxToFootCandles(1234))).toBeCloseTo(1234);
  });

  it('refuses to invent modifier transmission for a bare-fixture reference', () => {
    const modifier: LightModifier = {
      id: 'modifier-1', kind: 'softbox', symbolId: 'lighting.modifier.softbox', enabled: true,
    };
    const result = calculateIlluminance({ ...reference, modifierBasis: 'bare_fixture' }, 1000, 100, [modifier]);
    expect(result.lux).toBeNull();
    expect(result.warnings.join(' ')).toContain('transmission is unknown');
  });

  it('applies explicitly supplied modifier transmission', () => {
    const modifier: LightModifier = {
      id: 'modifier-1', kind: 'softbox', symbolId: 'lighting.modifier.softbox', enabled: true,
      transmissionPercent: 50,
    };
    const result = calculateIlluminance({ ...reference, modifierBasis: 'bare_fixture' }, 1000, 100, [modifier]);
    expect(result.lux).toBeCloseTo(500);
  });

  it('builds scale-aware markers in metric and imperial plans', () => {
    const metric = buildPhotometricMarkers({ reference, currentIntensityPercent: 100, throwDistancePx: 120, pixelsPerUnit: 40, gridUnit: 'm' });
    const imperial = buildPhotometricMarkers({ reference, currentIntensityPercent: 100, throwDistancePx: 50, pixelsPerUnit: 25, gridUnit: 'ft' });
    expect(metric.map((marker) => marker.distanceMm)).toEqual([1000, 2000, 3000]);
    expect(imperial.map((marker) => marker.distanceMm)).toEqual([304.8, 609.6]);
  });
});
