/**
 * The equipment manifest, driven through the panel.
 *
 * The manifest is derived, not authored: cameras, lights, props and track on
 * the floor plan become line items, and the budget and the load list both read
 * the result. That makes two properties worth holding onto — the derived rows
 * follow the plan, and anything a user typed on top of them survives, because
 * a manifest that quietly discards a hand-added item is one nobody trusts
 * enough to use.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPanel } from './renderPanel';

afterEach(cleanup);

const mount = () =>
  renderPanel({ module: 'equipment/EquipmentPanel', exportName: 'EquipmentPanel' });

const activeSetupOf = (project: ReturnType<Awaited<ReturnType<typeof mount>>['project']>) =>
  project.setups.find((setup) => setup.id === project.activeSetupId) ?? project.setups[0];

describe('EquipmentPanel', () => {
  it('lists gear derived from what is on the floor plan', async () => {
    const { project } = await mount();
    const setup = activeSetupOf(project());
    const cameras = setup.elements.filter((element) => element.type === 'camera');
    expect(cameras.length).toBeGreaterThan(0);

    // The camera on the plan appears as a line item without anyone typing it.
    const text = document.body.textContent ?? '';
    expect(/camera/i.test(text)).toBe(true);
  });

  it('filters the list without changing the project', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    const before = JSON.stringify(activeSetupOf(project()).customEquipment ?? []);

    const search = screen.getByPlaceholderText(/Search gear, brand, model/i);
    await user.type(search, 'zzzz-no-such-gear');

    expect(JSON.stringify(activeSetupOf(project()).customEquipment ?? [])).toBe(before);
  });

  /**
   * A search box that cannot be cleared strands the user on an empty list and
   * reads as "the manifest lost my gear".
   */
  it('clears the search again', async () => {
    const user = userEvent.setup();
    await mount();

    const search = screen.getByPlaceholderText<HTMLInputElement>(/Search gear, brand, model/i);
    await user.type(search, 'zzzz');
    expect(search.value).toBe('zzzz');

    await user.click(screen.getByRole('button', { name: 'Clear the equipment search' }));
    expect(search.value).toBe('');
  });

  it('adds a custom item to the setup once the form is submitted', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    const before = (activeSetupOf(project()).customEquipment ?? []).length;

    // The button opens a form; nothing is added until it is submitted, which is
    // the behaviour worth pinning — a click that silently created a blank row
    // would fill the manifest with noise.
    await user.click(screen.getByTitle('Add custom production item'));
    expect(activeSetupOf(project()).customEquipment ?? []).toHaveLength(before);

    await user.click(screen.getByRole('button', { name: /Add Item/i }));

    expect(activeSetupOf(project()).customEquipment ?? []).toHaveLength(before + 1);
  });

  /**
   * Resetting rebuilds the derived rows from the plan. It must not be a way to
   * lose gear that was typed rather than drawn — that is the difference between
   * "recompute" and "discard".
   */
  it('keeps hand-added gear when the derived list is reset', async () => {
    const user = userEvent.setup();
    const { project } = await mount();

    await user.click(screen.getByTitle('Add custom production item'));
    await user.click(screen.getByRole('button', { name: /Add Item/i }));
    const added = (activeSetupOf(project()).customEquipment ?? []).at(-1);
    expect(added).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'More gear actions' }));
    await user.click(screen.getByRole('button', { name: 'Reset overrides' }));

    const after = activeSetupOf(project()).customEquipment ?? [];
    expect(after.some((item) => item.id === added!.id)).toBe(true);
  });
});
