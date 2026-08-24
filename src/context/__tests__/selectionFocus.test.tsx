/**
 * Which right-panel tabs a canvas selection is allowed to navigate away from.
 *
 * A single click on the plan opens the Inspector, which is right when you are
 * inspecting and wrong when you are working in another panel: it loses your
 * scroll position and whatever field you were typing in. Double-click stays
 * the deliberate way in — the canvas handlers set the tab themselves, so it
 * bypasses this guard entirely and is not what these tests pin.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetStorage } from './providerHarness';

/** Mount both providers and expose the two APIs the guard spans. */
const mountBoth = async () => {
  await resetStorage();
  vi.resetModules();
  const { FloorPlanProvider, useFloorPlan } = await import('../FloorPlanContext');
  const { WorkspaceUIProvider, useWorkspaceUI } = await import('../WorkspaceUIContext');

  const rendered = renderHook(
    () => ({ floor: useFloorPlan(), ui: useWorkspaceUI() }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <WorkspaceUIProvider>
          <FloorPlanProvider>{children}</FloorPlanProvider>
        </WorkspaceUIProvider>
      ),
    },
  );
  await waitFor(() => expect(rendered.result.current.floor.project).toBeTruthy());
  return rendered;
};

const run = async (fn: () => void) => {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
};

describe('selection and the active right tab', () => {
  beforeEach(async () => {
    await resetStorage();
  });

  it('opens on the inspector', async () => {
    const { result } = await mountBoth();
    expect(result.current.ui.activeRightTab).toBe('inspector');
  });

  it('stays on the shot list when an element is selected', async () => {
    const { result } = await mountBoth();
    let id = '';
    await run(() => {
      id = result.current.floor.addElement({ type: 'prop', x: 10, y: 10 });
    });
    await run(() => result.current.ui.setActiveRightTab('shots'));

    await run(() => result.current.floor.selectElement(id));

    expect(result.current.floor.selectedElementIds).toEqual([id]);
    expect(result.current.ui.activeRightTab).toBe('shots');
  });

  it('stays put for a multi-element selection too', async () => {
    const { result } = await mountBoth();
    let first = '';
    let second = '';
    await run(() => {
      first = result.current.floor.addElement({ type: 'prop', x: 1, y: 1 });
    });
    await run(() => {
      second = result.current.floor.addElement({ type: 'prop', x: 2, y: 2 });
    });
    await run(() => result.current.ui.setActiveRightTab('shots'));

    await run(() => result.current.floor.selectElements([first, second]));

    expect(result.current.ui.activeRightTab).toBe('shots');
  });

  it.each(['script', 'storyboard', 'equipment'] as const)(
    'leaves the %s panel alone as it always did',
    async (tab) => {
      const { result } = await mountBoth();
      let id = '';
      await run(() => {
        id = result.current.floor.addElement({ type: 'prop', x: 3, y: 3 });
      });
      await run(() => result.current.ui.setActiveRightTab(tab));

      await run(() => result.current.floor.selectElement(id));

      expect(result.current.ui.activeRightTab).toBe(tab);
    },
  );

  it('still opens the inspector from a tab that is not a working panel', async () => {
    const { result } = await mountBoth();
    let id = '';
    await run(() => {
      id = result.current.floor.addElement({ type: 'prop', x: 4, y: 4 });
    });
    await run(() => result.current.ui.setActiveRightTab('locations'));

    await run(() => result.current.floor.selectElement(id));

    expect(result.current.ui.activeRightTab).toBe('inspector');
  });
});
