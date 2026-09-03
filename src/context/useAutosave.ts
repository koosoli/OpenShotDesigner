import { useEffect, useRef, useState } from 'react';
import type { Project } from '../types';
import type { ProjectSummary } from '../domain/storage/types';
import {
  loadLibrary,
  markSavePending,
  maybeWriteBackupSnapshot,
  setActiveProjectId,
  subscribeProjectWriteConflicts,
  subscribeSaveState,
  writeProject,
} from '../utils/projectLibrary';

export const AUTOSAVE_DEBOUNCE_MS = 300;

const QUOTA_WARNING =
  'Autosave to this browser failed — the project (likely with embedded storyboards) ' +
  'exceeds the local storage limit. Use the download button in the top bar to save your project file.';
const IDB_WARNING =
  'Saving to this browser failed — the storage database rejected the write (usually quota). ' +
  'Export your project file from the top bar so nothing is lost.';
const CONFLICT_WARNING =
  'This project was changed in another browser tab. This tab will not overwrite it; reload before continuing.';

/**
 * Debounced persistence slice, extracted from `FloorPlanContext`.
 *
 * The context was 4400+ lines because project content, selection, history,
 * canvas viewport *and* persistence all lived in one component. This hook owns
 * only persistence: debounce + flush on hide/unload + storage warnings +
 * multi-tab conflict surfacing. Behaviour is unchanged — same 300 ms timer,
 * same immediate `markSavePending()` so "Saved locally" never goes stale.
 */
export const useAutosave = (
  project: Project,
  setProjects: (summaries: ProjectSummary[]) => void,
): {
  storageWarning: string | null;
  dismissStorageWarning: () => void;
  persistProjectNow: (target?: Project) => void;
} => {
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const autosaveProjectRef = useRef(project);
  const autosaveTimerRef = useRef<number | null>(null);

  const persistProjectNow = (target: Project = autosaveProjectRef.current) => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    try {
      writeProject(target);
      setActiveProjectId(target.id);
      setProjects(loadLibrary());
      setStorageWarning(null);
      maybeWriteBackupSnapshot(target);
    } catch (error) {
      setStorageWarning(
        error instanceof Error && /another browser tab/i.test(error.message)
          ? error.message
          : QUOTA_WARNING,
      );
    }
  };

  useEffect(() => {
    const previous = autosaveProjectRef.current;
    if (previous.id !== project.id) persistProjectNow(previous);
    autosaveProjectRef.current = project;
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    if (previous !== project) markSavePending();
    autosaveTimerRef.current = window.setTimeout(
      () => persistProjectNow(project),
      AUTOSAVE_DEBOUNCE_MS,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  useEffect(() => {
    const flush = () => {
      if (autosaveTimerRef.current !== null) persistProjectNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    const unsubscribe = subscribeSaveState((state) => {
      if (state === 'error') setStorageWarning(IDB_WARNING);
    });
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      subscribeProjectWriteConflicts((projectId) => {
        if (projectId !== autosaveProjectRef.current.id) return;
        setStorageWarning(CONFLICT_WARNING);
      }),
    [],
  );

  return {
    storageWarning,
    dismissStorageWarning: () => setStorageWarning(null),
    persistProjectNow,
  };
};
