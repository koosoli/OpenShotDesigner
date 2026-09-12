/**
 * The backing store for collapsed bands and dismissed hints.
 *
 * The reason this is worth its own tests rather than being trusted as "just
 * useState plus localStorage": both failure directions are silent. If writes
 * do not land, a collapsed band reopens on every reload and the chrome
 * reduction it was built for is undone. If reads throw instead of falling
 * back, a private window or a browser set to block site data takes the whole
 * panel down — which is a far worse outcome than losing a preference.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentUiState } from '../usePersistentUiState';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('usePersistentUiState', () => {
  it('starts on the given default when nothing is stored', () => {
    const { result } = renderHook(() => usePersistentUiState('band', false));
    expect(result.current[0]).toBe(false);
  });

  it('writes through to localStorage under a namespaced key', () => {
    const { result } = renderHook(() => usePersistentUiState('band', false));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    // Namespaced so a preference cannot collide with project storage.
    expect(localStorage.getItem('openshotdesigner_ui_band')).toBe('true');
  });

  it('restores a stored value on the next mount', () => {
    const first = renderHook(() => usePersistentUiState('band', false));
    act(() => first.result.current[1](true));
    first.unmount();

    const second = renderHook(() => usePersistentUiState('band', false));
    expect(second.result.current[0]).toBe(true);
  });

  it('supports the functional updater form', () => {
    const { result } = renderHook(() => usePersistentUiState('count', 1));
    act(() => result.current[1]((previous) => previous + 1));
    act(() => result.current[1]((previous) => previous + 1));
    expect(result.current[0]).toBe(3);
    expect(localStorage.getItem('openshotdesigner_ui_count')).toBe('3');
  });

  it('round-trips values that are not booleans', () => {
    const { result } = renderHook(() =>
      usePersistentUiState<{ sort: string; open: string[] }>('view', { sort: 'name', open: [] }),
    );
    act(() => result.current[1]({ sort: 'department', open: ['camera'] }));

    const remounted = renderHook(() =>
      usePersistentUiState<{ sort: string; open: string[] }>('view', { sort: 'name', open: [] }),
    );
    expect(remounted.result.current[0]).toEqual({ sort: 'department', open: ['camera'] });
  });

  it('falls back to the default when the stored value is corrupt', () => {
    localStorage.setItem('openshotdesigner_ui_band', '{not json');
    const { result } = renderHook(() => usePersistentUiState('band', false));
    expect(result.current[0]).toBe(false);
  });

  it('still renders when reading storage throws', () => {
    // Safari in private mode and browsers set to block site data throw on
    // access rather than returning null.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = renderHook(() => usePersistentUiState('band', true));
    expect(result.current[0]).toBe(true);
  });

  it('still updates in memory when writing to storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => usePersistentUiState('band', false));
    act(() => result.current[1](true));
    // The preference is lost on reload, which is acceptable. The panel
    // refusing to collapse at all would not be.
    expect(result.current[0]).toBe(true);
  });

  it('keeps two different keys apart', () => {
    const a = renderHook(() => usePersistentUiState('a', false));
    const b = renderHook(() => usePersistentUiState('b', false));
    act(() => a.result.current[1](true));
    expect(b.result.current[0]).toBe(false);
  });
});

describe('usePersistentUiState with a null key', () => {
  /**
   * The opt-in escape hatch. `RubricSection` offers persistence as a prop, so
   * some of its 38 call sites pass a key and some do not; branching between
   * two hooks on a prop would break the rules of hooks the moment the prop
   * became conditional.
   */
  it('behaves like plain useState and touches no storage', () => {
    const { result } = renderHook(() => usePersistentUiState(null, false));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.length).toBe(0);
  });

  it('does not restore across mounts', () => {
    const first = renderHook(() => usePersistentUiState(null, false));
    act(() => first.result.current[1](true));
    first.unmount();

    const second = renderHook(() => usePersistentUiState(null, false));
    expect(second.result.current[0]).toBe(false);
  });

  it('ignores anything already stored under a similar name', () => {
    localStorage.setItem('openshotdesigner_ui_null', 'true');
    const { result } = renderHook(() => usePersistentUiState(null, false));
    expect(result.current[0]).toBe(false);
  });
});

describe('usePersistentUiState across a changing key', () => {
  /**
   * One component serving several subjects. `PanelIntro` renders for sixteen
   * different panels; with a read-once hook, dismissing the explanation on the
   * gear panel silently dismissed it on all of them.
   */
  it('re-reads when the key changes', () => {
    localStorage.setItem('openshotdesigner_ui_panel.a', 'true');

    const { result, rerender } = renderHook(({ key }) => usePersistentUiState(key, false), {
      initialProps: { key: 'panel.a' },
    });
    expect(result.current[0]).toBe(true);

    rerender({ key: 'panel.b' });
    // Nothing stored for b, so it falls back to the default rather than
    // inheriting a's value.
    expect(result.current[0]).toBe(false);
  });

  it('keeps the value of each key separate as it moves between them', () => {
    const { result, rerender } = renderHook(({ key }) => usePersistentUiState(key, false), {
      initialProps: { key: 'panel.a' },
    });
    act(() => result.current[1](true));

    rerender({ key: 'panel.b' });
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));

    rerender({ key: 'panel.a' });
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('openshotdesigner_ui_panel.a')).toBe('true');
    expect(localStorage.getItem('openshotdesigner_ui_panel.b')).toBe('true');
  });

  it('writes to the current key, never the previous one', () => {
    const { result, rerender } = renderHook(({ key }) => usePersistentUiState(key, false), {
      initialProps: { key: 'panel.a' },
    });
    rerender({ key: 'panel.b' });
    act(() => result.current[1](true));

    expect(localStorage.getItem('openshotdesigner_ui_panel.b')).toBe('true');
    expect(localStorage.getItem('openshotdesigner_ui_panel.a')).toBeNull();
  });
});
