import { LightElement, LightFixtureType } from '../types';

/** Number of DMX channels a fixture type typically consumes. */
const DMX_CHANNELS: Partial<Record<LightFixtureType, number>> = {
  fresnel: 1,
  led_panel: 4, // RGBW
  softbox: 1,
  spotlight: 16, // moving head / automated spot
  tube_light: 4, // RGBW tube
  practical: 1,
  china_ball: 1,
  hmi: 1,
  par_can: 4, // 4-channel RGBW LED par
  kino_flo: 2, // color temperature mix
  reflector: 0,
  c_stand_flag: 0,
  tripod: 0,
  flag_solid: 0,
  flag_silk: 0,
  flag_net: 0,
  flag_cutter: 0,
  overhead_diffusion: 0,
};

export const dmxChannelsForFixture = (fixtureType: LightFixtureType): number => {
  const ch = DMX_CHANNELS[fixtureType];
  if (ch === undefined) return 1;
  return ch;
};

export const isDmxFixture = (fixtureType: LightFixtureType): boolean => dmxChannelsForFixture(fixtureType) > 0;

export interface FixturePatch {
  light: LightElement;
  universe?: number;
  address?: number;
  channels: number;
  dmxable: boolean;
  /** Human-readable fixture label (name, model or fixture type). */
  label: string;
  /** True when this fixture's universe+address range overlaps another's. */
  conflict: boolean;
}

export const fixtureLabel = (light: LightElement): string =>
  light.name ||
  light.fixtureModel ||
  (light.brand ? `${light.brand} ${light.fixtureModel || ''}`.trim() : light.fixtureType) ||
  light.fixtureType;

export const collectFixturePatches = (elements: LightElement[]): FixturePatch[] => {
  return elements.map((light) => {
    const channels = dmxChannelsForFixture(light.fixtureType);
    return {
      light,
      universe: light.dmxUniverse,
      address: light.dmxAddress,
      channels,
      dmxable: channels > 0,
      label: fixtureLabel(light),
      conflict: false,
    };
  });
};

/** Assign universe+address sequentially to every DMX-able fixture. */
export const autoPatchFixtures = (
  patches: FixturePatch[],
  startUniverse = 1,
  startAddress = 1
): { universe: number; address: number }[] => {
  let universe = Math.max(1, Math.min(32, startUniverse));
  let address = Math.max(1, Math.min(512, startAddress));
  return patches.map((p) => {
    if (!p.dmxable) return { universe, address };
    const assigned = { universe, address };
    address += p.channels;
    if (address > 512) {
      universe += 1;
      address = 1;
    }
    return assigned;
  });
};

/** Flag fixtures whose (universe, address..address+channels) ranges overlap. */
export const findConflicts = (patches: FixturePatch[]): FixturePatch[] => {
  const withConflict = patches.map((p) => ({ ...p, conflict: false }));
  for (let i = 0; i < withConflict.length; i++) {
    const a = withConflict[i];
    if (!a.dmxable || !a.universe || !a.address) continue;
    for (let j = i + 1; j < withConflict.length; j++) {
      const b = withConflict[j];
      if (!b.dmxable || !b.universe || !b.address) continue;
      if (a.universe !== b.universe) continue;
      const aEnd = a.address + a.channels - 1;
      const bEnd = b.address + b.channels - 1;
      const overlap = a.address <= bEnd && b.address <= aEnd;
      if (overlap) {
        a.conflict = true;
        b.conflict = true;
      }
    }
  }
  return withConflict;
};

/** Next free address on a universe, scanning up to 512 channels. */
export const nextFreeAddress = (
  patches: FixturePatch[],
  universe: number,
  channels = 1
): { address: number } | null => {
  const occupied = patches
    .filter((p) => p.dmxable && p.universe === universe && !!p.address)
    .map((p) => ({ start: p.address!, end: p.address! + p.channels - 1 }))
    .sort((a, b) => a.start - b.start);

  let cursor = 1;
  for (const o of occupied) {
    if (o.start > cursor) break;
    cursor = Math.max(cursor, o.end + 1);
  }
  if (cursor + channels - 1 > 512) return null;
  return { address: cursor };
};