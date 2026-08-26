import { describe, expect, it } from 'vitest';
import type { LightElement } from '../../types';
import { deriveSceneEquipment } from '../equipmentList';
import { makeSetup } from './fixtures';

describe('modifier-aware equipment derivation', () => {
  it('adds enabled fixture modifiers to manifests and keeps unknown specs explicit', () => {
    const light: LightElement = {
      id: 'light-1', type: 'light', name: 'Key', x: 0, y: 0, rotation: 0,
      fixtureType: 'led_panel', colorTemp: 5600, intensity: 100, beamAngle: 60, throwDistance: 200,
      modifiers: [
        { id: 'modifier-1', kind: 'softbox', symbolId: 'lighting.modifier.softbox', enabled: true },
        { id: 'modifier-2', kind: 'grid', symbolId: 'lighting.modifier.grid', enabled: false, transmissionPercent: 80 },
      ],
    };
    const items = deriveSceneEquipment(makeSetup({ elements: [light] }));
    expect(items.find((item) => item.id === 'auto-light-light-1')?.specs).toContain('[Softbox]');
    expect(items.find((item) => item.id === 'auto-light-modifier-modifier-1')).toMatchObject({
      category: 'grip', name: 'Softbox', specs: 'Technical values unknown', quantity: 1,
    });
    expect(items.some((item) => item.id === 'auto-light-modifier-modifier-2')).toBe(false);
  });
});
