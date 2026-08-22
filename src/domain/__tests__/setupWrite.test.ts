import { describe, expect, it } from 'vitest';
import type { SceneSetup } from '../../types';
import { changedSetupKeys, mergeSetupWrite } from '../plan/setupWrite';

const setup = (over: Partial<SceneSetup> = {}): SceneSetup =>
  ({
    id: 'setup-1',
    name: 'Scene 1',
    sceneNumber: '1',
    location: 'INT. ROOM - DAY',
    timeOfDay: 'Day INT',
    elements: [],
    shots: [],
    currentBeat: 1,
    totalBeats: 1,
    aspectRatio: '16:9',
    canvasScale: 1,
    canvasOffset: { x: 0, y: 0 },
    gridSettings: { size: 30, snap: true, showGrid: false, unit: 'm', pixelsPerUnit: 30 },
    ...over,
  }) as SceneSetup;

describe('changedSetupKeys', () => {
  it('reports nothing when the caller changed nothing', () => {
    const base = setup();
    expect(changedSetupKeys(base, { ...base })).toEqual([]);
  });

  it('reports only the keys whose reference changed', () => {
    const base = setup();
    const next = { ...base, elements: [{ id: 'e1' }] as unknown as SceneSetup['elements'] };
    expect(changedSetupKeys(base, next)).toEqual(['elements']);
  });

  it('treats a rebuilt array with equal contents as changed (identity, not deep equality)', () => {
    const base = setup({ elements: [] });
    const next = { ...base, elements: [] };
    expect(changedSetupKeys(base, next)).toEqual(['elements']);
  });

  it('notices a key that was added or removed', () => {
    const base = setup();
    const added = { ...base, storyboardOrder: ['s1'] } as SceneSetup;
    expect(changedSetupKeys(base, added)).toEqual(['storyboardOrder']);

    const withKey = setup({ storyboardOrder: ['s1'] } as Partial<SceneSetup>);
    const removed = { ...withKey };
    delete (removed as Record<string, unknown>).storyboardOrder;
    expect(changedSetupKeys(withKey, removed as SceneSetup)).toEqual(['storyboardOrder']);
  });
});

describe('mergeSetupWrite', () => {
  it('returns the write as-is when the caller read the current state', () => {
    const base = setup();
    const next = { ...base, totalBeats: 4 };
    expect(mergeSetupWrite(base, base, next)).toBe(next);
  });

  it('keeps a concurrent write to a DIFFERENT key', () => {
    // The regression this exists for: two mutations in one render, each built
    // from the same stale snapshot. Committing the second whole used to wipe
    // the first.
    const base = setup();
    const elements = [{ id: 'e1' }] as unknown as SceneSetup['elements'];
    const afterFirst = { ...base, elements }; // already committed
    const secondWrite = { ...base, totalBeats: 6 }; // built from `base`, not from afterFirst

    const merged = mergeSetupWrite(afterFirst, base, secondWrite);
    expect(merged.totalBeats).toBe(6); // the second write landed
    expect(merged.elements).toBe(elements); // and the first survived
  });

  it('resolves two writes to the SAME key last-write-wins', () => {
    const base = setup();
    const first = { ...base, totalBeats: 2 };
    const second = { ...base, totalBeats: 9 };
    expect(mergeSetupWrite(first, base, second).totalBeats).toBe(9);
  });

  it('leaves the current setup untouched when the caller changed nothing', () => {
    const base = setup();
    const current = { ...base, totalBeats: 3 };
    expect(mergeSetupWrite(current, base, { ...base })).toBe(current);
  });

  it('carries several changed keys across together', () => {
    const base = setup();
    const shots = [{ id: 's1' }] as unknown as SceneSetup['shots'];
    const current = { ...base, name: 'Renamed elsewhere' };
    const write = { ...base, shots, currentBeat: 3 };

    const merged = mergeSetupWrite(current, base, write);
    expect(merged.shots).toBe(shots);
    expect(merged.currentBeat).toBe(3);
    expect(merged.name).toBe('Renamed elsewhere');
  });

  it('removes a key the caller deleted rather than setting it undefined', () => {
    const base = setup({ storyboardOrder: ['s1'] } as Partial<SceneSetup>);
    const current = { ...base, totalBeats: 5 };
    const write = { ...base };
    delete (write as Record<string, unknown>).storyboardOrder;

    const merged = mergeSetupWrite(current, base, write as SceneSetup);
    expect('storyboardOrder' in merged).toBe(false);
    expect(merged.totalBeats).toBe(5);
  });

  it('never mutates the inputs', () => {
    const base = setup();
    const current = { ...base, totalBeats: 2 };
    const frozenCurrent = Object.freeze({ ...current });
    const write = { ...base, currentBeat: 7 };
    expect(() => mergeSetupWrite(frozenCurrent, base, write)).not.toThrow();
    expect(frozenCurrent.currentBeat).toBe(1);
  });
});
