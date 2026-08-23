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
import { cleanup, screen } from '@testing-library/react';
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
