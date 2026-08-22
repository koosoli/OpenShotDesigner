import type { ActorElement, CameraElement, Project, SceneSetup, Shot } from '../types';
import { SAMPLE_SCENES, SAMPLE_SCREENPLAY } from '../constants/presets';
import { calculateFovAngle } from './geometry';
import { parseSampleScreenplay, sampleMarksFor } from './sampleContent';
import { createId } from '../domain/ids';
import { cloneProjectWithNewIds } from '../domain/clone';
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  detectSchemaVersion,
  migrateProject,
} from '../domain/migrations';
import {
  idbDelete,
  idbGet,
  idbGetAllValues,
  idbPut,
  isIndexedDbAvailable,
  openWorkspaceDb,
  STORE_META,
  STORE_PROJECTS,
} from '../domain/storage/idb';
import type { ProjectSummary } from '../domain/storage/types';

/**
 * Project library: several productions live side by side in this browser.
 *
 * Persistence is IndexedDB-first (plan §5.1) behind a synchronous in-memory
 * mirror so existing call sites stay synchronous. Writes hit memory instantly
 * and are flushed to IndexedDB asynchronously; a localStorage fallback keeps
 * working when IndexedDB is unavailable, and pre-existing localStorage data is
 * imported into IndexedDB exactly once on first initialization.
 */

const LIBRARY_KEY = 'openshotdesigner_library_v1';
const ACTIVE_KEY = 'openshotdesigner_active_project_v1';
const PROJECT_PREFIX = 'openshotdesigner_project_';
/** Where the single-project builds of the app kept everything. */
const SINGLE_PROJECT_KEY = 'openshotdesigner_project_v1';

export type { ProjectSummary };

// ---------------------------------------------------------------------------
// Save-state tracking (plan §5.5 autosave/save-state contract)
// ---------------------------------------------------------------------------

export type LibrarySaveState = 'idle' | 'saving' | 'saved' | 'error';

let saveState: LibrarySaveState = 'idle';
const saveStateListeners = new Set<(state: LibrarySaveState) => void>();

const setSaveState = (state: LibrarySaveState) => {
  saveState = state;
  saveStateListeners.forEach((listener) => listener(state));
};

/** Subscribe to library save-state changes. Returns an unsubscribe function. */
export const subscribeSaveState = (
  listener: (state: LibrarySaveState) => void,
): (() => void) => {
  saveStateListeners.add(listener);
  return () => {
    saveStateListeners.delete(listener);
  };
};

// ---------------------------------------------------------------------------
// Backend plumbing
// ---------------------------------------------------------------------------

type Backend = 'indexeddb' | 'localstorage';

let backend: Backend = 'localstorage';
let initialized = false;

/** In-memory mirror — the synchronous source of truth for reads. */
const memory = new Map<string, Project>();

const pendingWrites = new Set<Promise<unknown>>();

const trackWrite = (promise: Promise<void>) => {
  setSaveState('saving');
  const tracked = promise
    .then(() => {
      pendingWrites.delete(tracked);
      if (pendingWrites.size === 0) setSaveState('saved');
    })
    .catch(() => {
      pendingWrites.delete(tracked);
      setSaveState('error');
    });
  pendingWrites.add(tracked);
};

/** Resolves once every queued persistence write has settled. */
export const flushPendingWrites = (): Promise<void> =>
  Promise.allSettled([...pendingWrites]).then(() => undefined);

/** Current library save state (see {@link subscribeSaveState}). */
export const getSaveState = (): LibrarySaveState => saveState;

const lsReadJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const persistProject = (project: Project): void => {
  if (backend === 'indexeddb') {
    trackWrite(idbPut(STORE_PROJECTS, project.id, project));
  } else {
    try {
      localStorage.setItem(`${PROJECT_PREFIX}${project.id}`, JSON.stringify(project));
    } catch {
      // Quota errors surface through the storage warning in the app shell.
      throw new Error('Local storage quota exceeded while saving the project.');
    }
  }
};

const persistDelete = (id: string): void => {
  if (backend === 'indexeddb') {
    trackWrite(idbDelete(STORE_PROJECTS, id));
  } else {
    localStorage.removeItem(`${PROJECT_PREFIX}${id}`);
  }
};

// ---------------------------------------------------------------------------
// Public API (synchronous, unchanged signatures)
// ---------------------------------------------------------------------------

export const summarize = (project: Project): ProjectSummary => ({
  id: project.id,
  title: project.title || 'Untitled project',
  director: project.director,
  date: project.date,
  // Projects saved before `updatedAt` existed sort last rather than "just now".
  updatedAt: project.updatedAt ?? '',
  setupCount: project.setups.length,
  shotCount: project.setups.reduce((total, setup) => total + setup.shots.length, 0),
  hasScript: (project.scriptLines || []).length > 0,
});

