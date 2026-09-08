/**
 * The viewfinder, mounted over a real project.
 *
 * 1.400 lines with no test until now. It is a modal, so the failure that
 * matters is narrow and total: it throws on open and the user cannot frame a
 * shot at all, or it opens against a camera that no longer exists and takes
 * the app down with it.
 *
 * What is NOT tested here, deliberately: the rendered frame itself.
 * `renderSimulatedFrame` needs a real 2D canvas context, which jsdom does not
 * provide, and it already returns null rather than throwing when the context
 * is missing — a test asserting "null in a headless environment" would assert
 * the environment, not the app. The optics behind the preview are covered in
 * `domain/camera/opticalComparison.test.ts` and `utils/__tests__/geometry.test.ts`.
 *
 * BEHAVIOUR-ONLY, like its neighbours.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderPanel } from './renderPanel';

afterEach(cleanup);

const mountViewfinder = () =>
  renderPanel({ module: 'viewfinder/ViewfinderModal', exportName: 'ViewfinderModal' });

describe('ViewfinderModal', () => {
  it('stays out of the tree until it is opened', async () => {
    const { container } = await mountViewfinder();
    expect(container.firstChild).toBeNull();
  });

  it('opens on the active camera and renders a framing surface', async () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });

    try {
      const { container, api, act, project } = await mountViewfinder();
      const camera = project()
        .setups.find((setup) => setup.id === project().activeSetupId)!
        .elements.find((element) => element.type === 'camera');
      expect(camera).toBeTruthy();

      await act(() => {
        api().openViewfinder(camera!.id);
      });

      expect(container.firstChild).toBeTruthy();
      expect((container.textContent ?? '').trim().length).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('closes again and leaves nothing behind over the canvas', async () => {
    const { container, api, act } = await mountViewfinder();
    await act(() => {
      api().openViewfinder();
    });
    expect(container.firstChild).toBeTruthy();

    await act(() => {
      api().closeViewfinder();
    });
    // A modal that keeps a transparent overlay mounted after closing swallows
    // every pointer event on the plan underneath it.
    expect(container.firstChild).toBeNull();
  });

  it('opens without a camera id rather than throwing', async () => {
    // The toolbar button opens the viewfinder with no argument when nothing is
    // selected; that path must pick a camera itself or show its empty state.
    const { container, api, act } = await mountViewfinder();
    await act(() => {
      api().openViewfinder();
    });
    expect(container.firstChild).toBeTruthy();
  });

  it('survives being opened on a camera that has since been deleted', async () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });

    try {
      const { api, act, project } = await mountViewfinder();
      const camera = project()
        .setups.find((setup) => setup.id === project().activeSetupId)!
        .elements.find((element) => element.type === 'camera');

      await act(() => {
        api().openViewfinder(camera!.id);
      });
      await act(() => {
        api().selectElement(camera!.id);
      });
      await act(() => {
        api().deleteSelectedElements();
      });

      // Whatever it decides to show, it must not crash: this is reachable by
      // deleting a camera from the inspector while the viewfinder is open.
      expect(errors).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
