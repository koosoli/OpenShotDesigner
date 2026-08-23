import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clapperboard,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import type { Shot, ShotStatus } from '../../types';
import { sortCues } from '../../domain/scheduling';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';

/**
 * On-set / show-day mode (plan §35, standalone core).
 *
 * A full-screen, glanceable overlay for use on set: current shot hero card,
 * big status buttons, up-next list, run-of-show cue strip and a session
 * timer. Shot status changes go through the same `updateShot` path as the
 * shot list so autosave/history behave identically.
 *
 * Ephemeral-only state (cue "done" checkboxes, session timer) lives in
 * component state and is never persisted (plan rule 38).
 */

/** Statuses cycled by the big buttons, in shoot order. */
const STATUS_CYCLE: Array<{ status: ShotStatus; label: string }> = [
  { status: 'planned', label: 'Planned' },
  { status: 'rehearsed', label: 'Rehearsed' },
  { status: 'ready', label: 'Ready' },
  { status: 'taken', label: 'Taken' },
];

const STATUS_BADGE_CLASS: Record<ShotStatus, string> = {
  planned: 'bg-slate-500/15 text-slate-400 border-slate-500/40',
  rehearsed: 'bg-violet-500/15 text-violet-400 border-violet-500/40',
  ready: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  taken: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  omitted: 'bg-red-500/15 text-red-400 border-red-500/40',
};

const STATUS_LIGHT_BADGE_CLASS: Record<ShotStatus, string> = {
  planned: 'bg-slate-200 text-slate-600 border-slate-300',
  rehearsed: 'bg-violet-100 text-violet-700 border-violet-300',
  ready: 'bg-sky-100 text-sky-700 border-sky-300',
  taken: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  omitted: 'bg-red-100 text-red-700 border-red-300',
};

const formatElapsed = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

interface OnSetModeOverlayProps {
  onClose: () => void;
}

