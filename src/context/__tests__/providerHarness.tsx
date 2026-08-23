/**
 * Harness for characterising `FloorPlanContext`.
 *
 * These tests drive the REAL provider — not a stub — because their job is to
 * pin the context's public contract before that file is split into domain
 * reducers. A stub would pin the stub.
 *
 * The contract, not the construction: every assertion goes through an action
 * on the returned API and reads the resulting `project`. Nothing here may
 * depend on how the provider stores things internally, which state hook holds
 * what, or which module an action ends up living in — that is precisely what
 * the split is free to change.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import type { useFloorPlan as UseFloorPlan } from '../FloorPlanContext';

export type FloorPlanApi = ReturnType<typeof UseFloorPlan>;

/**
 * Wipe persisted state between tests.
 *
 * The provider restores the last project from IndexedDB, so without this each
 * test inherits whatever the previous one left behind: shots and cameras
 * accumulate, and an assertion about "one more camera than before" starts
 * depending on test order. That is how a net becomes flaky, and a flaky net is
 * worse than none — it trains you to ignore it during exactly the refactor it
 * exists to guard.
 */
export const resetStorage = async () => {
  // Let any debounced save from the test just finished land BEFORE the delete.
  // Without this the write arrives after the wipe and the next provider
  // restores the previous test's project — which is exactly how this harness
  // first went wrong: a camera-uniqueness assertion failed on cameras created
  // by an earlier test in single-camera mode, where repeating "A" is correct.
  await new Promise((resolve) => setTimeout(resolve, 60));
  localStorage.clear();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('local-workspace-v1');
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
};

/**
 * Mount the provider and wait for it to settle.
 *
 * The provider restores from storage asynchronously; `waitFor` lets that
 * finish so a test never races the first paint.
 */
export interface MountOptions {
  /**
   * Keep whatever is already in storage instead of wiping it. Used by the
   * autosave/recovery tests, which need a second mount to see what the first
   * one persisted — the equivalent of the user closing the tab and coming back.
   */
  preserveStorage?: boolean;
}

export const mountProvider = async ({ preserveStorage = false }: MountOptions = {}) => {
  if (!preserveStorage) await resetStorage();
  // A fresh module registry per test. `projectLibrary` keeps the open project
  // in a module-level Map behind an `initialized` flag, and `idb` memoises its
  // connection promise, so wiping IndexedDB alone leaves the previous test's
  // project in memory — which is what made a camera assertion pass alone and
  // fail in the suite. Re-importing gives each test genuinely fresh state
  // without adding test-only reset hooks to production code.
  vi.resetModules();
  const { FloorPlanProvider, useFloorPlan } = await import('../FloorPlanContext');

  const rendered = renderHook(() => useFloorPlan(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <FloorPlanProvider>{children}</FloorPlanProvider>
    ),
  });
  await waitFor(() => expect(rendered.result.current.project).toBeTruthy());

  // Wait for the restore to SETTLE, not merely to produce a project. The
  // provider loads asynchronously and can replace the project after the first
  // paint; a test that starts interacting before then has its early writes
  // overwritten mid-flight, which showed up as an action appearing to create
  // three cameras instead of one. Two consecutive identical snapshots is the
  // signal that nothing further is in flight.
  let previous = '';
  await waitFor(() => {
    const snapshot = JSON.stringify({
      id: rendered.result.current.project.id,
      setups: rendered.result.current.project.setups.map((setup) => ({
        id: setup.id,
        elements: setup.elements.length,
        shots: setup.shots.length,
      })),
    });
    const settled = snapshot === previous;
    previous = snapshot;
    expect(settled).toBe(true);
  });

  return rendered;
};

/** Run an action and let React flush the resulting state. */
export const run = async (fn: () => void) => {
  await act(async () => {
    fn();
  });
};

/** The setup the app currently has open. */
export const activeSetupOf = (api: FloorPlanApi) =>
  api.project.setups.find((setup) => setup.id === api.project.activeSetupId) ??
  api.project.setups[0];

/** Every shot on the active setup, in stored order. */
export const shotsOf = (api: FloorPlanApi) => activeSetupOf(api).shots;

/** Every element of one type on the active setup. */
export const elementsOf = (api: FloorPlanApi, type: string) =>
  activeSetupOf(api).elements.filter((element) => element.type === type);
