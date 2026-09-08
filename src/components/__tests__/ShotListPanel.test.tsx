/**
 * The shot list, driven the way a user drives it.
 *
 * This is the panel most features touch, and the one where a seam bug is most
 * expensive: a shot number reaches the stripboard, the call sheet, the slate
 * and the Resolve metadata export, so a value that looks fine on screen but is
 * not what got persisted goes a long way before anyone notices.
 *
 * Mounted over the real provider (see `renderPanel`), because the interesting
 * question is whether typing in a field actually changes the project — not
 * whether the component calls a callback.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPanel } from './renderPanel';

afterEach(cleanup);

const mount = () =>
  renderPanel({ module: 'shotlist/ShotListPanel', exportName: 'ShotListPanel' });

/** Shot-number fields, in the order the list shows them. */
const shotNumberFields = () =>
  screen
    .getAllByRole('textbox')
    .filter((field) => /^\d+\/\d/.test((field as HTMLInputElement).value)) as HTMLInputElement[];

describe('ShotListPanel', () => {
  it('lists the shots that are on the project', async () => {
    const { project } = await mount();
    const expected = project().setups[0].shots.map((shot) => shot.shotNumber);
    expect(shotNumberFields().map((field) => field.value)).toEqual(expected);
  });

  /**
   * Editing a shot number by hand is allowed — an AC's slate is the authority,
   * not the app — so what matters is that the typed value is what persists.
   */
  it('persists an edited shot number', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    const field = shotNumberFields()[0];
    const shotId = project().setups[0].shots[0].id;
    const before = field.value;

    await user.click(field);
    await user.keyboard('{End}A');

    const shot = project().setups[0].shots.find((candidate) => candidate.id === shotId);
    expect(shot?.shotNumber).toBe(`${before}A`);
  });

  it('persists a lens change through the picker', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    const shotId = project().setups[0].shots[0].id;

    const lensPicker = screen
      .getAllByRole('combobox')
      .find((box) =>
        Array.from((box as HTMLSelectElement).options).some((option) => option.text === '85mm'),
      ) as HTMLSelectElement;
    await user.selectOptions(lensPicker, '85');

    expect(project().setups[0].shots.find((s) => s.id === shotId)?.lensMm).toBe(85);
  });

  /**
   * The dropdown offers the letter the app would actually issue. It used to
   * compute its own, starting at A rather than reserving it, so the label could
   * promise a camera you would not get.
   */
  it('offers the next free camera letter', async () => {
    const { project } = await mount();
    const used = new Set(
      project()
        .setups[0].elements.filter((element) => element.type === 'camera')
        .map((camera) => ((camera as { cameraLabel?: string }).cameraLabel || 'A').toUpperCase()),
    );

    const picker = screen
      .getAllByRole('combobox')
      .find((box) =>
        Array.from((box as HTMLSelectElement).options).some((option) =>
          /New camera/.test(option.text),
        ),
      ) as HTMLSelectElement;
    const offered = Array.from(picker.options)
      .map((option) => option.text)
      .find((text) => /New camera/.test(text));

    const letter = offered?.match(/\(([A-Z])\)/)?.[1];
    expect(letter).toBeTruthy();
    expect(used.has(letter!)).toBe(false);
  });

  it('adds a shot without disturbing the numbers already there', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    const before = project().setups[0].shots.map((shot) => shot.shotNumber);

    const addButton = screen.getByTitle(/Add a new Camera on Floor Plan/);
    await user.click(addButton);

    const after = project().setups[0].shots.map((shot) => shot.shotNumber);
    expect(after).toHaveLength(before.length + 1);
    expect(after.slice(0, before.length)).toEqual(before);
    // And the new number is not one that already existed.
    expect(before).not.toContain(after.at(-1));
  });
});

