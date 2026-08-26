/**
 * v31 -> v32 introduces ordered light modifier stacks and explicit photometric
 * references. The new fields are absent-safe. Legacy barn-door and diffusion
 * booleans are represented as deterministic modifier records so old plans keep
 * their meaning and appearance.
 */
import type { LightElement, Project, SceneSetup } from '../../types';

type UnknownRecord = Record<string, unknown>;

const migrateLight = (light: LightElement): LightElement => {
  if (light.modifiers !== undefined) return light;
  const modifiers: NonNullable<LightElement['modifiers']> = [];
  if (light.hasBarnDoors) {
    modifiers.push({
      id: `${light.id}-modifier-barn-doors`,
      kind: 'barn_doors',
      symbolId: 'lighting.modifier.barn-doors',
      enabled: true,
    });
  }
  if (light.hasDiffusionGrid) {
    modifiers.push({
      id: `${light.id}-modifier-diffusion`,
      kind: 'diffusion',
      symbolId: 'lighting.modifier.diffusion',
      enabled: true,
    });
  }
  return modifiers.length > 0 ? { ...light, modifiers } : light;
};

export const migrateV31ToV32 = (raw: UnknownRecord): Project => {
  const project = raw as unknown as Project;
  const setups = (project.setups ?? []).map((setup): SceneSetup => ({
    ...setup,
    elements: setup.elements.map((element) => element.type === 'light' ? migrateLight(element) : element),
  }));
  return { ...project, setups, schemaVersion: 32 };
};
