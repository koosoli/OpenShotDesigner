import { describe, expect, it } from 'vitest';
import {
  assignMissingSceneNumbers,
  hasProductionSceneNumbers,
  insertedSceneNumber,
  normaliseSceneNumbers,
  parseSceneNumber,
  propagateSceneNumbers,
  renumberScenes,
} from '../script';

const h = (id: string, sceneNumber?: string, omitted?: boolean) => ({
  id,
  type: 'scene',
  ...(sceneNumber ? { sceneNumber } : {}),
  ...(omitted ? { omitted } : {}),
});
const a = (id: string, sceneNumber?: string) => ({ id, type: 'action', ...(sceneNumber ? { sceneNumber } : {}) });
const numbers = (lines: Array<{ type?: string; sceneNumber?: string }>) =>
  lines.filter((l) => l.type === 'scene').map((l) => l.sceneNumber);

describe('parseSceneNumber', () => {
  it('reads plain, suffixed and prefixed numbers', () => {
    expect(parseSceneNumber('12')).toEqual({ prefix: '', base: 12, suffix: '' });
    expect(parseSceneNumber('12a')).toEqual({ prefix: '', base: 12, suffix: 'A' });
    expect(parseSceneNumber('A1')).toEqual({ prefix: 'A', base: 1, suffix: '' });
    expect(parseSceneNumber('')).toBeNull();
    expect(parseSceneNumber('twelve')).toBeNull();
  });
});

describe('insertedSceneNumber (locked regime)', () => {
  it('a scene between 3 and 4 is 3A, the next 3B', () => {
    expect(insertedSceneNumber('3', '4', new Set(['3', '4']))).toBe('3A');
    expect(insertedSceneNumber('3A', '4', new Set(['3', '3A', '4']))).toBe('3B');
  });
  it('a scene squeezed between 3A and 3B is 3AA', () => {
    expect(insertedSceneNumber('3A', '3B', new Set(['3A', '3B']))).toBe('3AA');
  });
  it('skips a suffix that is already taken', () => {
    expect(insertedSceneNumber('3', '4', new Set(['3', '3A', '3B', '4']))).toBe('3C');
  });
  it('counts on past the highest number at the end', () => {
    expect(insertedSceneNumber('12', undefined, new Set(['12', '12A', '14']))).toBe('15');
  });
  it('takes an A-prefix ahead of scene 1', () => {
    expect(insertedSceneNumber(undefined, '1', new Set(['1']))).toBe('A1');
    expect(insertedSceneNumber(undefined, '1', new Set(['1', 'A1']))).toBe('B1');
  });
  it('starts at 1 in an empty script', () => {
    expect(insertedSceneNumber(undefined, undefined, new Set())).toBe('1');
  });
});

describe('renumberScenes (auto regime)', () => {
  it('numbers by position and carries the number onto body lines', () => {
    const lines = [h('s1', '7'), a('b1'), h('s2'), a('b2', 'stale'), h('s3', '2')];
    const out = renumberScenes(lines);
    expect(numbers(out)).toEqual(['1', '2', '3']);
    expect(out[1].sceneNumber).toBe('1');
    expect(out[3].sceneNumber).toBe('2');
  });
  it('an omitted heading keeps its slot, so nothing after it shifts', () => {
    expect(numbers(renumberScenes([h('s1'), h('s2', undefined, true), h('s3')]))).toEqual(['1', '2', '3']);
  });
  it('returns the same line objects when nothing changes', () => {
    const lines = [h('s1', '1'), a('b1', '1')];
    const out = renumberScenes(lines);
    expect(out[0]).toBe(lines[0]);
    expect(out[1]).toBe(lines[1]);
  });
});

describe('assignMissingSceneNumbers (locked regime)', () => {
  it('keeps explicit numbers and leaves a gap where a scene was removed', () => {
    expect(numbers(assignMissingSceneNumbers([h('s1', '1'), h('s3', '3'), h('s4', '4')]))).toEqual(['1', '3', '4']);
  });
  it('gives an inserted heading a letter between its neighbours', () => {
    const out = assignMissingSceneNumbers([h('s1', '1'), h('new'), h('s2', '2'), a('b')]);
    expect(numbers(out)).toEqual(['1', '1A', '2']);
    expect(out[3].sceneNumber).toBe('2');
  });
  it('renames the later of two headings that claim one number', () => {
    // Pasted or imported text can repeat a number; the first occurrence keeps
    // it. (The editor itself never inserts a numbered heading, so an Enter on
    // scene 3 arrives here unnumbered and becomes 3A.) A duplicate at the end counts on.
    expect(numbers(assignMissingSceneNumbers([h('s3', '3'), h('dup', '4'), h('s4', '4')]))).toEqual(['3', '4', '5']);
  });
  it('numbers two consecutive inserts 3A then 3B', () => {
    expect(numbers(assignMissingSceneNumbers([h('s3', '3'), h('x'), h('y'), h('s4', '4')]))).toEqual(['3', '3A', '3B', '4']);
  });
  it('appends at the end by counting on', () => {
    expect(numbers(assignMissingSceneNumbers([h('s1', '1'), h('s2', '2'), h('new')]))).toEqual(['1', '2', '3']);
  });
});

describe('normaliseSceneNumbers', () => {
  const lines = [h('s1', '1'), h('new'), h('s2', '2')];
  it('picks the regime', () => {
    expect(numbers(normaliseSceneNumbers(lines, false))).toEqual(['1', '2', '3']);
    expect(numbers(normaliseSceneNumbers(lines, true))).toEqual(['1', '1A', '2']);
  });
});

describe('propagateSceneNumbers', () => {
  it('clears a body number that precedes any heading', () => {
    const out = propagateSceneNumbers([a('b0', '9'), h('s1', '1'), a('b1')]);
    expect(out[0].sceneNumber).toBeUndefined();
    expect(out[2].sceneNumber).toBe('1');
  });
});

describe('hasProductionSceneNumbers', () => {
  it('is false for unnumbered or simply sequential scripts', () => {
    expect(hasProductionSceneNumbers([h('s1'), h('s2')])).toBe(false);
    expect(hasProductionSceneNumbers([h('s1', '1'), h('s2', '2')])).toBe(false);
  });
  it('is true when a number is not its own ordinal', () => {
    expect(hasProductionSceneNumbers([h('s1', '1'), h('s2', '1A'), h('s3', '2')])).toBe(true);
    expect(hasProductionSceneNumbers([h('s1', '1'), h('s2', '3')])).toBe(true);
  });
});
