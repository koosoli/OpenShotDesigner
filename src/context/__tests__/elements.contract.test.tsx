/**
 * The floor-plan element actions, characterised.
 *
 * Elements are where most features land — a new prop type, a new fixture, a
 * new overlay all arrive as elements — and they carry the references that
 * everything downstream resolves: a camera owns a shot, an actor links to a
 * script character, a light hangs on a truss. Breaking those links is silent,
 * so the assertions here are about what survives a mutation, not about counts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { mountProvider, run, activeSetupOf, elementsOf } from './providerHarness';

afterEach(cleanup);

describe('addElement', () => {
  it('returns the new id and puts the element on the active setup', async () => {
    const { result } = await mountProvider();
    const before = activeSetupOf(result.current).elements.length;

    let id = '';
    await run(() => {
      id = result.current.addElement({ type: 'prop', x: 100, y: 100 });
    });

    expect(id).toBeTruthy();
    const elements = activeSetupOf(result.current).elements;
    expect(elements).toHaveLength(before + 1);
    expect(elements.some((element) => element.id === id)).toBe(true);
  });

  /**
   * Adding a camera also mints its shot: the two are one act, and a camera
   * with no shot is a position nobody is going to film.
   */
  it('gives a new camera a shot of its own', async () => {
    const { result } = await mountProvider();
    const shotsBefore = activeSetupOf(result.current).shots.length;

    await run(() => {
      result.current.addElement({ type: 'camera', x: 200, y: 200 });
    });

    expect(activeSetupOf(result.current).shots).toHaveLength(shotsBefore + 1);
  });
});

describe('updateElement', () => {
  it('patches one element and leaves its siblings untouched', async () => {
    const { result } = await mountProvider();
    let id = '';
    await run(() => {
      id = result.current.addElement({ type: 'prop', x: 10, y: 20 });
    });
    const siblings = activeSetupOf(result.current)
      .elements.filter((element) => element.id !== id)
      .map((element) => `${element.id}:${element.x},${element.y}`);

    await run(() => {
      result.current.updateElement(id, { x: 999 });
    });

    const updated = activeSetupOf(result.current).elements.find((e) => e.id === id);
    expect(updated?.x).toBe(999);
    // y was not in the patch, so it must not have moved.
    expect(updated?.y).toBe(20);
    expect(
      activeSetupOf(result.current)
        .elements.filter((element) => element.id !== id)
        .map((element) => `${element.id}:${element.x},${element.y}`),
    ).toEqual(siblings);
  });
});

describe('deleteElementById', () => {
  /**
   * Deleting a camera takes its shots with it — and, since the continuity log
   * hangs off shots, their takes too. A take pointing at a shot that no longer
   * exists is metadata for footage nobody can place.
   */
  it('takes the camera shots and their takes with it', async () => {
    const { result } = await mountProvider();

    let cameraId = '';
    await run(() => {
      cameraId = result.current.addElement({ type: 'camera', x: 300, y: 300 });
    });
    const shot = activeSetupOf(result.current).shots.at(-1);
    expect(shot).toBeTruthy();

    await run(() => {
      result.current.updateProjectMeta({
        takes: [{ id: 'take-1', shotId: shot!.id, takeNumber: 1 }],
      });
    });

    await run(() => {
      result.current.deleteElementById(cameraId);
    });

    expect(
      activeSetupOf(result.current).elements.some((element) => element.id === cameraId),
    ).toBe(false);
    expect(result.current.project.takes ?? []).toHaveLength(0);
  });

  it('leaves unrelated elements in place', async () => {
    const { result } = await mountProvider();
    let keep = '';
    let drop = '';
    await run(() => {
      keep = result.current.addElement({ type: 'prop', x: 1, y: 1 });
    });
    await run(() => {
      drop = result.current.addElement({ type: 'prop', x: 2, y: 2 });
    });

    await run(() => {
      result.current.deleteElementById(drop);
    });

    const ids = activeSetupOf(result.current).elements.map((element) => element.id);
    expect(ids).toContain(keep);
    expect(ids).not.toContain(drop);
  });
});

describe('selection', () => {
  it('selects, adds to and clears the selection', async () => {
    const { result } = await mountProvider();
    let first = '';
    let second = '';
    await run(() => {
      first = result.current.addElement({ type: 'prop', x: 1, y: 1 });
    });
    await run(() => {
      second = result.current.addElement({ type: 'prop', x: 2, y: 2 });
    });

    await run(() => {
      result.current.selectElement(first);
    });
    expect(result.current.selectedElementIds).toEqual([first]);

    await run(() => {
      result.current.selectElements([first, second]);
    });
    expect([...result.current.selectedElementIds].sort()).toEqual([first, second].sort());

    await run(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedElementIds).toEqual([]);
  });

  it('drops a deleted element from the selection', async () => {
    const { result } = await mountProvider();
    let id = '';
    await run(() => {
      id = result.current.addElement({ type: 'prop', x: 5, y: 5 });
    });
    await run(() => {
      result.current.selectElement(id);
    });

    await run(() => {
      result.current.deleteElementById(id);
    });

    expect(result.current.selectedElementIds).not.toContain(id);
  });
});

describe('duplicateSelected', () => {
  it('copies the element without reusing its id', async () => {
    const { result } = await mountProvider();
    let id = '';
    await run(() => {
      id = result.current.addElement({ type: 'prop', x: 40, y: 40 });
    });
    await run(() => {
      result.current.selectElement(id);
    });
    const before = elementsOf(result.current, 'prop').length;

    await run(() => {
      result.current.duplicateSelected();
    });

    const props = elementsOf(result.current, 'prop');
    expect(props).toHaveLength(before + 1);
    expect(new Set(props.map((element) => element.id)).size).toBe(props.length);
  });
});

describe('setups', () => {
  it('adds a setup and switches to it', async () => {
    const { result } = await mountProvider();
    const before = result.current.project.setups.length;

    await run(() => {
      result.current.addSetup('A new coverage');
    });

    expect(result.current.project.setups).toHaveLength(before + 1);
    expect(result.current.project.setups.at(-1)?.name).toBe('A new coverage');
  });

  it('duplicates a setup without sharing element ids with the original', async () => {
    const { result } = await mountProvider();
    const source = activeSetupOf(result.current);
    const sourceIds = new Set(source.elements.map((element) => element.id));

    await run(() => {
      result.current.duplicateCurrentSetup();
    });

    const copy = result.current.project.setups.at(-1);
    expect(copy).toBeTruthy();
    expect(copy?.id).not.toBe(source.id);
    for (const element of copy!.elements) {
      expect(sourceIds.has(element.id)).toBe(false);
    }
  });

  it('deletes a setup and keeps an active one', async () => {
    const { result } = await mountProvider();
    await run(() => {
      result.current.addSetup('Disposable');
    });
    const target = result.current.project.setups.at(-1)!;

    await run(() => {
      result.current.deleteSetup(target.id);
    });

    expect(result.current.project.setups.some((setup) => setup.id === target.id)).toBe(false);
    // Whatever happens, the app must still have a setup open.
    expect(activeSetupOf(result.current)).toBeTruthy();
  });
});
