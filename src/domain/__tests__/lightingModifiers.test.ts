import { describe, expect, it } from 'vitest';
import { deriveEffectiveLightAppearance, getLightModifierDefinition } from '../lighting';
import type { LightModifier } from '../lighting';

const modifier = (over: Partial<LightModifier>): LightModifier => ({
  id: 'modifier-1', kind: 'softbox', symbolId: 'lighting.modifier.softbox', enabled: true, ...over,
});

describe('light modifier appearance', () => {
  it('uses explicit modifier beam angles without guessing absent values', () => {
    expect(deriveEffectiveLightAppearance(60, [modifier({ kind: 'grid' })]).beamAngleDeg).toBe(60);
    expect(deriveEffectiveLightAppearance(60, [modifier({ kind: 'snoot', beamAngleDeg: 20 })]).beamAngleDeg).toBe(20);
  });

  it('derives soft, hard, omni, and gel presentation from the enabled stack', () => {
    const result = deriveEffectiveLightAppearance(60, [
      modifier({ kind: 'lantern' }),
      modifier({ id: 'modifier-2', kind: 'gel', colorHex: '#ff0000' }),
    ]);
    expect(result).toMatchObject({ beamEdge: 'soft', omni: true, colorHex: '#ff0000' });
  });

  it('ignores disabled modifiers', () => {
    expect(deriveEffectiveLightAppearance(60, [modifier({ kind: 'lantern', enabled: false })])).toMatchObject({ beamAngleDeg: 60, omni: false });
  });

  it('does not turn an unknown persisted modifier into a softbox', () => {
    const unknown = modifier({ kind: 'future_plugin_modifier' as LightModifier['kind'] });
    expect(getLightModifierDefinition(unknown.kind)).toBeUndefined();
    expect(deriveEffectiveLightAppearance(60, [unknown])).toMatchObject({
      beamAngleDeg: 60,
      beamEdge: 'normal',
      omni: false,
    });
  });
});
