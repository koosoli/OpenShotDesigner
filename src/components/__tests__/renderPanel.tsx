/**
 * Render a panel inside the REAL provider.
 *
 * The continuity tests stub the context, which works because that panel reads
 * four things from it. The bigger panels read dozens, and stubbing those would
 * mean maintaining a second implementation of the context — the stub would
 * drift, and a test passing against a drifted stub is worse than no test.
 *
 * So these mount the actual `FloorPlanProvider`. That makes them integration
 * tests rather than unit tests, which is the point: the defects this suite
 * exists for live between the component and the state it drives, not inside
 * either.
 *
 * Isolation is the same trick the provider-contract tests use, and for the
 * same reason: `projectLibrary` holds the open project in a module-level Map
 * behind an `initialized` flag, so wiping IndexedDB is not enough. Both the
 * provider and the panel must come from the SAME fresh module registry, or the
 * panel's `useFloorPlan` reads a different React context than the provider
 * writes and throws.
 */
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';

/** Wipe persisted state, letting any debounced save land first. */
export const resetStorage = async () => {
  await new Promise((resolve) => setTimeout(resolve, 60));
  localStorage.clear();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('local-workspace-v1');
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
};

export interface RenderPanelOptions {
  /** Module path of the panel, relative to `src/components`. */
  module: string;
  /** Named export to render. */
  exportName: string;
}

/**
 * Mount a panel over a fresh project.
 *
 * Returns the RTL result plus `project()`, so a test can assert on what an
 * interaction persisted rather than only on what it painted.
 */
export const renderPanel = async ({ module, exportName }: RenderPanelOptions) => {
  await resetStorage();
  vi.resetModules();

  const contextModule = await import('../../context/FloorPlanContext');
  const panelModule = (await import(`../${module}`)) as Record<string, React.ComponentType>;
  const Panel = panelModule[exportName];
  if (!Panel) throw new Error(`${module} has no export named ${exportName}`);

  const { FloorPlanProvider, useFloorPlan } = contextModule;

  let api: ReturnType<typeof useFloorPlan> | null = null;
  const Probe: React.FC = () => {
    api = useFloorPlan();
    return null;
  };

  const result = render(
    <FloorPlanProvider>
      <Probe />
      <Panel />
    </FloorPlanProvider>,
  );

  await waitFor(() => expect(api).toBeTruthy());

  // Wait for the asynchronous restore to settle before a test interacts, so an
  // early write is not overwritten by the load landing behind it.
  let previous = '';
  await waitFor(() => {
    const snapshot = JSON.stringify(
      api!.project.setups.map((setup) => ({
        id: setup.id,
        elements: setup.elements.length,
        shots: setup.shots.length,
      })),
    );
    const settled = snapshot === previous;
    previous = snapshot;
    expect(settled).toBe(true);
  });

  return {
    ...result,
    project: () => api!.project,
    api: () => api!,
    act: async (fn: () => void) => {
      await act(async () => {
        fn();
      });
    },
  };
};
