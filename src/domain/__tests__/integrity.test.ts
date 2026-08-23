import { describe, expect, it } from 'vitest';
import {
  removePowerCircuit,
  removePowerSource,
  removeBreakdownItemReferences,
  removeRunOfShowCue,
  removeScriptLineReferences,
  removeTrussElement,
  removeSetupReferences,
  removeShotReferences,
  removeProductionDayFromTakes,
} from '../integrity';
import type { PowerPlan } from '../power';
import type { ScriptScene } from '../script';
import type { RiggingItem, SuspendedLoad, TrussElement } from '../rigging';

const truss = (id: string): TrussElement => ({ id, x: 0, y: 0, rotation: 0 });
const load = (id: string, trussElementId: string): SuspendedLoad => ({
  id,
  trussElementId,
  label: id,
  quantity: 1,
});
const item = (id: string, trussElementId: string): RiggingItem => ({ id, kind: 'motor', trussElementId });

const powerPlan = (): PowerPlan => ({
  sources: [
    { id: 'src1', name: 'Distro', kind: 'three_phase_400v_63a' },
    { id: 'src2', name: 'Genny', kind: 'generator' },
  ],
  circuits: [
    { id: 'c1', name: 'C1', sourceId: 'src1', consumerIds: [] },
    { id: 'c2', name: 'C2', sourceId: 'src2', consumerIds: [] },
  ],
  consumers: [
    { id: 'p1', name: 'Key', quantity: 1, circuitId: 'c1', trussElementId: 't1' },
    { id: 'p2', name: 'Fill', quantity: 1, circuitId: 'c2', trussElementId: 't2' },
  ],
});

describe('removeTrussElement', () => {
  const refs = () => ({
    trussElements: [truss('t1'), truss('t2')],
    suspendedLoads: [load('l1', 't1'), load('l2', 't2')],
    riggingItems: [item('r1', 't1'), item('r2', 't2')],
    powerPlan: powerPlan(),
  });

  it('removes the run, its loads and its rigging hardware', () => {
    const next = removeTrussElement(refs(), 't1');
    expect(next.trussElements.map((t) => t.id)).toEqual(['t2']);
    expect(next.suspendedLoads.map((l) => l.id)).toEqual(['l2']);
    expect(next.riggingItems.map((i) => i.id)).toEqual(['r2']);
  });

  it('clears the truss reference on power consumers without deleting them', () => {
    // The fixture still exists and still draws power; it is just not on a
    // truss any more.
    const next = removeTrussElement(refs(), 't1');
    const consumers = next.powerPlan!.consumers!;
    expect(consumers).toHaveLength(2);
    expect(consumers.find((c) => c.id === 'p1')!.trussElementId).toBeUndefined();
    expect(consumers.find((c) => c.id === 'p2')!.trussElementId).toBe('t2');
  });

  it('leaves the power plan object untouched when nothing referenced the truss', () => {
    const input = refs();
    const next = removeTrussElement(input, 't2');
    const consumers = next.powerPlan!.consumers!;
    expect(consumers.find((c) => c.id === 'p2')!.trussElementId).toBeUndefined();
  });

  it('works for a project with no power plan at all', () => {
    const { powerPlan: _dropped, ...noPower } = refs();
    const next = removeTrussElement(noPower, 't1');
    expect(next.trussElements.map((t) => t.id)).toEqual(['t2']);
  });

  it('is a no-op for an id that is not there', () => {
    const next = removeTrussElement(refs(), 'ghost');
    expect(next.trussElements).toHaveLength(2);
    expect(next.suspendedLoads).toHaveLength(2);
  });

  it('does not mutate its input', () => {
    const input = refs();
    removeTrussElement(input, 't1');
    expect(input.trussElements).toHaveLength(2);
    expect(input.powerPlan.consumers![0].trussElementId).toBe('t1');
  });
});

