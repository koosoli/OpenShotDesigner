/**
 * Whole-project undo history, extracted from `FloorPlanContext` the same way
 * `useAutosave` was: one slice of the provider with its own state and rules.
 *
 * Every entry is an immutable project snapshot (structural sharing keeps
 * memory flat), so Ctrl+Z spans the screenplay, schedule, mood boards,
 * company info and every scene's canvas — not just the open setup.
 * Session-only UI prefs (displaySettings) stay outside by design (rule 38).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Project } from '../types';
import { shouldCoalesce, typingTarget } from '../utils/undoCoalesce';
import type { TypingMark } from '../utils/undoCoalesce';

/** How many undo steps are kept. */
export const HISTORY_LIMIT = 50;

export const useProjectHistory = (
  project: Project,
  setProjectState: Dispatch<SetStateAction<Project>>,
) => {
  const [history, setHistory] = useState<Project[]>([project]);
  const [historyIndex, setHistoryIndex] = useState(0);
  // Updaters run during React's render phase, so snapshots they want recorded
  // are parked here and flushed once per committed render.
  const pendingSnapshotsRef = useRef<Project[]>([]);
  // Latest known project for code paths that commit WITHOUT a setProject
  // (canvas gesture end), including live drag refs.
  const liveProjectRef = useRef(project);
  /** The text field the last recorded change was typed in (utils/undoCoalesce). */
  const lastTypingRef = useRef<TypingMark | null>(null);

  /**
   * Every project write goes through here, so `liveProjectRef` can never fall
   * behind the committed project.
   *
   * It matters because `commitCurrentState` — the drag-release path — records
   * whatever this ref holds. The ref used to be written only by
   * `commitSetupUpdate` and by an effect that runs after the render, which
   * left a window after an undo, a scene switch or any non-setup edit where
   * releasing a drag would record a project from before it and silently
   * revert the edit. Wrapping the setter closes that by construction.
   */
  const setProject = useCallback((value: Project | ((prev: Project) => Project)) => {
    setProjectState((prev) => {
      const next = typeof value === 'function' ? (value as (p: Project) => Project)(prev) : value;
      liveProjectRef.current = next;
      return next;
    });
  }, [setProjectState]);

  // Stable, like `setProject`: an effect that writes the project does not have
  // to re-subscribe on every render just to list it as a dependency.
  const setRecordedProject = useCallback(
    (updater: (prev: Project) => Project) => {
      setProject((prev) => {
        const next = updater(prev);
        if (next !== prev) pendingSnapshotsRef.current.push(next);
        return next;
      });
    },
    [setProject],
  );

  /** Push one immutable snapshot (dedupe by reference; cap length). */
  const recordProjectSnapshot = (snapshot: Project, baseHistory: Project[], baseIndex: number) => {
    const nextHistory = baseHistory.slice(0, baseIndex + 1);
    if (nextHistory[nextHistory.length - 1] === snapshot) return;
    // Keystrokes in one field fold into one undo step: replace the step the
    // first keystroke opened instead of stacking one per character.
    const target = typeof document === 'undefined' ? null : typingTarget(document.activeElement);
    const now = Date.now();
    const coalesce = shouldCoalesce(lastTypingRef.current, target, now) && nextHistory.length > 1 && baseIndex === baseHistory.length - 1;
    lastTypingRef.current = target ? { target, at: now } : null;
    if (coalesce) {
      nextHistory[nextHistory.length - 1] = snapshot;
    } else {
      nextHistory.push(snapshot);
      if (nextHistory.length > HISTORY_LIMIT) nextHistory.shift();
    }
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  // Flush snapshots produced by batched updaters exactly once per render.
  useEffect(() => {
    liveProjectRef.current = project;
    if (pendingSnapshotsRef.current.length === 0) return;
    const snapshot = pendingSnapshotsRef.current[pendingSnapshotsRef.current.length - 1];
    pendingSnapshotsRef.current = [];
    recordProjectSnapshot(snapshot, history, historyIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const undo = () => {
    lastTypingRef.current = null;
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setProject(history[newIndex]);
    }
  };

  const redo = () => {
    lastTypingRef.current = null;
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setProject(history[newIndex]);
    }
  };

  /** Start a fresh history at `snapshot` (project switch, restore). */
  const resetHistory = (snapshot: Project) => {
    setHistory([snapshot]);
    setHistoryIndex(0);
    liveProjectRef.current = snapshot;
  };

  return {
    history,
    historyIndex,
    setHistory,
    setHistoryIndex,
    pendingSnapshotsRef,
    liveProjectRef,
    setProject,
    setRecordedProject,
    recordProjectSnapshot,
    undo,
    redo,
    resetHistory,
  };
};
