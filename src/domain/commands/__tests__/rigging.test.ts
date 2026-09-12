/**
 * Rigging commands.
 *
 * The invariant worth the move: deleting a truss run must release the power
 * consumers hanging on it, not just drop its loads. Miss that and the consumer
 * vanishes from the rigging totals while still counting against a circuit —
 * the load sheet and the rig disagree, and nothing on screen explains why.
 *
 * That sweep used to live inside `RiggingPanel`, so it was reachable only by
 * rendering a React tree.
 */
import { describe, expect, it } from 'vitest';
import type { Project } from '../../../types';
import {
  removeTrussElementCommand,
  setRiggingItemsCommand,
  setSuspendedLoadsCommand,
  setTrussProfilesCommand,
  upsertTrussElementCommand,
} from '../rigging';
import { setDocumentLanguageCommand } from '../project';

const riggedProject = (): Project =>
  ({
    id: 'p1',
    title: 'Test Production',
    setups: [],
    activeSetupId: '',
    trussProfiles: [{ id: 'prof-1', geometry: 'box' }],
    trussElements: [
      { id: 'truss-1', profileId: 'prof-1', label: 'Grid A', x: 0, y: 0, rotation: 0 },
      { id: 'truss-2', profileId: 'prof-1', label: 'Grid B', x: 0, y: 0, rotation: 0 },
    ],
    suspendedLoads: [
      { id: 'load-1', trussElementId: 'truss-1', label: 'Key', weightKg: 12 },
      { id: 'load-2', trussElementId: 'truss-2', label: 'Fill', weightKg: 8 },
    ],
    riggingItems: [
      { id: 'item-1', trussElementId: 'truss-1', kind: 'clamp' },
      { id: 'item-2', trussElementId: 'truss-2', kind: 'clamp' },
    ],
    powerPlan: {
      sources: [],
      circuits: [],
      consumers: [
        { id: 'con-1', name: 'Key', quantity: 1, powerWattsOverride: 1200, trussElementId: 'truss-1' },
        { id: 'con-2', name: 'Fill', quantity: 1, powerWattsOverride: 800, trussElementId: 'truss-2' },
      ],
    },
  }) as unknown as Project;

describe('removeTrussElementCommand', () => {
  it('removes the run', () => {
    const { project } = removeTrussElementCommand(riggedProject(), { trussElementId: 'truss-1' });
    expect(project.trussElements?.map((element) => element.id)).toEqual(['truss-2']);
  });

  it('takes its loads and hardware with it', () => {
    const { project } = removeTrussElementCommand(riggedProject(), { trussElementId: 'truss-1' });
    expect(project.suspendedLoads?.map((load) => load.id)).toEqual(['load-2']);
    expect(project.riggingItems?.map((item) => item.id)).toEqual(['item-2']);
  });

  it('releases the power consumer instead of deleting it', () => {
    // The fixture is still plugged in and still draws current — it has simply
    // stopped hanging on that truss. Deleting it would understate the load.
    const { project } = removeTrussElementCommand(riggedProject(), { trussElementId: 'truss-1' });
    const consumers = project.powerPlan?.consumers ?? [];
    expect(consumers).toHaveLength(2);
    expect(consumers.find((consumer) => consumer.id === 'con-1')?.trussElementId).toBeUndefined();
    expect(consumers.find((consumer) => consumer.id === 'con-1')?.powerWattsOverride).toBe(1200);
  });

  it('leaves the other run entirely alone', () => {
    const { project } = removeTrussElementCommand(riggedProject(), { trussElementId: 'truss-1' });
    const other = (project.powerPlan?.consumers ?? []).find((consumer) => consumer.id === 'con-2');
    expect(other?.trussElementId).toBe('truss-2');
  });

  it('leaves no reference to the removed run anywhere', () => {
    const { project } = removeTrussElementCommand(riggedProject(), { trussElementId: 'truss-1' });
    const serialized = JSON.stringify({
      elements: project.trussElements,
      loads: project.suspendedLoads,
      items: project.riggingItems,
      power: project.powerPlan,
    });
    expect(serialized).not.toContain('truss-1');
  });

  it('counts the attachments in the description', () => {
    const { meta } = removeTrussElementCommand(riggedProject(), { trussElementId: 'truss-1' });
    // 1 load + 1 item + 1 consumer.
    expect(meta.description).toBe('Remove Grid A and 3 attachments');
  });

  it('says so plainly when nothing was hanging on it', () => {
    const bare = riggedProject();
    bare.suspendedLoads = [];
    bare.riggingItems = [];
    bare.powerPlan = { sources: [], circuits: [], consumers: [] };
    const { meta, warnings } = removeTrussElementCommand(bare, { trussElementId: 'truss-1' });
    expect(meta.description).toBe('Remove Grid A');
    expect(warnings).toBeUndefined();
  });

  it('names an unlabelled run rather than logging an anonymous delete', () => {
    const unlabelled = riggedProject();
    unlabelled.trussElements![0].label = undefined;
    const { meta } = removeTrussElementCommand(unlabelled, { trussElementId: 'truss-1' });
    expect(meta.description).toContain('truss run');
  });

  it('rejects an unknown id instead of silently doing nothing', () => {
    expect(() =>
      removeTrussElementCommand(riggedProject(), { trussElementId: 'nope' }),
    ).toThrow(/unknown truss element id/);
  });

  it('leaves the input project untouched', () => {
    const before = riggedProject();
    removeTrussElementCommand(before, { trussElementId: 'truss-1' });
    expect(before.trussElements).toHaveLength(2);
    expect(before.powerPlan?.consumers?.[0].trussElementId).toBe('truss-1');
  });
});

