import { describe, expect, it } from 'vitest';
import { buildStripContextResolver, sluglineHeaderBefore, synthesiseSlugline } from '../reports';
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
      slugline: 'INT. LIVING ROOM - NIGHT',
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
      slugline: 'INT. LIVING ROOM - NIGHT',
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
      slugline: 'INT. LIVING ROOM - NIGHT',
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

describe('sluglines', () => {
  it('a scene strip prints its own heading, number stripped', () => {
    const resolve = buildStripContextResolver({
      scriptScenes: [
        { id: 's1', sceneNumber: '3', heading: 'int. living room - day #3#', characterIds: [], breakdownItemIds: [] },
      ],
    });
    expect(resolve({ id: 'b', kind: 'scene', scriptSceneId: 's1' })?.slugline).toBe('INT. LIVING ROOM - DAY');
  });

  it('a setup without a screenplay synthesises one from its own fields', () => {
    expect(synthesiseSlugline({ location: 'Kitchen', timeOfDay: 'Night INT' })).toBe('INT. KITCHEN - NIGHT');
    expect(synthesiseSlugline({ location: 'Car park', timeOfDay: 'Day EXT' }, 'Bonnevoie car park')).toBe('EXT. BONNEVOIE CAR PARK - DAY');
    // An unknown time of day contributes nothing rather than a guess.
    expect(synthesiseSlugline({ location: 'Stage 2', timeOfDay: 'Continuous' })).toBe('STAGE 2');
    expect(synthesiseSlugline({ location: '   ' })).toBeUndefined();
  });

  it('a mixed shot strip carries no single slugline', () => {
    const resolve = buildStripContextResolver({
      setups: [
        { id: 'u1', sceneNumber: '1', location: 'Kitchen', timeOfDay: 'Day INT', shots: [{ id: 'a' }] },
        { id: 'u2', sceneNumber: '2', location: 'Garden', timeOfDay: 'Day EXT', shots: [{ id: 'b' }] },
      ],
    });
    const mixed = resolve({ id: 'b', kind: 'shots', shotIds: ['a', 'b'] });
    expect(mixed?.sceneNumber).toBe('1, 2');
    expect(mixed?.slugline).toBeUndefined();
    expect(resolve({ id: 'c', kind: 'shots', shotIds: ['a'] })?.slugline).toBe('INT. KITCHEN - DAY');
  });
});

describe('sluglineHeaderBefore', () => {
  const entries = [
    { sceneNumber: '1', slugline: 'INT. KITCHEN - DAY' },
    { sceneNumber: '1', slugline: 'INT. KITCHEN - DAY' },
    { slugline: undefined },
    { sceneNumber: '2', slugline: 'EXT. GARDEN - DAY' },
    { sceneNumber: '1', slugline: 'INT. KITCHEN - DAY' },
  ];
  it('opens a group on the first strip of a heading and not on its siblings', () => {
    expect(sluglineHeaderBefore(entries, 0)).toBe('Sc 1 · INT. KITCHEN - DAY');
    expect(sluglineHeaderBefore(entries, 1)).toBeUndefined();
  });
  it('a banner never opens a group, and a heading that returns opens a fresh one', () => {
    expect(sluglineHeaderBefore(entries, 2)).toBeUndefined();
    expect(sluglineHeaderBefore(entries, 3)).toBe('Sc 2 · EXT. GARDEN - DAY');
    expect(sluglineHeaderBefore(entries, 4)).toBe('Sc 1 · INT. KITCHEN - DAY');
  });
  it('a heading with no number prints the slugline alone', () => {
    expect(sluglineHeaderBefore([{ slugline: 'INT. VAN - NIGHT' }], 0)).toBe('INT. VAN - NIGHT');
  });
});
