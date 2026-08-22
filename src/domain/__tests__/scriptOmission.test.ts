import { describe, it, expect } from 'vitest';
import {
  isOmittedHeading,
  omitScene,
  omittedSceneLabel,
  removeLineOrOmit,
  restoreScene,
  sceneBodyRange,
} from '../script/omission';
import { deriveScriptBreakdown } from '../script/logic';

interface TestLine { id: string; type: string; text: string; sceneNumber: string; omitted?: boolean; omittedBody?: TestLine[] }

const lines = (): TestLine[] => [
  { id: 'h1', type: 'scene', text: 'INT. KITCHEN - DAY', sceneNumber: '1' },
  { id: 'a1', type: 'action', text: 'Anna pours coffee.', sceneNumber: '1' },
  { id: 'c1', type: 'character', text: 'ANNA', sceneNumber: '1' },
  { id: 'd1', type: 'dialogue', text: 'Morning.', sceneNumber: '1' },
  { id: 'h2', type: 'scene', text: 'EXT. STREET - NIGHT', sceneNumber: '2' },
  { id: 'a2', type: 'action', text: 'Rain.', sceneNumber: '2' },
  { id: 'h3', type: 'scene', text: 'INT. CAR - NIGHT', sceneNumber: '3' },
];

describe('sceneBodyRange', () => {
  it('covers the lines up to the next heading', () => {
    expect(sceneBodyRange(lines(), 'h1')).toEqual({ start: 1, end: 4 });
    expect(sceneBodyRange(lines(), 'h2')).toEqual({ start: 5, end: 6 });
    expect(sceneBodyRange(lines(), 'h3')).toEqual({ start: 7, end: 7 });
  });

  it('returns null for non-headings or unknown ids', () => {
    expect(sceneBodyRange(lines(), 'a1')).toBeNull();
    expect(sceneBodyRange(lines(), 'nope')).toBeNull();
  });
});

describe('omitScene / restoreScene', () => {
  it('removes the body and flags the heading while keeping its number and text', () => {
    const next = omitScene(lines(), 'h1');
    expect(next.map((l) => l.id)).toEqual(['h1', 'h2', 'a2', 'h3']);
    expect(next[0]).toMatchObject({ omitted: true, sceneNumber: '1', text: 'INT. KITCHEN - DAY' });
    expect(isOmittedHeading(next, 'h1')).toBe(true);
  });

  it('is idempotent and leaves other scenes untouched', () => {
    const once = omitScene(lines(), 'h2');
    const twice = omitScene(once, 'h2');
    expect(twice).toEqual(once);
    expect(twice.find((l) => l.id === 'h1')?.omitted).toBeUndefined();
  });

  it('restores the heading AND its parked body lines in their original order', () => {
    const omitted = omitScene(lines(), 'h1');
    expect(omitted[0].omittedBody?.map((l) => l.id)).toEqual(['a1', 'c1', 'd1']);
    const restored = restoreScene(omitted, 'h1');
    expect(restored).toEqual(lines());
    expect(isOmittedHeading(restored, 'h1')).toBe(false);
    expect('omittedBody' in restored[0]).toBe(false);
  });

  it('restoring a scene that had no body just clears the flag', () => {
    const restored = restoreScene(omitScene(lines(), 'h3'), 'h3');
    expect(restored).toEqual(lines());
  });
});

describe('removeLineOrOmit', () => {
  it('omits a live heading first, then deletes the omitted heading', () => {
    const first = removeLineOrOmit(lines(), 'h1');
    expect(first[0]).toMatchObject({ id: 'h1', omitted: true });
    const second = removeLineOrOmit(first, 'h1');
    expect(second.map((l) => l.id)).toEqual(['h2', 'a2', 'h3']);
  });

  it('removes ordinary lines outright', () => {
    const next = removeLineOrOmit(lines(), 'd1');
    expect(next.map((l) => l.id)).toEqual(['h1', 'a1', 'c1', 'h2', 'a2', 'h3']);
  });

  it('ignores unknown ids', () => {
    expect(removeLineOrOmit(lines(), 'missing')).toEqual(lines());
  });
});

describe('breakdown integration', () => {
  it('keeps omitted scenes in the scene list, numbered, with the flag set', () => {
    const omitted = omitScene(lines(), 'h2');
    const { scenes, locations } = deriveScriptBreakdown(omitted);
    expect(scenes.map((s) => s.sceneNumber)).toEqual(['1', '2', '3']);
    expect(scenes[1].omitted).toBe(true);
    expect(scenes[0].omitted).toBeUndefined();
    // Omitted scenes do not contribute to the location breakdown.
    expect(locations.some((group) => group.scenes.some((s) => s.id === 'h2'))).toBe(false);
  });
});

describe('omittedSceneLabel', () => {
  it('formats with and without a number', () => {
    expect(omittedSceneLabel('12A')).toBe('SCENE 12A — OMITTED');
    expect(omittedSceneLabel(undefined)).toBe('SCENE OMITTED');
  });
});
