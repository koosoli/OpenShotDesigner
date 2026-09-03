import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useWorkspaceUI, type RightTab } from '../../context/WorkspaceUIContext';
import { isGoodCoverageTake } from '../../domain/continuity';
import { todayIso } from '../../domain/scheduling';

interface ReadinessItem {
  id: string;
  severity: 'blocker' | 'warning';
  label: string;
  detail: string;
  tab: RightTab;
}

export const ProductionReadiness: React.FC = () => {
  const { project } = useFloorPlan();
  const { theme, setActiveRightTab, setRightPanelOpen } = useWorkspaceUI();
  const [open, setOpen] = useState(false);
  const isLight = theme === 'light';

  const items = useMemo((): ReadinessItem[] => {
    const result: ReadinessItem[] = [];
    const takes = project.takes ?? [];
    const shots = project.setups.flatMap((setup) => setup.shots);
    for (const day of project.productionDays ?? []) {
      const missing = [
        !day.date && 'date',
        !day.crewCall && 'crew call',
        day.scheduleBlockIds.length === 0 && 'schedule',
        !day.callSheet?.nearestHospital && 'nearest hospital',
      ].filter(Boolean);
      if (missing.length) result.push({
        id: `day-${day.id}`,
        severity: 'blocker',
        label: `${day.name} is not ready to issue`,
        detail: `Missing ${missing.join(', ')}`,
        tab: 'schedule',
      });
    }
    for (const shot of shots) {
      const shotTakes = takes.filter((take) => take.shotId === shot.id);
      if (shotTakes.length > 0 && !shotTakes.some(isGoodCoverageTake)) result.push({
        id: `coverage-${shot.id}`,
        severity: 'blocker',
        label: `Shot ${shot.shotNumber} attempted without coverage`,
        detail: 'No good base take; a good PU does not cover the planned shot.',
        tab: 'continuity',
      });
    }
    for (const task of project.tasks ?? []) {
      if (!task.completedAt && task.dueDate && task.dueDate < todayIso()) result.push({
        id: `task-${task.id}`,
        severity: task.priority === 'urgent' ? 'blocker' : 'warning',
        label: `Overdue: ${task.title}`,
        detail: `Due ${task.dueDate}${task.priority ? ` · ${task.priority}` : ''}`,
        tab: 'tasks',
      });
    }
    for (const location of project.locations ?? []) {
      if (!location.address) result.push({
        id: `location-${location.id}`,
        severity: 'warning',
        label: `${location.name} has no address`,
        detail: 'Call sheets and transport plans cannot provide an address.',
        tab: 'locations',
      });
    }
    for (const consumer of project.powerPlan?.consumers ?? []) {
      if (!consumer.circuitId) result.push({
        id: `power-${consumer.id}`,
        severity: 'warning',
        label: `${consumer.name} is not assigned to a circuit`,
        detail: 'It cannot be included in circuit loading or phase balance.',
        tab: 'power',
      });
    }
    return result;
  }, [project]);

  const blockers = items.filter((item) => item.severity === 'blocker').length;
  const warnings = items.length - blockers;
  const navigate = (tab: RightTab) => {
    setActiveRightTab(tab);
    setRightPanelOpen(true);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`absolute top-3 right-3 z-30 h-9 px-3 rounded-xl border shadow-lg backdrop-blur flex items-center gap-2 text-[11px] font-bold ${blockers ? 'border-rose-500/60 bg-rose-950/85 text-rose-100' : warnings ? 'border-amber-500/60 bg-amber-950/85 text-amber-100' : 'border-emerald-500/60 bg-emerald-950/85 text-emerald-100'}`}
        title="Open production readiness"
      >
        {items.length ? <AlertTriangle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
        Readiness · {blockers} blocker{blockers === 1 ? '' : 's'} · {warnings} warning{warnings === 1 ? '' : 's'}
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className={`relative w-full max-w-2xl max-h-[78vh] overflow-hidden rounded-2xl border shadow-2xl ${isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'}`} role="dialog" aria-modal="true" aria-labelledby="readiness-title">
            <div className="p-4 border-b border-inherit flex items-start justify-between gap-3">
              <div><h2 id="readiness-title" className="font-black flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-500" /> Production readiness</h2><p className="text-[11px] opacity-60 mt-1">Actionable facts already present in schedule, continuity, tasks, locations and power.</p></div>
              <button onClick={() => setOpen(false)} aria-label="Close readiness" className="p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[62vh]">
              {items.length === 0 ? (
                <div className="py-12 text-center"><CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" /><div className="mt-2 font-bold">No blockers or warnings found</div><p className="text-xs opacity-60 mt-1">This is a readiness check, not a safety or legal certification.</p></div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <button key={item.id} onClick={() => navigate(item.tab)} className={`w-full text-left rounded-xl border p-3 flex gap-3 ${isLight ? 'border-slate-200 hover:bg-slate-50' : 'border-slate-800 hover:bg-slate-800'}`}>
                      <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${item.severity === 'blocker' ? 'text-rose-500' : 'text-amber-500'}`} />
                      <span className="flex-1"><span className="block text-xs font-bold">{item.label}</span><span className="block text-[10px] opacity-60 mt-0.5">{item.detail}</span></span>
                      <span className="text-[9px] uppercase font-bold opacity-50">Open {item.tab}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
