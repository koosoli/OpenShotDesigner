/**
 * The shot actions, characterised.
 *
 * A shot is the spine of this app — it exists on the floor plan, in the shot
 * list, on the board, in the schedule and now in the continuity log — so these
 * actions are the ones a feature is most likely to touch and the ones a
 * `FloorPlanContext` split is most likely to break.
 *
 * Written as a CHARACTERISATION suite: it records what the context does today,
 * so that a refactor which changes behaviour has to do so deliberately rather
 * than by accident. Where today's behaviour looks wrong, the test says so in a
 * comment instead of asserting what it wishes were true — a characterisation
 * test that lies about the present is worse than none.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { mountProvider, run, shotsOf, activeSetupOf, elementsOf } from './providerHarness';

afterEach(cleanup);

describe('addShot', () => {
  it('appends a shot to the active setup and returns its id', async () => {
    const { result } = await mountProvider();
    const before = shotsOf(result.current).length;

    let id = '';
    await run(() => {
      id = result.current.addShot();
    });

    expect(id).toBeTruthy();
    const shots = shotsOf(result.current);
    expect(shots).toHaveLength(before + 1);
    expect(shots[shots.length - 1].id).toBe(id);
  });

  it('numbers the new shot in the scene/index form the app uses elsewhere', async () => {
    const { result } = await mountProvider();
    await run(() => {
      result.current.addShot();
    });
    const shots = shotsOf(result.current);
    const scene = activeSetupOf(result.current).sceneNumber || '1';
    expect(shots[shots.length - 1].shotNumber).toMatch(new RegExp(`^${scene}/\\d`));
  });

  it('honours the fields it is given', async () => {
    const { result } = await mountProvider();
    await run(() => {
      result.current.addShot({ name: 'Named by the caller', lensMm: 85 });
    });
    const shot = shotsOf(result.current).at(-1);
    expect(shot?.name).toBe('Named by the caller');
    expect(shot?.lensMm).toBe(85);
  });
});

describe('updateShot / deleteShot', () => {
  it('patches only the fields given', async () => {
    const { result } = await mountProvider();
    let id = '';
    await run(() => {
      id = result.current.addShot({ name: 'Before', lensMm: 35 });
    });
    await run(() => {
      result.current.updateShot(id, { name: 'After' });
    });

    const shot = shotsOf(result.current).find((s) => s.id === id);
    expect(shot?.name).toBe('After');
    expect(shot?.lensMm).toBe(35);
  });

  it('removes the shot and leaves its siblings numbered as they were', async () => {
    const { result } = await mountProvider();
    let first = '';
    let second = '';
    await run(() => {
      first = result.current.addShot({ name: 'First' });
    });
    await run(() => {
      second = result.current.addShot({ name: 'Second' });
    });
    const numbersBefore = shotsOf(result.current)
      .filter((s) => s.id !== first)
      .map((s) => s.shotNumber);

    await run(() => {
      result.current.deleteShot(first);
    });

    const shots = shotsOf(result.current);
    expect(shots.some((s) => s.id === first)).toBe(false);
    expect(shots.some((s) => s.id === second)).toBe(true);
    // Numbers are production identifiers: deleting one must not renumber the rest.
    expect(shots.map((s) => s.shotNumber)).toEqual(numbersBefore);
  });

  it('takes the continuity takes of a deleted shot with it', async () => {
    const { result } = await mountProvider();
    let id = '';
    await run(() => {
      id = result.current.addShot();
    });
    await run(() => {
      result.current.updateProjectMeta({
        takes: [
          { id: 'take-1', shotId: id, takeNumber: 1 },
          { id: 'take-2', shotId: 'some-other-shot', takeNumber: 1 },
        ],
      });
    });

    await run(() => {
      result.current.deleteShot(id);
    });

    expect((result.current.project.takes ?? []).map((t) => t.id)).toEqual(['take-2']);
  });

  it('cleans storyboard, schedule, script and continuity references together', async () => {
    const { result } = await mountProvider();
    let id = '';
    await run(() => {
      id = result.current.addShot({ name: 'Referenced everywhere', storyboardImage: 'data:image/png;base64,AA==' });
    });
    await run(() => {
      result.current.updateProjectMeta((project) => ({
        setups: project.setups.map((setup) =>
          setup.id === project.activeSetupId
            ? { ...setup, storyboardOrder: [id, ...(setup.storyboardOrder ?? [])] }
            : setup,
        ),
        scheduleBlocks: [{ id: 'shot-strip', kind: 'shots', shotIds: [id] }],
        productionDays: [{ id: 'day-1', name: 'Day 1', scheduleBlockIds: ['shot-strip'] }],
        scriptLines: [{ id: 'line-1', lineNumber: 1, text: 'ANGLE ON', linkedShotId: id }],
        takes: [{ id: 'take-1', shotId: id, takeNumber: 1, isGoodTake: true }],
      }));
    });

    await run(() => result.current.deleteShot(id));

    const setup = result.current.project.setups.find((entry) => entry.id === result.current.project.activeSetupId)!;
    expect(setup.shots.some((shot) => shot.id === id)).toBe(false);
    expect(setup.storyboardOrder).not.toContain(id);
    expect(result.current.project.scheduleBlocks).toEqual([]);
    expect(result.current.project.productionDays?.[0].scheduleBlockIds).toEqual([]);
    expect(result.current.project.scriptLines?.[0].linkedShotId).toBeUndefined();
    expect(result.current.project.takes).toEqual([]);
  });
});

describe('insertShotAfter', () => {
  it('places the new shot directly after the one named', async () => {
    const { result } = await mountProvider();
    let first = '';
    await run(() => {
      first = result.current.addShot({ name: 'Anchor' });
    });
    await run(() => {
      result.current.addShot({ name: 'Trailing' });
    });

    let inserted = '';
    await run(() => {
      inserted = result.current.insertShotAfter(first);
    });

    const ids = shotsOf(result.current).map((s) => s.id);
    expect(ids[ids.indexOf(first) + 1]).toBe(inserted);
  });

  /**
   * Inserting twice after the same shot must produce two different numbers.
   * The old implementation derived the number from the neighbour alone and
   * could not see what was already taken, so both inserts came out as the same
   * number — and a shot number is what the stripboard, the call sheet and the
   * Resolve export all key on.
   */
  it('never repeats a number when inserting twice in the same place', async () => {
    const { result } = await mountProvider();
    let anchorId = '';
    await run(() => {
      anchorId = result.current.addShot();
    });

    await run(() => {
      result.current.insertShotAfter(anchorId);
    });
    await run(() => {
      result.current.insertShotAfter(anchorId);
    });

    const numbers = shotsOf(result.current).map((shot) => shot.shotNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  /**
   * Two shapes, both correct. After the LAST shot there is room to count on, so
   * an insert becomes the next whole number. Between two shots there is not, so
   * it letters the one it follows — the same algebra locked scene numbers use,
   * and the reason nothing already on a slate has to move.
   */
  it('counts on after the last shot and letters an insert in the middle', async () => {
    const { result } = await mountProvider();
    let first = '';
    await run(() => {
      first = result.current.addShot();
    });
    await run(() => {
      result.current.addShot();
    });

    const firstNumber = shotsOf(result.current).find((s) => s.id === first)?.shotNumber ?? '';
    const lastId = shotsOf(result.current).at(-1)!.id;
    const lastNumber = shotsOf(result.current).at(-1)!.shotNumber ?? '';

    let middle = '';
    await run(() => {
      middle = result.current.insertShotAfter(first);
    });
    let trailing = '';
    await run(() => {
      trailing = result.current.insertShotAfter(lastId);
    });

    const numberOf = (id: string) =>
      shotsOf(result.current).find((shot) => shot.id === id)?.shotNumber ?? '';

    // Squeezed between two shots: a letter on the one it follows.
    expect(numberOf(middle)).toMatch(/^1\/\d+[A-Z]+$/);
    expect(numberOf(middle).startsWith(firstNumber)).toBe(true);
    // Appended after the last: the next whole number, not a letter.
    expect(numberOf(trailing)).toMatch(/^1\/\d+$/);
    expect(numberOf(trailing)).not.toBe(lastNumber);

    // And the shots it was inserted around kept their numbers.
    expect(numberOf(first)).toBe(firstNumber);
    expect(numberOf(lastId)).toBe(lastNumber);
  });

  it('leaves existing numbers alone unless renumbering is asked for', async () => {
    const { result } = await mountProvider();
    let first = '';
    await run(() => {
      first = result.current.addShot();
    });
    await run(() => {
      result.current.addShot();
    });
    const before = shotsOf(result.current).map((s) => s.shotNumber);

    await run(() => {
      result.current.insertShotAfter(first);
    });

    const after = shotsOf(result.current)
      .map((s) => s.shotNumber)
      .filter((n) => before.includes(n));
    expect(after).toEqual(before);
  });
});

describe('reorderShots', () => {
  it('reorders without inventing or losing shots', async () => {
    const { result } = await mountProvider();
    await run(() => {
      result.current.addShot({ name: 'A' });
    });
    await run(() => {
      result.current.addShot({ name: 'B' });
    });

    const before = shotsOf(result.current).map((s) => s.id);
    await run(() => {
      result.current.reorderShots(before.length - 1, 0);
    });

    const after = shotsOf(result.current).map((s) => s.id);
    expect([...after].sort()).toEqual([...before].sort());
    expect(after[0]).toBe(before[before.length - 1]);
  });
});

describe('camera letters', () => {
  const lettersOn = (api: Parameters<typeof shotsOf>[0]) =>
    elementsOf(api, 'camera').map((camera) => (camera as { cameraLabel?: string }).cameraLabel);

  /**
   * In MULTI-camera mode the letter distinguishes concurrent cameras, and it
   * reaches the `Camera #` column of the Resolve metadata export — two cameras
   * sharing one makes two setups claim to be the same camera in the media
   * pool, which no downstream tool can untangle.
   */
  it('never issues a letter already on the setup in multi-camera mode', async () => {
    const { result } = await mountProvider();
    await run(() => {
      result.current.setShootMode('multi_cam');
    });

    // Checked per creation rather than in aggregate: the question is whether
    // the rule that picks a letter can pick one that is taken, and only the
    // labels present at that moment can answer it.
    for (let i = 0; i < 3; i += 1) {
      const before = new Set(lettersOn(result.current));
      await run(() => {
        result.current.createCameraAndShot();
      });
      const added = lettersOn(result.current).filter((letter, index, all) =>
        all.indexOf(letter) === index ? !before.has(letter) : false,
      );
      for (const letter of added) {
        expect(before.has(letter)).toBe(false);
      }
      expect(new Set(lettersOn(result.current)).size).toBe(
        lettersOn(result.current).length,
      );
    }
  });

  /**
   * SINGLE-camera mode is the opposite by design: one camera moves through the
   * coverage, so every position is Camera A. The repeat is the feature, and it
   * is characterised here so a refactor cannot "fix" it into uniqueness.
   */
  it('deliberately reuses A in single-camera mode', async () => {
    const { result } = await mountProvider();
    await run(() => {
      result.current.setShootMode('single_cam');
    });

    const before = lettersOn(result.current).length;
    await run(() => {
      result.current.createCameraAndShot();
    });

    const letters = lettersOn(result.current);
    expect(letters).toHaveLength(before + 1);
    expect(letters.at(-1)).toBe('A');
  });
});

describe('history', () => {
  it('undoes an added shot and redoes it', async () => {
    const { result } = await mountProvider();
    const before = shotsOf(result.current).length;

    await run(() => {
      result.current.addShot();
    });
    expect(shotsOf(result.current)).toHaveLength(before + 1);

    await run(() => {
      result.current.undo();
    });
    expect(shotsOf(result.current)).toHaveLength(before);

    await run(() => {
      result.current.redo();
    });
    expect(shotsOf(result.current)).toHaveLength(before + 1);
  });
});
