import { ActorElement, CameraElement, Project, SceneSetup, Shot } from '../types';
import { SAMPLE_SCENES, SAMPLE_SCREENPLAY } from '../constants/presets';
import { calculateFovAngle } from './geometry';
import { parseSampleScreenplay, sampleMarksFor } from './sampleContent';

/**
 * Project library: several productions live side by side in this browser.
 *
 * Each project is stored under its own key (`openshotdesigner_project_<id>`) so
 * one big project with embedded storyboards can't blow the quota for all the
 * others, and a small index keeps the dashboard fast to render.
 */

const LIBRARY_KEY = 'openshotdesigner_library_v1';
const ACTIVE_KEY = 'openshotdesigner_active_project_v1';
const PROJECT_PREFIX = 'openshotdesigner_project_';
/** Where the single-project builds of the app kept everything. */
const SINGLE_PROJECT_KEY = 'openshotdesigner_project_v1';

export interface ProjectSummary {
  id: string;
  title: string;
  director?: string;
  date?: string;
  /** ISO timestamp of the last save. */
  updatedAt: string;
  setupCount: number;
  shotCount: number;
  hasScript: boolean;
}

const projectKey = (id: string) => `${PROJECT_PREFIX}${id}`;

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const summarize = (project: Project): ProjectSummary => ({
  id: project.id,
  title: project.title || 'Untitled project',
  director: project.director,
  date: project.date,
  updatedAt: new Date().toISOString(),
  setupCount: project.setups.length,
  shotCount: project.setups.reduce((total, setup) => total + setup.shots.length, 0),
  hasScript: (project.scriptLines || []).length > 0,
});

export const loadLibrary = (): ProjectSummary[] => {
  const list = readJson<ProjectSummary[]>(LIBRARY_KEY);
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
};

const writeLibrary = (list: ProjectSummary[]) => {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
};

export const readProject = (id: string): Project | null => {
  const project = readJson<Project>(projectKey(id));
  return project?.setups?.length ? project : null;
};

/** Save a project and refresh its entry in the index. Throws when out of quota. */
export const writeProject = (project: Project): ProjectSummary => {
  localStorage.setItem(projectKey(project.id), JSON.stringify(project));
  const summary = summarize(project);
  const rest = loadLibrary().filter((entry) => entry.id !== project.id);
  writeLibrary([summary, ...rest]);
  return summary;
};

export const removeProject = (id: string) => {
  localStorage.removeItem(projectKey(id));
  writeLibrary(loadLibrary().filter((entry) => entry.id !== id));
  if (getActiveProjectId() === id) localStorage.removeItem(ACTIVE_KEY);
};

export const getActiveProjectId = (): string | null => localStorage.getItem(ACTIVE_KEY);

export const setActiveProjectId = (id: string) => localStorage.setItem(ACTIVE_KEY, id);

export const newProjectId = () =>
  `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** A fresh scene setup starting with a first camera and an actor placed directly in front of it. */
export const blankSetup = (sceneNumber = '1', name = 'Scene 1'): SceneSetup => {
  const actorId = `actor-${Date.now().toString(36)}-1`;
  const camId = `cam-${Date.now().toString(36)}-1`;
  const shotId = `shot-${Date.now().toString(36)}-1`;

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
    id: `setup-${Date.now().toString(36)}`,
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
}

export const createProject = (options: NewProjectOptions = {}): Project => {
  const withSamples = !!options.withSampleScenes;
  const setups = withSamples
    ? (JSON.parse(JSON.stringify(SAMPLE_SCENES)) as SceneSetup[])
    : [blankSetup()];

  // The examples come pre-lined, so the script tab isn't empty on first run.
  let scriptLines;
  if (withSamples) {
    scriptLines = parseSampleScreenplay();
    setups.forEach((setup) => {
      setup.scriptMarks = sampleMarksFor(setup.id, scriptLines!, setup.sceneNumber);
    });
  }

  const initialAVRows = withSamples
    ? []
    : [
        {
          id: `av-${setups[0].shots[0]?.id || '1'}`,
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
    setups,
    activeSetupId: setups[0].id,
    avScriptRows: initialAVRows,
    ...(withSamples
      ? { scriptTitle: 'Sample scene', scriptText: SAMPLE_SCREENPLAY, scriptLines }
      : {}),
  };
};

/** Deep copy of a project under a new id and title. */
export const cloneProject = (project: Project, title?: string): Project => ({
  ...(JSON.parse(JSON.stringify(project)) as Project),
  id: newProjectId(),
  title: title || `${project.title} (Copy)`,
});

/**
 * One-time move of the old single-project storage into the library, so an
 * existing production is simply the first entry on the dashboard.
 */
export const migrateSingleProject = (): ProjectSummary | null => {
  if (loadLibrary().length > 0) return null;
  const legacy = readJson<Project>(SINGLE_PROJECT_KEY);
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