export const loadLibrary = (): ProjectSummary[] =>
  [...memory.values()]
    .map(summarize)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

/**
 * Read a project by id. Data stored under an older schema is migrated to the
 * current version first (and the migrated result is persisted back).
 */
export const readProject = (id: string): Project | null => {
  const stored = memory.get(id);
  if (!stored?.setups?.length) return null;

  const version = detectSchemaVersion(stored);
  if (version === CURRENT_PROJECT_SCHEMA_VERSION) return stored;

  try {
    const { project } = migrateProject(stored);
    memory.set(id, project);
    persistProject(project);
    return project;
  } catch {
    return null;
  }
};

/** Save a project and refresh its entry in the index. Throws when out of quota. */
export const writeProject = (project: Project, options: { touch?: boolean } = {}): ProjectSummary => {
  let storable = project;
  if (detectSchemaVersion(project) !== CURRENT_PROJECT_SCHEMA_VERSION) {
    try {
      storable = migrateProject(project).project;
    } catch {
      // Keep the caller's data rather than failing the whole save.
      storable = { ...project, schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION };
    }
  }
  if (options.touch !== false) {
    storable = { ...storable, updatedAt: new Date().toISOString() };
  }

  memory.set(storable.id, storable);
  persistProject(storable);
  return summarize(storable);
};

export const removeProject = (id: string) => {
  memory.delete(id);
  persistDelete(id);
  if (getActiveProjectId() === id) localStorage.removeItem(ACTIVE_KEY);
};

export const getActiveProjectId = (): string | null => localStorage.getItem(ACTIVE_KEY);

export const setActiveProjectId = (id: string) => localStorage.setItem(ACTIVE_KEY, id);

export const newProjectId = () => createId('proj');

/**
 * Initialize the library: hydrate the in-memory mirror from IndexedDB (or the
 * localStorage fallback), importing any pre-existing localStorage library
 * exactly once. Must be awaited once at application startup.
 */
export const initProjectLibrary = async (): Promise<void> => {
  if (initialized) return;
  initialized = true;

  const useIdb =
    isIndexedDbAvailable() &&
    await openWorkspaceDb()
      .then(() => true)
      .catch(() => false);

  if (useIdb) {
    backend = 'indexeddb';
    try {
      const stored = await idbGetAllValues<Project>(STORE_PROJECTS);
      stored.forEach((project) => {
        if (project?.setups?.length) memory.set(project.id, project);
      });

      // One-time import of the pre-IndexedDB localStorage library.
      const alreadyMigrated = await idbGet<boolean>(STORE_META, 'lsImportedV1');
      if (!alreadyMigrated) {
        const legacySummaries = lsReadJson<ProjectSummary[]>(LIBRARY_KEY) || [];
        for (const summary of legacySummaries) {
          const raw = lsReadJson<Project>(`${PROJECT_PREFIX}${summary.id}`);
          if (!raw?.setups?.length || memory.has(summary.id)) continue;
          try {
            const { project } = migrateProject(raw);
            memory.set(project.id, project);
            trackWrite(idbPut(STORE_PROJECTS, project.id, project));
          } catch {
            // A corrupt legacy entry must not block the rest of startup.
          }
        }
        trackWrite(idbPut(STORE_META, 'lsImportedV1', true));
      }
      await flushPendingWrites();
      return;
    } catch {
      backend = 'localstorage';
    }
  }

  // localStorage fallback hydration.
  const summaries = lsReadJson<ProjectSummary[]>(LIBRARY_KEY) || [];
  for (const summary of summaries) {
    const raw = lsReadJson<Project>(`${PROJECT_PREFIX}${summary.id}`);
    if (raw?.setups?.length) memory.set(raw.id, raw);
  }
};

/** A fresh scene setup starting with a first camera and an actor placed directly in front of it. */
export const blankSetup = (sceneNumber = '1', name = 'Scene 1'): SceneSetup => {
  const actorId = createId('actor');
  const camId = createId('cam');
  const shotId = createId('shot');

  const actor: ActorElement = {
    id: actorId,
    type: 'actor',
    name: 'Actor A',
    characterLetter: 'A',
    color: '#3b82f6',
    x: 400,
    y: 240,
    rotation: 90,
    isStanding: true,
    actionNotes: 'Subject in frame',
    path: [],
    speechCues: [],
  };

  const camera: CameraElement = {
    id: camId,
    type: 'camera',
    name: 'Camera A (Shot 1)',
    cameraLabel: 'A',
    color: '#0284c7',
    x: 400,
    y: 450,
    rotation: -90,
    locked: false,
    visible: true,
    focalLength: 35,
    sensorFormat: 'Super35',
    fovAngle: calculateFovAngle(35, 'Super35'),
    aspectRatio: '16:9',
    cameraHeight: 'Eye Level',
    rigType: 'Tripod',
    throwDistance: 210,
    path: [],
    associatedShotId: shotId,
  };

  const shot: Shot = {
    id: shotId,
    sceneNumber,
    shotNumber: `${sceneNumber}/1`,
    name: 'Shot 1',
    cameraId: camId,
    cameraLabel: 'A',
    shotSize: 'MS',
    lensMm: 35,
    cameraAngle: 'Eye Level',
    movement: 'Static',
    aspectRatio: '16:9',
    frameRate: 24,
    subjectActorIds: [actorId],
    framingDescription: 'Medium shot on Actor A',
    actionScriptNotes: '',
    status: 'planned',
    takesCount: 0,
    estDurationSeconds: 5,
    order: 1,
  };

  return {
    id: createId('setup'),
    name,
    sceneNumber,
    location: 'INT. LOCATION - DAY',
    timeOfDay: 'Day INT',
    elements: [actor, camera],
    shots: [shot],
    currentBeat: 1,
    totalBeats: 1,
    aspectRatio: '16:9',
    canvasScale: 1,
    canvasOffset: { x: 50, y: 50 },
    gridSettings: { size: 30, snap: true, showGrid: false, unit: 'm', pixelsPerUnit: 30 },
  };
};

