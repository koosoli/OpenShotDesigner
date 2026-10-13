import React, { useEffect, useState } from 'react';
import { Keyboard, X } from 'lucide-react';

/** Open or close the keyboard-shortcut sheet from anywhere (a button, a command, the ? key). */
export const toggleShortcutSheet = (): void => {
  window.dispatchEvent(new CustomEvent('osd:toggle-shortcuts'));
};

const GROUPS: Array<{ group: string; items: Array<[string, string]> }> = [
  {
    group: 'Anywhere',
    items: [
      ['Shift + Space / Ctrl + K', 'Quick search: shots, scenes, people, days, commands'],
      ['?', 'Show or hide this sheet'],
      ['Ctrl/Cmd + Z', 'Undo (typing in one field undoes as one step)'],
      ['Ctrl/Cmd + Shift + Z / Ctrl + Y', 'Redo'],
      ['Esc', 'Close a menu or dialog'],
      ['↑ ↓ Home End', 'Move through an open menu'],
    ],
  },
  {
    group: 'Floor plan tools',
    items: [
      ['V', 'Select / move'],
      ['H', 'Pan'],
      ['A', 'Actor'],
      ['C', 'Camera & shot'],
      ['L', 'Light fixture (or lock the selection)'],
      ['W', 'Wall / room'],
      ['D · N', 'Door · window'],
      ['P · E · U · F', 'Props · staging · studio & grip · architecture'],
      ['S · T · R', 'Shape · dolly track · road'],
      ['M · G · K', 'Measure · arrow · cable'],
      ['X · B', 'Text · pen'],
    ],
  },
  {
    group: 'Selection & editing',
    items: [
      ['Del / Backspace', 'Delete the selection (or the reference image)'],
      ['Shift + Click', 'Add to the selection'],
      ['Ctrl/Cmd + D', 'Duplicate'],
      ['Ctrl/Cmd + C · V', 'Copy · paste'],
      ['Arrow keys', 'Nudge (Shift = 10 px)'],
      ['Esc', 'Deselect / cancel the current tool'],
    ],
  },
  {
    group: 'Drawing',
    items: [
      ['Enter', 'Finish a wall or cable chain'],
      ['Hold Shift', 'Snap angles to 45°'],
      ['Hold Alt', 'Turn snapping off while placing'],
    ],
  },
  {
    group: 'Canvas',
    items: [
      ['Hold Space / middle-click', 'Pan'],
      ['Mouse wheel', 'Zoom at the cursor'],
    ],
  },
  {
    group: 'Screenplay editor',
    items: [
      ['Enter', 'New line of the next kind (heading → action → character → …)'],
      ['Enter on an empty line', 'Turn it into the next kind (action → scene heading)'],
      ['Tab · Shift + Tab', 'Change the line’s kind'],
      ['↑ ↓', 'Previous · next line'],
      ['Backspace on an empty line', 'Remove it'],
      ['↑ ↓ then Enter / Tab', 'Pick from an open suggestion list (Esc closes it)'],
      ['Alt + ↑ ↓', 'Scene heading: INT. / EXT. …'],
      ['Alt + Shift + ↑ ↓', 'Scene heading: time of day'],
      ['← at the start · → at the end', 'Scene heading: reach the INT/EXT · time picker'],
      ['( after a character name', 'Cue extensions: V.O., O.S., CONT’D…'],
    ],
  },
];

/**
 * Every keyboard shortcut on one sheet, opened with ? anywhere outside a text
 * field, from the navbar keyboard button, or from Quick Search.
 */
export const ShortcutSheet: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setOpen((value) => !value);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener('osd:toggle-shortcuts', toggle);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('osd:toggle-shortcuts', toggle);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onPointerDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onPointerDown={(event) => event.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-surface border border-line text-ink rounded-2xl shadow-2xl p-5 custom-scrollbar"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
          <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-accent" /> Keyboard shortcuts
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the keyboard shortcuts" className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 text-[11px]">
          {GROUPS.map(({ group, items }) => (
            <section key={group}>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-accent-ink mb-1">{group}</h3>
              <div className="space-y-1">
                {items.map(([key, description]) => (
                  <div key={key + description} className="flex items-center justify-between gap-3">
                    <kbd className="px-1.5 py-0.5 rounded bg-surface-muted border border-line font-mono text-[10px] whitespace-nowrap">{key}</kbd>
                    <span className="text-ink-muted text-right">{description}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
