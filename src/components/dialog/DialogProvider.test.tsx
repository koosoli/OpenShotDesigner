/**
 * The in-app dialog system that replaced `window.alert` / `window.confirm`.
 *
 * Native dialogs block the main thread, cannot be styled, and are a dead end
 * for automated tests, so every destructive or informative prompt in the app
 * goes through this provider. These tests pin the contract each call site
 * relies on: confirm resolves true only on the confirm action, everything
 * else (cancel button, Escape) resolves false and aborts the guarded action,
 * and a notice resolves once acknowledged.
 *
 * BEHAVIOUR-ONLY: drive the DOM the way a user does, assert what is visible
 * and how the awaiting caller settled. Nothing here asserts context
 * internals.
 */
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DialogProvider, useDialogs } from './DialogProvider';

afterEach(() => {
  cleanup();
});

/** A trigger plus a readout of how the awaiting caller settled. */
const Probe: React.FC = () => {
  const { confirm, notice, prompt } = useDialogs();
  const [outcome, setOutcome] = useState('pending');
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void confirm({
            title: 'Delete board?',
            message: 'Line one\nLine two',
            confirmLabel: 'Delete',
            danger: true,
          }).then((confirmed) => setOutcome(confirmed ? 'confirmed' : 'cancelled'));
        }}
      >
        ask
      </button>
      <button
        type="button"
        onClick={() => {
          void notice({ title: 'MVR exported', message: 'All good' }).then(() => setOutcome('noticed'));
        }}
      >
        tell
      </button>
      <button
        type="button"
        onClick={() => {
          void prompt({
            title: 'Name this assembly',
            label: 'Assembly name',
            defaultValue: '3 elements',
            requireValue: true,
          }).then((value) => setOutcome(value === null ? 'cancelled' : `named:${value}`));
        }}
      >
        name
      </button>
      <button
        type="button"
        onClick={() => {
          void prompt({ title: 'Add a note', label: 'Note' }).then((value) =>
            setOutcome(value === null ? 'cancelled' : `note:${value}`),
          );
        }}
      >
        note
      </button>
      <span data-testid="outcome">{outcome}</span>
    </div>
  );
};

const renderProbe = () =>
  render(
    <DialogProvider>
      <Probe />
    </DialogProvider>,
  );

const expectOutcome = async (value: string) => {
  await waitFor(() => expect(screen.getByTestId('outcome').textContent).toBe(value));
};

describe('confirm', () => {
  it('resolves true when the confirm action is picked', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('ask'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByTestId('dialog-title').textContent).toBe('Delete board?');
    // Multi-line warnings keep their line breaks, as the native dialog showed.
    expect(screen.getByTestId('dialog-message').textContent).toBe('Line one\nLine two');
    fireEvent.click(screen.getByTestId('dialog-confirm'));
    await expectOutcome('confirmed');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('resolves false when the safe action is picked', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('ask'));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByTestId('dialog-cancel'));
    await expectOutcome('cancelled');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('resolves false on Escape, aborting the guarded action', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('ask'));
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await expectOutcome('cancelled');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('styles a destructive confirm differently from the safe action', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('ask'));
    await screen.findByRole('alertdialog');
    expect(screen.getByTestId('dialog-confirm').className).toMatch(/rose-600/);
    expect(screen.getByTestId('dialog-cancel').className).not.toMatch(/rose-600/);
  });
});

describe('notice', () => {
  it('resolves once acknowledged and then closes', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('tell'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByTestId('dialog-title').textContent).toBe('MVR exported');
    fireEvent.click(screen.getByTestId('dialog-ok'));
    await expectOutcome('noticed');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('also resolves on Escape', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('tell'));
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await expectOutcome('noticed');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('prompt', () => {
  it('opens pre-filled and resolves the edited value', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('name'));
    await screen.findByRole('dialog');
    const field = screen.getByTestId('dialog-input') as HTMLInputElement;
    expect(field.value).toBe('3 elements');
    fireEvent.change(field, { target: { value: 'Interview corner' } });
    fireEvent.click(screen.getByTestId('dialog-confirm'));
    await expectOutcome('named:Interview corner');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolves null on cancel, matching the native prompt contract', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('name'));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByTestId('dialog-cancel'));
    await expectOutcome('cancelled');
  });

  it('resolves null on Escape', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('name'));
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await expectOutcome('cancelled');
  });

  it('commits on Enter without reaching for the button', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('name'));
    await screen.findByRole('dialog');
    const field = screen.getByTestId('dialog-input');
    fireEvent.change(field, { target: { value: 'Kitchen rig' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await expectOutcome('named:Kitchen rig');
  });

  it('blocks an empty value when the caller requires one', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('name'));
    await screen.findByRole('dialog');
    const field = screen.getByTestId('dialog-input');
    fireEvent.change(field, { target: { value: '   ' } });
    const confirmButton = screen.getByTestId('dialog-confirm') as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    // Enter must respect the same guard, or the keyboard path bypasses it.
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByTestId('dialog-input')).toBeTruthy();
  });

  it('accepts an empty value when the caller does not require one', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('note'));
    await screen.findByRole('dialog');
    expect((screen.getByTestId('dialog-confirm') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('dialog-confirm'));
    await expectOutcome('note:');
  });

  it('opens each prompt on its own default rather than the last answer', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('name'));
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByTestId('dialog-input'), { target: { value: 'first' } });
    fireEvent.click(screen.getByTestId('dialog-confirm'));
    await expectOutcome('named:first');

    fireEvent.click(screen.getByText('name'));
    await screen.findByRole('dialog');
    expect((screen.getByTestId('dialog-input') as HTMLInputElement).value).toBe('3 elements');
  });
});
