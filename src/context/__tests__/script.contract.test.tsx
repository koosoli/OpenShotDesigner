/**
 * The script actions, characterised.
 *
 * `setScriptLines` is the widest-reaching write in the context: one call
 * renumbers scenes, rederives the scene list and the character catalog,
 * restamps omitted schedule strips, and prunes the linings and the breakdown
 * tags that pointed at lines which have gone. Everything downstream of a
 * screenplay resolves through what it leaves behind.
 *
 * The pruning case is the one that was actually broken. It lived in
 * `ScriptPanel`, so it only ran for edits made through the panel — and
 * `setSceneNumbersLocked` and every import path call the context directly.
 * A test that drove the panel would have passed throughout, which is why this
 * one drives the context.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { mountProvider, run } from './providerHarness';
import type { ScriptLine } from '../../types';

afterEach(cleanup);

let counter = 0;
const line = (partial: Partial<ScriptLine> & { text: string }): ScriptLine =>
  ({
    id: `line-${(counter += 1)}`,
    type: 'action',
    lineNumber: 1,
    ...partial,
  }) as ScriptLine;

/** A two-scene script, with a tagged prop on a line of the second. */
const seed = async () => {
  const { result } = await mountProvider();

  const sceneOne = line({ type: 'scene', text: 'INT. KITCHEN - DAY' });
  const keptLine = line({ text: 'JENNA pours coffee.' });
  const sceneTwo = line({ type: 'scene', text: 'EXT. STREET - NIGHT' });
  const doomedLine = line({ text: 'MARCUS drops the LAPTOP.' });

  await run(() => {
    result.current.setScriptLines([sceneOne, keptLine, sceneTwo, doomedLine]);
  });
  await run(() => {
    result.current.updateProjectMeta({
      breakdownItems: [
        {
          id: 'item-laptop',
          category: 'prop',
          name: 'Laptop',
          sourceScriptLineIds: [keptLine.id, doomedLine.id],
          sourceRanges: [{ lineId: doomedLine.id, startOffset: 18, endOffset: 24 }],
        },
      ],
    });
  });

  return { result, sceneOne, keptLine, sceneTwo, doomedLine };
};

const laptop = (result: Awaited<ReturnType<typeof seed>>['result']) =>
  (result.current.project.breakdownItems ?? []).find((item) => item.id === 'item-laptop');

describe('setScriptLines — breakdown tags', () => {
  it('drops tags on lines that no longer exist', async () => {
    const { result, sceneOne, keptLine, sceneTwo } = await seed();

    await run(() => {
      result.current.setScriptLines([sceneOne, keptLine, sceneTwo]);
    });

    expect(laptop(result)?.sourceScriptLineIds).toEqual([keptLine.id]);
    expect(laptop(result)?.sourceRanges).toEqual([]);
  });

  it('keeps the item itself when every line it was tagged from is gone', async () => {
    // The element is still in the breakdown — a production still needs the
    // laptop — it has simply stopped pointing at the script. Deleting the item
    // would throw away whatever else was attached to it.
    const { result, sceneOne, sceneTwo } = await seed();

    await run(() => {
      result.current.setScriptLines([sceneOne, sceneTwo]);
    });

    expect(laptop(result)).toBeTruthy();
    expect(laptop(result)?.sourceScriptLineIds).toEqual([]);
  });

  it('leaves tags alone when nothing was removed', async () => {
    const { result, sceneOne, keptLine, sceneTwo, doomedLine } = await seed();
    const before = laptop(result);

    await run(() => {
      result.current.setScriptLines([
        sceneOne,
        keptLine,
        sceneTwo,
        doomedLine,
        line({ text: 'He walks away.' }),
      ]);
    });

    expect(laptop(result)?.sourceScriptLineIds).toEqual(before?.sourceScriptLineIds);
  });

  it('prunes when the caller is not the script panel', async () => {
    /**
     * The actual defect. `setSceneNumbersLocked` calls `setScriptLines`
     * straight through, and the pruning used to live in the panel's wrapper —
     * so this path renumbered the scenes and left the tags dangling.
     *
     * Verified by mutation: removing the `breakdownItems` line from the
     * context's updater turns this red while the panel's own tests stay green,
     * which is exactly how the bug survived.
     */
    const { result, sceneOne, keptLine, sceneTwo } = await seed();

    // Remove a line the tag points at WITHOUT going through the panel...
    await run(() => {
      result.current.setScriptLines([sceneOne, keptLine, sceneTwo]);
    });
    // ...and then take another context-only path over the same lines.
    await run(() => {
      result.current.setSceneNumbersLocked(true);
    });

    const ids = laptop(result)?.sourceScriptLineIds ?? [];
    expect(ids).toEqual([keptLine.id]);
  });

  it('keeps a tag on a line inside an omitted scene body', async () => {
    // Those lines are hidden, not gone: a tag on one has to survive restoring
    // the scene. Linings are filtered against the flat list instead, because a
    // stroke into a hidden body would be drawn nowhere.
    const { result, sceneOne, keptLine, sceneTwo, doomedLine } = await seed();

    await run(() => {
      result.current.setScriptLines([
        sceneOne,
        keptLine,
        { ...sceneTwo, omittedBody: [doomedLine] } as ScriptLine,
      ]);
    });

    expect(laptop(result)?.sourceScriptLineIds).toEqual([keptLine.id, doomedLine.id]);
  });
});

describe('setScriptLines — the rest of the contract', () => {
  it('numbers the lines by position', async () => {
    const { result, sceneOne, keptLine, sceneTwo } = await seed();

    await run(() => {
      result.current.setScriptLines([sceneTwo, keptLine, sceneOne]);
    });

    expect(result.current.project.scriptLines?.map((entry) => entry.lineNumber)).toEqual([1, 2, 3]);
  });

  it('derives the scene list from the headings', async () => {
    const { result } = await seed();
    const scenes = result.current.project.scriptScenes ?? [];
    expect(scenes.map((scene) => scene.heading)).toEqual([
      'INT. KITCHEN - DAY',
      'EXT. STREET - NIGHT',
    ]);
  });

  it('drops linings that pointed at removed lines', async () => {
    const { result, sceneOne, keptLine, sceneTwo, doomedLine } = await seed();
    await run(() => {
      result.current.updateProjectMeta((previous) => ({
        setups: previous.setups.map((setup, index) =>
          index === 0
            ? {
                ...setup,
                scriptMarks: [
                  {
                    id: 'mark-1',
                    shotId: 'shot-1',
                    startLineId: doomedLine.id,
                    endLineId: doomedLine.id,
                    label: '1A',
                    color: '#fff',
                  },
                ],
              }
            : setup,
        ),
      }));
    });

    await run(() => {
      result.current.setScriptLines([sceneOne, keptLine, sceneTwo]);
    });

    expect(result.current.project.setups[0].scriptMarks ?? []).toEqual([]);
  });
});