describe('removeRunOfShowCue', () => {
  const refs = () => ({
    runOfShowCues: [{ id: 'cue1' }, { id: 'cue2' }],
    coverageMatrix: {
      cameraIds: ['A', 'B'],
      rowKeys: ['cue1', 'cue2'],
      cells: { cue1: { A: 'Wide' }, cue2: { B: 'CU' } },
    },
  });

  it('removes the cue AND the coverage row keyed by it', () => {
    // The row used to be filtered out of the editor but left in the project,
    // and the print builder still emitted it under a stub label.
    const next = removeRunOfShowCue(refs(), 'cue1');
    expect(next.runOfShowCues.map((c) => c.id)).toEqual(['cue2']);
    expect(next.coverageMatrix!.rowKeys).toEqual(['cue2']);
    expect(next.coverageMatrix!.cells.cue1).toBeUndefined();
  });

  it('leaves the other rows alone', () => {
    const next = removeRunOfShowCue(refs(), 'cue1');
    expect(next.coverageMatrix!.cells.cue2).toEqual({ B: 'CU' });
  });

  it('works for a project with no coverage matrix', () => {
    const next = removeRunOfShowCue({ runOfShowCues: [{ id: 'cue1' }] }, 'cue1');
    expect(next.runOfShowCues).toEqual([]);
  });

  it('does not mutate its input', () => {
    const input = refs();
    removeRunOfShowCue(input, 'cue1');
    expect(input.runOfShowCues).toHaveLength(2);
    expect(input.coverageMatrix.rowKeys).toEqual(['cue1', 'cue2']);
  });
});

describe('removePowerCircuit', () => {
  it('removes the circuit and unassigns the consumers it fed', () => {
    const next = removePowerCircuit({ powerPlan: powerPlan() }, 'c1');
    expect(next.powerPlan.circuits.map((c) => c.id)).toEqual(['c2']);
    const consumers = next.powerPlan.consumers!;
    expect(consumers).toHaveLength(2);
    expect(consumers.find((c) => c.id === 'p1')!.circuitId).toBeUndefined();
    expect(consumers.find((c) => c.id === 'p2')!.circuitId).toBe('c2');
  });
});

describe('removePowerSource', () => {
  it('takes its circuits with it and unassigns their consumers', () => {
    const next = removePowerSource({ powerPlan: powerPlan() }, 'src1');
    expect(next.powerPlan.sources.map((s) => s.id)).toEqual(['src2']);
    expect(next.powerPlan.circuits.map((c) => c.id)).toEqual(['c2']);
    const consumers = next.powerPlan.consumers!;
    expect(consumers.find((c) => c.id === 'p1')!.circuitId).toBeUndefined();
    expect(consumers.find((c) => c.id === 'p2')!.circuitId).toBe('c2');
  });

  it('keeps every consumer — a fixture is not deleted with its supply', () => {
    const next = removePowerSource({ powerPlan: powerPlan() }, 'src1');
    expect(next.powerPlan.consumers).toHaveLength(2);
  });

  it('is a no-op for an unknown source', () => {
    const next = removePowerSource({ powerPlan: powerPlan() }, 'ghost');
    expect(next.powerPlan.sources).toHaveLength(2);
    expect(next.powerPlan.circuits).toHaveLength(2);
  });
});

describe('take cleanup', () => {
  const takes = [
    { id: 't1', shotId: 's1', takeNumber: 1, productionDayId: 'd1' },
    { id: 't2', shotId: 's1', takeNumber: 2, productionDayId: 'd1' },
    { id: 't3', shotId: 's2', takeNumber: 1, productionDayId: 'd2' },
  ];

  it('takes the continuity takes of a deleted shot with it', () => {
    const next = removeShotReferences({ takes: [...takes] }, 's1');
    expect(next.takes.map((take) => take.id)).toEqual(['t3']);
  });

  /**
   * A caller that keeps no take list must not be handed an empty one: spread
   * into project state, `[]` reads as "nothing was ever shot" rather than as
   * "takes are none of this caller's business".
   */
  it('does not invent a take list for a caller that has none', () => {
    const next = removeShotReferences({ scriptLines: [{ id: 'l1' }] }, 's1');
    expect('takes' in next).toBe(false);
  });

  it('cleans up takes when a whole setup goes', () => {
    const next = removeSetupReferences({ takes: [...takes] }, 'setup-1', ['s1', 's2']);
    expect(next.takes).toEqual([]);
  });

  /**
   * Deleting a day does not unshoot the footage: the clips exist on a card,
   * so the takes survive and only lose the day they pointed at.
   */
  it('unhooks takes from a deleted production day without deleting them', () => {
    const next = removeProductionDayFromTakes(takes, 'd1');
    expect(next).toHaveLength(3);
    expect(next[0].productionDayId).toBeUndefined();
    expect(next[2].productionDayId).toBe('d2');
  });
});

