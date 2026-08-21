import React from 'react';
import { Highlighter, Minus, Pencil } from 'lucide-react';
import { getFreehandStrokeAppearance } from '../../domain/plan';
import type { FreehandToolSettings, FreehandToolStyle } from '../../domain/plan';

interface FreehandToolOptionsProps {
  settings: FreehandToolSettings;
  isLight: boolean;
  onChange: (settings: FreehandToolSettings) => void;
}

const COLOR_PRESETS = [
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#0ea5e9', label: 'Blue' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#22c55e', label: 'Green' },
  { value: '#f8fafc', label: 'White' },
];

export const FreehandToolOptions: React.FC<FreehandToolOptionsProps> = ({ settings, isLight, onChange }) => {
  const preview = getFreehandStrokeAppearance(settings);
  const setStyle = (toolStyle: FreehandToolStyle) => {
    onChange({
      ...settings,
      toolStyle,
      opacity: toolStyle === 'highlighter' ? 0.35 : 1,
    });
  };

  return (
    <section
      aria-label="Free draw options"
      onPointerDown={(event) => event.stopPropagation()}
      className={`absolute top-3 left-3 z-30 w-[min(620px,calc(100%-24px))] rounded-xl border shadow-2xl backdrop-blur-md p-2.5 select-none ${
        isLight
          ? 'bg-white/95 border-slate-200 text-slate-800'
          : 'bg-slate-900/95 border-slate-700 text-slate-100'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className={`flex rounded-lg p-0.5 ${isLight ? 'bg-slate-100' : 'bg-slate-800'}`}>
          <button
            type="button"
            aria-pressed={settings.toolStyle === 'pen'}
            onClick={() => setStyle('pen')}
            className={`h-8 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              settings.toolStyle === 'pen'
                ? 'bg-sky-600 text-white shadow-sm'
                : isLight ? 'text-slate-600 hover:bg-white' : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" /> Pen
          </button>
          <button
            type="button"
            aria-pressed={settings.toolStyle === 'highlighter'}
            onClick={() => setStyle('highlighter')}
            className={`h-8 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              settings.toolStyle === 'highlighter'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : isLight ? 'text-slate-600 hover:bg-white' : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" /> Highlighter
          </button>
        </div>

        <div className="flex items-center gap-1" aria-label="Drawing color presets">
          {COLOR_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.value}
              title={preset.label}
              aria-label={`${preset.label} drawing color`}
              aria-pressed={settings.color.toLowerCase() === preset.value}
              onClick={() => onChange({ ...settings, color: preset.value })}
              className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                settings.color.toLowerCase() === preset.value
                  ? 'border-sky-500 ring-2 ring-sky-500/30 scale-110'
                  : isLight ? 'border-white shadow-sm' : 'border-slate-700'
              }`}
              style={{ backgroundColor: preset.value }}
            />
          ))}
          <label
            title="Custom drawing color"
            className={`relative w-7 h-7 rounded-lg border cursor-pointer overflow-hidden ${
              isLight ? 'border-slate-300' : 'border-slate-600'
            }`}
          >
            <input
              type="color"
              aria-label="Custom drawing color"
              value={settings.color}
              onChange={(event) => onChange({ ...settings, color: event.target.value })}
              className="absolute inset-[-4px] w-10 h-10 cursor-pointer"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 min-w-[160px] text-[11px] font-semibold">
          <Minus className="w-4 h-4" />
          <span className="whitespace-nowrap">Size {settings.strokeWidth}px</span>
          <input
            type="range"
            aria-label="Free draw thickness"
            min="1"
            max="16"
            step="1"
            value={settings.strokeWidth}
            onChange={(event) => onChange({ ...settings, strokeWidth: Number(event.target.value) })}
            className="w-24 accent-sky-500"
          />
        </label>

        <label className="flex items-center gap-2 min-w-[150px] text-[11px] font-semibold">
          <span className="whitespace-nowrap">Opacity {Math.round(settings.opacity * 100)}%</span>
          <input
            type="range"
            aria-label="Free draw opacity"
            min="10"
            max="100"
            step="5"
            value={Math.round(settings.opacity * 100)}
            onChange={(event) => onChange({ ...settings, opacity: Number(event.target.value) / 100 })}
            className="w-24 accent-sky-500"
          />
        </label>

        <svg width="72" height="24" viewBox="0 0 72 24" aria-label="Brush preview" className="rounded-md overflow-visible">
          <line
            x1="5"
            y1="12"
            x2="67"
            y2="12"
            stroke={settings.color}
            strokeWidth={Math.min(20, preview.strokeWidth)}
            strokeOpacity={preview.opacity}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </section>
  );
};
