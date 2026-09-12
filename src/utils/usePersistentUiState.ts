/**
 * A small piece of view state that survives a reload.
 *
 * Panels in this app stack a lot of chrome above their content — filters,
 * view-mode switches, metric strips. Making a strip collapsible only helps if
 * it stays collapsed: a band that reopens on every reload is worse than one
 * that never collapsed, because now the user has to close it repeatedly.
 *
 * Scope is deliberately per-viewer, not per-project: whether someone keeps the
 * power summary open is a habit, not production data, and it has no business
 * in the `.osd` file or in an export.
 *
 * Storage failures are swallowed on both sides. A private window, a full quota
 * or a browser configured to block site data must never be able to stop a
 * panel from rendering — the preference is a convenience, and the fallback is
 * simply the default.
 */
import { useCallback, useRef, useState } from 'react';

const KEY_PREFIX = 'openshotdesigner_ui_';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/**
 * `useState` with a localStorage backing.
 *
 * Same shape as `useState`, including the functional updater, so a call site
 * can adopt it by changing one line.
 *
 * A CHANGING key re-reads. That is not just convenience: a single component
 * rendered for several subjects — one explanation strip serving sixteen
 * panels, say — would otherwise carry the first subject's stored value into
 * every later one, so dismissing the explanation on one panel silently
 * dismissed it on all of them. Read-once was the documented contract and it
 * was violated on the first shared call site, which is a good sign the
 * contract was the wrong one.
 *
 * A `null` key means "behave exactly like `useState`". That exists so a shared
 * component can offer persistence as an opt-in without its callers branching
 * between two different hooks — which would break the rules of hooks the
 * moment the prop was conditional.
 */
export const usePersistentUiState = <T,>(
  key: string | null,
  initial: T,
): [T, (next: T | ((previous: T) => T)) => void] => {
  const [value, setValue] = useState<T>(() => (key === null ? initial : read(key, initial)));

  // Re-read on a key change, during render rather than in an effect: an effect
  // would paint one frame with the previous subject's value, which for a
  // dismissed/undismissed strip is a visible flash of the wrong state.
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    const restored = key === null ? initial : read(key, initial);
    if (!Object.is(restored, value)) setValue(restored);
  }

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved =
          typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
        if (key !== null) {
          try {
            localStorage.setItem(KEY_PREFIX + key, JSON.stringify(resolved));
          } catch {
            // Preference only — never break the panel over it.
          }
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update];
};
