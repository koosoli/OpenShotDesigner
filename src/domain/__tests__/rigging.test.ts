import { describe, it, expect } from 'vitest';
import { createId } from '../ids';
import type { RiggingItem, SuspendedLoad, TrussElement, TrussProfile } from '../rigging/types';
import { calculateTrussLoad, SAFETY_DISCLAIMER } from '../rigging/logic';

const truss = (id: string): TrussElement => ({
  id,
  profileId: 'profile-1',
  x: 0,
  y: 0,
  rotation: 0,
});

describe('calculateTrussLoad', () => {
  it('sums known suspended loads × quantity and counts unknown weights separately', () => {
    const t = truss(createId('truss'));
    const loads: SuspendedLoad[] = [
      {
        id: createId('load'),
        trussElementId: t.id,
        label: 'Moving head',
        weightKg: 25,
        quantity: 2,
        source: 'manual',
      },
      {
        id: createId('load'),
        trussElementId: t.id,
        label: 'Mystery prop',
        quantity: 1,
        source: 'unknown',
      },
      {
        id: createId('load'),
        trussElementId: createId('truss'), // other truss — must be ignored
        label: 'Elsewhere',
        weightKg: 100,
        quantity: 1,
        source: 'manual',
      },
    ];
    const result = calculateTrussLoad(t, undefined, loads, []);
    expect(result.loadsKg).toBe(50);
    expect(result.unknownLoadCount).toBe(1);
    expect(result.trussSelfWeightKg).toBeNull();
    expect(result.totalKg).toBeNull();
  });

  it('returns null total when self-weight is unknown (missing data ≠ 0)', () => {
    const t = truss('truss-1');
    const profile: TrussProfile = {
      id: 'profile-1',
      geometry: 'box',
      // selfWeightKg deliberately absent
    };
    const result = calculateTrussLoad(t, profile, [], []);
    expect(result.trussSelfWeightKg).toBeNull();
    expect(result.totalKg).toBeNull();
  });

  it('computes total when self-weight is known', () => {
    const t = truss('truss-1');
    const profile: TrussProfile = { id: 'profile-1', geometry: 'box', selfWeightKg: 12.5 };
    const loads: SuspendedLoad[] = [
      {
        id: createId('load'),
        trussElementId: 'truss-1',
        label: 'LED bar',
        weightKg: 10,
        quantity: 3,
        source: 'profile',
      },
    ];
    const result = calculateTrussLoad(t, profile, loads, []);
    expect(result.trussSelfWeightKg).toBe(12.5);
    expect(result.loadsKg).toBe(30);
    expect(result.totalKg).toBe(42.5);
  });

  it('adds clamp/safety hardware via explicit per-item weights × counts only', () => {
    const t = truss('truss-1');
    const profile: TrussProfile = { id: 'p', geometry: 'box', selfWeightKg: 10 };
    const items: RiggingItem[] = [
      { id: createId('rig'), kind: 'clamp', trussElementId: 'truss-1' },
      { id: createId('rig'), kind: 'clamp', trussElementId: 'truss-1' },
      { id: createId('rig'), kind: 'safety', trussElementId: 'truss-1' },
      { id: createId('rig'), kind: 'motor', trussElementId: 'truss-1', capacityKg: 500 },
      { id: createId('rig'), kind: 'clamp', trussElementId: 'other-truss' },
    ];
    // Without options: no contribution at all.
    const bare = calculateTrussLoad(t, profile, [], items);
    expect(bare.clampsKg).toBe(0);
    expect(bare.totalKg).toBe(10);
    // With options: 2 clamps × 0.8 + 1 safety × 0.15 + cable allowance.
    const withOptions = calculateTrussLoad(t, profile, [], items, {
      clampWeightKg: 0.8,
      safetyWeightKg: 0.15,
      cableAllowanceKg: 5,
    });
    expect(withOptions.clampsKg).toBeCloseTo(1.75, 10);
    expect(withOptions.totalKg).toBeCloseTo(16.75, 10);
  });

  it('exposes the safety disclaimer constant (rule 15)', () => {
    expect(typeof SAFETY_DISCLAIMER).toBe('string');
    expect(SAFETY_DISCLAIMER.length).toBeGreaterThan(0);
    expect(SAFETY_DISCLAIMER).toMatch(/not a structural safety certification/i);
  });
});
