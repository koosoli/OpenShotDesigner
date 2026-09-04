import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';

/**
 * A blocking yes/no question that used to be a `window.confirm`.
 *
 * The message text is preserved verbatim (newlines included), so the wording
 * the user approved is the wording they still see — only the chrome changes.
 */
export interface ConfirmOptions {
  /** Heading shown at the top of the dialog. */
  title: string;
  /** Body text; newlines are preserved via `whitespace-pre-wrap`. */
  message: string;
  /** Label for the affirmative action. Defaults to 'Confirm'. */
  confirmLabel?: string;
  /** Label for the safe action, which also receives initial focus. Defaults to 'Cancel'. */
  cancelLabel?: string;
  /** Red destructive styling on the confirm button for wipes and deletes. */
  danger?: boolean;
}

/**
 * A blocking acknowledgement that used to be a `window.alert`.
 *
 * There is nothing to decide, so the dialog has a single button and resolves
 * when it is dismissed by button or Escape.
 */
export interface NoticeOptions {
  /** Heading shown at the top of the dialog. */
  title: string;
  /** Body text; newlines are preserved via `whitespace-pre-wrap`. */
  message: string;
  /** Label for the dismiss button. Defaults to 'OK'. */
  buttonLabel?: string;
}

/** Promise-based replacement for the blocking native dialogs. */
export interface Dialogs {
  /** Opens a question; resolves true only when the user picks the confirm action. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Opens an acknowledgement; resolves once it is dismissed. */
  notice: (options: NoticeOptions) => Promise<void>;
}

/**
 * Safe default when no provider is mounted.
 *
 * Component tests render panels without the app chrome, and a question with
 * no one to answer it must fail closed: confirm resolves false so the guarded
 * action aborts, exactly as a dismissed native confirm would.
 */
const fallbackDialogs: Dialogs = {
  confirm: () => Promise.resolve(false),
  notice: () => Promise.resolve(),
};

const DialogContext = createContext<Dialogs>(fallbackDialogs);

/**
 * Reaches the nearest dialog provider, or the fail-closed default above.
 *
 * Deliberately does NOT throw without a provider: panels are tested in
 * isolation and the default already matches the safe direction.
 */
export const useDialogs = (): Dialogs => useContext(DialogContext);

type ActiveDialog =
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
    }
  | { kind: 'notice'; title: string; message: string; buttonLabel: string };

/**
 * Owns the single in-app dialog and serves it promise-first.
 *
 * Only one dialog is ever on screen: a second request while one is open
 * settles the first as cancelled rather than orphaning its promise, so every
 * caller awaits exactly one settlement. The dialog sits above every other
 * layer (including the storage banner) and traps focus until dismissed.
 */
export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState<ActiveDialog | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  // While a dialog is open the trap confines Tab inside it and returns focus
  // to the trigger afterwards; it also lands initial focus on the first
  // button, which is deliberately the safe action (Cancel / OK).
  const dialogRef = useDialogFocusTrap(active !== null);

  const dismiss = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setActive(null);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setActive({
          kind: 'confirm',
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel ?? 'Confirm',
          cancelLabel: options.cancelLabel ?? 'Cancel',
          danger: options.danger ?? false,
        });
      }),
    [],
  );

  const notice = useCallback(
    (options: NoticeOptions): Promise<void> =>
      new Promise<void>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = () => resolve();
        setActive({
          kind: 'notice',
          title: options.title,
          message: options.message,
          buttonLabel: options.buttonLabel ?? 'OK',
        });
      }),
    [],
  );

  // Escape settles on the safe side: a question cancels, a notice acknowledges.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dismiss(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, dismiss]);

  const value = useMemo<Dialogs>(() => ({ confirm, notice }), [confirm, notice]);

  // Fixed dark chrome on purpose: the dialog floats above every themed
  // surface, so it carries its own readable palette instead of one of them.
  return (
    <DialogContext.Provider value={value}>
      {children}
      {active && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70">
          <div
            ref={dialogRef}
            role={active.kind === 'confirm' ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            aria-describedby="app-dialog-message"
            tabIndex={-1}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl outline-none animate-in fade-in"
          >
            <div className="px-5 pt-4 pb-3">
              <h2 id="app-dialog-title" data-testid="dialog-title" className="text-sm font-bold">
                {active.title}
              </h2>
              <p
                id="app-dialog-message"
                data-testid="dialog-message"
                className="mt-1.5 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap"
              >
                {active.message}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800">
              {active.kind === 'confirm' ? (
                <>
                  <button
                    type="button"
                    data-testid="dialog-cancel"
                    onClick={() => dismiss(false)}
                    className="min-h-[36px] px-3.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                  >
                    {active.cancelLabel}
                  </button>
                  <button
                    type="button"
                    data-testid="dialog-confirm"
                    onClick={() => dismiss(true)}
                    className={`min-h-[36px] px-3.5 rounded-lg text-xs font-bold text-white transition-colors ${
                      active.danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-sky-600 hover:bg-sky-500'
                    }`}
                  >
                    {active.confirmLabel}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  data-testid="dialog-ok"
                  onClick={() => dismiss(true)}
                  className="min-h-[36px] px-3.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors"
                >
                  {active.buttonLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
