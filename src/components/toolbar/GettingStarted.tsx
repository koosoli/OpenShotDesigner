import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, Rocket, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import type { RightTab } from '../../context/WorkspaceUIContext';
import { gettingStartedSteps } from '../../domain/workspace/gettingStarted';
import { useDismiss } from '../common/useDismiss';

const dismissedKey = (projectId: string) => `openshotdesigner_ui_getting_started_hidden_${projectId}`;

/**
 * A navbar button with the workflow checklist. Shows progress until every
 * step is done or it is hidden for this project; steps tick themselves off
 * from the project data, and "Go" opens the module (switching it on if the
 * workspace preset hid it).
 */
export const GettingStarted: React.FC = () => {
  const { project, isModuleVisible, setModuleVisible, loadExampleProductionData } = useFloorPlan();
  const { setActiveRightTab, setRightPanelOpen } = useWorkspaceUI();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(dismissedKey(project.id)) === '1';
    } catch {
      return false;
    }
  });
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, useCallback(() => setOpen(false), []), ref);

  const steps = useMemo(() => gettingStartedSteps(project), [project]);
  const done = steps.filter((step) => step.done).length;
  if (hidden || done === steps.length) return null;

  const hide = () => {
    setHidden(true);
    setOpen(false);
    try {
      localStorage.setItem(dismissedKey(project.id), '1');
    } catch {
      // Preference only.
    }
  };

  const go = (module: (typeof steps)[number]['module']) => {
    if (!isModuleVisible(module)) setModuleVisible(module, true);
    setActiveRightTab(module as RightTab);
    setRightPanelOpen(true);
    setOpen(false);
  };

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Getting started: the production workflow, step by step"
        aria-label={`Getting started, ${done} of ${steps.length} done`}
        className="h-8 px-2.5 rounded-lg border border-line-strong text-[11px] font-semibold flex items-center gap-1.5 text-ink-soft hover:bg-surface-hover whitespace-nowrap"
      >
        <Rocket className="w-3.5 h-3.5 text-accent-ink" />
        <span className="hidden 2xl:inline">Getting started</span>
        <span className="font-mono text-[10px] px-1 rounded bg-surface-muted">{done}/{steps.length}</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-80 rounded-xl border border-line bg-surface text-ink shadow-2xl p-3 z-50">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold">From script to call sheet</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded text-ink-muted hover:bg-surface-hover"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden mb-3">
            <div className="h-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <ol className="space-y-2">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2">
                {step.done
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-ok shrink-0" aria-label="Done" />
                  : <Circle className="w-4 h-4 mt-0.5 text-ink-subtle shrink-0" aria-label="To do" />}
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-semibold ${step.done ? 'line-through text-ink-muted' : ''}`}>{step.title}</div>
                  {!step.done && <p className="text-[11px] text-ink-muted leading-snug">{step.detail}</p>}
                </div>
                {!step.done && (
                  <button type="button" onClick={() => go(step.module)} className="shrink-0 px-2 py-1 rounded-md bg-accent hover:bg-accent-hover text-white text-[11px] font-semibold">
                    Go
                  </button>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-3 pt-2 border-t border-line flex items-center justify-between gap-2">
            <button type="button" onClick={() => { loadExampleProductionData(); }} className="text-[11px] font-semibold text-accent-ink hover:underline">
              Fill empty modules with examples
            </button>
            <button type="button" onClick={hide} className="text-[11px] text-ink-muted hover:text-ink">Hide for this project</button>
          </div>
        </div>
      )}
    </div>
  );
};
