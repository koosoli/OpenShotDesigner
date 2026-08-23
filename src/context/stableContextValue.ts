/**
 * Keep a context value's identity stable across renders that changed nothing.
 *
 * The problem this solves is specific and expensive. `FloorPlanProvider` builds
 * its value as one large object literal containing both state and roughly two
 * hundred action functions. Every render produces a new object and a new
 * closure for every action, so the context value's identity changes on every
 * keystroke, every pointer move during a drag and every playback tick — and
 * every one of the fifty-odd `useFloorPlan()` consumers re-renders, including
 * the whole canvas and the inspector. `React.memo` on the SVG layers cannot
 * help while the callbacks handed to them are new objects each time.
 *
 * Two things are needed, and this does both:
 *
 *  - **Stable actions.** Each function is replaced, once, by a wrapper that
 *    forwards to the newest implementation through a ref. The wrapper's
 *    identity never changes; the behaviour is always current, because the ref
 *    is updated during render before anything can call it. Nothing is captured
 *    in a stale closure — the opposite of the usual `useCallback` hazard, since
 *    there is no dependency list to get wrong.
 *  - **Shallow-compared state.** The value is rebuilt each render and compared
 *    key by key against the last one handed out. If nothing differs, the
 *    previous object is returned and consumers do not re-render. This is
 *    deliberately a comparison rather than a `useMemo` dependency list: a
 *    dependency list over that many fields is a stale-UI bug waiting to be
 *    written, whereas a comparison cannot miss a field that changed.
 *
 * The ref writes during render are a memo cache, not a side effect: running the
 * render twice produces the same result, which is what React requires.
 *
 * The cost is one shallow compare over the value's keys per render — a few
 * hundred reference comparisons, against the alternative of re-rendering the
 * entire application.
 */
import { useRef } from 'react';

type UnknownRecord = Record<string, unknown>;
type AnyFunction = (...args: never[]) => unknown;

const shallowEqual = (a: UnknownRecord, b: UnknownRecord): boolean => {
  // The value is one fixed object literal, so the key sets always match; the
  // length check is a cheap guard in case that ever stops being true.
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) if (!Object.is(a[key], b[key])) return false;
  return true;
};

export const useStableContextValue = <T extends object>(next: T): T => {
  const latest = useRef(next);
  latest.current = next;

  // Built once, from the keys of the first render's value. The provider always
  // returns the same literal shape, so a key cannot appear later.
  const wrappers = useRef<UnknownRecord | null>(null);
  if (wrappers.current === null) {
    const built: UnknownRecord = {};
    for (const [key, value] of Object.entries(next as UnknownRecord)) {
      if (typeof value !== 'function') continue;
      built[key] = (...args: never[]): unknown => {
        const current = (latest.current as UnknownRecord)[key];
        if (typeof current !== 'function') {
          throw new Error(`Context member "${key}" is no longer a function`);
        }
        return (current as AnyFunction)(...args);
      };
    }
    wrappers.current = built;
  }

  const candidate = { ...(next as UnknownRecord), ...wrappers.current } as T;
  const handedOut = useRef<T | null>(null);
  if (
    handedOut.current === null ||
    !shallowEqual(handedOut.current as UnknownRecord, candidate as UnknownRecord)
  ) {
    handedOut.current = candidate;
  }
  return handedOut.current;
};
