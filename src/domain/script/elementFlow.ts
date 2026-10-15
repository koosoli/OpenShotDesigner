/**
 * Final Draft's element flow: what Enter and Tab do on each kind of line.
 *
 * Writers move between screenplays and this editor, so the keys follow the
 * convention their hands already know. The tables are ScriptCraft's
 * (docs/typing-parity.md, MIT/Apache-2.0), which follow Final Draft's
 * documented behaviour:
 *
 * - Enter at the end of a line starts the next element (`ENTER_NEW`); in an
 *   empty line it changes the element instead (`ENTER_EMPTY_CHANGES`).
 * - Tab at the end of a non-empty line starts a new element (`TAB_NEW`); in an
 *   empty line, or with the caret mid-text, it changes the element
 *   (`TAB_CHANGES`). Shift+Tab changes it backwards (`SHIFT_TAB_CHANGES`).
 *
 * So the classic exchange types as: action → Tab → CHARACTER → Enter →
 * dialogue → Enter → (action) → Tab → CHARACTER…, and a transition from an
 * empty action line is Tab, Tab.
 */
import type { ScriptElementType } from '../../types';

type Flow = Partial<Record<ScriptElementType, ScriptElementType>>;

export const ENTER_NEW: Flow = {
  scene: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'action',
  transition: 'scene',
  shot: 'action',
  note: 'action',
};

export const ENTER_EMPTY_CHANGES: Flow = {
  action: 'scene',
  scene: 'action',
  character: 'action',
  dialogue: 'action',
  parenthetical: 'dialogue',
  transition: 'scene',
  shot: 'action',
  note: 'action',
};

export const TAB_NEW: Flow = {
  action: 'character',
  character: 'parenthetical',
  transition: 'scene',
  scene: 'action',
  dialogue: 'parenthetical',
  parenthetical: 'dialogue',
  shot: 'action',
  note: 'character',
};

export const TAB_CHANGES: Flow = {
  action: 'character',
  character: 'transition',
  transition: 'scene',
  scene: 'action',
  dialogue: 'parenthetical',
  parenthetical: 'dialogue',
  shot: 'action',
  note: 'action',
};

export const SHIFT_TAB_CHANGES: Flow = {
  character: 'action',
  transition: 'character',
  scene: 'transition',
  parenthetical: 'dialogue',
  dialogue: 'character',
  action: 'scene',
  shot: 'action',
  note: 'action',
};

/**
 * Typing `int. `, `ext. `, `int./ext. `, `i/e ` or `est. ` at the start of an
 * action line makes it a scene heading.
 */
export const startsSceneHeading = (text: string): boolean =>
  /^(?:int\.?\s*\/\s*ext\.?|ext\.?\s*\/\s*int\.?|i\/e\.?|int\.|ext\.|est\.)\s/i.test(text);
