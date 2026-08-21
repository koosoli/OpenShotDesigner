import { describe, it, expect } from 'vitest';
import type { Location } from '../locations';
import { createId } from '../ids';

describe('Location', () => {
  it('requires name, type and referenceAssetIds only', () => {
    const loc: Location = {
      id: createId('loc'),
      name: 'Warehouse 7',
      type: 'location',
      referenceAssetIds: [],
    };
    expect(loc.parentLocationId).toBeUndefined();
    expect(loc.referenceAssetIds).toEqual([]);
  });

  it('supports parent/child venue areas', () => {
    const arena: Location = {
      id: createId('loc'),
      name: 'Meridian Arena',
      type: 'arena',
      referenceAssetIds: [],
    };
    const backstage: Location = {
      id: createId('loc'),
      name: 'Backstage',
      type: 'stage',
      parentLocationId: arena.id,
      referenceAssetIds: [],
    };
    expect(backstage.parentLocationId).toBe(arena.id);
  });

  it('supports aliases and contacts', () => {
    const contactId = createId('person');
    const loc: Location = {
      id: createId('loc'),
      name: 'Studio B',
      aliases: ['B', 'The Black Box'],
      type: 'studio',
      contactIds: [contactId],
      address: '12 Kastanienallee, Berlin',
      referenceAssetIds: [createId('asset')],
    };
    expect(loc.aliases).toContain('The Black Box');
    expect(loc.contactIds).toEqual([contactId]);
  });

  it('round-trips parent/alias structure through JSON', () => {
    const arena: Location = {
      id: createId('loc'),
      name: 'Meridian Arena',
      aliases: ['The Meridian'],
      type: 'arena',
      address: '1 Arena Way',
      contactIds: [createId('person')],
      notes: 'Load-in via north ramp',
      masterPlanId: createId('proj'),
      referenceAssetIds: [createId('asset'), createId('asset')],
    };
    const backstage: Location = {
      id: createId('loc'),
      name: 'Backstage',
      type: 'stage',
      parentLocationId: arena.id,
      referenceAssetIds: [],
    };

    const roundTripped: Location[] = JSON.parse(
      JSON.stringify([arena, backstage]),
    ) as Location[];

    expect(roundTripped[0]).toEqual(arena);
    expect(roundTripped[1]).toEqual(backstage);
    expect(roundTripped[1].parentLocationId).toBe(roundTripped[0].id);
    expect(roundTripped[0].aliases).toEqual(['The Meridian']);
    expect(roundTripped[0].referenceAssetIds).toHaveLength(2);
  });
});
