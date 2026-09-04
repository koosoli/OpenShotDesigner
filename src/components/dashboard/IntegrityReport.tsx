import React from 'react';
import { AlertTriangle, CheckCircle2, Database, X, XCircle } from 'lucide-react';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import type { IntegrityReport as IntegrityReportData } from '../../domain/integrityReport';
import type { ValidationIssue } from '../../domain/validation';

interface IntegrityReportProps {
  report: IntegrityReportData;
  onClose?: () => void;
  onSelectIssue?: (issue: ValidationIssue) => void;
}

const IssueRow: React.FC<{
  issue: ValidationIssue;
  isLight: boolean;
  onSelectIssue?: (issue: ValidationIssue) => void;
}> = ({ issue, isLight, onSelectIssue }) => {
  const body = (
    <>
      <span className="block text-[10px] font-mono font-bold opacity-60">{issue.code}</span>
      <span className="block text-xs mt-0.5">{issue.message}</span>
    </>
  );
  const style = `w-full rounded-xl border p-3 text-left ${
    isLight ? 'border-slate-200' : 'border-slate-800'
  }`;
  return onSelectIssue ? (
    <button type="button" onClick={() => onSelectIssue(issue)} className={`${style} ${isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800'}`}>
      {body}
    </button>
  ) : (
    <div className={style}>{body}</div>
  );
};

/**
 * Presentational integrity report: summary counts plus inspectable issue
 * lists grouped by severity. Receives a ready-built report and never fetches
 * data itself; navigation/wiring belongs to the caller.
 */
export const IntegrityReport: React.FC<IntegrityReportProps> = ({ report, onClose, onSelectIssue }) => {
  const { theme } = useWorkspaceUI();
  const isLight = theme === 'light';
  const hasIssues = report.errors.length > 0 || report.warnings.length > 0;

  return (
    <section
      aria-label="Project integrity"
      className={`rounded-2xl border p-4 ${isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black flex items-center gap-2">
            {hasIssues ? (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            )}
            Project integrity
          </h2>
          <p className="text-[11px] opacity-60 mt-1">
            ✓ {report.validReferences} valid references · ⚠ {report.warnings.length} warning{report.warnings.length === 1 ? '' : 's'} · ✕{' '}
            {report.errors.length} error{report.errors.length === 1 ? '' : 's'} · {report.mediaVerified} media verified
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close integrity report" className="p-1.5">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!hasIssues && (
        <div className="py-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <div className="mt-2 text-sm font-bold">No broken references</div>
          <p className="text-xs opacity-60 mt-1">Every checked reference resolves.</p>
        </div>
      )}

      {report.errors.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-rose-500" /> Errors · {report.errors.length}
          </h3>
          <div className="mt-2 space-y-1.5">
            {report.errors.map((issue, index) => (
              <IssueRow key={`${issue.code}-${issue.entityId ?? index}`} issue={issue} isLight={isLight} onSelectIssue={onSelectIssue} />
            ))}
          </div>
        </div>
      )}

      {report.warnings.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Warnings · {report.warnings.length}
          </h3>
          <div className="mt-2 space-y-1.5">
            {report.warnings.map((issue, index) => (
              <IssueRow key={`${issue.code}-${issue.entityId ?? index}`} issue={issue} isLight={isLight} onSelectIssue={onSelectIssue} />
            ))}
          </div>
        </div>
      )}

      {report.unreachableAssets.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold flex items-center gap-1.5">
            <Database className="w-4 h-4 opacity-60" /> Unreachable assets · {report.unreachableAssets.length}
          </h3>
          <ul className={`mt-2 rounded-xl border p-3 space-y-1 text-[11px] font-mono ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
            {report.unreachableAssets.map((id) => (
              <li key={id} className="opacity-80">{id}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
