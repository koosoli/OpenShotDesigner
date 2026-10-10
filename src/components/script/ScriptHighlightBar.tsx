import React from 'react';
import { Highlighter } from 'lucide-react';
import type { HighlightLegendEntry, HighlightMode } from '../../domain/script';

interface ScriptHighlightBarProps {
  mode: HighlightMode;
  onModeChange: (mode: HighlightMode) => void;
  legend: HighlightLegendEntry[];
  focusKey: string | null;
  onFocusChange: (key: string | null) => void;
  /** Character mode only: change one character's colour. */
  onColorChange?: (key: string, color: string) => void;
  isLight: boolean;
}

const MODES: Array<{ value: HighlightMode; label: string; title: string }> = [
  { value: 'breakdown', label: 'Breakdown', title: 'Tagged elements in their department colours' },
  { value: 'characters', label: 'Characters', title: 'Each speaker\u2019s dialogue in their colour' },
  { value: 'locations', label: 'Locations', title: 'Every scene tinted by where it is set' },
  { value: 'off', label: 'Off', title: 'Plain page' },
];

/**
 * The highlighter: how the script page is colour-coded, with a legend you can
 * click to read the script for one character or one location only.
 */
export const ScriptHighlightBar: React.FC<ScriptHighlightBarProps> = ({
  mode,
  onModeChange,
  legend,
  focusKey,
  onFocusChange,
  onColorChange,
  isLight: _isLight,
}) => {
  const chip = 'border-line-strong bg-surface';
  return (
    <div className={`px-2.5 py-1.5 border-b flex items-center gap-2 flex-wrap bg-surface-sunken border-line`}>
      <Highlighter className={`w-3.5 h-3.5 text-ink-muted`} aria-hidden />
      <div role="radiogroup" aria-label="Script highlighter" className={`flex rounded-lg border p-0.5 ${chip}`}>
        {MODES.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="radio"
            aria-checked={mode === entry.value}
            title={entry.title}
            onClick={() => {
              onModeChange(entry.value);
              onFocusChange(null);
            }}
            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${mode === entry.value ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {(mode === 'characters' || mode === 'locations') && legend.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          {legend.map((entry) => {
            const active = focusKey === entry.key;
            const faded = focusKey !== null && !active;
            return (
              <span
                key={entry.key}
                className={`inline-flex items-center gap-1 rounded-full border pl-1 pr-2 py-0.5 text-[11px] ${chip} ${faded ? 'opacity-40' : ''} ${active ? 'ring-2 ring-violet-500' : ''}`}
              >
                {onColorChange ? (
                  <label className="relative w-3 h-3 rounded-full cursor-pointer" style={{ backgroundColor: entry.color }} title="Change colour">
                    <input
                      type="color"
                      value={entry.color}
                      aria-label={`Colour for ${entry.label}`}
                      onChange={(event) => onColorChange(entry.key, event.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </label>
                ) : (
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                )}
                <button
                  type="button"
                  onClick={() => onFocusChange(active ? null : entry.key)}
                  title={active ? 'Show everyone again' : `Read the script for ${entry.label} only`}
                  aria-pressed={active}
                  className="font-semibold max-w-[14ch] truncate"
                >
                  {entry.label}
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
