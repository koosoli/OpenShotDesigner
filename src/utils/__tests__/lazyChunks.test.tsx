/**
 * The stale-chunk reload.
 *
 * This is worth testing carefully for one reason: the failure mode of getting
 * it wrong is a page that reloads forever. A guard that does not stick turns a
 * single missing file into an infinite loop, which is far worse than the error
 * it was trying to hide.
 *
 * So the cases below are mostly about the guard — that it reloads once, that
 * the second failure is allowed through to the error boundary, and that a
 * later success clears it so the NEXT deploy gets its own attempt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';

const RELOAD_GUARD = 'cineplan_chunk_reload';

let reloads = 0;

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  reloads = 0;
  // jsdom's `location.reload` is not implemented and throws "Not implemented".
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: () => { reloads += 1; } },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const Panel = () => <div>panel content</div>;

/** Render a lazy component built from `factory`, inside a boundary. */
const renderLazy = async (factory: () => Promise<{ default: React.ComponentType }>) => {
  const { lazyWithRetry } = await import('../lazyChunks');
  const Lazy = lazyWithRetry(factory);

  class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    render() {
      return this.state.failed ? <div>load failed</div> : this.props.children;
    }
  }

  return render(
    <Boundary>
      <Suspense fallback={<div>loading</div>}>
        <Lazy />
      </Suspense>
    </Boundary>,
  );
};

/** What a missing chunk actually throws. */
const chunkMissing = () =>
  Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/X-abc.js'));

describe('a chunk that loads', () => {
  it('renders it', async () => {
    await renderLazy(async () => ({ default: Panel }));
    await waitFor(() => expect(screen.getByText('panel content')).toBeTruthy());
    expect(reloads).toBe(0);
  });

  it('clears the guard, so a later deploy gets its own reload', async () => {
    // Otherwise one stale deploy locks out the recovery for every future one,
    // and the second time this happens the user just sees a broken panel.
    sessionStorage.setItem(RELOAD_GUARD, '1');
    await renderLazy(async () => ({ default: Panel }));
    await waitFor(() => expect(screen.getByText('panel content')).toBeTruthy());
    expect(sessionStorage.getItem(RELOAD_GUARD)).toBeNull();
  });
});

describe('a chunk that is missing because the deploy moved', () => {
  it('reloads the page once', async () => {
    await renderLazy(chunkMissing);
    await waitFor(() => expect(reloads).toBe(1));
    expect(sessionStorage.getItem(RELOAD_GUARD)).toBe('1');
  });

  it('shows the fallback rather than an error while the reload takes over', async () => {
    // Resolving would render against a build whose files are gone.
    await renderLazy(chunkMissing);
    await waitFor(() => expect(reloads).toBe(1));
    expect(screen.getByText('loading')).toBeTruthy();
    expect(screen.queryByText('load failed')).toBeNull();
  });

  it('does NOT reload a second time — it lets the error through', async () => {
    // The case that matters. Offline, a blocked request or a genuinely broken
    // build all fail the same way, and reloading on each one spins forever.
    sessionStorage.setItem(RELOAD_GUARD, '1');
    await renderLazy(chunkMissing);
    await waitFor(() => expect(screen.getByText('load failed')).toBeTruthy());
    expect(reloads).toBe(0);
  });

  it('reports the error rather than reloading when storage is blocked', async () => {
    // With nowhere to record the attempt there is no way to stop a loop, so
    // the safe half of the trade is a visible error.
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('storage disabled');
    };
    try {
      await renderLazy(chunkMissing);
      await waitFor(() => expect(screen.getByText('load failed')).toBeTruthy());
      expect(reloads).toBe(0);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

describe('prefetching', () => {
  it('requests every registered chunk once the browser is idle', async () => {
    const { lazyWithRetry, prefetchLazyChunks } = await import('../lazyChunks');
    const calls: string[] = [];
    lazyWithRetry(async () => {
      calls.push('a');
      return { default: Panel };
    });
    lazyWithRetry(async () => {
      calls.push('b');
      return { default: Panel };
    });

    expect(calls).toEqual([]); // nothing fetched merely by declaring them
    prefetchLazyChunks();
    // jsdom has no `requestIdleCallback`, so this takes the setTimeout
    // fallback — deliberately a couple of seconds in production, hence the
    // longer window here.
    await waitFor(() => expect(calls.sort()).toEqual(['a', 'b']), { timeout: 4000 });
  });

  it('survives a chunk that cannot be fetched', async () => {
    // A warm-up must never be the thing that breaks the app; the real request
    // happens later, where the failure is handled properly.
    const { lazyWithRetry, prefetchLazyChunks } = await import('../lazyChunks');
    lazyWithRetry(chunkMissing);
    expect(() => prefetchLazyChunks()).not.toThrow();
    await new Promise((r) => setTimeout(r, 2500));
    expect(reloads).toBe(0);
  });
});
