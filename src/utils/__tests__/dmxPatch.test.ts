import { describe, it, expect } from 'vitest';
import {
  autoPatchFixtures,
  collectFixturePatches,
  dmxChannelsForFixture,
  findConflicts,
  findFreeRange,
  fixtureLabel,
  fixtureRoleLabel,
  isDmxFixture,
  nextFreeAddress,
  previewFixturePlacement,
  sortedPatchRows,
  universeOccupancy,
} from '../dmxPatch';
import type { FixturePatch } from '../dmxPatch';
import type { LightElement, LightFixtureType } from '../../types';

let idCounter = 0;
const makeLight = (
  fixtureType: LightFixtureType,
  dmx?: { universe?: number; address?: number }
): LightElement => ({
  id: `light-test-${++idCounter}`,
  type: 'light',
  x: 0,
  y: 0,
  rotation: 0,
  name: `${fixtureType} ${idCounter}`,
  fixtureType,
  colorTemp: 5600,
  intensity: 100,
  beamAngle: 40,
  throwDistance: 300,
  dmxUniverse: dmx?.universe,
  dmxAddress: dmx?.address,
  dmxChannelCount: ({ fresnel: 1, led_panel: 4, spotlight: 16, kino_flo: 2 } as Partial<Record<LightFixtureType, number>>)[fixtureType] ??
    (['reflector', 'c_stand_flag', 'tripod', 'flag_solid', 'flag_silk', 'flag_net', 'flag_cutter', 'overhead_diffusion'].includes(fixtureType) ? undefined : 1),
});

const makePatch = (
  fixtureType: LightFixtureType,
  universe: number | undefined,
  address: number | undefined,
  channelsOverride?: number
): FixturePatch => {
  const base = collectFixturePatches([makeLight(fixtureType, { universe, address })])[0];
  return channelsOverride !== undefined ? { ...base, channels: channelsOverride } : base;
};

describe('dmxChannelsForFixture', () => {
  it('uses only the explicit selected-mode footprint', () => {
    const light = makeLight('spotlight');
    expect(dmxChannelsForFixture(light)).toBe(16);
    expect(dmxChannelsForFixture({ ...light, dmxChannelCount: 24 })).toBe(24);
  });

  it('keeps a controllable fixture footprint unknown until its mode is configured', () => {
    const unknownType = 'future_moving_head' as LightFixtureType;
    expect(dmxChannelsForFixture(unknownType)).toBeUndefined();
    expect(isDmxFixture(unknownType)).toBe(true);
  });

  it('marks grip/non-emitting items explicitly as non-DMX', () => {
    expect(dmxChannelsForFixture('reflector')).toBe(0);
    expect(isDmxFixture('flag_solid')).toBe(false);
  });

  it('lets an explicit footprint override the non-DMX type default', () => {
    // Linking a catalogue fixture to an element still typed as a bounce is a
    // statement that it is now a controllable fixture; the patch bay has to
    // see it rather than filtering it out on the stale type.
    const bounce = { ...makeLight('reflector'), dmxChannelCount: 8 };
    expect(dmxChannelsForFixture(bounce)).toBe(8);
    expect(isDmxFixture(bounce)).toBe(true);
  });
});

describe('fixtureLabel', () => {
  /**
   * A patch sheet is read at a console by somebody deciding what a footprint
   * belongs to. "Key" does not say whether that is 8 channels of L7-C or 20 of
   * Orbiter, so the fixture itself leads and the production's nickname follows.
   */
  it('names the fixture, not the nickname the production gave it', () => {
    const light = { ...makeLight('led_panel'), name: 'Key', brand: 'ARRI', fixtureModel: 'SkyPanel S60-C' };
    expect(fixtureLabel(light)).toBe('ARRI SkyPanel S60-C');
    expect(fixtureRoleLabel(light)).toBe('Key');
  });

  it('uses the model alone when no brand is recorded', () => {
    const light = { ...makeLight('led_panel'), name: 'Rim', brand: undefined, fixtureModel: 'Titan Tube' };
    expect(fixtureLabel(light)).toBe('Titan Tube');
  });

  it('falls back to the plan label when no catalogue fixture was chosen', () => {
    const light = { ...makeLight('led_panel'), name: 'Practical 3', brand: undefined, fixtureModel: undefined };
    expect(fixtureLabel(light)).toBe('Practical 3');
    // Nothing extra to add: the label IS the name, so a row never prints it twice.
    expect(fixtureRoleLabel(light)).toBeUndefined();
  });

  it('falls back to the fixture type for a light with no name at all', () => {
    const light = { ...makeLight('led_panel'), name: '', brand: undefined, fixtureModel: undefined };
    expect(fixtureLabel(light)).toBe('led_panel');
    expect(fixtureRoleLabel(light)).toBeUndefined();
  });

  it('ignores a brand with no model rather than naming a row "ARRI"', () => {
    const light = { ...makeLight('led_panel'), name: 'Key', brand: 'ARRI', fixtureModel: undefined };
    expect(fixtureLabel(light)).toBe('Key');
  });

  it('carries both onto the patch row', () => {
    const [patch] = collectFixturePatches([
      { ...makeLight('spotlight'), name: 'Key', brand: 'ARRI', fixtureModel: 'L7-C' },
    ]);
    expect(patch).toMatchObject({ label: 'ARRI L7-C', role: 'Key' });
    expect(sortedPatchRows([patch])[0]).toMatchObject({ label: 'ARRI L7-C', role: 'Key' });
  });
});

