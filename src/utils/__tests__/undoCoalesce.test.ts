import { describe, expect, it } from 'vitest';
import { TYPING_COALESCE_MS, shouldCoalesce, typingTarget } from '../undoCoalesce';

describe('undo coalescing', () => {
  it('treats text fields as typing targets and buttons/selects as not', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    expect(typingTarget(input)).toBe(input);
    expect(typingTarget(textarea)).toBe(textarea);
    expect(typingTarget(checkbox)).toBeNull();
    expect(typingTarget(document.createElement('select'))).toBeNull();
    expect(typingTarget(null)).toBeNull();
  });

  it('merges only same-field edits inside the pause window', () => {
    const a = document.createElement('input');
    const b = document.createElement('input');
    expect(shouldCoalesce({ target: a, at: 1000 }, a, 1000 + TYPING_COALESCE_MS)).toBe(true);
    expect(shouldCoalesce({ target: a, at: 1000 }, a, 1001 + TYPING_COALESCE_MS)).toBe(false);
    expect(shouldCoalesce({ target: a, at: 1000 }, b, 1100)).toBe(false);
    expect(shouldCoalesce(null, a, 1100)).toBe(false);
  });
});