export interface NewProjectOptions {
  title?: string;
  director?: string;
  cinematographer?: string;
  /** Start from the bundled example scenes instead of an empty stage. */
  withSampleScenes?: boolean;
  /**
   * Workspace preset id (plan §1.2). Presets configure module visibility only.
   * The `blank` preset also skips the Camera A + Actor A + Shot 1 bootstrap so
   * a new floor-plan workspace starts genuinely empty.
   */
  workspacePreset?: import('../domain/workspace').WorkspacePresetId;
}

/** An empty setup with no bootstrap elements — used by the Blank preset. */
export const emptySetup = (name = 'Scene 1'): SceneSetup => ({
  id: createId('setup'),
  name,
  sceneNumber: '1',
  location: 'INT. LOCATION - DAY',
  timeOfDay: 'Day INT',
  elements: [],
  shots: [],
  currentBeat: 1,
  totalBeats: 1,
  aspectRatio: '16:9',
  canvasScale: 1,
  canvasOffset: { x: 50, y: 50 },
  gridSettings: { size: 30, snap: true, showGrid: false, unit: 'm', pixelsPerUnit: 30 },
});

export const createProject = (options: NewProjectOptions = {}): Project => {
  const withSamples = !!options.withSampleScenes;
  const isBlankPreset = options.workspacePreset === 'blank';
  const setups = withSamples
    ? (JSON.parse(JSON.stringify(SAMPLE_SCENES)) as SceneSetup[])
    : isBlankPreset
      ? [emptySetup()]
      : [blankSetup()];

  // The examples come pre-lined, so the script tab isn't empty on first run.
  let scriptLines;
  if (withSamples) {
    scriptLines = parseSampleScreenplay();
    setups.forEach((setup) => {
      setup.scriptMarks = sampleMarksFor(setup.id, scriptLines!, setup.sceneNumber);
    });
  }

  const initialAVRows = withSamples || isBlankPreset
    ? []
    : [
        {
          id: createId('av'),
          shotNumber: '1',
          shotName: 'Shot 1',
          shotSize: 'MS' as const,
          video: 'Medium shot on Actor A',
          audio: '',
          durationSec: 5,
          linkedShotId: setups[0].shots[0]?.id,
        },
      ];

  return {
    id: newProjectId(),
    title: options.title?.trim() || 'Untitled project',
    director: options.director || '',
    cinematographer: options.cinematographer || '',
    date: new Date().toISOString().split('T')[0],
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    setups,
    activeSetupId: setups[0].id,
    avScriptRows: initialAVRows,
    ...(withSamples
      ? { scriptTitle: 'Sample scene', scriptText: SAMPLE_SCREENPLAY, scriptLines }
      : {}),
  };
};

/**
 * Deep copy of a project under a new id and title. Every nested entity gets a
 * fresh globally unique id and all internal references are remapped, so the
 * duplicate can never collide with the original (plan §3.1).
 */
export const cloneProject = (project: Project, title?: string): Project =>
  cloneProjectWithNewIds(project, {
    title: title || `${project.title} (Copy)`,
  });

/**
 * One-time move of the old single-project storage into the library, so an
 * existing production is simply the first entry on the dashboard.
 */
export const migrateSingleProject = (): ProjectSummary | null => {
  if (loadLibrary().length > 0) return null;
  const legacy = lsReadJson<Project>(SINGLE_PROJECT_KEY);
  if (!legacy?.setups?.length) return null;

  const project: Project = { ...legacy, id: legacy.id || newProjectId() };
  const summary = writeProject(project);
  setActiveProjectId(project.id);
  try {
    localStorage.removeItem(SINGLE_PROJECT_KEY);
  } catch {
    // keeping the old copy is harmless
  }
  return summary;
};
