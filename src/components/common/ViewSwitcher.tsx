import React, { useRef } from 'react';
import { useElementWidth } from './useFitsLabels';

export interface ViewSwitcherItem<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Small count after the label ("Current scene 1"). */
  count?: number;
}

/**
 * The segmented "which view" control used across modules. A label never
 * breaks inside itself ("One-/liner"). When one row is too narrow the views
 * wrap onto a second row, still labelled; only on a phone-narrow panel do
 * they drop to icons, keeping the label on the active view. Every button
 * keeps its name for screen readers and as a tooltip.
 */
export const ViewSwitcher = <T extends string>({
  items,
  value,
  onChange,
  label,
  widthPerLabel = 92,
  className = '',
}: {
  items: ReadonlyArray<ViewSwitcherItem<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Accessible name of the group ("Schedule view"). */
  label: string;
  widthPerLabel?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const fits = width === 0 || width >= items.length * widthPerLabel;
  // Two labelled rows are fine; four are not. Below that, icons.
  const wrap = !fits && width >= (items.length * widthPerLabel) / 2;
  const showLabels = fits || wrap;
  return (
    <div ref={ref} className={`min-w-0 flex-1 flex ${className}`}>
      <div role="group" aria-label={label} className={`flex max-w-full rounded-lg border p-0.5 bg-surface-sunken border-line ${wrap ? 'flex-wrap gap-0.5' : 'h-8 overflow-x-auto no-scrollbar'}`}>
        {items.map((item) => {
          const active = item.id === value;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-pressed={active}
              aria-label={item.label}
              title={item.label}
              className={`shrink-0 ${wrap ? 'h-7' : ''} px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                active ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {(showLabels || active) && <span>{item.label}</span>}
              {item.count !== undefined && (showLabels || active) && <span className="font-mono text-[10px] opacity-70">{item.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
