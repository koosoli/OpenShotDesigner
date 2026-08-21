import { LightElement, LightFixtureType } from '../types';

/** A DMX universe always has exactly 512 channels, addressed 1-based. */
export const DMX_CHANNELS_PER_UNIVERSE = 512;

/** Grip and passive modifiers that cannot consume DMX addresses. */
const NON_DMX_TYPES = new Set<LightFixtureType>([
  'reflector',
  'c_stand_flag',
  'tripod',
  'flag_solid',
  'flag_silk',
  'flag_net',
  'flag_cutter',
  'overhead_diffusion',
]);

/**
 * Explicit fixture-mode footprint. Passive modifiers return 0; controllable
 * fixtures without configured mode data remain unknown (undefined).
 */
export const dmxChannelsForFixture = (fixture: LightElement | LightFixtureType): number | undefined => {
  const fixtureType = typeof fixture === 'string' ? fixture : fixture.fixtureType;
  if (NON_DMX_TYPES.has(fixtureType)) return 0;
  if (typeof fixture !== 'string' && Number.isFinite(fixture.dmxChannelCount) && (fixture.dmxChannelCount ?? 0) > 0) {
    return Math.floor(fixture.dmxChannelCount!);
  }
  return undefined;
};

export const isDmxFixture = (fixture: LightElement | LightFixtureType): boolean => dmxChannelsForFixture(fixture) !== 0;

export interface FixturePatch {
  light: LightElement;
  universe?: number;
  address?: number;
  channels?: number;
  dmxable: boolean;
  /** Human-readable fixture label (name, model or fixture type). */
  label: string;
  /** True when this fixture's universe+address range overlaps another's or is invalid. */
  conflict: boolean;
}

export type FixturePlacementIssue = 'fixture_not_found' | 'unknown_footprint' | 'invalid_address' | 'outside_universe' | 'overlap';

/** The result of trying to place a fixture footprint at a particular DMX address. */
export interface FixturePlacementPreview {
  address: number;
  end: number | undefined;
  channels: number | undefined;
  fits: boolean;
  issue?: FixturePlacementIssue;
}

export const fixtureLabel = (light: LightElement): string =>
  light.name ||
  light.fixtureModel ||
  (light.brand ? `${light.brand} ${light.fixtureModel || ''}`.trim() : light.fixtureType) ||
  light.fixtureType;

export const collectFixturePatches = (elements: LightElement[]): FixturePatch[] => {
  return elements.map((light) => {
    const channels = dmxChannelsForFixture(light);
    return {
      light,
      universe: light.dmxUniverse,
      address: light.dmxAddress,
      channels,
      dmxable: channels !== 0,
      label: fixtureLabel(light),
      conflict: false,
    };
  });
};

interface OccupiedRange {
  start: number;
  end: number;
}

const clampChannelCount = (channels: number): number =>
  Number.isFinite(channels) ? Math.max(1, Math.floor(channels)) : 1;

/** True when address is a valid 1-based DMX start address. */
const isValidStartAddress = (address: number | undefined): address is number =>
  typeof address === 'number' && Number.isFinite(address) && address >= 1 && address <= DMX_CHANNELS_PER_UNIVERSE;

/**
 * Sorted, clamped occupied ranges of a universe derived from patched fixtures.
 * Ranges are clamped to 1..512; fixtures without a valid start address are ignored.
 */
const occupiedRanges = (patches: FixturePatch[], universe: number): OccupiedRange[] =>
  patches
    .filter(
      (p) =>
        p.dmxable &&
        p.universe === universe &&
        isValidStartAddress(p.address) &&
        typeof p.channels === 'number'
    )
    .map((p) => ({
      start: p.address!,
      end: Math.min(DMX_CHANNELS_PER_UNIVERSE, p.address! + clampChannelCount(p.channels!) - 1),
    }))
    .sort((a, b) => a.start - b.start);

/**
 * Assign universe+address sequentially to every DMX-able fixture.
 * Non-DMX fixtures receive no assignment (undefined universe/address).
 * A footprint that would cross the channel-512 boundary starts on the next
 * universe instead of silently wrapping.
 */
export const autoPatchFixtures = (
  patches: FixturePatch[],
  startUniverse = 1,
  startAddress = 1
): { universe: number | undefined; address: number | undefined }[] => {
  let universe = Number.isFinite(startUniverse) ? Math.max(1, Math.floor(startUniverse)) : 1;
  let address = isValidStartAddress(startAddress) ? startAddress : 1;
  return patches.map((p) => {
    if (!p.dmxable || p.channels === undefined) return { universe: undefined, address: undefined };
    const channels = clampChannelCount(p.channels);
    // Footprint must fit entirely within the current universe; otherwise skip
    // to the next universe rather than wrapping past channel 512.
    if (address + channels - 1 > DMX_CHANNELS_PER_UNIVERSE) {
      universe += 1;
      address = 1;
    }
    const assigned = { universe, address };
    address += channels;
    return assigned;
  });
};

