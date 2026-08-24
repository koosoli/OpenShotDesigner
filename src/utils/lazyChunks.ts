/**
 * Lazy panels that survive a deploy, and feel instant after one.
 *
 * The panels are code-split so the first paint does not carry sixteen of them.
 * That is the right trade, but it has two costs on a static host, and both
 * showed up in the same session:
 *
 * ## A deploy breaks the page someone already has open
 *
 * Every build hashes its chunks, and a GitHub Pages deploy replaces the whole
 * directory. A browser holding the previous `index.html` therefore asks for
 * chunk names that no longer exist, and gets a 404 dressed up as
 * `TypeError: Failed to fetch dynamically imported module`. The page looks
 * fine until you open the one panel whose chunk went missing.
 *
 * Nothing about that is recoverable in place — the running page was built
 * against files that are gone. What fixes it is fetching `index.html` again,
 * so `lazyWithRetry` reloads once and lets the fresh build take over.
 *
 * The reload is guarded through `sessionStorage`. A chunk can also fail for
 * reasons a reload will never fix — offline, a blocked request, a genuinely
 * broken build — and a page that reloads on every failure would spin forever
 * instead of showing the error boundary. One attempt, then the error is real
 * and gets reported as one.
 *
 * ## Every panel pauses the first time it opens
 *
 * Splitting moves the download from startup to first use, which is only an
 * improvement if first use is not the moment someone is waiting. Opening a tab
 * and watching it fetch is exactly that moment.
 *
 * So the chunks are prefetched once the app is idle: the first paint stays
 * light, and by the time anyone reaches for a tab its code is already in the
 * browser cache. This is a warm-up, not a preload — it deliberately runs at
 * idle priority and never blocks anything.
 */
import React from 'react';
import type { ComponentType } from 'react';

/** Set once a stale-chunk reload has been attempted, so it cannot loop. */
const RELOAD_GUARD = 'cineplan_chunk_reload';

/** Every registered import, for the idle warm-up below. */
const factories: Array<() => Promise<unknown>> = [];

const readGuard = (): boolean => {
  try {
    return sessionStorage.getItem(RELOAD_GUARD) === '1';
  } catch {
    // Storage can be blocked outright. Without somewhere to record the
    // attempt, not reloading is the safe half of the trade: a visible error
    // beats a reload loop.
    return true;
  }
};

const writeGuard = (value: '1' | null): void => {
  try {
    if (value === null) sessionStorage.removeItem(RELOAD_GUARD);
    else sessionStorage.setItem(RELOAD_GUARD, value);
  } catch {}
};

/**
 * `React.lazy`, plus one reload when the chunk is missing because the deploy
 * moved underneath this page.
 */
// React's own `lazy` is typed `<T extends ComponentType<any>>`, and a narrower
// constraint does not compose: props are contravariant, so `never` or a record
// type makes every real component fail to match. Matching React's signature
// exactly is the honest option, and the disable sits on the line that needs it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lazyWithRetry = <T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> => {
  factories.push(factory);

  return React.lazy(async () => {
    try {
      const loaded = await factory();
      // A chunk arrived, so whatever was stale no longer is. Clearing here
      // rather than on load means the next stale deploy gets its own reload
      // instead of being locked out by this one.
      writeGuard(null);
      return loaded;
    } catch (error) {
      if (readGuard()) throw error;
      writeGuard('1');
      window.location.reload();
      // The reload takes over; resolving would render against a dead build.
      return new Promise<{ default: T }>(() => {});
    }
  });
};

/**
 * Warm the split chunks once the browser has nothing better to do.
 *
 * Failures are swallowed on purpose: this is an optimisation, and a chunk that
 * cannot be fetched now will be requested again — and properly handled — when
 * something actually renders it.
 */
export const prefetchLazyChunks = (): void => {
  const run = () => {
    for (const factory of factories) {
      try {
        void factory().catch(() => {});
      } catch {}
    }
  };

  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (typeof idle === 'function') idle(run);
  // No `requestIdleCallback` in Safari. A timeout is not the same promise
  // about priority, but it keeps the warm-up off the critical path, which is
  // the part that matters.
  else setTimeout(run, 2000);
};
