import React, { useEffect, useRef, useState } from 'react';
import {
  SCENE_PREFIXES,
  TIMES_OF_DAY,
  composeSceneHeading,
  cycleValue,
  headingFromBodyInput,
  matchingPresets,
  splitSceneHeading,
  type SceneHeadingParts,
  typedTimeQuery,
  withoutTypedTime,
} from '../../domain/script/sceneHeadingParts';
import { SuggestionList, suggestionKeyAction } from './SuggestionList';

const select =
  'shrink-0 bg-transparent font-bold uppercase text-amber-300 outline-none rounded px-0.5 hover:bg-amber-950/30 focus:bg-amber-950/40 focus:ring-1 focus:ring-amber-500/60 cursor-pointer';
const option = 'bg-slate-900 text-amber-300';

/**
 * A native select is as wide as its longest option ("MOMENTS LATER"), which
 * squeezed the set field to nothing. The page is Courier, so the chosen
 * value's length in `ch` (plus room for the arrow) is its real width.
 */
const fitWidth = (value: string): React.CSSProperties => ({ width: `${Math.max(value.length, 1) + 3}ch` });

const PREFIX_VALUES: readonly string[] = ['', ...SCENE_PREFIXES];

/**
 * A scene heading in the screenplay editor: INT/EXT and the time of day are
 * pickers, the set is typed. Everything works from the keyboard:
 *
 *  - type the whole heading ("EXT. STREET - NIGHT") and the pickers fill in;
 *  - after " - " the times are offered as a list (↑ ↓, Enter or Tab);
 *  - Alt+↑/↓ changes INT/EXT, Alt+Shift+↑/↓ the time of day;
 *  - ← at the start of the set field reaches the INT/EXT picker, → at its end
 *    the time picker; there ↑ ↓ change the value and ← → / Enter / Esc go back.
 *
 * While the set field is being typed in it keeps its own draft of all three
 * parts, so a trailing space ("LIVING ") survives until the next word, and a
 * half-typed "ext" is not read back from the stored heading as the EXT.
 * prefix before the dot and space arrive. The stored heading is always the
 * tidy, composed one.
 */