/** Flag fixtures whose (universe, address..address+channels) ranges overlap or are invalid. */
export const findConflicts = (patches: FixturePatch[]): FixturePatch[] => {
  const withConflict = patches.map((p) => ({ ...p, conflict: false }));
  for (const p of withConflict) {
    if (!p.dmxable) continue;
    if (p.universe === undefined && p.address === undefined) continue;
    // Invalid placement: missing/out-of-range start address or footprint
    // crossing the universe boundary (e.g. after a mode change grew the
    // footprint). Flagged so it surfaces in the UI instead of failing silently.
    if (!isValidStartAddress(p.address) || p.channels === undefined) {
      p.conflict = true;
      continue;
    }
    if (p.address + clampChannelCount(p.channels) - 1 > DMX_CHANNELS_PER_UNIVERSE) {
      p.conflict = true;
    }
  }
  for (let i = 0; i < withConflict.length; i++) {
    const a = withConflict[i];
    if (!a.dmxable || !a.universe || !isValidStartAddress(a.address)) continue;
    for (let j = i + 1; j < withConflict.length; j++) {
      const b = withConflict[j];
      if (!b.dmxable || !b.universe || !isValidStartAddress(b.address) || a.channels === undefined || b.channels === undefined) continue;
      if (a.universe !== b.universe) continue;
      const aEnd = a.address + clampChannelCount(a.channels) - 1;
      const bEnd = b.address + clampChannelCount(b.channels) - 1;
      const overlap = a.address <= bEnd && b.address <= aEnd;
      if (overlap) {
        a.conflict = true;
        b.conflict = true;
      }
    }
  }
  return withConflict;
};

/**
 * Next free address on a universe that fits `channels` consecutive channels,
 * filling gaps before appending. Returns null on universe overflow — never an
 * overlapping address.
 */
export const nextFreeAddress = (
  patches: FixturePatch[],
  universe: number,
  channels = 1
): { address: number } | null => {
  const wanted = clampChannelCount(channels);
  const ranges = occupiedRanges(patches, universe);

  let cursor = 1;
  for (const o of ranges) {
    if (o.start - cursor >= wanted) break; // gap before this range fits
    cursor = Math.max(cursor, o.end + 1);
  }
  if (cursor + wanted - 1 > DMX_CHANNELS_PER_UNIVERSE) return null;
  return { address: cursor };
};

/**
 * Expand every validly patched fixture of a universe into its occupied
 * 1-based channel numbers (clamped to 1..512). Useful input for findFreeRange.
 */
export const universeOccupancy = (patches: FixturePatch[], universe: number): number[] => {
  const channels: number[] = [];
  for (const o of occupiedRanges(patches, universe)) {
    for (let ch = o.start; ch <= o.end; ch++) channels.push(ch);
  }
  return channels;
};

/**
 * Find the first free range of `channelCount` consecutive channels in a
 * universe given its occupied channel numbers (1-based, unordered, duplicates
 * harmless). Prefers `preferredStart` when that exact range is free; otherwise
 * returns the earliest fitting gap (gap-fitting before appending). Returns the
 * 1-based start address, or null when nothing fits (universe overflow).
 */
export const findFreeRange = (
  universe: number[],
  channelCount: number,
  preferredStart?: number
): number | null => {
  const wanted = clampChannelCount(channelCount);
  const occupied = new Set(
    universe.filter((ch) => Number.isFinite(ch) && ch >= 1 && ch <= DMX_CHANNELS_PER_UNIVERSE)
  );

  const fitsAt = (start: number): boolean => {
    for (let ch = start; ch < start + wanted; ch++) {
      if (occupied.has(ch)) return false;
    }
    return true;
  };

  if (
    preferredStart !== undefined &&
    isValidStartAddress(preferredStart) &&
    preferredStart + wanted - 1 <= DMX_CHANNELS_PER_UNIVERSE &&
    fitsAt(preferredStart)
  ) {
    return preferredStart;
  }

  for (let start = 1; start + wanted - 1 <= DMX_CHANNELS_PER_UNIVERSE; start++) {
    if (fitsAt(start)) return start;
  }
  return null;
};

/**
 * Validate a proposed patch placement without mutating project data. The
 * fixture being moved is excluded from occupancy so an existing block can be
 * dragged to a new address in its own universe.
 */
export const previewFixturePlacement = (
  patches: FixturePatch[],
  fixtureId: string,
  universe: number,
  address: number
): FixturePlacementPreview => {
  const target = patches.find((patch) => patch.light.id === fixtureId);
  if (!target || !target.dmxable) return { address, end: undefined, channels: undefined, fits: false, issue: 'fixture_not_found' };
  if (target.channels === undefined) return { address, end: undefined, channels: undefined, fits: false, issue: 'unknown_footprint' };
  if (!isValidStartAddress(address)) return { address, end: undefined, channels: target.channels, fits: false, issue: 'invalid_address' };

  const channels = clampChannelCount(target.channels);
  const end = address + channels - 1;
  if (end > DMX_CHANNELS_PER_UNIVERSE) return { address, end, channels, fits: false, issue: 'outside_universe' };

  const occupied = new Set(universeOccupancy(patches.filter((patch) => patch.light.id !== fixtureId), universe));
  for (let channel = address; channel <= end; channel++) {
    if (occupied.has(channel)) return { address, end, channels, fits: false, issue: 'overlap' };
  }
  return { address, end, channels, fits: true };
};
