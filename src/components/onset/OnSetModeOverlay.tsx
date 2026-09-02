import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clapperboard,
  Plus,
  VolumeX,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import type { Shot, ShotStatus } from '../../types';
import {
  buildPrintableStripboardDays,
  formatDurationHours,
  parseClockMinutes,
  sortCues,
} from '../../domain/scheduling';
import {
  dayChecklist,
  isGoodCoverageTake,
  recordOnSetTake,
  takesCountFor,
} from '../../domain/continuity';
import { createId } from '../../domain/ids';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

/**
 * On-set / show-day mode (plan §35, standalone core).
 *
 * A full-screen, glanceable overlay for use on set: shooting-day progress,
 * current shot and take logging, day strips, up-next list, run-of-show cues
 * and a session timer. Coverage comes from GOOD takes, never from a second
 * counter, so this view and Continuity cannot disagree.
 *
 * Ephemeral-only state (cue "done" checkboxes, session timer) lives in
 * component state and is never persisted (plan rule 38).
 */

/** Planning statuses. Actual coverage is derived from the take log below. */
const PLANNING_STATUSES: Array<{ status: ShotStatus; label: string }> = [
  { status: 'planned', label: 'Planned' },
  { status: 'rehearsed', label: 'Rehearsed' },
  { status: 'ready', label: 'Ready' },
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
  const {
    project,
    activeSetup,
    updateProjectMeta,
    updateShot,
    selectShot,
    setActiveSetupId,
  } = useFloorPlan();
  const { theme } = useWorkspaceUI();
  const isLight = theme === 'light';
  // The overlay covers the workspace without unmounting it, so without a trap
  // Tab would walk the shot list underneath — mounted here means always open.
  const dialogRef = useDialogFocusTrap(true);

  const productionDays = project.productionDays ?? [];
  const scheduleBlocks = useMemo(
    () => project.scheduleBlocks ?? [],
    [project.scheduleBlocks],
  );
  const allTakes = useMemo(() => project.takes ?? [], [project.takes]);

  // Continuity and On-set deliberately share one selected shooting day. When
  // no day was selected yet, prefer the day containing the active setup.
  const selectedDayId =
    (project.continuityDayFilterId &&
    productionDays.some((day) => day.id === project.continuityDayFilterId)
      ? project.continuityDayFilterId
      : undefined) ??
    productionDays.find((day) =>
      day.scheduleBlockIds.some((id) => {
        const block = scheduleBlocks.find((candidate) => candidate.id === id);
        return block?.kind === 'setup' && block.setupId === activeSetup.id;
      }),
    )?.id ??
    productionDays[0]?.id;
  const selectedDay = productionDays.find((day) => day.id === selectedDayId);

  const shotIndex = useMemo(() => {
    const index = new Map<string, { shot: Shot; setupId: string; sceneNumber?: string }>();
    for (const setup of project.setups) {
      for (const shot of setup.shots) {
        index.set(shot.id, { shot, setupId: setup.id, sceneNumber: setup.sceneNumber });
      }
    }
    return index;
  }, [project.setups]);

  const dayCoverage = useMemo(
    () =>
      selectedDay
        ? dayChecklist(
            selectedDay.scheduleBlockIds,
            scheduleBlocks,
            { setups: project.setups, scriptScenes: project.scriptScenes },
            allTakes,
            selectedDay.id,
          )
        : undefined,
    [selectedDay, scheduleBlocks, project.setups, project.scriptScenes, allTakes],
  );

  // A scheduled day can span scenes and setups. Without a shooting day the
  // overlay keeps its old, useful fallback of showing the active setup.
  const shotEntries = useMemo(() => {
    if (!dayCoverage) {
      return activeSetup.shots.map((shot) => ({
        shot,
        setupId: activeSetup.id,
        sceneNumber: activeSetup.sceneNumber,
        takeCount: takesCountFor(allTakes, shot.id, shot.takesCount),
        covered: allTakes.some((take) => take.shotId === shot.id && isGoodCoverageTake(take)),
        attemptedNotCovered:
          allTakes.some((take) => take.shotId === shot.id) &&
          !allTakes.some((take) => take.shotId === shot.id && isGoodCoverageTake(take)),
      }));
    }
    return dayCoverage.planned.flatMap((row) => {
      const indexed = shotIndex.get(row.shotId);
      return indexed ? [{ ...indexed, ...row }] : [];
    });
  }, [dayCoverage, activeSetup, allTakes, shotIndex]);

  const [currentShotId, setCurrentShotId] = useState<string | null>(null);
  const firstOpenIndex = shotEntries.findIndex(
    (entry) => !entry.covered && entry.shot.status !== 'omitted',
  );
  const selectedIndex = currentShotId
    ? shotEntries.findIndex((entry) => entry.shot.id === currentShotId)
    : -1;
  const clampedIndex = selectedIndex >= 0 ? selectedIndex : firstOpenIndex >= 0 ? firstOpenIndex : 0;
  const currentEntry = shotEntries[clampedIndex];
  const currentShot = currentEntry?.shot;

  const [takeNote, setTakeNote] = useState('');
  const [nextTakeMos, setNextTakeMos] = useState(false);

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

  const goToIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(index, shotEntries.length - 1));
    const target = shotEntries[clamped];
    if (!target) return;
    setCurrentShotId(target.shot.id);
    if (target.setupId !== activeSetup.id) setActiveSetupId(target.setupId);
    selectShot(target.shot.id, target.setupId === activeSetup.id);
  };

  const setStatus = (shot: Shot, status: ShotStatus) => {
    updateShot(shot.id, { status });
  };

  /**
   * A judgement completes the most recent unjudged take for this shot. If the
   * slate operator skipped TAKE +, it creates and judges the take in one tap.
   * GOOD advances to the next still-uncovered planned shot; NG stays put.
   */
  const recordTake = (judgement?: boolean) => {
    if (!currentShot) return;
    const shotId = currentShot.id;
    const note = takeNote.trim() || undefined;
    updateProjectMeta((prev) => {
      const takes = prev.takes ?? [];
      const nextTakes = recordOnSetTake(takes, {
        id: createId('take'),
        shotId,
        productionDayId: selectedDay?.id,
        loggedAt: new Date().toISOString(),
        judgement,
        comments: note,
        mos: nextTakeMos,
      });

      return {
        takes: nextTakes,
        // Keep the legacy workflow/status compatible while coverage itself is
        // derived exclusively from GOOD takes.
        setups: prev.setups.map((setup) => ({
          ...setup,
          shots: setup.shots.map((shot) =>
            shot.id === shotId ? { ...shot, status: 'taken' as const } : shot,
          ),
        })),
      };
    });
    setTakeNote('');
    setNextTakeMos(false);

    if (judgement === true) {
      const nextIndex = shotEntries.findIndex(
        (entry, index) =>
          index > clampedIndex && !entry.covered && entry.shot.status !== 'omitted',
      );
      if (nextIndex >= 0) goToIndex(nextIndex);
    }
  };

  const toggleCueDone = (cueId: string) => {
    setDoneCueIds((prev) => {
      const next = new Set(prev);
      if (next.has(cueId)) next.delete(cueId);
      else next.add(cueId);
      return next;
    });
  };

  const shootableEntries = shotEntries.filter((entry) => entry.shot.status !== 'omitted');
  const coveredCount = shootableEntries.filter((entry) => entry.covered).length;
  const attemptedCount = shootableEntries.filter((entry) => entry.attemptedNotCovered).length;
  const remainingCount = shootableEntries.length - coveredCount - attemptedCount;
  const progressPercent =
    shootableEntries.length > 0 ? Math.round((coveredCount / shootableEntries.length) * 100) : 0;

  /** Published day plan, including meals, moves and other manual strips. */
  const stripboardDay = useMemo(
    () => buildPrintableStripboardDays(project).find((day) => day.id === selectedDay?.id),
    [project, selectedDay?.id],
  );
  const callMinutes = parseClockMinutes(selectedDay?.crewCall);
  const wrapMinutes = parseClockMinutes(selectedDay?.plannedWrap);
  const dayWindowMinutes =
    callMinutes !== null && wrapMinutes !== null
      ? wrapMinutes > callMinutes
        ? wrapMinutes - callMinutes
        : wrapMinutes + 1440 - callMinutes
      : null;
  const unallocatedMinutes =
    dayWindowMinutes !== null && stripboardDay
      ? dayWindowMinutes - stripboardDay.totalMinutes
      : null;

  const upNext = useMemo(
    () => shotEntries.slice(clampedIndex + 1, clampedIndex + 6),
    [shotEntries, clampedIndex],
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
                {selectedDay
                  ? `${selectedDay.name}${selectedDay.date ? ` · ${selectedDay.date}` : ''}`
                  : `Scene ${activeSetup.sceneNumber}: ${activeSetup.name}`}
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

        {productionDays.length > 0 && (
          <label className={`block text-[10px] font-bold uppercase tracking-wider ${subtextClass}`}>
            Shooting day
            <select
              value={selectedDay?.id ?? ''}
              onChange={(event) => {
                setCurrentShotId(null);
                updateProjectMeta({ continuityDayFilterId: event.target.value || undefined });
              }}
              className={`mt-1 w-full min-h-[44px] rounded-xl border px-3 text-sm font-semibold normal-case ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900'
                  : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            >
              {productionDays.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.name}{day.date ? ` · ${day.date}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs font-semibold mb-1">
            <span className={subtextClass}>Progress</span>
            <span className="font-mono">
              {coveredCount} covered · {attemptedCount} attempted · {remainingCount} remaining
            </span>
          </div>
          <div className={`h-2.5 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}>
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {selectedDay && stripboardDay && (
          <div className={`rounded-2xl border p-3 ${panelClass}`}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-bold">
                {selectedDay.crewCall ? `Call ${selectedDay.crewCall}` : 'Call TBC'}
                {' · '}
                {selectedDay.plannedWrap ? `Wrap ${selectedDay.plannedWrap}` : 'Wrap TBC'}
              </span>
              <span className={`font-mono ${subtextClass}`}>
                {formatDurationHours(stripboardDay.totalMinutes)} planned
              </span>
            </div>
            {unallocatedMinutes !== null && (
              <div className={`mt-1 text-[11px] font-semibold ${
                unallocatedMinutes < 0 ? 'text-amber-500' : subtextClass
              }`}>
                {unallocatedMinutes < 0
                  ? `${formatDurationHours(Math.abs(unallocatedMinutes))} beyond planned wrap`
                  : `${formatDurationHours(unallocatedMinutes)} unallocated before wrap`}
              </div>
            )}
            {stripboardDay.items.length > 0 && (
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Shooting day schedule">
                {stripboardDay.items.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    className={`flex-shrink-0 rounded-lg border px-2 py-1.5 text-[10px] ${
                      isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-950'
                    }`}
                  >
                    <div className="font-bold max-w-36 truncate">{item.label}</div>
                    <div className={subtextClass}>
                      {item.kindLabel}{item.minutes !== undefined ? ` · ${item.minutes}m` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                <div className="font-semibold text-sm mt-0.5">{currentEntry?.takeCount ?? 0}</div>
              </div>
            </div>

            {currentShot.framingDescription && (
              <p className={`text-xs leading-relaxed ${subtextClass}`}>{currentShot.framingDescription}</p>
            )}

            {/* Planning state stays available, but no longer claims coverage. */}
            <div className="grid grid-cols-3 gap-2">
              {PLANNING_STATUSES.map(({ status, label }) => {
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

            <div className={`rounded-xl border p-3 space-y-2 ${
              isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-950'
            }`}>
              <label className={`block text-[10px] font-bold uppercase tracking-wider ${subtextClass}`}>
                Take note
                <input
                  value={takeNote}
                  onChange={(event) => setTakeNote(event.target.value)}
                  placeholder="Short note (optional)"
                  className={`mt-1 w-full min-h-[44px] rounded-lg border px-3 text-sm normal-case ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-900 border-slate-700 text-slate-100'
                  }`}
                />
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button onClick={() => recordTake()} className={ghostButtonClass}>
                  <Plus className="w-4 h-4" /> Take +
                </button>
                <button
                  onClick={() => recordTake(true)}
                  className="min-h-[48px] px-3 rounded-xl border border-emerald-500 bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" /> Good
                </button>
                <button
                  onClick={() => recordTake(false)}
                  className="min-h-[48px] px-3 rounded-xl border border-red-500 bg-red-600 hover:bg-red-500 text-white font-bold"
                >
                  NG
                </button>
                <button
                  type="button"
                  aria-pressed={nextTakeMos}
                  onClick={() => setNextTakeMos((value) => !value)}
                  className={`${ghostButtonClass} ${nextTakeMos ? '!border-amber-500 !text-amber-500' : ''}`}
                >
                  <VolumeX className="w-4 h-4" /> MOS
                </button>
              </div>
              <p className={`text-[10px] ${subtextClass}`}>
                GOOD/NG judges the latest open take, or logs one if TAKE + was skipped. GOOD advances.
              </p>
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
                {clampedIndex + 1}/{shotEntries.length}
              </span>
              <button
                onClick={() => goToIndex(clampedIndex + 1)}
                disabled={clampedIndex >= shotEntries.length - 1}
                className={`${ghostButtonClass} flex-1 disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                Next shot <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className={`rounded-2xl border border-dashed p-8 text-center text-sm ${panelClass}`}>
            {selectedDay
              ? 'No planned shots on this shooting day. Add scene, setup or shot strips in Schedule.'
              : 'No shots in this scene yet. Add shots in the shot list first.'}
          </div>
        )}

        {/* Up-next list */}
        {upNext.length > 0 && (
          <div className={`rounded-2xl border p-3 ${panelClass}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2 px-1">
              Up next
            </div>
            <div className="space-y-1">
              {upNext.map((entry, i) => (
                <button
                  key={entry.shot.id}
                  onClick={() => goToIndex(clampedIndex + 1 + i)}
                  className={`w-full min-h-[48px] px-3 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors ${
                    isLight
                      ? 'border-slate-200 hover:bg-slate-100'
                      : 'border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold text-sky-500 flex-shrink-0">
                      {entry.shot.shotNumber || '—'}
                    </span>
                    <span className="text-sm font-medium truncate">{entry.shot.name}</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded border flex-shrink-0 ${
                      isLight
                        ? STATUS_LIGHT_BADGE_CLASS[entry.shot.status]
                        : STATUS_BADGE_CLASS[entry.shot.status]
                    }`}
                  >
                    {entry.covered ? 'covered' : entry.attemptedNotCovered ? 'attempted' : entry.shot.status}
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