describe('removeShotReferences', () => {
  const refs = () => ({
    scheduleBlocks: [
      { id: 'b1', kind: 'shots' as const, shotIds: ['s1'] },
      { id: 'b2', kind: 'shots' as const, shotIds: ['s1', 's2', 's3'] },
      { id: 'b3', kind: 'setup' as const, setupId: 'setup-1' },
    ],
    productionDays: [
      { id: 'd1', name: 'Day 1', scheduleBlockIds: ['b1', 'b2', 'b3'] },
    ],
    scriptLines: [
      { id: 'l1', linkedShotId: 's1' },
      { id: 'l2', linkedShotId: 's2' },
      { id: 'l3' },
    ],
  });

  /** A strip covering nothing is not a plan; it is a gap on the board. */
  it('drops a strip that covered only the deleted shot', () => {
    const next = removeShotReferences(refs(), 's1');
    expect(next.scheduleBlocks.map((b) => b.id)).toEqual(['b2', 'b3']);
    expect(next.productionDays[0].scheduleBlockIds).toEqual(['b2', 'b3']);
  });

  it('keeps a strip that still covers other shots', () => {
    const next = removeShotReferences(refs(), 's1');
    const shared = next.scheduleBlocks.find((b) => b.id === 'b2');
    expect(shared && 'shotIds' in shared && shared.shotIds).toEqual(['s2', 's3']);
  });

  it('unlinks the script line that was lined for it, and leaves the others', () => {
    const next = removeShotReferences(refs(), 's1');
    expect(next.scriptLines[0].linkedShotId).toBeUndefined();
    expect(next.scriptLines[1].linkedShotId).toBe('s2');
  });

  /**
   * Deleting a camera takes every shot on it at once. One at a time would drop
   * a multi-shot strip only when the last of its shots happened to go.
   */
  it('takes a set, so a camera deletion clears a strip covering all its shots', () => {
    const next = removeShotReferences(refs(), ['s1', 's2', 's3']);
    expect(next.scheduleBlocks.map((b) => b.id)).toEqual(['b3']);
    expect(next.productionDays[0].scheduleBlockIds).toEqual(['b3']);
  });

  it('leaves setup strips and unrelated shots alone', () => {
    const next = removeShotReferences(refs(), 'unknown-shot');
    expect(next.scheduleBlocks).toHaveLength(3);
    expect(next.scriptLines[0].linkedShotId).toBe('s1');
  });

  it('does nothing for an empty set', () => {
    const original = refs();
    expect(removeShotReferences(original, [])).toBe(original);
  });

  /**
   * The result is spread straight into project state, so a key the caller never
   * passed must not come back. An injected `scriptLines: []` turned "this
   * project has no screenplay" into "this project has an empty screenplay",
   * which is how a script disappears from a project that still has one.
   */
  it('leaves out the keys the caller did not pass, rather than emptying them', () => {
    const next = removeShotReferences(
      { scheduleBlocks: [{ id: 'b1', kind: 'shots' as const, shotIds: ['s1'] }] },
      's1',
    );
    expect('scriptLines' in next).toBe(false);
    expect('productionDays' in next).toBe(false);
    // The work it was actually asked to do still happens.
    expect(next.scheduleBlocks).toEqual([]);
  });

  it('cleans the script for a caller that passes no schedule at all', () => {
    const next = removeShotReferences({ scriptLines: [{ id: 'l1', linkedShotId: 's1' }] }, 's1');
    expect('scheduleBlocks' in next).toBe(false);
    expect(next.scriptLines[0].linkedShotId).toBeUndefined();
  });
});