export const SceneHeadingInput: React.FC<{
  /** The line, so the editor can focus this heading from the keyboard. */
  lineId: string;
  text: string;
  onChange: (text: string) => void;
  /** Keys the heading does not use itself (line navigation, Enter, Tab…). */
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  /** Called after a typed change, to open location suggestions. */
  onTyped?: () => void;
  autoFocus?: boolean;
  /** Times used elsewhere in this screenplay, offered after the presets. */
  extraTimes?: readonly string[];
  children?: React.ReactNode;
}> = ({ lineId, text, onChange, onKeyDown, onBlur, onTyped, autoFocus, extraTimes = [], children }) => {
  const [draft, setDraft] = useState<SceneHeadingParts | null>(null);
  const parts = draft ?? splitSceneHeading(text);
  const [timeHighlight, setTimeHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefixRef = useRef<HTMLSelectElement>(null);
  const timeRef = useRef<HTMLSelectElement>(null);

  // The heading this field last wrote. Any other change of `text` — undo, a
  // suggestion, another edit — drops the draft. (The editor upper-cases.)
  const emittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (text.toUpperCase() !== emittedRef.current?.toUpperCase()) setDraft(null);
  }, [text]);
  const emit = (next: string) => {
    if (next === text) return;
    emittedRef.current = next;
    onChange(next);
  };

  // Set by a paste so the next change is read as a whole heading.
  const pastedRef = useRef(false);

  const body = parts.body;
  const times = [...TIMES_OF_DAY, ...extraTimes.filter((time) => !(TIMES_OF_DAY as readonly string[]).includes(time))];
  if (parts.time && !times.includes(parts.time)) times.push(parts.time);
  const timeValues = ['', ...times];

  // " - DU" typed after the set: offer the times that fit.
  const timeQuery = draft !== null ? typedTimeQuery(draft.body) : null;
  const timeOptions = timeQuery === null ? [] : matchingPresets(times, timeQuery);

  const typeBody = (value: string) => {
    const { text: next, ...rest } = headingFromBodyInput(parts, value, { complete: pastedRef.current });
    pastedRef.current = false;
    setDraft(rest);
    setTimeHighlight(0);
    emit(next);
    onTyped?.();
  };

  const write = (change: Partial<SceneHeadingParts>) => {
    const next = { ...parts, ...change };
    if (draft !== null) setDraft(next);
    emit(composeSceneHeading({ ...next, body: next.body.trim() }));
  };

  const pickTime = (time: string) => write({ body: withoutTypedTime(body), time });

  const focusInput = (at: 'start' | 'end') => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const position = at === 'start' ? 0 : input.value.length;
    input.setSelectionRange(position, position);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // The time list, when one is open, takes its keys first.
    const action = suggestionKeyAction(event, timeOptions.length);
    if (action) {
      event.preventDefault();
      if (action === 'next') setTimeHighlight((index) => (index + 1) % timeOptions.length);
      else if (action === 'previous') setTimeHighlight((index) => (index - 1 + timeOptions.length) % timeOptions.length);
      else if (action === 'pick') pickTime(timeOptions[Math.min(timeHighlight, timeOptions.length - 1)]);
      else setDraft({ ...parts, body: withoutTypedTime(body) });
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (event.shiftKey) write({ time: cycleValue(timeValues, parts.time, step) });
      else write({ prefix: cycleValue(PREFIX_VALUES, parts.prefix, step) });
      return;
    }
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    if (event.key === 'ArrowLeft' && atStart && !event.shiftKey) {
      event.preventDefault();
      prefixRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowRight' && atEnd && !event.shiftKey) {
      event.preventDefault();
      timeRef.current?.focus();
      return;
    }
    onKeyDown(event);
  };

  /** Keys on the pickers: ↑ ↓ change the value, ← → / Enter / Esc return to the set. */
  const onSelectKeyDown = (which: 'prefix' | 'time') => (event: React.KeyboardEvent<HTMLSelectElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (which === 'prefix') write({ prefix: cycleValue(PREFIX_VALUES, parts.prefix, step) });
      else write({ time: cycleValue(timeValues, parts.time, step) });
      return;
    }
    if (which === 'prefix' && event.key === 'ArrowRight') {
      event.preventDefault();
      focusInput('start');
    } else if (which === 'time' && event.key === 'ArrowLeft') {
      event.preventDefault();
      focusInput('end');
    } else if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      focusInput(which === 'prefix' ? 'start' : 'end');
    }
  };

  return (
    <div className="relative flex-1 flex items-center gap-1 min-w-[16rem]">
      <select
        ref={prefixRef}
        aria-label="Interior or exterior"
        title="Interior / exterior — ↑ ↓ to change, → back to the set"
        value={parts.prefix}
        onChange={(event) => write({ prefix: event.target.value })}
        onKeyDown={onSelectKeyDown('prefix')}
        className={select}
        style={fitWidth(parts.prefix)}
      >
        <option value="" className={option}>—</option>
        {SCENE_PREFIXES.map((prefix) => (
          <option key={prefix} value={prefix} className={option}>{prefix}</option>
        ))}
      </select>
      <div className="relative flex-1 min-w-0">
        <input
          ref={inputRef}
          data-line-input={lineId}
          autoFocus={autoFocus}
          aria-label="Set / location"
          value={body}
          onChange={(event) => typeBody(event.target.value)}
          onPaste={() => {
            pastedRef.current = true;
          }}
          onKeyDown={onInputKeyDown}
          onBlur={() => {
            // Leaving the field reads a time typed at its end ("… - DUSK").
            if (draft !== null) emit(headingFromBodyInput(draft, draft.body, { complete: true }).text);
            setDraft(null);
            onBlur?.();
          }}
          className="w-full bg-transparent outline-none uppercase font-bold text-amber-300 focus:bg-amber-950/20 px-1 rounded"
          placeholder="LOCATION"
        />
        {timeOptions.length > 0 ? (
          <SuggestionList
            label="Time of day"
            tone="amber"
            uppercase
            items={timeOptions.map((time) => ({ key: time, label: time }))}
            highlight={Math.min(timeHighlight, timeOptions.length - 1)}
            onPick={(item) => pickTime(item.key)}
          />
        ) : children}
      </div>
      <span aria-hidden className="shrink-0 font-bold text-amber-300/70">-</span>
      <select
        ref={timeRef}
        aria-label="Time of day"
        title="Time of day — ↑ ↓ to change, ← back to the set"
        value={parts.time}
        onChange={(event) => write({ time: event.target.value })}
        onKeyDown={onSelectKeyDown('time')}
        className={select}
        style={fitWidth(parts.time)}
      >
        <option value="" className={option}>—</option>
        {times.map((time) => (
          <option key={time} value={time} className={option}>{time}</option>
        ))}
      </select>
    </div>
  );
};