/**
 * Row window (audit 2026-09-08, P2 "Skalierung").
 *
 * Measured: one shot row is 111 DOM nodes, so a feature-sized list of 1.000
 * shots is ~111.000 nodes and roughly 700 ms of DOM construction before React
 * does anything. The derivations are free by comparison — the cost is the
 * nodes — so the fix is to not build them all at once.
 *
 * What these pin is the part that makes it safe rather than merely fast: the
 * hidden rows are announced, they are reachable, and the window slices from
 * the start so drag-to-reorder indices still line up with the full array.
 */
describe('ShotListPanel row window', () => {
  const manyShots = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `shot-${index}`,
      sceneNumber: '1',
      shotNumber: `1/${index + 1}`,
      name: `Shot ${index + 1}`,
      cameraId: '',
      cameraLabel: 'A',
      shotSize: 'MS',
      lensMm: 35,
      cameraAngle: 'Eye Level',
      movement: 'Static',
      aspectRatio: '16:9',
      frameRate: 25,
      subjectActorIds: [],
      framingDescription: '',
      status: 'planned',
      takesCount: 0,
      estDurationSeconds: 10,
      order: index + 1,
    }));

  it('renders every shot when the list is small', async () => {
    const { api, act, container } = await mount();
    await act(() => {
      api().updateSetupMeta({ shots: manyShots(12) } as never);
    });
    expect(container.querySelectorAll('tbody tr').length).toBe(12);
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it('caps the rendered rows on a feature-sized list and says so', async () => {
    const { api, act, container } = await mount();
    await act(() => {
      api().updateSetupMeta({ shots: manyShots(1000) } as never);
    });

    const rendered = container.querySelectorAll('tbody tr').length;
    expect(rendered).toBeLessThan(1000);
    expect(rendered).toBeGreaterThan(0);
    // Silence here would read as data loss to a producer.
    expect(screen.getByText(/Showing the first/)).toBeTruthy();
    expect(screen.getByText(/of 1000 shots/)).toBeTruthy();
  });

  it('reassures the reader that exports are unaffected', async () => {
    const { api, act } = await mount();
    await act(() => {
      api().updateSetupMeta({ shots: manyShots(1000) } as never);
    });
    expect(screen.getByText(/Exports and reports always include all of them/)).toBeTruthy();
  });

  it('renders the whole list on request', async () => {
    // 220, not 1.000: the property is "the escape hatch renders everything",
    // and it needs only to exceed the 200-row window. Rendering a feature-sized
    // list in jsdom costs tens of seconds — the very cost this feature exists
    // to avoid, so paying it on every CI run would be perverse.
    //
    // `fireEvent` rather than `userEvent` for the same reason: userEvent's
    // pointer simulation walks the tree, which is what is expensive here.
    const { api, act, container } = await mount();
    await act(() => {
      api().updateSetupMeta({ shots: manyShots(220) } as never);
    });

    fireEvent.click(screen.getByRole('button', { name: /Show all 220/ }));
    expect(container.querySelectorAll('tbody tr').length).toBe(220);
    expect(screen.queryByText(/Showing the first/)).toBeNull();
    // 60s, not the suite's 20s default. Rendering 220 of these rows in jsdom
    // with eight workers competing genuinely takes ~20 seconds — which is the
    // measurement this whole feature rests on, restated as a test budget. The
    // slowness is the point, not a flake to paper over.
  }, 60_000);

  it('keeps the window anchored at the start so reorder indices still line up', async () => {
    const { api, act, container } = await mount();
    await act(() => {
      api().updateSetupMeta({ shots: manyShots(1000) } as never);
    });

    // Slicing from 0 is what makes row index === position in the full array.
    // A window that started anywhere else would silently corrupt a drag.
    // Shot names live in inputs, so read values rather than text content.
    const names = [...container.querySelectorAll('tbody input')]
      .map((input) => (input as HTMLInputElement).value)
      .filter((value) => value.startsWith('Shot '));
    expect(names[0]).toBe('Shot 1');
    expect(names).not.toContain('Shot 1000');
  });
});
