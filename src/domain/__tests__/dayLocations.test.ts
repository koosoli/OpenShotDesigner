import { describe, expect, it } from 'vitest';
import { buildStripContextResolver, locationForText, resolveDayLocations, setNameFromLocationText } from '../reports';
import type { Location } from '../locations';
import type { ScheduleBlock } from '../scheduling';

const studio: Location = { id: 'studio', name: 'Kreuzberg Studio', type: 'studio', address: 'Kohlfurter Str. 41', lat: 52.5, lng: 13.4, aliases: ['LIVING ROOM'], referenceAssetIds: [] };
const diner: Location = { id: 'diner', name: "Ruby's Diner", type: 'location', referenceAssetIds: [] };
const locations = [studio, diner];
const setups = [
  { id: 'u1', location: 'INT. LIVING ROOM - NIGHT', shots: [{ id: 's1' }] },
  { id: 'u2', location: "Ruby's Diner", shots: [] },
  { id: 'u3', location: 'EXT. CAR PARK - DAY', shots: [] },
  { id: 'u4', locationId: 'diner', location: 'whatever', shots: [] },
];
const scriptScenes = [{ id: 'sc1', heading: 'INT. LIVING ROOM - DAY' }, { id: 'sc2', heading: 'EXT. BEACH - DUSK' }];
const blocks: ScheduleBlock[] = [
  { id: 'b1', kind: 'setup', setupId: 'u1' },
  { id: 'b2', kind: 'setup', setupId: 'u2' },
  { id: 'b3', kind: 'setup', setupId: 'u3' },
  { id: 'b4', kind: 'setup', setupId: 'u4' },
  { id: 'b5', kind: 'scene', scriptSceneId: 'sc1' },
  { id: 'b6', kind: 'scene', scriptSceneId: 'sc2' },
  { id: 'b7', kind: 'shots', shotIds: ['s1'] },
  { id: 'b8', kind: 'manual', label: 'Lunch' },
];

describe('setNameFromLocationText', () => {
  it('reads the set out of a heading and leaves plain text alone', () => {
    expect(setNameFromLocationText('INT. LIVING ROOM - NIGHT')).toBe('LIVING ROOM');
    expect(setNameFromLocationText("Ruby's Diner")).toBe("Ruby's Diner");
    expect(setNameFromLocationText('  ')).toBeUndefined();
  });
});

describe('locationForText', () => {
  it('resolves by alias through a heading, and by name directly', () => {
    expect(locationForText(locations, 'INT. LIVING ROOM - NIGHT')?.id).toBe('studio');
    expect(locationForText(locations, "ruby's diner")?.id).toBe('diner');
    expect(locationForText(locations, 'EXT. CAR PARK - DAY')).toBeUndefined();
  });
});

describe('resolveDayLocations', () => {
  const out = resolveDayLocations(blocks.map((b) => b.id), blocks, { locations, scriptScenes, setups });

  it('gives a linked or alias-matched set its address and pin, once', () => {
    expect(out[0]).toEqual({ name: 'Kreuzberg Studio', setName: 'LIVING ROOM', address: 'Kohlfurter Str. 41', lat: 52.5, lng: 13.4 });
    // The set name is the handle for changing the link later; a location named directly carries none.
    expect(out[1].setName).toBeUndefined();
    expect(out.filter((l) => l.name === 'Kreuzberg Studio')).toHaveLength(1);
    expect(out.filter((l) => l.name === "Ruby's Diner")).toHaveLength(1);
  });

  it('prints an unlinked set by its name, not its whole heading', () => {
    expect(out.map((l) => l.name)).toEqual(['Kreuzberg Studio', "Ruby's Diner", 'CAR PARK', 'BEACH']);
    expect(out[2].address).toBeUndefined();
  });

  it('ignores unknown blocks and banners', () => {
    expect(resolveDayLocations(['nope', 'b8'], blocks, { locations, scriptScenes, setups })).toEqual([]);
  });
});

describe('strip context through an alias', () => {
  it('a setup whose text names an aliased set prints the canonical location', () => {
    const resolve = buildStripContextResolver({ locations, setups: setups.map((s) => ({ ...s, sceneNumber: '1' })) });
    expect(resolve({ id: 'b', kind: 'setup', setupId: 'u1' })?.location).toBe('Kreuzberg Studio');
    expect(resolve({ id: 'b', kind: 'setup', setupId: 'u3' })?.location).toBe('EXT. CAR PARK - DAY');
  });
});
