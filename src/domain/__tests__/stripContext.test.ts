import { describe, expect, it } from 'vitest';
import { buildStripContextResolver } from '../reports';
import type { ScheduleBlock } from '../scheduling';

const DINER = "Ruby's Diner, Backlot Ave";

const sources = {
  scriptScenes: [
    { id: 'sc1', sceneNumber: '1', heading: 'INT. LIVING ROOM - NIGHT', characterIds: [], breakdownItemIds: [] },
    { id: 'sc7', sceneNumber: '7', heading: 'EXT. DINER - DAY', locationId: 'loc-diner', characterIds: [], breakdownItemIds: [] },
  ],
  locations: [{ id: 'loc-diner', name: DINER }],
  setups: [
    { id: 'su1', sceneNumber: '1', location: 'INT. LIVING ROOM - NIGHT', shots: [{ id: 's1a' }, { id: 's1b' }] },
    { id: 'su7', sceneNumber: '7', locationId: 'loc-diner', location: 'Diner', shots: [{ id: 's7a' }] },
    { id: 'suX', shots: [{ id: 'sx' }] },
  ],
};
const resolve = buildStripContextResolver(sources);
const block = (b: ScheduleBlock) => b;

describe('strip context', () => {
  it('gives a scene strip its number and the set from the slugline', () => {
    expect(resolve(block({ id: 'b', kind: 'scene', scriptSceneId: 'sc1' }))).toEqual({
      sceneNumber: '1',
      location: 'LIVING ROOM',
    });
  });

  /** A linked location beats the slugline: it is the one with the address. */
  it('prefers the linked location name when a scene has one', () => {
    expect(resolve(block({ id: 'b', kind: 'scene', scriptSceneId: 'sc7' }))?.location).toBe(DINER);
  });

  it('gives a setup strip its scene and its own location text', () => {
    expect(resolve(block({ id: 'b', kind: 'setup', setupId: 'su1' }))).toEqual({
      sceneNumber: '1',
      location: 'INT. LIVING ROOM - NIGHT',
    });
  });

  it('gives a setup strip the linked location over its free text', () => {
    expect(resolve(block({ id: 'b', kind: 'setup', setupId: 'su7' }))?.location).toBe(DINER);
  });

  /** The reported gap: a shot strip said nothing about its scene or place. */
  it('gives a shot strip the scene and location of the setup that owns it', () => {
    expect(resolve(block({ id: 'b', kind: 'shots', shotIds: ['s1a'] }))).toEqual({
      sceneNumber: '1',
      location: 'INT. LIVING ROOM - NIGHT',
    });
  });

  it('names every scene a mixed shot strip spans rather than picking one', () => {
    expect(resolve(block({ id: 'b', kind: 'shots', shotIds: ['s1a', 's7a'] }))).toEqual({
      sceneNumber: '1, 7',
      location: `INT. LIVING ROOM - NIGHT / ${DINER}`,
    });
  });

  it('returns nothing for strips that have no scene of their own', () => {
    expect(resolve(block({ id: 'b', kind: 'manual', label: 'Lunch' }))).toBeUndefined();
    expect(resolve(block({ id: 'b', kind: 'setup', setupId: 'suX' }))).toBeUndefined();
    expect(resolve(block({ id: 'b', kind: 'shots', shotIds: ['nope'] }))).toBeUndefined();
  });

  it('returns nothing for a strip whose entity is gone, rather than a guess', () => {
    expect(resolve(block({ id: 'b', kind: 'scene', scriptSceneId: 'missing' }))).toBeUndefined();
  });
});
