import { describe, expect, it } from 'vitest';
import { linkSetNameToLocation, locationForSetName, unlinkSetName } from '../locations';
import type { Location } from '../locations';

const loc = (id: string, name: string, aliases?: string[]): Location => ({
  id,
  name,
  type: 'location',
  referenceAssetIds: [],
  ...(aliases ? { aliases } : {}),
});

/**
 * The link between a scene heading and a location IS the alias: the breakdown
 * resolves heading text by name and alias, so teaching a location the name the
 * script uses is all a link needs to be.
 */
describe('linking a set name to a location', () => {
  const locations = [loc('a', "Ruby's Diner"), loc('b', 'Warehouse', ['THE OLD DEPOT'])];

  it('adds the script name as an alias', () => {
    const next = linkSetNameToLocation(locations, 'DINER', 'a');
    expect(next[0].aliases).toEqual(['DINER']);
    expect(locationForSetName(next, 'diner')?.id).toBe('a');
  });

  it('needs no alias when the script already uses the location name', () => {
    const next = linkSetNameToLocation(locations, "ruby's diner", 'a');
    expect(next[0]).toBe(locations[0]);
  });

  it('moves a name that answered to another location, so it never resolves twice', () => {
    const next = linkSetNameToLocation(locations, 'the old depot', 'a');
    expect(locationForSetName(next, 'THE OLD DEPOT')?.id).toBe('a');
    expect(next[1].aliases).toBeUndefined();
  });

  it('ignores an unknown location or an empty name', () => {
    expect(linkSetNameToLocation(locations, 'DINER', 'nope')).toEqual(locations);
    expect(linkSetNameToLocation(locations, '   ', 'a')).toEqual(locations);
  });

  it('unlinks by removing the alias and leaves names alone', () => {
    const next = unlinkSetName(locations, 'THE OLD DEPOT');
    expect(next[1].aliases).toBeUndefined();
    expect(locationForSetName(next, 'Warehouse')?.id).toBe('b');
  });
});
