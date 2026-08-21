import { describe, it, expect } from 'vitest';
import { createId, isGeneratedId } from '../ids';

describe('createId', () => {
  it('returns an id beginning with the given prefix followed by a dash', () => {
    for (const prefix of ['cam', 'shot', 'waypoint', 'proj']) {
      const id = createId(prefix);
      expect(id.startsWith(`${prefix}-`)).toBe(true);
      expect(id.length).toBeGreaterThan(prefix.length + 1);
    }
  });

  it('produces unique ids across many calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) ids.add(createId('x'));
    expect(ids.size).toBe(500);
  });

  it('keeps the exact prefix even for multi-dash prefixes', () => {
    const id = createId('my-prefix');
    expect(id.startsWith('my-prefix-')).toBe(true);
  });

  it('does not collide across different prefixes sharing a tail namespace', () => {
    const a = new Set(Array.from({ length: 100 }, () => createId('a')));
    const b = Array.from({ length: 100 }, () => createId('b'));
    expect(b.some((id) => a.has(id))).toBe(false);
  });
});

describe('isGeneratedId', () => {
  it('recognizes ids produced by createId', () => {
    const id = createId('setup');
    expect(isGeneratedId(id)).toBe(true);
    expect(isGeneratedId(id, 'setup')).toBe(true);
  });

  it('rejects arbitrary strings', () => {
    expect(isGeneratedId('')).toBe(false);
    expect(isGeneratedId('abc')).toBe(false);
    expect(isGeneratedId('not an id!')).toBe(false);
    expect(isGeneratedId('12345')).toBe(false);
  });
});