export const OnSetModeOverlay: React.FC<OnSetModeOverlayProps> = ({ onClose }) => {
  const { project, activeSetup, theme, updateShot, selectShot } = useFloorPlan();
  const isLight = theme === 'light';
  // The overlay covers the workspace without unmounting it, so without a trap
  // Tab would walk the shot list underneath — mounted here means always open.
  const dialogRef = useDialogFocusTrap(true);

  // Shots in setup order (same order the shot list shows them in).
  const shots: Shot[] = activeSetup.shots;

  const [currentIndex, setCurrentIndex] = useState(() => {
    // Start on the first shot that is not yet taken/omitted, else the first.
    const firstOpen = shots.findIndex((s) => s.status !== 'taken' && s.status !== 'omitted');
    return firstOpen >= 0 ? firstOpen : 0;
  });

  /** Session-local cue completion — presence-like ephemeral state, NOT persisted. */
  const [doneCueIds, setDoneCueIds] = useState<Set<string>>(new Set());

  /** Seconds since the overlay was opened — session-local, NOT persisted. */
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setElapsedSeconds((v) => v + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Escape closes the overlay.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const clampedIndex = Math.min(currentIndex, Math.max(shots.length - 1, 0));
  const currentShot = shots[clampedIndex];

  const goToIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(index, shots.length - 1));
    setCurrentIndex(clamped);
    const target = shots[clamped];
    if (target) selectShot(target.id, true);
  };

  const setStatus = (shot: Shot, status: ShotStatus) => {
    updateShot(shot.id, { status });
  };

  const toggleCueDone = (cueId: string) => {
    setDoneCueIds((prev) => {
      const next = new Set(prev);
      if (next.has(cueId)) next.delete(cueId);
      else next.add(cueId);
      return next;
    });
  };

  const takenCount = useMemo(
    () => shots.filter((s) => s.status === 'taken').length,
    [shots],
  );
  const progressPercent =
    shots.length > 0 ? Math.round((takenCount / shots.length) * 100) : 0;

  const upNext = useMemo(
    () => shots.slice(clampedIndex + 1, clampedIndex + 6),
    [shots, clampedIndex],
  );

  const cues = useMemo(
    () => sortCues(project.runOfShowCues ?? []),
    [project.runOfShowCues],
  );
  const nowCueId = cues.find((c) => !doneCueIds.has(c.id))?.id ?? null;

  const panelClass = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-slate-900 border-slate-800 text-slate-100';
  const subtextClass = isLight ? 'text-slate-500' : 'text-slate-400';
  const ghostButtonClass = `min-h-[48px] px-4 rounded-xl border font-semibold flex items-center justify-center gap-2 transition-colors ${
    isLight
      ? 'border-slate-300 bg-white hover:bg-slate-100'
      : 'border-slate-700 bg-slate-900 hover:bg-slate-800'
  }`;

  return (
    <div
      id="on-set-mode-overlay"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="on-set-mode-title"
      tabIndex={-1}
      className={`fixed inset-0 z-[70] overflow-y-auto ${isLight ? 'bg-slate-100' : 'bg-slate-950'} ${
        isLight ? 'text-slate-900' : 'text-slate-100'
      }`}
    >
      <div className="max-w-3xl mx-auto px-3 py-4 sm:px-6 sm:py-8 space-y-4">
        {/* Header: title, session timer, close */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-500 border border-sky-500/30">
              <Clapperboard className="w-5 h-5" />
            </div>
            <div>
              <h1 id="on-set-mode-title" className="text-base sm:text-lg font-black tracking-tight uppercase">On-set mode</h1>
              <p className={`text-xs ${subtextClass}`}>
                Scene {activeSetup.sceneNumber}: {activeSetup.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-2 rounded-xl border font-mono text-sm font-bold tabular-nums ${
                isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
              }`}
              title="Session time"
            >
              {formatElapsed(elapsedSeconds)}
            </div>
            <button
              onClick={onClose}
              title="Exit on-set mode (Esc)"
              aria-label="Exit on-set mode (Esc)"
              className={`p-3 rounded-xl border transition-colors ${
                isLight ? 'border-slate-300 hover:bg-slate-200' : 'border-slate-700 hover:bg-slate-800'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs font-semibold mb-1">
            <span className={subtextClass}>Progress</span>
            <span className="font-mono">
              {takenCount}/{shots.length} taken · {progressPercent}%
            </span>
          </div>
          <div className={`h-2.5 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}>
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Current shot hero card */}
        {currentShot ? (
          <div className={`rounded-2xl border p-4 space-y-4 shadow-sm ${panelClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold text-sky-500">
                    {currentShot.shotNumber || '—'}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded border ${
                      isLight
                        ? STATUS_LIGHT_BADGE_CLASS[currentShot.status]
                        : STATUS_BADGE_CLASS[currentShot.status]
                    }`}
                  >
                    {currentShot.status}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold truncate mt-0.5">{currentShot.name}</h2>
              </div>
              <span
                className={`font-mono text-xs font-bold px-2 py-1 rounded-lg border flex-shrink-0 ${
                  isLight ? 'bg-slate-100 border-slate-300 text-sky-700' : 'bg-slate-950 border-sky-500/40 text-sky-400'
                }`}
                title="Camera"
              >
                CAM {currentShot.cameraLabel || 'A'}
              </span>
            </div>

            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs ${subtextClass}`}>
              <div className={`rounded-lg border p-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Size</div>
                <div className="font-semibold text-sm mt-0.5">{currentShot.shotSize}</div>
              </div>
              <div className={`rounded-lg border p-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Lens</div>
                <div className="font-semibold text-sm mt-0.5">{currentShot.lensMm}mm</div>
              </div>
              <div className={`rounded-lg border p-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Movement</div>
                <div className="font-semibold text-sm mt-0.5 truncate">{currentShot.movement}</div>
              </div>
              <div className={`rounded-lg border p-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Takes</div>
                <div className="font-semibold text-sm mt-0.5">{currentShot.takesCount}</div>
              </div>
            </div>

            {currentShot.framingDescription && (
              <p className={`text-xs leading-relaxed ${subtextClass}`}>{currentShot.framingDescription}</p>
            )}

            {/* Big status buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STATUS_CYCLE.map(({ status, label }) => {
                const isActive = currentShot.status === status;
                const activeClass = isLight
                  ? 'bg-sky-600 border-sky-600 text-white'
                  : 'bg-sky-600 border-sky-500 text-white';
                return (
                  <button
                    key={status}
                    onClick={() => setStatus(currentShot, status)}
                    className={`min-h-[48px] rounded-xl border font-bold text-sm transition-colors ${
                      isActive ? activeClass : ghostButtonClass
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() =>
                setStatus(currentShot, currentShot.status === 'omitted' ? 'planned' : 'omitted')
              }
              className={`w-full min-h-[48px] rounded-xl border font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                currentShot.status === 'omitted'
                  ? isLight
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-red-600 border-red-500 text-white'
                  : isLight
                    ? 'border-slate-300 bg-white hover:bg-red-50 text-red-600'
                    : 'border-slate-700 bg-slate-900 hover:bg-red-950/40 text-red-400'
              }`}
            >
              <CircleSlash className="w-4 h-4" />
              {currentShot.status === 'omitted' ? 'Restore from Omit' : 'Omit'}
            </button>

            {/* Prev / Next navigation */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={() => goToIndex(clampedIndex - 1)}
                disabled={clampedIndex <= 0}
                className={`${ghostButtonClass} flex-1 disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <ChevronLeft className="w-5 h-5" /> Prev shot
              </button>
              <span className={`font-mono text-xs px-2 ${subtextClass}`}>
                {clampedIndex + 1}/{shots.length}
              </span>
              <button
                onClick={() => goToIndex(clampedIndex + 1)}
                disabled={clampedIndex >= shots.length - 1}
                className={`${ghostButtonClass} flex-1 disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                Next shot <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className={`rounded-2xl border border-dashed p-8 text-center text-sm ${panelClass}`}>
            No shots in this scene yet. Add shots in the shot list first.
          </div>
        )}

        {/* Up-next list */}
        {upNext.length > 0 && (
          <div className={`rounded-2xl border p-3 ${panelClass}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2 px-1">
              Up next
            </div>
            <div className="space-y-1">
              {upNext.map((shot, i) => (
                <button
                  key={shot.id}
                  onClick={() => goToIndex(clampedIndex + 1 + i)}
                  className={`w-full min-h-[48px] px-3 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors ${
                    isLight
                      ? 'border-slate-200 hover:bg-slate-100'
                      : 'border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold text-sky-500 flex-shrink-0">
                      {shot.shotNumber || '—'}
                    </span>
                    <span className="text-sm font-medium truncate">{shot.name}</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded border flex-shrink-0 ${
                      isLight
                        ? STATUS_LIGHT_BADGE_CLASS[shot.status]
                        : STATUS_BADGE_CLASS[shot.status]
                    }`}
                  >
                    {shot.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Run-of-show cue strip (session-local done checkboxes only) */}
        {cues.length > 0 && (
          <div className={`rounded-2xl border p-3 ${panelClass}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2 px-1">
              Now / Next — run of show
            </div>
            <div className="space-y-1">
              {cues.map((cue) => {
                const done = doneCueIds.has(cue.id);
                const isNow = cue.id === nowCueId;
                return (
                  <label
                    key={cue.id}
                    className={`w-full min-h-[48px] px-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${
                      isNow
                        ? isLight
                          ? 'border-sky-400 bg-sky-50'
                          : 'border-sky-500/60 bg-sky-950/40'
                        : isLight
                          ? 'border-slate-200 hover:bg-slate-100'
                          : 'border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggleCueDone(cue.id)}
                      className="w-5 h-5 rounded accent-sky-500 cursor-pointer flex-shrink-0"
                    />
                    <span className="flex items-center gap-2 min-w-0">
                      {isNow && (
                        <span className="text-[10px] font-black uppercase tracking-wider text-sky-500 flex-shrink-0">
                          Now
                        </span>
                      )}
                      <span
                        className={`text-sm truncate ${done ? 'line-through opacity-50' : 'font-medium'}`}
                      >
                        {cue.label}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
