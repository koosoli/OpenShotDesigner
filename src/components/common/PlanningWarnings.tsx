import React from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Info } from 'lucide-react';

/**
 * The shared shell for the two derived warning lists — coverage on the shot
 * list, health on the schedule.
 *
 * One component because the two have the same job and the same failure mode.
 * A warning list is only read if it is short and quiet: collapsed by default,
 * summarised in one line, and — the part that matters most — able to say "these
 * four questions found nothing" rather than showing a green tick. An empty
 * result is not a verdict on the plan, and a checker that implies otherwise
 * teaches people to trust it for things it never looked at.
 *
 * Warnings and notes are ranked and counted separately for the same reason. A
 * list where everything is urgent gets ignored wholesale, and the items most
 * often deliberate — a scene covered from one angle, three locations in a day —
 * are exactly the ones that would do the ignoring.
 */

export interface PlanningWarning {
  severity: 'warning' | 'note';
  message: string;
}

export interface PlanningWarningsProps {
  /** "Coverage", "Schedule health". */
  title: string;
  /** What the checks looked at, shown when nothing was found. */
  clearMessage: string;
  issues: readonly PlanningWarning[];
  isLight: boolean;
  /** Open on mount. Off by default: this sits above content people came for. */
  defaultOpen?: boolean;
}

export const PlanningWarnings: React.FC<PlanningWarningsProps> = ({
  title,
  clearMessage,
  issues,
  isLight,
  defaultOpen = false,
}) => {
  const [open, setOpen] = React.useState(defaultOpen);
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const notes = issues.filter((issue) => issue.severity === 'note');
  const headingId = React.useId();

  const summary =
    issues.length === 0
      ? 'nothing found'
      : [
          warnings.length > 0 &&
            `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
          notes.length > 0 && `${notes.length} note${notes.length === 1 ? '' : 's'}`,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <div
      className={`rounded-lg border text-[11px] ${
        warnings.length > 0
          ? isLight
            ? 'bg-amber-50 border-amber-300 text-amber-900'
            : 'bg-amber-950/30 border-amber-900/60 text-amber-100'
          : isLight
            ? 'bg-slate-50 border-slate-200 text-slate-600'
            : 'bg-slate-900/60 border-slate-800 text-slate-400'
      }`}
    >
      <button
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-controls={headingId}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left font-semibold"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
        {warnings.length > 0 ? (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Info className="w-3.5 h-3.5 shrink-0 opacity-60" />
        )}
        <span>{title}</span>
        <span className="ml-auto font-normal opacity-70">{summary}</span>
      </button>

      {open && (
        <div id={headingId} className="px-2 pb-2 space-y-1">
          {issues.length === 0 ? (
            /* Not a tick. These checks asked a fixed set of questions, and
               saying so is the difference between "we found nothing" and
               "your plan is fine". */
            <p className="opacity-80 leading-relaxed">{clearMessage}</p>
          ) : (
            <ul className="space-y-1">
              {[...warnings, ...notes].map((issue, index) => (
                <li
                  key={`${issue.severity}-${index}-${issue.message}`}
                  className={`flex gap-1.5 leading-relaxed ${
                    issue.severity === 'note' ? 'opacity-70' : ''
                  }`}
                >
                  <span aria-hidden className="shrink-0">
                    {issue.severity === 'warning' ? '▲' : '·'}
                  </span>
                  <span>
                    <span className="sr-only">
                      {issue.severity === 'warning' ? 'Warning: ' : 'Note: '}
                    </span>
                    {issue.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
