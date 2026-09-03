import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, EyeOff, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useWorkspaceUI, type RightTab } from '../../context/WorkspaceUIContext';
import { buildReadinessItems, readinessFingerprint, type ReadinessDismissal, type ReadinessItem } from '../../domain/readiness';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';

export const ProductionReadiness: React.FC = () => {
  const { project, updateProjectMeta, displaySettings } = useFloorPlan();
  const { theme, setActiveRightTab, setRightPanelOpen } = useWorkspaceUI();
  const [open, setOpen] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const isLight = theme === 'light';
  const dialogRef = useDialogFocusTrap(open);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const allItems = useMemo(() => buildReadinessItems(project), [project]);
  const dismissals = project.readinessDismissals ?? [];
  const isDismissed = (item: ReadinessItem) => dismissals.some(
    (entry) => entry.itemId === item.id && entry.fingerprint === readinessFingerprint(item),
  );
  const items = allItems.filter((item) => !isDismissed(item));
  const dismissedItems = allItems.filter(isDismissed);

  const blockers = items.filter((item) => item.severity === 'blocker').length;
  const warnings = items.length - blockers;
  const navigate = (tab: RightTab) => {
    setActiveRightTab(tab);
    setRightPanelOpen(true);
    setOpen(false);
  };
  const mutateDismissals = (change: (current: ReadinessDismissal[]) => ReadinessDismissal[]) => updateProjectMeta((previous) => {
    const next = change(previous.readinessDismissals ?? []);
    return { readinessDismissals: next.length ? next : undefined };
  });
  const dismiss = (item: ReadinessItem) => mutateDismissals((current) => [
    ...current.filter((entry) => entry.itemId !== item.id),
    { itemId: item.id, fingerprint: readinessFingerprint(item), dismissedAt: new Date().toISOString() },
  ]);
  const restore = (item: ReadinessItem) => mutateDismissals((current) =>
    current.filter((entry) => !(entry.itemId === item.id && entry.fingerprint === readinessFingerprint(item))),
  );

  if (displaySettings.showProductionReadiness !== true) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`absolute top-3 right-3 z-30 h-9 px-3 rounded-xl border shadow-lg backdrop-blur flex items-center gap-2 text-[11px] font-bold ${blockers ? 'border-rose-500/60 bg-rose-950/85 text-rose-100' : warnings ? 'border-amber-500/60 bg-amber-950/85 text-amber-100' : 'border-emerald-500/60 bg-emerald-950/85 text-emerald-100'}`}
        title="Open production readiness"
      >
        {items.length ? <AlertTriangle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
        Readiness · {blockers} blocker{blockers === 1 ? '' : 's'} · {warnings} warning{warnings === 1 ? '' : 's'}
        {dismissedItems.length > 0 && <span className="opacity-60">{' · '}{dismissedItems.length} hidden</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div ref={dialogRef} tabIndex={-1} className={`relative w-full max-w-2xl max-h-[78vh] overflow-hidden rounded-2xl border shadow-2xl ${isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'}`} role="dialog" aria-modal="true" aria-labelledby="readiness-title">
            <div className="p-4 border-b border-inherit flex items-start justify-between gap-3">
              <div><h2 id="readiness-title" className="font-black flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-500" /> Production readiness</h2><p className="text-[11px] opacity-60 mt-1">Actionable facts already present in schedule, continuity, tasks, locations and power.</p></div>
              <button onClick={() => setOpen(false)} aria-label="Close readiness" className="p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[62vh]">
              {items.length === 0 ? (
                <div className="py-8 text-center"><CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" /><div className="mt-2 font-bold">No active blockers or warnings</div><p className="text-xs opacity-60 mt-1">This is a readiness check, not a safety or legal certification.</p></div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className={`w-full rounded-xl border flex items-stretch ${isLight ? 'border-slate-200 hover:bg-slate-50' : 'border-slate-800 hover:bg-slate-800'}`}>
                      <button onClick={() => navigate(item.tab)} className="flex-1 min-w-0 text-left p-3 flex gap-3">
                        <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${item.severity === 'blocker' ? 'text-rose-500' : 'text-amber-500'}`} />
                        <span className="flex-1"><span className="block text-xs font-bold">{item.label}</span><span className="block text-[10px] opacity-60 mt-0.5">{item.detail}</span></span>
                        <span className="text-[9px] uppercase font-bold opacity-50">Open {item.tab}</span>
                      </button>
                      <button onClick={() => dismiss(item)} aria-label={`Dismiss ${item.label}`} title="Dismiss until this finding changes" className="px-3 border-l border-inherit opacity-55 hover:opacity-100"><EyeOff className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              {dismissedItems.length > 0 && (
                <div className="mt-4 pt-3 border-t border-inherit">
                  <button onClick={() => setShowDismissed((value) => !value)} className="text-[10px] font-bold opacity-60 hover:opacity-100">{showDismissed ? 'Hide' : 'Show'} {dismissedItems.length} dismissed</button>
                  {showDismissed && <div className="mt-2 space-y-1.5">{dismissedItems.map((item) => <div key={item.id} className="rounded-lg border border-inherit p-2.5 flex items-center gap-2 opacity-65"><EyeOff className="w-3.5 h-3.5" /><span className="flex-1 text-xs">{item.label}</span><button onClick={() => restore(item)} aria-label={`Restore ${item.label}`} title="Restore finding"><RotateCcw className="w-3.5 h-3.5" /></button></div>)}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
