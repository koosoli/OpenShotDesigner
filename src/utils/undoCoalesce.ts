/**
 * Undo by edit, not by keystroke.
 *
 * Every keystroke in a project field is a recorded change, so typing a
 * twelve-letter caption used to cost twelve presses of Ctrl+Z. Consecutive
 * changes made while typing in the SAME field, close together in time, now
 * fold into one undo step: the first keystroke opens the step, the rest update
 * it, and undo returns to how things were before you started typing.
 *
 * Decided here, at the single place history is recorded, so every panel gets
 * it without each input having to opt in.
 */

/** How long a pause in typing still counts as the same edit. */
export const TYPING_COALESCE_MS = 2000;

export interface TypingMark {
  /** The field being typed in. */
  target: EventTarget;
  at: number;
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'number', 'email', 'tel', 'url', 'time', 'date', 'datetime-local', 'color', '']);

/** The element a keystroke edit is coming from, when focus is in a text field. */
export const typingTarget = (active: Element | null): Element | null => {
  if (!active) return null;
  if (active instanceof HTMLTextAreaElement) return active;
  if (active instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(active.type) ? active : null;
  if (active instanceof HTMLElement && active.isContentEditable) return active;
  return null;
};

/**
 * Whether a new change should merge into the previous undo step: same field,
 * still focused, within the pause window.
 */
export const shouldCoalesce = (previous: TypingMark | null, target: Element | null, now: number): boolean =>
  !!previous && !!target && previous.target === target && now - previous.at <= TYPING_COALESCE_MS;