describe('collectFixturePatches', () => {
  it('carries universe/address from the light element and flags dmxability', () => {
    const patches = collectFixturePatches([
      makeLight('spotlight', { universe: 2, address: 33 }),
      makeLight('flag_solid'),
    ]);
    expect(patches[0]).toMatchObject({ universe: 2, address: 33, channels: 16, dmxable: true });
    expect(patches[1]).toMatchObject({ universe: undefined, address: undefined, channels: 0, dmxable: false });
  });
});

describe('autoPatchFixtures', () => {
  it('allocates sequential footprints without overlap', () => {
    const patches = collectFixturePatches([
      makeLight('led_panel'),
      makeLight('led_panel'),
      makeLight('fresnel'),
    ]);
    const assigned = autoPatchFixtures(patches, 1, 1);
    expect(assigned[0]).toEqual({ universe: 1, address: 1 });
    expect(assigned[1]).toEqual({ universe: 1, address: 5 });
    expect(assigned[2]).toEqual({ universe: 1, address: 9 });
  });

  it('does not assign a DMX patch to non-DMX fixtures', () => {
    const patches = collectFixturePatches([
      makeLight('flag_solid'),
      makeLight('led_panel'),
    ]);
    const assigned = autoPatchFixtures(patches, 1, 1);
    expect(assigned[0].universe).toBeUndefined();
    expect(assigned[0].address).toBeUndefined();
    expect(assigned[1]).toEqual({ universe: 1, address: 1 });
  });

  it('moves a footprint that would cross channel 512 to the next universe instead of wrapping', () => {
    // 16ch spotlight cannot fit at address 500 (would end at 515)
    const patches = collectFixturePatches([makeLight('spotlight')]);
    const assigned = autoPatchFixtures(patches, 1, 500);
    expect(assigned[0]).toEqual({ universe: 2, address: 1 });
  });

  it('spills into the next universe exactly at the 512 boundary', () => {
    // 128 x 4ch = 512 channels fills universe 1 exactly
    const patches = collectFixturePatches(
      Array.from({ length: 129 }, () => makeLight('led_panel'))
    );
    const assigned = autoPatchFixtures(patches, 1, 1);
    expect(assigned[127]).toEqual({ universe: 1, address: 509 });
    expect(assigned[128]).toEqual({ universe: 2, address: 1 });
  });

  it('clamps invalid start addresses to valid values', () => {
    const patches = collectFixturePatches([makeLight('fresnel')]);
    expect(autoPatchFixtures(patches, 1, 0)[0]).toEqual({ universe: 1, address: 1 });
    expect(autoPatchFixtures(patches, 1, -5)[0]).toEqual({ universe: 1, address: 1 });
    expect(autoPatchFixtures(patches, 1, 600)[0].address).toBeLessThanOrEqual(512);
    expect(autoPatchFixtures(patches, 0, 1)[0].universe).toBeGreaterThanOrEqual(1);
    expect(autoPatchFixtures(patches, -3, 1)[0].universe).toBeGreaterThanOrEqual(1);
  });

  it('never assigns a footprint larger than one universe on top of itself', () => {
    // Defensive: even a pathological footprint must land at a defined position
    const patches = [makePatch('spotlight', undefined, undefined, 600)];
    const assigned = autoPatchFixtures(patches, 1, 1);
    expect(assigned[0].universe).toBeGreaterThanOrEqual(1);
    expect(assigned[0].address).toBeGreaterThanOrEqual(1);
  });
});

