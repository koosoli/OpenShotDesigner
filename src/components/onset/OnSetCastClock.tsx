import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { updatePerformerTimeReportCommand } from '../../domain/commands';
import { exhibitGTotals, formatMinutes, nextClockStep } from '../../domain/reports';
import type { PerformerTimeEntry } from '../../domain/reports';


const nowClock = (): string => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

/**
 * Performer clock for on-set mode: one big button per performer that stamps
 * the time into their next empty Exhibit G field. The sheet itself is set up
 * in Schedule → Time report; this only records times as they happen.
 */
export const OnSetCastClock: React.FC<{ dayId: string; isLight: boolean }> = ({ dayId, isLight: _isLight }) => {
  const { project, runCommand } = useFloorPlan();
  const report = useMemo(
    () => (project.performerTimeReports ?? []).find((entry) => entry.dayId === dayId),
    [project.performerTimeReports, dayId],
  );

  if (!report || report.entries.length === 0) {
    return (
      <p className={`text-xs text-ink-muted`}>
        No time report for this day yet. Set it up in Schedule → Time report (“From schedule” adds today’s cast), then clock times here.
      </p>
    );
  }

  const stamp = (entry: PerformerTimeEntry, key: string, label: string) => {
    const time = nowClock();
    runCommand(
      updatePerformerTimeReportCommand,
      {
        dayId,
        update: (current) => ({
          ...current,
          entries: current.entries.map((candidate) => (candidate.id === entry.id ? { ...candidate, [key]: time } : candidate)),
        }),
        description: `${entry.name}: ${label.toLowerCase()} ${time}`,
      },
      { domain: 'schedule' },
    );
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {report.entries.map((entry) => {
        const { last, next } = nextClockStep(entry);
        const totals = exhibitGTotals(entry, report.limits);
        return (
          <div key={entry.id} className={`rounded-xl border p-3 flex items-center gap-3 border-line bg-surface`}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate">
                {entry.castNumber !== undefined && <span className="font-mono mr-1.5 opacity-60">{entry.castNumber}</span>}
                {entry.name}
              </div>
              <div className={`text-xs text-ink-muted`}>
                {last ? `${last.label} ${String(entry[last.key])}` : 'Not in yet'}
                {totals.workedMinutes !== undefined && ` · ${formatMinutes(totals.workedMinutes)} worked`}
                {totals.mealPenalties > 0 && <span className="text-rose-500 font-bold"> · {totals.mealPenalties} MP</span>}
              </div>
            </div>
            {next ? (
              <button
                type="button"
                onClick={() => stamp(entry, next.key, next.label)}
                className="min-h-12 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-bold flex items-center gap-2 shrink-0"
              >
                <Clock className="w-4 h-4" /> {next.label}
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-500 shrink-0">Day done</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
