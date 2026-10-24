import React from 'react';
import { wrapScreenplayText } from '../../domain/script';

/**
 * One screenplay line in the editor, laid out as it prints.
 *
 * The editor used single-line inputs, so a long action line or speech ran out
 * of sight to the right. This is a text area exactly as wide as the element's
 * printed column (in `ch` of a monospaced face, the same 10-to-the-inch grid
 * as the page), growing a row for every row the page will print — so a line
 * wraps on screen where it wraps on paper. A screenplay paragraph is one
 * line of the script, so typed or pasted line breaks become spaces; Enter is
 * the editor's (see ScriptPanel's key handling).
 */
export const ScreenplayLineField = React.forwardRef<
  HTMLTextAreaElement,
  {
    lineId: string;
    value: string;
    /** Printed width of the element in characters. */
    width: number;
    onChange: (value: string) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onBlur?: () => void;
    autoFocus?: boolean;
    placeholder?: string;
    ariaLabel: string;
    className?: string;
    right?: boolean;
  }
>(({ lineId, value, width, onChange, onKeyDown, onBlur, autoFocus, placeholder, ariaLabel, className = '', right }, ref) => {
  const rows = Math.max(1, wrapScreenplayText(value || placeholder || '', width).length);
  return (
    <textarea
      ref={ref}
      data-line-input={lineId}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      value={value}
      rows={rows}
      spellCheck
      onChange={(event) => onChange(event.target.value.replace(/\r?\n/g, ' '))}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`block resize-none overflow-hidden bg-transparent outline-none rounded leading-[inherit] p-0 ${right ? 'text-right' : ''} ${className}`}
      // The column is exactly the printed width; the browser's word wrap at
      // that width matches the page's.
      style={{ width: `${width}ch`, maxWidth: '100%', font: 'inherit', letterSpacing: 'inherit' }}
    />
  );
});
ScreenplayLineField.displayName = 'ScreenplayLineField';