describe('nextFreeAddress', () => {
  it('returns 1 on an empty universe', () => {
    expect(nextFreeAddress([], 1, 4)).toEqual({ address: 1 });
  });

  it('appends after the last occupied range', () => {
    const patches = [makePatch('spotlight', 1, 1)];
    expect(nextFreeAddress(patches, 1, 4)).toEqual({ address: 17 });
  });

  it('fits into a gap before appending', () => {
    const patches = [
      makePatch('spotlight', 1, 1), // 1-16
      makePatch('spotlight', 1, 30), // 30-45
    ];
    // Gap 17-29 fits 8 channels
    expect(nextFreeAddress(patches, 1, 8)).toEqual({ address: 17 });
    // Gap 17-29 does not fit 16 channels -> append after 45
    expect(nextFreeAddress(patches, 1, 16)).toEqual({ address: 46 });
  });

  it('skips gaps that are too small instead of overlapping', () => {
    const patches = [
      makePatch('fresnel', 1, 1), // 1
      makePatch('spotlight', 1, 10), // 10-25
      makePatch('spotlight', 1, 30), // 30-45
    ];
    // Gap 2-9 is 8 wide: fits 8ch at 2, but 16ch must go to 46
    expect(nextFreeAddress(patches, 1, 8)).toEqual({ address: 2 });
    expect(nextFreeAddress(patches, 1, 16)).toEqual({ address: 46 });
  });

  it('ignores invalid stored addresses (0, negative, > 512)', () => {
    const patches = [
      makePatch('fresnel', 1, 0),
      makePatch('fresnel', 1, -4),
      makePatch('fresnel', 1, 513),
      makePatch('spotlight', 1, 1),
    ];
    expect(nextFreeAddress(patches, 1, 4)).toEqual({ address: 17 });
  });

  it('reports explicit failure (null) on universe overflow, never silent overlap', () => {
    // 128 x 4ch fills channels 1-512 exactly
    const full = Array.from({ length: 128 }, () => makePatch('led_panel', 1, undefined));
    const filled = autoPatchFixtures(full, 1, 1).map((a, i) => ({ ...full[i], ...a }));
    expect(nextFreeAddress(filled, 1, 1)).toBeNull();
    expect(nextFreeAddress(filled, 1, 16)).toBeNull();
  });

  it('treats a missing/zero channel count as at least 1 channel', () => {
    expect(nextFreeAddress([], 1, 0)).toEqual({ address: 1 });
  });

  it('only considers the requested universe', () => {
    const patches = [
      makePatch('spotlight', 2, 1),
      makePatch('spotlight', 3, 1),
    ];
    expect(nextFreeAddress(patches, 1, 16)).toEqual({ address: 1 });
  });
});

describe('findConflicts', () => {
  it('flags two fixtures whose ranges overlap in the same universe', () => {
    const patches = [
      makePatch('spotlight', 1, 1), // 1-16
      makePatch('led_panel', 1, 14), // 14-17 overlaps
    ];
    const result = findConflicts(patches);
    expect(result[0].conflict).toBe(true);
    expect(result[1].conflict).toBe(true);
  });

  it('does not flag adjacent or disjoint ranges', () => {
    const patches = [
      makePatch('spotlight', 1, 1), // 1-16
      makePatch('spotlight', 1, 17), // 17-32
    ];
    const result = findConflicts(patches);
    expect(result[0].conflict).toBe(false);
    expect(result[1].conflict).toBe(false);
  });

  it('does not flag identical ranges in different universes', () => {
    const patches = [
      makePatch('spotlight', 1, 1),
      makePatch('spotlight', 2, 1),
    ];
    const result = findConflicts(patches);
    expect(result.every((p) => !p.conflict)).toBe(true);
  });

  it('detects a collision caused by a mode change growing a footprint', () => {
    // Two 8ch fixtures patched back to back; one grows to 16ch (mode change)
    const grown = makePatch('spotlight', 1, 1, 16); // was 8ch at patch time
    const neighbour = makePatch('spotlight', 1, 9, 8);
    const result = findConflicts([grown, neighbour]);
    expect(result[0].conflict).toBe(true);
    expect(result[1].conflict).toBe(true);
  });

  it('flags a footprint that crosses the 512 channel boundary', () => {
    const patches = [makePatch('spotlight', 1, 505)]; // 505-520 invalid
    const result = findConflicts(patches);
    expect(result[0].conflict).toBe(true);
  });

  it('flags invalid addresses (0, negative, > 512) as conflicts', () => {
    const patches = [
      makePatch('spotlight', 1, 0),
      makePatch('spotlight', 1, -2),
      makePatch('spotlight', 1, 513),
    ];
    const result = findConflicts(patches);
    expect(result.map((p) => p.conflict)).toEqual([true, true, true]);
  });

  it('never flags non-DMX fixtures', () => {
    const patches = [makePatch('flag_solid', 1, 1)];
    const result = findConflicts(patches);
    expect(result[0].conflict).toBe(false);
  });
});

