import { describe, it, expect } from 'vitest';
import { reconcileScriptLineIds } from '../script/reconcile';

const prev = [
  { id: 'h1', type: 'scene', text: 'INT. KITCHEN - DAY', sceneNumber: '1' },
  { id: 'a1', type: 'action', text: 'Anna pours coffee.' },
  { id: 'c1', type: 'character', text: 'ANNA' },
  { id: 'd1', type: 'dialogue', text: 'Morning.' },
  { id: 'h2', type: 'scene', text: 'EXT. STREET - NIGHT', sceneNumber: '2' },
  { id: 'a2', type: 'action', text: 'Beat.' },
  { id: 'a3', type: 'action', text: 'Beat.' },
];

describe('reconcileScriptLineIds', () => {
  it('reuses ids for unchanged lines even when the parser minted new ones', () => {
    const next = prev.map((line, i) => ({ ...line, id: `new-${i}` }));
    const out = reconcileScriptLineIds(next, prev);
    expect(out.map((l) => l.id)).toEqual(prev.map((l) => l.id));
  });

  it('keeps a scene heading identity by number when the wording changes', () => {
    const next = [
      { id: 'n0', type: 'scene', text: 'INT. KITCHEN - MORNING', sceneNumber: '1' },
      { id: 'n1', type: 'action', text: 'Anna pours coffee.' },
    ];
    const out = reconcileScriptLineIds(next, prev);
    expect(out[0].id).toBe('h1');
    expect(out[1].id).toBe('a1');
  });

  it('gives inserted lines fresh ids and never reuses an id twice', () => {
    const next = [
      { id: 'n0', type: 'scene', text: 'INT. KITCHEN - DAY', sceneNumber: '1' },
      { id: 'n1', type: 'action', text: 'NEW LINE' },
      { id: 'n2', type: 'action', text: 'Anna pours coffee.' },
      { id: 'n3', type: 'action', text: 'Beat.' },
      { id: 'n4', type: 'action', text: 'Beat.' },
      { id: 'n5', type: 'action', text: 'Beat.' },
    ];
    const out = reconcileScriptLineIds(next, prev);
    expect(out.map((l) => l.id)).toEqual(['h1', 'n1', 'a1', 'a2', 'a3', 'n5']);
    expect(new Set(out.map((l) => l.id)).size).toBe(out.length);
  });

  it('does not match across element types', () => {
    const next = [{ id: 'n0', type: 'dialogue', text: 'Anna pours coffee.' }];
    expect(reconcileScriptLineIds(next, prev)[0].id).toBe('n0');
  });

  it('handles empty inputs', () => {
    expect(reconcileScriptLineIds([], prev)).toEqual([]);
    const next = [{ id: 'n0', type: 'action', text: 'x' }];
    expect(reconcileScriptLineIds(next, [])).toEqual(next);
  });
});
