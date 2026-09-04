import React, { useMemo } from 'react';
import type { UsageEntry } from '../../domain/usage';

export interface UsageListProps {
  /** Usages for one entity, as returned by `usagesFor`. */
  entries: UsageEntry[];
  /** Optional selection callback; without it entries render as plain text. */
  onSelect?: (entry: UsageEntry) => void;
  /** Shown when there are no usages. */
  emptyText?: string;
  /** Light/dark styling switch, following panel conventions. */
  isLight?: boolean;
}

/**
 * Presentational "where is this used?" list.
 *
 * Groups entries by section with per-section counts plus a total. The only
 * side effect allowed is the optional `onSelect` callback — this component
 * never navigates, edits state or reads context itself.
 */
export const UsageList: React.FC<UsageListProps> = ({
  entries,
  onSelect,
  emptyText = 'Not used anywhere yet.',
  isLight = false,
}) => {
  const groups = useMemo(() => {
    const map = new Map<string, UsageEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.section) ?? [];
      list.push(entry);
      map.set(entry.section, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  if (entries.length === 0) {
    return <p className={`text-[11px] italic ${muted}`}>{emptyText}</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className={`text-[10px] font-semibold ${muted}`}>
        Used {entries.length} {entries.length === 1 ? 'time' : 'times'}
        {groups.length > 1 ? ` across ${groups.length} areas` : ''}
      </p>
      {groups.map(([section, items]) => (
        <div key={section} className="space-y-0.5">
          <p className={`text-[9px] font-black uppercase tracking-wider ${muted}`}>
            {section} · {items.length}
          </p>
          <ul className="space-y-0.5">
            {items.map((entry, itemIndex) => {
              const text = entry.detail ? `${entry.label} — ${entry.detail}` : entry.label;
              const key = `${section}-${itemIndex}-${entry.label}`;
              return (
                <li
                  key={key}
                  className={`text-[11px] rounded-md px-2 py-1 ${
                    isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800/60 text-slate-300'
                  }`}
                >
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(entry)}
                      className="w-full text-left hover:underline"
                    >
                      {text}
                    </button>
                  ) : (
                    text
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
};
