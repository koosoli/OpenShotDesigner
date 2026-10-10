import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  /** One or two sentences: what this page is for. */
  children?: React.ReactNode;
  /** The one thing to do next. */
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
  /** Offer "Fill with example data" (fills only empty modules). Default true. */
  offerExamples?: boolean;
  className?: string;
}

/**
 * What an empty module shows: what it is for, the next step, and a way to see
 * it working with the example production. An empty page that only says
 * "nothing here" teaches nothing.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  children,
  action,
  offerExamples = true,
  className = '',
}) => {
  const { loadExampleProductionData } = useFloorPlan();
  const [message, setMessage] = useState<string | null>(null);

  const fill = () => {
    const filled = loadExampleProductionData();
    setMessage(filled.length === 0 ? 'Every module already has data — nothing was changed.' : `Added example ${filled.join(', ')}.`);
  };

  return (
    <div className={`rounded-xl border border-dashed border-line-strong bg-surface-sunken p-5 text-center flex flex-col items-center gap-2 ${className}`}>
      <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent-ink grid place-items-center">{icon}</div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children && <p className="text-xs text-ink-muted max-w-sm leading-relaxed">{children}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5"
          >
            {action.icon}
            {action.label}
          </button>
        )}
        {offerExamples && (
          <button
            type="button"
            onClick={fill}
            title="Fill every empty module with the bundled example production. Nothing you have is changed."
            className="px-3 py-1.5 rounded-lg border border-line-strong text-ink-soft hover:bg-surface-hover text-xs font-semibold flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Fill with example data
          </button>
        )}
      </div>
      {message && <p role="status" className="text-[11px] text-emerald-600 dark:text-emerald-400">{message}</p>}
    </div>
  );
};
