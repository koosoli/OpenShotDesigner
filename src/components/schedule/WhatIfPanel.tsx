import React from 'react';
import { ArrowRight } from 'lucide-react';
import { formatMinutes } from '../../domain/reports';
import { formatPageEighths } from '../../domain/reports';
import type { ScheduleWhatIf } from '../../domain/reports';

/**
 * Shown while a strip is dragged over a day: what dropping it there would do
 * to the two days' pages and time, and to the cast's paid and hold days.
 */
export const WhatIfPanel: React.FC<{ whatIf: ScheduleWhatIf }> = ({ whatIf }) => (
  <div
    role="status"
    aria-live="polite"
    className="absolute bottom-3 right-3 z-30 w-72 rounded-xl border border-line bg-surface text-ink shadow-2xl p-3 text-[11px] pointer-events-none"
  >
    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">If you drop it here</div>
    <ul className="space-y-1">
      {whatIf.days.map((day) => (
        <li key={day.dayId} className="flex items-center gap-1.5">
          <span className="font-semibold min-w-0 truncate flex-1">{day.dayName}</span>
          <span className="font-mono">{formatPageEighths(day.pagesBefore)}</span>
          <ArrowRight className="w-3 h-3 text-ink-subtle" />
          <span className="font-mono font-bold">{formatPageEighths(day.pagesAfter)} pg</span>
          <span className="font-mono text-ink-muted">{formatMinutes(day.minutesAfter)}</span>
        </li>
      ))}
    </ul>
    <div className={`mt-2 pt-2 border-t border-line font-semibold ${whatIf.paidDaysDelta > 0 ? 'text-rose-500' : whatIf.paidDaysDelta < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-muted'}`}>
      {whatIf.paidDaysDelta === 0
        ? 'No change to paid cast days'
        : `${whatIf.paidDaysDelta > 0 ? '+' : ''}${whatIf.paidDaysDelta} paid cast day${Math.abs(whatIf.paidDaysDelta) === 1 ? '' : 's'}`}
    </div>
    {whatIf.performers.length > 0 && (
      <ul className="mt-1 space-y-0.5 text-ink-soft">
        {whatIf.performers.slice(0, 5).map((performer) => (
          <li key={performer.name} className="flex justify-between gap-2">
            <span className="truncate">{performer.name}</span>
            <span className="font-mono shrink-0">
              {performer.paidBefore}→{performer.paidAfter} days{performer.holdAfter !== performer.holdBefore ? ` · holds ${performer.holdBefore}→${performer.holdAfter}` : ''}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);