describe('universeOccupancy', () => {
  it('expands patched footprints into occupied 1-based channel numbers', () => {
    const patches = [
      makePatch('fresnel', 1, 2), // channel 2
      makePatch('led_panel', 1, 5), // 5-8
      makePatch('led_panel', 2, 1), // other universe
      makePatch('fresnel', 1, 0), // invalid, ignored
    ];
    expect(universeOccupancy(patches, 1).sort((a, b) => a - b)).toEqual([2, 5, 6, 7, 8]);
    expect(universeOccupancy(patches, 2)).toEqual([1, 2, 3, 4]);
  });
});

describe('findFreeRange', () => {
  it('returns 1 on an empty universe', () => {
    expect(findFreeRange([], 4)).toBe(1);
  });

  it('honours a preferred start address when the range is free', () => {
    const occupied = universeOccupancy([makePatch('spotlight', 1, 1)], 1); // 1-16
    expect(findFreeRange(occupied, 4, 17)).toBe(17);
  });

  it('falls back to the earliest fitting gap when the preferred start is blocked', () => {
    const occupied = universeOccupancy([makePatch('spotlight', 1, 10)], 1); // 10-25
    expect(findFreeRange(occupied, 4, 15)).toBe(1);
  });

  it('fits into gaps before appending', () => {
    const occupied = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 30, 31, 32];
    expect(findFreeRange(occupied, 4)).toBe(13);
  });

  it('allocates the exact tail of the universe', () => {
    const occupied = Array.from({ length: 509 }, (_, i) => i + 1); // 1-509
    expect(findFreeRange(occupied, 3)).toBe(510);
    expect(findFreeRange(occupied, 4)).toBeNull();
  });

  it('returns null on universe overflow instead of wrapping past 512', () => {
    const occupied = Array.from({ length: 512 }, (_, i) => i + 1);
    expect(findFreeRange(occupied, 1)).toBeNull();
  });

  it('treats a zero/unknown channel count as a single channel', () => {
    expect(findFreeRange([], 0)).toBe(1);
  });

  it('clamps an out-of-range preferred start to the valid search space', () => {
    // Out-of-range preferences are discarded, not honoured past channel 512
    expect(findFreeRange([], 4, 0)).toBe(1);
    expect(findFreeRange([], 4, 600)).toBe(1);
    expect(findFreeRange([1, 2, 3, 4], 4, 600)).toBe(5);
  });
});

describe('previewFixturePlacement', () => {
  it('accepts an empty range and reports the full footprint', () => {
    const moving = makePatch('led_panel', undefined, undefined);
    expect(previewFixturePlacement([moving], moving.light.id, 1, 20)).toMatchObject({
      address: 20,
      end: 23,
      channels: 4,
      fits: true,
    });
  });

  it('excludes the fixture being moved but blocks another fixture footprint', () => {
    const moving = makePatch('led_panel', 1, 1);
    const occupied = makePatch('spotlight', 1, 20); // 20-35
    expect(previewFixturePlacement([moving, occupied], moving.light.id, 1, 1).fits).toBe(true);
    expect(previewFixturePlacement([moving, occupied], moving.light.id, 1, 20)).toMatchObject({ fits: false, issue: 'overlap' });
  });

  it('does not allow unknown footprints or placements past channel 512', () => {
    const unknown = makePatch('spotlight', undefined, undefined, undefined);
    const known = makePatch('spotlight', undefined, undefined);
    expect(previewFixturePlacement([{ ...unknown, channels: undefined }], unknown.light.id, 1, 1)).toMatchObject({
      fits: false,
      issue: 'unknown_footprint',
    });
    expect(previewFixturePlacement([known], known.light.id, 1, 500)).toMatchObject({
      fits: false,
      issue: 'outside_universe',
    });
  });
});

describe('sortedPatchRows (printable patch sheet)', () => {
  it('orders rows by universe then address and trails unpatched fixtures last', () => {
    const patches = [
      makePatch('led_panel', 2, 10),
      makePatch('fresnel', 1, 20),
      makePatch('spotlight', undefined, undefined),
      makePatch('kino_flo', 1, 5),
    ];
    const rows = sortedPatchRows(findConflicts(patches));
    // Unpatched fixture is still listed (with unknown address) at the end.
    expect(rows).toHaveLength(4);
    const order = rows.map((row) => `${row.universe ?? '—'}:${row.address ?? '—'}`);
    expect(order).toEqual(['1:5', '1:20', '2:10', '—:—']);
  });

  it('computes inclusive end addresses clamped to the universe', () => {
    const rows = sortedPatchRows(findConflicts([makePatch('spotlight', 1, 505)]));
    expect(rows[0].endAddress).toBe(512);
    expect(rows[0].conflict).toBe(true);
  });

  it('omits non-DMX grip entirely from the sheet', () => {
    const rows = sortedPatchRows([makePatch('flag_solid', 1, 1)]);
    expect(rows).toHaveLength(0);
  });
});
