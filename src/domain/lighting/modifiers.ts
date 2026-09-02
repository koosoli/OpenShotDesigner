import type { LightModifier, LightModifierKind } from './types';

export interface LightModifierDefinition {
  kind: LightModifierKind;
  label: string;
  symbolId: string;
  description: string;
  softensBeam?: boolean;
  hardensBeam?: boolean;
  omniBeam?: boolean;
}

export const LIGHT_MODIFIER_DEFINITIONS: readonly LightModifierDefinition[] = [
  { kind: 'softbox', label: 'Softbox', symbolId: 'lighting.modifier.softbox', description: 'Larger, softer source.', softensBeam: true },
  { kind: 'lantern', label: 'Lantern', symbolId: 'lighting.modifier.lantern', description: 'Omnidirectional soft modifier.', softensBeam: true, omniBeam: true },
  { kind: 'fresnel', label: 'Fresnel attachment', symbolId: 'lighting.modifier.fresnel', description: 'Focusable lens attachment.', hardensBeam: true },
  { kind: 'grid', label: 'Grid', symbolId: 'lighting.modifier.grid', description: 'Controls spill.' , hardensBeam: true },
  { kind: 'eggcrate', label: 'Eggcrate', symbolId: 'lighting.modifier.eggcrate', description: 'Fabric grid controlling spill.', hardensBeam: true },
  { kind: 'gel', label: 'Gel', symbolId: 'lighting.modifier.gel', description: 'Colour or correction gel.' },
  { kind: 'snoot', label: 'Snoot', symbolId: 'lighting.modifier.snoot', description: 'Narrows and controls spill.', hardensBeam: true },
  { kind: 'reflector', label: 'Reflector', symbolId: 'lighting.modifier.reflector', description: 'Reflector or dish attachment.' },
  { kind: 'diffusion', label: 'Diffusion', symbolId: 'lighting.modifier.diffusion', description: 'Diffusion material.', softensBeam: true },
  { kind: 'barn_doors', label: 'Barn doors', symbolId: 'lighting.modifier.barn-doors', description: 'Four-leaf spill control.', hardensBeam: true },
] as const;

export const getLightModifierDefinition = (
  kind: LightModifierKind | string,
): LightModifierDefinition | undefined =>
  LIGHT_MODIFIER_DEFINITIONS.find((definition) => definition.kind === kind);

export const lightModifierSpecs = (modifier: LightModifier): string => {
  const parts: string[] = [];
  if (modifier.beamAngleDeg !== undefined) parts.push(`${modifier.beamAngleDeg}° effective beam`);
  if (modifier.transmissionPercent !== undefined) parts.push(`${modifier.transmissionPercent}% transmission`);
  if (modifier.kind === 'gel' && modifier.colorHex) parts.push(modifier.colorHex.toUpperCase());
  return parts.length > 0 ? parts.join(' · ') : 'Technical values unknown';
};

export interface EffectiveLightAppearance {
  beamAngleDeg: number;
  beamEdge: 'normal' | 'soft' | 'hard';
  omni: boolean;
  colorHex?: string;
}

export const deriveEffectiveLightAppearance = (
  baseBeamAngleDeg: number,
  modifiers: readonly LightModifier[] = [],
): EffectiveLightAppearance => {
  let beamAngleDeg = baseBeamAngleDeg;
  let beamEdge: EffectiveLightAppearance['beamEdge'] = 'normal';
  let omni = false;
  let colorHex: string | undefined;

  for (const modifier of modifiers) {
    if (!modifier.enabled) continue;
    const definition = getLightModifierDefinition(modifier.kind);
    if (modifier.beamAngleDeg !== undefined && Number.isFinite(modifier.beamAngleDeg)) {
      beamAngleDeg = Math.max(1, Math.min(360, modifier.beamAngleDeg));
    }
    if (definition?.softensBeam) beamEdge = 'soft';
    if (definition?.hardensBeam) beamEdge = 'hard';
    if (definition?.omniBeam) omni = true;
    if (modifier.kind === 'gel' && modifier.colorHex) colorHex = modifier.colorHex;
  }

  return { beamAngleDeg, beamEdge, omni, colorHex };
};