describe('removeSetupReferences', () => {
  const refs = () => ({
    scheduleBlocks: [
      { id: 'b1', kind: 'setup' as const, setupId: 'setup-1' },
      { id: 'b2', kind: 'shots' as const, shotIds: ['s1', 's2'] },
      { id: 'b3', kind: 'shots' as const, shotIds: ['s1', 'other'] },
      { id: 'b4', kind: 'setup' as const, setupId: 'setup-2' },
    ],
    productionDays: [{ id: 'd1', name: 'Day 1', scheduleBlockIds: ['b1', 'b2', 'b3', 'b4'] }],
  });

  /**
   * These used to survive as "Unresolved setup 8f3c…" on the board and on every
   * call sheet for that day, permanently, with no way to tell which strips were
   * affected.
   */
  it('drops the setup strip and the strips covering only its shots', () => {
    const next = removeSetupReferences(refs(), 'setup-1', ['s1', 's2']);
    expect(next.scheduleBlocks.map((b) => b.id)).toEqual(['b3', 'b4']);
    expect(next.productionDays[0].scheduleBlockIds).toEqual(['b3', 'b4']);
  });

  it('trims a mixed strip rather than dropping shots that belonged elsewhere', () => {
    const next = removeSetupReferences(refs(), 'setup-1', ['s1', 's2']);
    const mixed = next.scheduleBlocks.find((b) => b.id === 'b3');
    expect(mixed && 'shotIds' in mixed && mixed.shotIds).toEqual(['other']);
  });

  it('leaves another setup’s strip alone', () => {
    const next = removeSetupReferences(refs(), 'setup-1', ['s1', 's2']);
    expect(next.scheduleBlocks.some((b) => b.id === 'b4')).toBe(true);
  });

  it('handles a setup that was never scheduled and had no shots', () => {
    const original = refs();
    const next = removeSetupReferences(original, 'setup-never', []);
    expect(next.scheduleBlocks).toHaveLength(4);
  });

  /**
   * Deleting the setup used to clear only the schedule, so the script kept its
   * lining strokes for shots that no longer existed — the exact dangling
   * reference `deleteShot` has always prevented.
   */
  it('clears the lining marks for the shots that lived on the setup', () => {
    const next = removeSetupReferences(
      {
        ...refs(),
        scriptLines: [
          { id: 'l1', linkedShotId: 's1' },
          { id: 'l2', linkedShotId: 'other' },
          { id: 'l3' },
        ],
      },
      'setup-1',
      ['s1', 's2'],
    );
    expect(next.scriptLines).toEqual([
      { id: 'l1', linkedShotId: undefined },
      { id: 'l2', linkedShotId: 'other' },
      { id: 'l3' },
    ]);
  });
});

describe('removeBreakdownItemReferences', () => {
  const scene = (id: string, breakdownItemIds: string[]): ScriptScene => ({
    id,
    sceneNumber: id,
    heading: `INT. ROOM ${id}`,
    characterIds: [],
    breakdownItemIds,
  });
  const refs = () => ({
    breakdownItems: [
      { id: 'b1', category: 'prop' as const, name: 'Ledger' },
      { id: 'b2', category: 'vehicle' as const, name: 'Taxi' },
    ],
    scriptScenes: [scene('4', ['b1', 'b2']), scene('9', ['b2'])],
  });

  it('deletes the element and clears it off every scene that cached it', () => {
    const next = removeBreakdownItemReferences(refs(), 'b1');
    expect(next.breakdownItems.map((i) => i.id)).toEqual(['b2']);
    expect(next.scriptScenes.map((s) => s.breakdownItemIds)).toEqual([['b2'], ['b2']]);
  });

  it('leaves scenes that never referenced it untouched', () => {
    const before = refs();
    const next = removeBreakdownItemReferences(before, 'b1');
    expect(next.scriptScenes[1]).toBe(before.scriptScenes[1]);
  });

  it('copes with a project that has no script', () => {
    const next = removeBreakdownItemReferences({ breakdownItems: refs().breakdownItems }, 'b2');
    expect(next.breakdownItems.map((i) => i.id)).toEqual(['b1']);
  });
});

describe('removeScriptLineReferences', () => {
  it('drops element pointers at lines the script no longer has', () => {
    const next = removeScriptLineReferences(
      {
        breakdownItems: [
          {
            id: 'b1',
            category: 'prop' as const,
            name: 'Ledger',
            sourceScriptLineIds: ['l1', 'l2'],
            sourceRanges: [{ lineId: 'l1' }, { lineId: 'l2' }],
          },
        ],
      },
      ['l1'],
    );
    expect(next.breakdownItems[0].sourceScriptLineIds).toEqual(['l1']);
    expect(next.breakdownItems[0].sourceRanges).toEqual([{ lineId: 'l1' }]);
  });

  it('is a no-op when there are no elements to rewrite', () => {
    const refs = { breakdownItems: [] };
    expect(removeScriptLineReferences(refs, [])).toBe(refs);
  });
});
