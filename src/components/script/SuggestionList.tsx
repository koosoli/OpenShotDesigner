import React, { useEffect, useRef } from 'react';

export interface Suggestion {
  key: string;
  label: string;
  /** Small grey hint after the label ("aka Al"). */
  hint?: string;
}

const TONES = {
  amber: { border: 'border-amber-300 dark:border-amber-700/50', text: 'text-amber-800 dark:text-amber-300', active: 'bg-amber-100 dark:bg-amber-950/70' },
  emerald: { border: 'border-emerald-300 dark:border-emerald-700/50', text: 'text-emerald-800 dark:text-emerald-300', active: 'bg-emerald-100 dark:bg-emerald-950/70' },
  sky: { border: 'border-sky-300 dark:border-sky-700/50', text: 'text-sky-800 dark:text-sky-300', active: 'bg-sky-100 dark:bg-sky-950/70' },
  slate: { border: 'border-slate-300 dark:border-slate-600', text: 'text-slate-800 dark:text-slate-200', active: 'bg-slate-200 dark:bg-slate-700/70' },
} as const;

/**
 * The screenplay editor's suggestion list. Driven from the field's own keys —
 * ↑ ↓ move the highlight, Enter or Tab take it, Esc closes (see
 * `suggestionKeyAction`) — so writing never needs the mouse; a click works too.
 * Buttons keep the field focused (mousedown is prevented).
 */
export const SuggestionList: React.FC<{
  items: Suggestion[];
  highlight: number;
  onPick: (item: Suggestion) => void;
  tone?: keyof typeof TONES;
  uppercase?: boolean;
  label: string;
}> = ({ items, highlight, onPick, tone = 'slate', uppercase = false, label }) => {
  const colors = TONES[tone];
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);
  if (items.length === 0) return null;
  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-label={label}
      className={`absolute z-20 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-lg border ${colors.border} bg-white dark:bg-slate-900 shadow-xl text-[11px]`}
    >
      {items.map((item, index) => (
        <li key={item.key} role="option" aria-selected={index === highlight}>
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item)}
            className={`w-full text-left px-2 py-1 font-bold ${uppercase ? 'uppercase' : ''} ${colors.text} ${index === highlight ? colors.active : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            {item.label}
            {item.hint && <span className="ml-2 opacity-50 font-normal normal-case">{item.hint}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
};

/**
 * What a key does to an open suggestion list. `null` means "not for the
 * list" — the field handles it as usual.
 */
export const suggestionKeyAction = (
  event: React.KeyboardEvent,
  count: number,
): 'next' | 'previous' | 'pick' | 'close' | null => {
  if (count === 0 || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === 'ArrowDown') return 'next';
  if (event.key === 'ArrowUp') return 'previous';
  if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) return 'pick';
  if (event.key === 'Escape') return 'close';
  return null;
};
