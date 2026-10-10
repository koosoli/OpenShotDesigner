import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Pop-up menus close the way people expect: Escape, or a click anywhere
 * outside `ref` (which should wrap both the trigger and the menu, so clicking
 * the trigger toggles rather than closes-and-reopens). Inside the menu the
 * arrow keys move between items, and Home/End jump to the ends.
 */
export const useDismiss = (open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>): void => {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      const root = ref.current;
      if (!root || !root.contains(document.activeElement)) return;
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      // Leave arrow keys to the field when typing or picking in a select.
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null || item === active);
      if (items.length === 0) return;
      const index = items.indexOf(active as HTMLElement);
      const next =
        event.key === 'Home' ? 0
          : event.key === 'End' ? items.length - 1
            : event.key === 'ArrowDown' ? (index + 1) % items.length
              : (index - 1 + items.length) % items.length;
      items[next]?.focus();
      event.preventDefault();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, ref]);
};
