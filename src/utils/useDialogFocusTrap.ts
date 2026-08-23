import { RefObject, useEffect, useRef } from 'react';

/**
 * Keeps keyboard focus inside an open modal dialog and gives it back afterwards.
 *
 * The app's modals are painted over the panel behind them rather than replacing
 * it, so without a trap the focus ring stays on whatever was underneath and Tab
 * walks a page the user can no longer see. Returns a ref to attach to the dialog
 * panel — the element that carries role="dialog" — which also has to be focusable
 * (tabIndex={-1}) so focus has somewhere to land when the dialog opens.
 */
export const useDialogFocusTrap = (isOpen: boolean): RefObject<HTMLDivElement | null> => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Remember the trigger so the keyboard user resumes where they left off.
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Recomputed on every Tab rather than cached, because modal bodies show and
    // hide controls as the user types or picks a different option.
    const getFocusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => node.offsetParent !== null);

    // Focus the first control when there is one: these dialogs open on a form or
    // a search field, so landing there is what a sighted mouse user would do too.
    const initial = getFocusable();
    (initial[0] ?? dialog).focus();

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        // Nothing to move to, but focus must still not escape the dialog.
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!active || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Capture phase so the trap wins over anything the dialog body listens for.
    document.addEventListener('keydown', handleTabKey, true);
    return () => {
      document.removeEventListener('keydown', handleTabKey, true);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  return dialogRef;
};
