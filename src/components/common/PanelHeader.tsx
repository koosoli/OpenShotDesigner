import React from 'react';

interface PanelTitleProps {
  icon: React.ReactNode;
  title: string;
  /** One line under the title: counts, scope. */
  subtitle?: React.ReactNode;
  /** Small count chip beside the title. */
  count?: number;
  className?: string;
}

/**
 * The title block every module panel shares: icon tile, title, count chip and
 * one line of context. Panels whose header also holds view controls put this
 * on the left of their own row; simple panels use `PanelHeader`.
 */
export const PanelTitle: React.FC<PanelTitleProps> = ({ icon, title, subtitle, count, className = '' }) => (
  <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
    <div className="w-7 h-7 shrink-0 rounded-lg bg-accent-soft text-accent-ink grid place-items-center [&_svg]:w-4 [&_svg]:h-4">{icon}</div>
    <div className="min-w-0">
      <h2 className="text-sm font-bold text-ink flex items-center gap-1.5 truncate">
        {title}
        {count !== undefined && (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-surface-muted text-ink-soft">{count}</span>
        )}
      </h2>
      {subtitle && <p className="text-[11px] text-ink-muted truncate">{subtitle}</p>}
    </div>
  </div>
);

interface PanelHeaderProps extends PanelTitleProps {
  /** Buttons on the right: export, add, view toggles. */
  actions?: React.ReactNode;
}

/** Title on the left, actions on the right, a rule underneath. */
export const PanelHeader: React.FC<PanelHeaderProps> = ({ actions, className = '', ...title }) => (
  <div className={`flex items-center justify-between gap-3 pb-2 border-b border-line ${className}`}>
    <PanelTitle {...title} />
    {actions && <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">{actions}</div>}
  </div>
);
