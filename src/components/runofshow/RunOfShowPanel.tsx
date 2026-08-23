import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ListOrdered,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { createId } from '../../domain/ids';
import {
  sortCues,
  computeCueStarts,
  totalRunTime,
  validateCueList,
} from '../../domain/scheduling';
import type { RunOfShowCue } from '../../domain/scheduling';
import {
  CUE_NOTE_FIELDS,
  moveCueInList,
  renumberCuesByPosition,
  sortAndRenumberCues,
} from '../../domain/scheduling/runOfShow';
import { removeRunOfShowCue } from '../../domain';


const parseClockToSeconds = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] !== undefined ? Number(match[3]) : 0;
  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
};

const formatClock = (seconds: number): string => {
  const norm = ((seconds % 86400) + 86400) % 86400;
  const h = Math.floor(norm / 3600);
  const m = Math.floor((norm % 3600) / 60);
  const s = norm % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return s > 0 ? `${h}:${mm}:${ss}` : `${h}:${mm}`;
};

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join(' ');
};

export const RunOfShowPanel: React.FC = () => {
  const { project, theme, updateProjectMeta, openExportModal } = useFloorPlan();
  const isLight = theme === 'light';

  // Memoised so the cue-timing memos below actually memoise.
  const cues = useMemo(() => project.runOfShowCues ?? [], [project.runOfShowCues]);
  const segments = useMemo(() => project.productionSegments ?? [], [project.productionSegments]);

  const [showStartText, setShowStartText] = useState('20:00');
  const [expandedCueIds, setExpandedCueIds] = useState<Set<string>>(new Set());
  const [draggedCueId, setDraggedCueId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const sorted = useMemo(() => sortCues(cues), [cues]);

  const showStartSeconds = useMemo(() => {
    const parsed = parseClockToSeconds(showStartText);
    return parsed === null ? undefined : parsed;
  }, [showStartText]);

  const starts = useMemo(
    () => computeCueStarts(sorted, showStartSeconds),
    [sorted, showStartSeconds]
  );

  const totalRuntime = useMemo(() => totalRunTime(sorted), [sorted]);

  const issues = useMemo(() => {
    const seen = new Set<string>();
    const out = [];
    for (const issue of validateCueList(sorted)) {
      const key = `${issue.code}:${issue.entityId ?? ''}:${issue.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(issue);
    }
    return out;
  }, [sorted]);

  // --- Mutations ---

  const setCues = (next: RunOfShowCue[]) => {
    updateProjectMeta({ runOfShowCues: next });
  };

  const addCue = () => {
    const cue: RunOfShowCue = {
      id: createId('cue'),
      label: `Cue ${sorted.length + 1}`,
      order: sorted.length,
    };
    // Appended to the running order, not to the stored array: a list whose
    // stored orders have gaps would otherwise swallow the new cue somewhere in
    // the middle instead of at the bottom where it was asked for.
    setCues(renumberCuesByPosition([...sorted, cue]));
  };

  const duplicateCue = (cueId: string) => {
    const index = sorted.findIndex((c) => c.id === cueId);
    if (index < 0) return;
    const source = sorted[index];
    const copy: RunOfShowCue = { ...source, id: createId('cue'), label: `${source.label} (copy)` };
    const next = [...sorted];
    // The copy sits directly under its original, and carries the original's
    // `order` until the renumber below settles it — so the array's position,
    // not the duplicated number, is what decides where it lands.
    next.splice(index + 1, 0, copy);
    setCues(renumberCuesByPosition(next));
  };

  const deleteCue = (cueId: string) => {
    // The coverage row keyed by this cue goes too. It used to be filtered out
    // of the editor's display but left in the project forever, and the print
    // builder still emitted it under a "Row abcdef" stub.
    const next = removeRunOfShowCue(
      { runOfShowCues: cues, coverageMatrix: project.coverageMatrix },
      cueId,
    );
    updateProjectMeta({
      // The filtered project array is in storage order, not running order, so
      // it has to be sorted before the gap the deleted cue left is closed up.
      runOfShowCues: sortAndRenumberCues(next.runOfShowCues as RunOfShowCue[]),
      ...(next.coverageMatrix ? { coverageMatrix: next.coverageMatrix } : {}),
    });
    setExpandedCueIds((prev) => {
      if (!prev.has(cueId)) return prev;
      const next = new Set(prev);
      next.delete(cueId);
      return next;
    });
  };

  const updateCue = (cueId: string, updates: Partial<RunOfShowCue>) => {
    setCues(cues.map((c) => (c.id === cueId ? { ...c, ...updates } : c)));
  };

  const moveCue = (fromIndex: number, toIndex: number) => {
    // A move that changes nothing is dropped here rather than in the domain:
    // writing an identical cue list back would still mark the project dirty.
    if (fromIndex < 0 || fromIndex >= sorted.length) return;
    if (Math.max(0, Math.min(toIndex, sorted.length - 1)) === fromIndex) return;
    setCues(moveCueInList(sorted, fromIndex, toIndex));
  };

  const toggleExpanded = (cueId: string) => {
    setExpandedCueIds((prev) => {
      const next = new Set(prev);
      if (next.has(cueId)) next.delete(cueId);
      else next.add(cueId);
      return next;
    });
  };

  // --- Drag & drop ---

  const handleDragStart = (cueId: string) => (e: React.DragEvent) => {
    setDraggedCueId(cueId);
    e.dataTransfer.setData('text/plain', cueId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedCueId(null);
    setDropTargetId(null);
  };

  const allowDrop = (cueId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(cueId);
  };

  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = draggedCueId ?? e.dataTransfer.getData('text/plain');
    const fromIndex = sorted.findIndex((c) => c.id === draggedId);
    const toIndex = sorted.findIndex((c) => c.id === targetId);
    if (fromIndex >= 0 && toIndex >= 0) moveCue(fromIndex, toIndex);
    setDraggedCueId(null);
    setDropTargetId(null);
  };

  // --- Timeline geometry ---

  const timeline = useMemo(() => {
    const resolved: { cue: RunOfShowCue; start: number; duration: number | null }[] = [];
    const unresolved: RunOfShowCue[] = [];
    let spanMin = 0;
    let spanMax = showStartSeconds ?? 0;

    const startMap = new Map(starts.map((s) => [s.cueId, s.startSeconds]));
    for (const cue of sorted) {
      const start = startMap.get(cue.id);
      if (start === null || start === undefined) {
        unresolved.push(cue);
        continue;
      }
      resolved.push({ cue, start, duration: cue.plannedDurationSeconds ?? null });
      spanMin = Math.min(spanMin, start);
      spanMax = Math.max(spanMax, start + (cue.plannedDurationSeconds ?? 0));
    }
    const span = Math.max(spanMax - spanMin, 60);
    return { resolved, unresolved, spanMin, span };
  }, [sorted, starts, showStartSeconds]);

  // --- Styles ---

  const surfaceClass = isLight
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/60 border-slate-800';
  const cardClass = isLight
    ? 'bg-white border-slate-200'
    : 'bg-slate-900 border-slate-700';
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const inputClass = `min-h-[36px] px-2 py-1 rounded-lg border text-xs w-full transition-colors ${
    isLight
      ? 'bg-white border-slate-300 text-slate-800 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
      : 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
  }`;
  const iconBtnClass = `flex items-center justify-center min-w-[36px] min-h-[36px] rounded-lg transition-colors ${
    isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70' : 'text-slate-400 hover:text-white hover:bg-slate-800'
  }`;

  const renderCueRow = (cue: RunOfShowCue, index: number) => {
    const isDragging = draggedCueId === cue.id;
    const isDropTarget = dropTargetId === cue.id && draggedCueId !== cue.id;
    const expanded = expandedCueIds.has(cue.id);

    return (
      <li
        key={cue.id}
        draggable
        onDragStart={handleDragStart(cue.id)}
        onDragEnd={handleDragEnd}
        onDragOver={allowDrop(cue.id)}
        onDrop={handleDrop(cue.id)}
        className={`rounded-xl border transition-all ${cardClass} ${
          isDragging ? 'opacity-40' : ''
        } ${
          isDropTarget
            ? isLight
              ? 'border-sky-400 ring-2 ring-sky-400/40'
              : 'border-sky-500 ring-2 ring-sky-500/40'
            : ''
        }`}
      >
        <div className="flex items-start gap-1 p-2">
          <span
            title="Drag to reorder (or use the arrow buttons)"
            aria-hidden="true"
            className={`cursor-grab select-none px-1 py-2 text-xs ${mutedText}`}
          >
            ⠿
          </span>
          <div className="flex flex-col flex-shrink-0">
            <button
              onClick={() => moveCue(index, index - 1)}
              disabled={index === 0}
              title="Move up"
              aria-label={`Move cue ${index + 1} up`}
              className={`${iconBtnClass} !min-w-[28px] !min-h-[18px] disabled:opacity-30`}
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => moveCue(index, index + 1)}
              disabled={index === sorted.length - 1}
              title="Move down"
              aria-label={`Move cue ${index + 1} down`}
              className={`${iconBtnClass} !min-w-[28px] !min-h-[18px] disabled:opacity-30`}
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-1.5 items-center">
            <input
              value={cue.label}
              onChange={(e) => updateCue(cue.id, { label: e.target.value })}
              placeholder={`Cue ${index + 1} label`}
              aria-label={`Label for cue ${index + 1}`}
              className={`${inputClass} font-medium`}
            />
            <select
              value={cue.segmentId ?? ''}
              onChange={(e) =>
                updateCue(cue.id, { segmentId: e.target.value || undefined })
              }
              aria-label={`Segment for cue ${index + 1}`}
              className={`${inputClass} !w-auto min-w-[110px]`}
            >
              <option value="">— none —</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
            <input
              value={cue.plannedStart ?? ''}
              onChange={(e) =>
                updateCue(cue.id, { plannedStart: e.target.value.trim() || undefined })
              }
              placeholder="HH:MM"
              aria-label={`Planned start for cue ${index + 1}`}
              className={`${inputClass} !w-auto w-[76px] font-mono`}
            />
            <input
              type="number"
              min={0}
              step={1}
              value={
                cue.plannedDurationSeconds === undefined
                  ? ''
                  : String(Math.round(cue.plannedDurationSeconds / 60))
              }
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === '') {
                  updateCue(cue.id, { plannedDurationSeconds: undefined });
                  return;
                }
                const minutes = Number(raw);
                if (Number.isFinite(minutes) && minutes >= 0) {
                  updateCue(cue.id, { plannedDurationSeconds: Math.round(minutes * 60) });
                }
              }}
              placeholder="min"
              aria-label={`Planned duration in minutes for cue ${index + 1}`}
              className={`${inputClass} !w-auto w-[64px] font-mono`}
            />
          </div>
          <div className="flex flex-shrink-0">
            <button
              onClick={() => toggleExpanded(cue.id)}
              title={expanded ? 'Hide department notes' : 'Show department notes'}
              aria-label={`${expanded ? 'Hide' : 'Show'} department notes for cue ${index + 1}`}
              aria-expanded={expanded}
              className={`${iconBtnClass} ${expanded ? (isLight ? 'text-sky-600' : 'text-sky-400') : ''}`}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button
              onClick={() => duplicateCue(cue.id)}
              title="Duplicate cue"
              aria-label={`Duplicate cue ${index + 1}`}
              className={iconBtnClass}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => deleteCue(cue.id)}
              title="Delete cue"
              aria-label={`Delete cue ${index + 1}`}
              className={`${iconBtnClass} hover:!text-red-500`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {expanded && (
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-2 px-2 pb-2 pt-1 mx-2 mb-2 rounded-lg border-t ${
              isLight ? 'border-slate-100 bg-slate-50' : 'border-slate-800 bg-slate-950/40'
            }`}
          >
            {CUE_NOTE_FIELDS.map(({ key, label }) => (
              <label key={key} className="flex flex-col gap-1">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${mutedText}`}>
                  {label}
                </span>
                <textarea
                  value={cue[key] ?? ''}
                  onChange={(e) =>
                    updateCue(cue.id, { [key]: e.target.value.trim() || undefined })
                  }
                  rows={2}
                  aria-label={`${label} notes for cue ${index + 1}`}
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </label>
            ))}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3">
      {/* Header: show start + add */}
      <div className={`rounded-xl border p-2.5 flex flex-wrap items-center gap-2 ${surfaceClass}`}>
        <h3
          className={`text-xs font-bold flex items-center gap-1.5 mr-auto ${
            isLight ? 'text-slate-700' : 'text-slate-300'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          Run of Show
          <span
            className={`px-1.5 py-0.5 text-[10px] font-mono rounded-full ${
              isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {sorted.length}
          </span>
        </h3>
        <label className="flex items-center gap-1.5">
          <span className={`text-xs flex items-center gap-1 ${mutedText}`}>
            <Clock className="w-3.5 h-3.5" />
            Show start
          </span>
          <input
            value={showStartText}
            onChange={(e) => setShowStartText(e.target.value)}
            placeholder="20:00"
            aria-label="Show start time"
            className={`${inputClass} !w-auto w-[80px] font-mono`}
          />
        </label>
        {/* The show caller works from paper, and the printed sheet uses the
            same show start typed above. */}
        <button
          onClick={() => openExportModal('runofshow')}
          title="Printable run of show with cue times and department notes"
          className={`flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-semibold border transition-colors flex-shrink-0 ${
            isLight
              ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <button
          onClick={addCue}
          title="Add cue"
          className={`flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
            isLight
              ? 'bg-sky-600 text-white hover:bg-sky-700'
              : 'bg-sky-600 text-white hover:bg-sky-500'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          Add cue
        </button>
      </div>

      {/* Timeline strip */}
      <div className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        <div
          className={`relative h-10 rounded-lg overflow-hidden border ${
            isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'
          }`}
          role="img"
          aria-label="Cue timeline"
        >
          {timeline.resolved.map(({ cue, start, duration }) => {
            const leftPct = ((start - timeline.spanMin) / timeline.span) * 100;
            const widthPct = duration !== null ? (duration / timeline.span) * 100 : 1.5;
            const wideEnough = widthPct >= 10;
            const clock = formatClock(start);
            return (
              <div
                key={cue.id}
                title={`${cue.label || 'Untitled cue'} — ${clock}${
                  duration !== null ? ` · ${formatDuration(duration)}` : ' · no duration'
                }`}
                className={`absolute top-1 bottom-1 rounded-md overflow-hidden flex items-center justify-center text-[10px] font-medium truncate px-1 ${
                  duration !== null
                    ? isLight
                      ? 'bg-sky-500/85 text-white'
                      : 'bg-sky-600 text-white'
                    : isLight
                    ? 'bg-sky-200 text-sky-900 border border-dashed border-sky-400'
                    : 'bg-sky-900/70 text-sky-200 border border-dashed border-sky-600'
                }`}
                style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1.5)}%` }}
              >
                {wideEnough ? cue.label || '—' : ''}
              </div>
            );
          })}
          {timeline.resolved.length === 0 && (
            <div
              className={`absolute inset-0 flex items-center justify-center text-[11px] ${mutedText}`}
            >
              No cues with resolvable start times
            </div>
          )}
        </div>
        {timeline.unresolved.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${mutedText}`}>
              Unscheduled:
            </span>
            {timeline.unresolved.map((cue) => (
              <span
                key={cue.id}
                title={`${cue.label || 'Untitled cue'} — start cannot be resolved (missing upstream duration or invalid time)`}
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono border border-dashed ${
                  isLight
                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                    : 'border-amber-600 bg-amber-950/50 text-amber-300'
                }`}
              >
                {cue.label || 'Untitled'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Cue list */}
      {sorted.length > 0 ? (
        <ul className="flex flex-col gap-1.5">{sorted.map(renderCueRow)}</ul>
      ) : (
        <div
          className={`min-h-[120px] rounded-xl border border-dashed flex flex-col items-center justify-center gap-2 p-6 text-center ${mutedText} ${
            isLight ? 'border-slate-300' : 'border-slate-700'
          }`}
        >
          <ListOrdered className="w-6 h-6" />
          <p className="text-xs">No cues yet — add one to build the running order.</p>
        </div>
      )}

      {/* Footer stats */}
      <div className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        <p className={`text-xs font-mono flex items-center gap-1.5 ${mutedText}`}>
          Total runtime:
          {totalRuntime === null ? (
            <span
              title="some cues lack durations"
              className={`font-bold ${isLight ? 'text-amber-600' : 'text-amber-400'}`}
            >
              —
            </span>
          ) : (
            <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
              {formatDuration(totalRuntime)}
            </span>
          )}
        </p>
        {issues.length > 0 ? (
          <ul className="flex flex-col gap-1" role="alert">
            {issues.map((issue, i) => (
              <li
                key={`${issue.code}-${i}`}
                className={`text-xs flex items-start gap-2 leading-relaxed rounded-lg px-2 py-1.5 ${
                  issue.severity === 'error'
                    ? isLight
                      ? 'bg-red-50 text-red-800'
                      : 'bg-red-950/50 text-red-300'
                    : isLight
                    ? 'bg-amber-50 text-amber-900'
                    : 'bg-amber-950/50 text-amber-200'
                }`}
              >
                <AlertTriangle
                  className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                    issue.severity === 'error' ? 'text-red-500' : 'text-amber-500'
                  }`}
                />
                <span>
                  <span className="font-semibold uppercase text-[10px] mr-1.5">
                    {issue.severity}
                  </span>
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className={`text-xs flex items-center gap-1.5 ${
              isLight ? 'text-emerald-600' : 'text-emerald-400'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            No cue-list issues
          </p>
        )}
      </div>
    </div>
  );
};
