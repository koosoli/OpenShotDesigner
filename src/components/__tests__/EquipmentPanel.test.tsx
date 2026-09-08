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

/**
 * Chrome reduction (audit 2026-09-08, P2 "GUI-Dichte").
 *
 * The panel used to stack eight full-width bands above the first data row, so
 * roughly half its height was controls. Two of those — the power summary and
 * the DMX summary — are now one collapsible digest, and the editing hint can
 * be dismissed permanently.
 *
 * These tests pin the two properties that make that an improvement rather than
 * a hiding place: an urgent number stays readable while collapsed, and both
 * choices survive a reload. A collapse that forgets itself is worse than no
 * collapse at all, because the user has to close it every single time.
 */
describe('EquipmentPanel chrome', () => {
  const bandButton = () => screen.getByRole('button', { name: /Load & patch/i });

  it('starts with the technical detail collapsed', async () => {
    await mount();
    expect(bandButton().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/power run/i)).toBeNull();
  });

  it('keeps the headline load and patch figures visible while collapsed', async () => {
    await mount();
    // The point of collapsing is to remove noise, not to hide a fault: an
    // overload or a patch conflict must still be legible without expanding.
    expect(bandButton().textContent).toMatch(/W/);
    expect(bandButton().textContent).toMatch(/DMX \d+\/\d+/);
  });

  it('reveals the full power and DMX strips on expand', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(bandButton());
    expect(bandButton().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/power run/i)).toBeTruthy();
  });

  it('records the expanded state as a viewer preference', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(bandButton());
    // Persistence itself is the hook's contract and is tested there
    // (utils/__tests__/usePersistentUiState.test.ts). What belongs here is
    // that the panel actually writes through it rather than holding the state
    // in a plain useState that dies with the component.
    expect(localStorage.getItem('openshotdesigner_ui_gear.technicalBand')).toBe('true');
  });

  it('dismisses the editing hint and records that too', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: 'Dismiss this hint' }));
    expect(screen.queryByRole('button', { name: 'Dismiss this hint' })).toBeNull();
    expect(localStorage.getItem('openshotdesigner_ui_gear.editingHint.dismissed')).toBe('true');
  });
});