describe('upsertTrussElementCommand', () => {
  it('adds a new run and says so', () => {
    const { project, meta } = upsertTrussElementCommand(riggedProject(), {
      element: { id: 'truss-3', profileId: 'prof-1', label: 'Grid C', x: 0, y: 0, rotation: 0 } as never,
    });
    expect(project.trussElements).toHaveLength(3);
    expect(meta.description).toBe('Add Grid C');
  });

  it('replaces an existing run in place rather than appending', () => {
    const { project, meta } = upsertTrussElementCommand(riggedProject(), {
      element: { id: 'truss-1', profileId: 'prof-1', label: 'Grid A upstage', x: 0, y: 0, rotation: 0 } as never,
    });
    expect(project.trussElements).toHaveLength(2);
    expect(project.trussElements?.[0].label).toBe('Grid A upstage');
    expect(meta.description).toBe('Update Grid A upstage');
  });

  it('rejects an element with no id', () => {
    expect(() =>
      upsertTrussElementCommand(riggedProject(), { element: { id: '' } as never }),
    ).toThrow(/non-empty string/);
  });
});

describe('the list commands take an updater, not a finished list', () => {
  /**
   * This is the whole reason the signature is a function. `runCommand` applies
   * a command against the newest project inside the state updater; a caller
   * that resolved the list at render time would hand over a stale snapshot,
   * and two edits in one tick would lose the first.
   */
  it('applies the updater to the project it is given, not to a captured one', () => {
    const first = setTrussProfilesCommand(riggedProject(), {
      update: (previous) => [...previous, { id: 'prof-2', geometry: 'triangle' } as never],
      description: 'Add truss profile',
    });
    // Second edit sees the FIRST edit's result, because it re-reads.
    const second = setTrussProfilesCommand(first.project, {
      update: (previous) => [...previous, { id: 'prof-3', geometry: 'ladder' } as never],
      description: 'Add truss profile',
    });
    expect(second.project.trussProfiles?.map((profile) => profile.id)).toEqual([
      'prof-1',
      'prof-2',
      'prof-3',
    ]);
  });

  it('carries the caller description into the log', () => {
    const { meta } = setSuspendedLoadsCommand(riggedProject(), {
      update: (previous) => previous.filter((load) => load.id !== 'load-1'),
      description: 'Remove suspended load',
    });
    // Never "Update project metadata" again.
    expect(meta.description).toBe('Remove suspended load');
  });

  it('starts from an empty list when the collection has never existed', () => {
    const bare = { ...riggedProject(), riggingItems: undefined } as Project;
    const { project } = setRiggingItemsCommand(bare, {
      update: (previous) => [...previous, { id: 'i1', trussElementId: 'truss-1' } as never],
      description: 'Add rigging hardware',
    });
    expect(project.riggingItems).toHaveLength(1);
  });

  it('rejects a non-function updater', () => {
    expect(() =>
      setTrussProfilesCommand(riggedProject(), {
        update: [] as never,
        description: 'nope',
      }),
    ).toThrow(/must be a function/);
  });

  it('leaves the input project untouched', () => {
    const before = riggedProject();
    setSuspendedLoadsCommand(before, { update: () => [], description: 'Clear' });
    expect(before.suspendedLoads).toHaveLength(2);
  });
});

describe('setDocumentLanguageCommand', () => {
  it('records the choice in words a producer can read later', () => {
    const { project, meta } = setDocumentLanguageCommand(riggedProject(), { language: 'de' });
    expect(project.documentLanguage).toBe('de');
    // Matters because this changes every call sheet the production issues, and
    // an already-issued revision compares as changed afterwards.
    expect(meta.description).toBe('Print paperwork in Deutsch');
  });

  it('rejects a language the app cannot print', () => {
    expect(() =>
      setDocumentLanguageCommand(riggedProject(), { language: 'fr' as never }),
    ).toThrow(/unsupported language/);
  });

  it('leaves the input project untouched', () => {
    const before = riggedProject();
    setDocumentLanguageCommand(before, { language: 'de' });
    expect(before.documentLanguage).toBeUndefined();
  });
});
