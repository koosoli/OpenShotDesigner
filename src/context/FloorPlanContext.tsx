import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActiveTool,
  AspectRatio,
  BackgroundImage,
  CableElement,
  CableType,
  CameraElement,
  CameraRigType,
  FloorPlanElement,
  LightElement,
  LightFixtureType,
  Project,
  ProjectRevision,
  PropElement,
  PropType,
  SceneSetup,
  ShapeElement,
  ShapeType,
  StrokeElement,
  AVScriptRow,
  ScriptFormatMode,
  ScriptLine,
  ScriptMark,
  Shot,
  CameraMovement,
  EquipmentItem,
  EquipmentPackageItem,
  PlanGroup,
  Vector2D,
} from '../types';
import { createId } from '../domain/ids';
import { deriveScriptBreakdown } from '../domain/script/logic';
import {
  ACTOR_COLOR_PALETTE,
  CAMERA_COLOR_PALETTE,
  CABLE_TYPES,
  LIGHT_FIXTURES,
  PROP_CATALOG,
  SAMPLE_DIALOGUE_SCREENPLAY,
  SAMPLE_NOIR_SCREENPLAY,
  SAMPLE_SCENES,
  SAMPLE_SCREENPLAY,
} from '../constants/presets';
import { calculateFovAngle } from '../utils/geometry';
import { parseSampleScreenplay, sampleMarksFor } from '../utils/sampleContent';
import {
  NewProjectOptions,
  ProjectSummary,
  blankSetup,
  cloneProject,
  createProject as buildProject,
  getActiveProjectId,
  loadLibrary,
  migrateSingleProject,
  newProjectId,
  readProject,
  removeProject,
  setActiveProjectId,
  subscribeSaveState,
  writeProject,
} from '../utils/projectLibrary';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../domain/migrations';
import { deriveSceneEquipment } from '../utils/equipmentList';
import { migrateProject } from '../domain/migrations';
import { validateProject } from '../domain/validation';
import {
  createWorkspaceProfile,
  setWorkspaceProfile as persistWorkspaceProfile,
  withModuleToggled,
} from '../domain/workspace';
import {
  ALL_MODULES_PROFILE,
  isModuleEnabled as isModuleEnabledIn,
  getWorkspaceProfile,
  type ModuleId,
  type WorkspaceProfile,
} from '../domain/workspace';

/** Sections available in the export / print studio. */
export type ExportSection = 'floorplan' | 'shotlist' | 'storyboard' | 'linedscript' | 'sides' | 'scriptreports' | 'equipment' | 'dmx' | 'moodboard' | 'crew' | 'combined';

/**
 * Collision-proof ids. `Date.now()` alone repeats when two shots are created
 * within the same millisecond, which made a freshly inserted shot reuse an
 * existing shot's id and appear to overwrite it.
 */
let idCounter = 0;
const newShotId = () => `shot-${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const newMarkId = () => `mark-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

interface FloorPlanContextType {
  project: Project;
  activeSetup: SceneSetup;
  selectedElementIds: string[];
  selectedShotId: string | null;
  highlightedElementId: string | null;
  activeTool: ActiveTool;
  activePropSubtype: PropType;
  activeLightFixture: LightFixtureType;
  activeCameraRig: CameraRigType;
  activeShapeType: ShapeType;
  activeCableType: CableType;
  historyIndex: number;
  historyLength: number;
  playback: {
    isPlaying: boolean;
    currentBeat: number;
    totalBeats: number;
    speed: number;
    isLooping: boolean;
  };
  isViewfinderOpen: boolean;
  viewfinderCameraId: string | null;
  isExportModalOpen: boolean;
  /** Which tab the export modal opens on (floor plan, shot list, lined script, equipment). */
  exportSection: ExportSection;
  theme: 'dark' | 'light';
  displaySettings: DisplaySettings;
  storageWarning: string | null;
  dismissStorageWarning: () => void;

  // Actions
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  updateDisplaySettings: (updates: Partial<DisplaySettings>) => void;
  setTool: (tool: ActiveTool) => void;
  setPropSubtype: (type: PropType) => void;
  setLightFixture: (type: LightFixtureType) => void;
  setCameraRig: (rig: CameraRigType) => void;
  setShapeType: (shape: ShapeType) => void;
  setCableType: (cable: CableType) => void;
  quickSearchOpen: boolean;
  setQuickSearchOpen: (open: boolean) => void;
  activeRightTab: 'shots' | 'storyboard' | 'script' | 'equipment' | 'schedule' | 'moodboard' | 'locations' | 'power' | 'logistics' | 'run_of_show' | 'rigging' | 'contacts' | 'tasks' | 'inspector';
  setActiveRightTab: (tab: 'shots' | 'storyboard' | 'script' | 'equipment' | 'schedule' | 'moodboard' | 'locations' | 'power' | 'logistics' | 'run_of_show' | 'rigging' | 'contacts' | 'tasks' | 'inspector') => void;
  /** Workspace profile of the open project (module visibility, plan §1.2). */
  workspaceProfile: WorkspaceProfile;
  isModuleVisible: (moduleId: ModuleId) => boolean;
  setModuleVisible: (moduleId: ModuleId, visible: boolean) => void;
  selectElement: (id: string | null, multi?: boolean, force?: boolean) => void;
  selectElements: (ids: string[]) => void;
  clearSelection: () => void;
  selectShot: (shotId: string | null, focusCanvasCamera?: boolean) => void;
  setHighlightedElement: (id: string | null) => void;

  // Equipment List Actions
  addCustomEquipmentItem: (item: Omit<EquipmentItem, 'id'>) => void;
  updateEquipmentItem: (id: string, updates: Partial<EquipmentItem>) => void;
  deleteEquipmentItem: (id: string) => void;
  resetSceneEquipment: () => void;
  addPackageItem: (packageId: string, item: Omit<EquipmentPackageItem, 'id'>) => void;
  updatePackageItem: (packageId: string, itemId: string, updates: Partial<EquipmentPackageItem>) => void;
  deletePackageItem: (packageId: string, itemId: string) => void;

  // Element CRUD
  addElement: (element: Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }) => string;
  quickAddElement: (element: Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }) => string;
  updateElement: (id: string, updates: Partial<FloorPlanElement>, recordHistory?: boolean) => void;
  updateMultipleElements: (updates: { id: string; updates: Partial<FloorPlanElement> }[], recordHistory?: boolean) => void;
  deleteSelectedElements: () => void;
  deleteElementById: (id: string) => void;
  duplicateSelected: () => void;
  copySelectedElements: () => void;
  pasteElements: () => void;
  commitCurrentState: () => void;
  insertDoorInWall: (wallId: string) => string | null;
  insertWindowInWall: (wallId: string) => string | null;

  // Plan groups (plan §6.4)
  /** Group every selected element into one new plan group. */
  groupSelection: () => void;
  /** Dissolve every group whose membership exactly matches the selection. */
  ungroupSelection: () => void;
  /** World-space position at the visual center of the visible canvas. */
  getCanvasCenterPosition: () => Vector2D;

  // Shot CRUD (Synchronized with Cameras)
  addShot: (shotData?: Partial<Shot>) => string;
  insertShotAfter: (afterShotId: string, options?: { renumberRest?: boolean }) => string;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  deleteShot: (id: string) => void;
  reorderShots: (arg1: number | Shot[], arg2?: number) => void;
  /** Order of the storyboard board only — the shot list keeps its own order. */
  setStoryboardOrder: (shotIds: string[]) => void;
  moveShot: (shotId: string, direction: 'up' | 'down') => void;
  moveShotToScene: (shotId: string, sourceSetupId: string, targetSetupId: string, targetIndex?: number) => void;
  renumberAllShots: (format?: 'scene_slash_number' | 'scene_alphabetic' | 'numeric' | 'alphabetic') => void;
  sortShotsBy: (criteria: 'custom' | 'shotNumber' | 'camera' | 'lens' | 'status') => void;
  createCameraAndShot: (pos?: Vector2D) => { cameraId: string; shotId: string };

  // Lined script: highlight a range of screenplay lines -> shot + vertical line
  createShotFromScriptRange: (range: {
    startLineId: string;
    endLineId: string;
    /** Character offsets for word-level linings (optional). */
    startOffset?: number;
    endOffset?: number;
    sceneNumber?: string;
    description?: string;
    shotSize?: Shot['shotSize'];
    text?: string;
  }) => string;
  /** The production's screenplay — shared by every scene / setup. */
  scriptLines: ScriptLine[];
  scriptTitle?: string;
  /** Linings from every scene, so one lined script shows the whole coverage. */
  allScriptMarks: ScriptMark[];
  /** Shots from every scene (needed to label linings that belong elsewhere). */
  allShots: Shot[];
  /** Which setup a lining belongs to (used to jump scenes when it is clicked). */
  setupIdForMark: (markId: string) => string | null;
  /**
   * "Line this shot" flow started from the shot list: the id of the shot that
   * is waiting for the user to highlight the screenplay it covers.
   */
  scriptLinkShotId: string | null;
  startScriptLinking: (shotId: string) => void;
  cancelScriptLinking: () => void;
  /** Line a shot that already exists over a stretch of the screenplay. */
  linkShotToScriptRange: (
    shotId: string,
    range: { startLineId: string; endLineId: string; startOffset?: number; endOffset?: number }
  ) => void;
  updateScriptMark: (markId: string, updates: Partial<ScriptMark>) => void;
  /** Write a lining's description onto both the mark and its shot in one step. */
  setLiningDescription: (markId: string, text: string) => void;
  deleteScriptMark: (markId: string, options?: { deleteShot?: boolean }) => void;
  setScriptLines: (lines: ScriptLine[], meta?: { scriptTitle?: string; scriptText?: string }) => void;
  /** Audio-Visual (AV) 2-column commercial / documentary script rows. */
  avScriptRows: AVScriptRow[];
  setAVScriptRows: (rows: AVScriptRow[]) => void;
  updateAVScriptRow: (id: string, updates: Partial<AVScriptRow>) => void;
  addAVScriptRow: (row?: Partial<AVScriptRow>) => string;
  deleteAVScriptRow: (id: string) => void;
  scriptFormatMode: ScriptFormatMode;
  setScriptFormatMode: (mode: ScriptFormatMode) => void;
  syncAVRowToShot: (rowId: string) => string;
  createCameraOnly: (name: string, pos?: Vector2D) => string;
  createCameraForShot: (name: string, shotId: string, lensMm?: number, pos?: Vector2D) => string;
  setShotCameraLetter: (shotId: string, letter: string) => void;
  /** Point a shot at an existing camera (no renaming, no new elements). */
  assignCameraToShot: (shotId: string, cameraId: string | null) => void;
  /** Add a camera with the next free letter (B, C, …) and shoot this shot on it. */
  addCameraForShot: (shotId: string) => string;
  setShootMode: (mode: 'single_cam' | 'multi_cam') => void;

  // Background Screenshots / Reference Blueprints (multiple supported)
  backgroundImages: BackgroundImage[];
  selectedBackgroundId: string | null;
  addBackgroundImage: (bg: BackgroundImage) => void;
  updateBackgroundImage: (id: string, updates: Partial<BackgroundImage>, recordHistory?: boolean) => void;
  removeBackgroundImage: (id: string) => void;
  setSelectedBackgroundId: (id: string | null) => void;
  calibratingBackgroundId: string | null;
  startBackgroundCalibration: (id: string) => void;
  cancelBackgroundCalibration: () => void;

  // Rotation Helper
  rotateElementBy: (id: string, deltaDegrees: number) => void;

  // Setup / Project Management
  setActiveSetupId: (setupId: string) => void;
  addSetup: (name?: string) => void;
  duplicateCurrentSetup: () => void;
  deleteSetup: (setupId: string) => void;
  updateSetupMeta: (updates: Partial<SceneSetup>) => void;
  updateProjectMeta: (updates: Partial<Project>) => void;

  // Named revisions (plan §13.2): intentional milestones, distinct from undo.
  /** Saved revisions of the open project (oldest first). */
  revisions: ProjectRevision[];
  /** Snapshot the current project as a named revision (capped at 20). */
  saveRevision: (name: string, note?: string) => void;
  /**
   * Load a revision's snapshot into the project. Keeps the current project
   * id/title/revision history; automatically saves a safety revision
   * "Before restore <name>" first. Pass a projectId to restore into a stored
   * (non-open) project from the library.
   */
  restoreRevision: (revisionId: string, projectId?: string) => void;

  // Project library (dashboard): several productions in one browser
  projects: ProjectSummary[];
  activeProjectId: string;
  isDashboardOpen: boolean;
  openDashboard: () => void;
  closeDashboard: () => void;
  createNewProject: (options?: NewProjectOptions) => void;
  openProjectById: (id: string) => void;
  duplicateProject: (id: string) => void;
  renameProject: (id: string, title: string) => void;
  deleteProjectById: (id: string) => void;
  loadTemplateScene: (templateIndex: number) => void;
  loadProjectFromJson: (newProject: Project) => void;

  // History
  undo: () => void;
  redo: () => void;

  // Canvas View
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setCanvasScale: (scale: number) => void;
  setCanvasOffset: (offset: Vector2D | ((prev: Vector2D) => Vector2D)) => void;
  setGridSettings: (settings: Partial<SceneSetup['gridSettings']>) => void;

  // Playback / Director's Blocking Scrubber
  togglePlayback: () => void;
  setCurrentBeat: (beat: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setIsLooping: (loop: boolean) => void;
  addBeat: () => void;
  removeBeat: () => void;

  // Modals
  openViewfinder: (cameraId?: string) => void;
  closeViewfinder: () => void;
  setViewfinderCameraId: (id: string | null) => void;
  openExportModal: (section?: ExportSection) => void;
  setExportSection: (section: ExportSection) => void;
  closeExportModal: () => void;
  setCanvasTransform: (scale: number, offset: Vector2D) => void;
  setCanvasViewport: (width: number, height: number) => void;
}

export interface CategoryOpacitySettings {
  actors: number;
  cameras: number;
  lights: number;
  props: number;
  architecture?: number;
  walls?: number;
  shapes?: number;
  tracks: number;
  measurements?: number;
  storyboards?: number;
  cables?: number;
}

export interface LabelCategoryOpacitySettings {
  actors: number;
  cameras: number;
  props: number;
  tracks: number;
  lights: number;
  doorWindows: number;
  measurements: number;
  cables?: number;
}

export interface DisplaySettings {
  // Master label switch
  showLabels: boolean;
  labelScale: number; // 0.5 - 2.0 multiplier
  labelOpacity: number; // 0 - 1
  // Per-category label visibility
  showActorLabels: boolean;
  /** Assigned character names render on actor markers by default (independent of the label switches). */
  showCharacterNames: boolean;
  showCameraLabels: boolean;
  showPropLabels: boolean;
  showTrackLabels: boolean;
  showLightLabels: boolean;
  showLightNameLabels: boolean;
  showLightRoleLabels: boolean;
  showLightKelvinLabels: boolean;
  showLightIntensityLabels: boolean;
  showMeasurementLabels: boolean;
  showDoorWindowLabels: boolean;
  showCableLabels: boolean;
  // Per-category label color overrides (null = use element's own color)
  actorLabelColor: string | null;
  cameraLabelColor: string | null;
  propLabelColor: string | null;
  trackLabelColor: string | null;
  lightLabelColor: string | null;
  doorWindowLabelColor: string | null;
  measurementLabelColor: string | null;
  cableLabelColor: string | null;
  // Per-category label opacity overrides (0 - 1)
  labelCategoryOpacity: LabelCategoryOpacitySettings;
  /** Per-category label size multipliers on top of the global labelScale (0.5–2). */
  labelCategoryScale?: {
    actors?: number;
    cameras?: number;
    lights?: number;
    props?: number;
    tracks?: number;
    cables?: number;
    measurements?: number;
  };
  // Decluttering toggles
  showWaypoints: boolean;
  showWaypointCues: boolean; // toggle dialogue / action cues on floorplan waypoints (default true)
  showSpeechBubbles: boolean;
  showFovCones: boolean;
  showLightBeams: boolean;
  /** Storyboard thumbnails pinned next to their camera on the floor plan. */
  showStoryboardThumbs: boolean;
  /** When true, waypoint keyframes without artwork are omitted from the storyboard and exports. */
  hideBlankStoryboardWaypoints?: boolean;
  showGrid: boolean;
  showShotSizeInScript: boolean; // show WS / CU in script (default true)
  // Shot info shown on the camera label
  showShotSizeOnCamera: boolean;
  showShotLensOnCamera: boolean;
  showShotAngleOnCamera: boolean;
  showShotNumberOnCamera: boolean;
  showLensFovLabel: boolean;
  fovConeOpacity?: number; // Master camera FOV cone opacity (0.05 to 1.0)
  // Category Opacity Controls
  categoryOpacity: CategoryOpacitySettings;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showLabels: true,
  labelScale: 1,
  labelOpacity: 1,
  showActorLabels: true,
  showCharacterNames: true,
  showCameraLabels: true,
  showPropLabels: true,
  showTrackLabels: true,
  showLightLabels: true,
  showLightNameLabels: true,
  showLightRoleLabels: true,
  showLightKelvinLabels: false,
  showLightIntensityLabels: false,
  showMeasurementLabels: true,
  showDoorWindowLabels: true,
  showCableLabels: true,
  actorLabelColor: null,
  cameraLabelColor: null,
  propLabelColor: null,
  trackLabelColor: null,
  lightLabelColor: null,
  doorWindowLabelColor: null,
  measurementLabelColor: null,
  cableLabelColor: null,
  labelCategoryOpacity: {
    actors: 1.0,
    cameras: 1.0,
    props: 1.0,
    tracks: 1.0,
    lights: 1.0,
    doorWindows: 1.0,
    measurements: 1.0,
    cables: 1.0,
  },
  labelCategoryScale: {
    actors: 1.0,
    cameras: 1.0,
    lights: 1.0,
    props: 1.0,
    tracks: 1.0,
    cables: 1.0,
    measurements: 1.0,
  },
  showWaypoints: true,
  showWaypointCues: false,
  showSpeechBubbles: false,
  // Camera FOV cones and light beams start OFF: a plan with every cone and
  // beam drawn is unreadable for a first-time user. Both are one toggle away
  // in Inspector - Display, and anyone who has already saved a preference
  // keeps it (this default only applies to a fresh install).
  showFovCones: false,
  fovConeOpacity: 1.0,
  showStoryboardThumbs: true,
  hideBlankStoryboardWaypoints: false,
  showLightBeams: false,
  showGrid: false, // Default grid to hidden as requested
  showShotSizeInScript: true,
  showShotSizeOnCamera: false,
  showShotLensOnCamera: false,
  showShotAngleOnCamera: false,
  showShotNumberOnCamera: true,
  showLensFovLabel: false,
  categoryOpacity: {
    actors: 1.0,
    cameras: 1.0,
    lights: 1.0,
    props: 1.0,
    architecture: 1.0,
    shapes: 1.0,
    tracks: 1.0,
    cables: 1.0,
  },
};

const FloorPlanContext = createContext<FloorPlanContextType | null>(null);

const STORAGE_KEY = 'openshotdesigner_project_v1';

const LEGACY_STORAGE_KEYS = {
  project: 'cineplan_project_v1',
  theme: 'cineplan_theme',
  display: 'cineplan_display',
};

const STORAGE_KEYS = {
  project: STORAGE_KEY,
  theme: 'openshotdesigner_theme',
  display: 'openshotdesigner_display',
};

/**
 * Reads from the new storage key. If it doesn't exist yet, the value is migrated
 * from the legacy (cineplan_*) key exactly once, so no saved projects are lost
 * when the app is renamed.
 */
function migrateStorageKey(oldKey: string, newKey: string): string | null {
  try {
    const newValue = localStorage.getItem(newKey);
    if (newValue !== null) return newValue;
    const oldValue = localStorage.getItem(oldKey);
    if (oldValue !== null) {
      localStorage.setItem(newKey, oldValue);
      localStorage.removeItem(oldKey);
      return oldValue;
    }
    return null;
  } catch {
    return null;
  }
}

// Finds a position on the floor plan that doesn't overlap any existing element
// or background image, so a newly imported reference image is visible & clickable.
function findFreeSpawnPoint(
  width: number,
  height: number,
  backgroundImages: BackgroundImage[],
  elements: FloorPlanElement[]
): Vector2D {
  const candidates: Vector2D[] = [];
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      candidates.push({ x: 50 + col * 90, y: 50 + row * 90 });
    }
  }

  const overlaps = (x: number, y: number): boolean => {
    const pad = 40;
    for (const bg of backgroundImages) {
      if (
        x < bg.x + bg.width + pad &&
        x + width + pad > bg.x &&
        y < bg.y + bg.height + pad &&
        y + height + pad > bg.y
      ) {
        return true;
      }
    }
    for (const el of elements) {
      const ex = (el as any).x ?? 0;
      const ey = (el as any).y ?? 0;
      let ex2 = (el as any).x2;
      let ey2 = (el as any).y2;
      if (ex2 === undefined) ex2 = ex + ((el as any).width ?? 80);
      if (ey2 === undefined) ey2 = ey + ((el as any).height ?? 60);
      if (
        x < Math.max(ex, ex2) + pad &&
        x + width + pad > Math.min(ex, ex2) &&
        y < Math.max(ey, ey2) + pad &&
        y + height + pad > Math.min(ey, ey2)
      ) {
        return true;
      }
    }
    return false;
  };

  for (const pos of candidates) {
    if (!overlaps(pos.x, pos.y)) return pos;
  }
  return { x: 50, y: 50 };
}

/**
 * Deep-clone a project for revision snapshots. The revisions list itself is
 * stripped so snapshots never nest the history inside themselves.
 */
const cloneProjectForSnapshot = (source: Project): Project => {
  const { revisions: _ignored, ...rest } = source;
  const cloned =
    typeof structuredClone === 'function'
      ? structuredClone(rest)
      : JSON.parse(JSON.stringify(rest));
  return cloned as Project;
};

/** Maximum number of revisions kept per project; oldest are dropped. */
const MAX_REVISIONS = 20;

const capRevisions = (list: ProjectRevision[]): ProjectRevision[] => {
  if (list.length <= MAX_REVISIONS) return list;
  console.warn(
    `[revisions] Cap of ${MAX_REVISIONS} reached — dropping ${list.length - MAX_REVISIONS} oldest revision(s).`
  );
  return list.slice(list.length - MAX_REVISIONS);
};

/**
 * Build the restored project from a revision snapshot. Everything content-ish
 * (setups, script, collections) comes from the snapshot; identity (id/title),
 * schema version and the revision history stay with the current project — and
 * a safety revision of the pre-restore state is appended first.
 */
const applyRevisionRestore = (base: Project, revision: ProjectRevision): Project => {
  const snapshot = cloneProjectForSnapshot(revision.snapshot);
  const safetyRevision: ProjectRevision = {
    id: createId('rev'),
    name: `Before restore ${revision.name}`,
    createdAt: new Date().toISOString(),
    snapshot: cloneProjectForSnapshot(base),
  };
  return {
    ...base,
    ...snapshot,
    id: base.id,
    title: base.title,
    schemaVersion: base.schemaVersion,
    revisions: capRevisions([...(base.revisions || []), safetyRevision]),
  };
};

export const FloorPlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Open the project the user was last working on. Projects saved by earlier
  // (single-project) versions are moved into the library on first run.
  const [project, setProject] = useState<Project>(() => {
    try {
      // Pull anything the pre-library builds left behind into the library first
      migrateStorageKey(LEGACY_STORAGE_KEYS.project, STORAGE_KEYS.project);
      migrateSingleProject();

      const activeId = getActiveProjectId();
      const saved = activeId ? readProject(activeId) : null;
      if (saved) return saved;

      const mostRecent = loadLibrary()[0];
      const fallback = mostRecent ? readProject(mostRecent.id) : null;
      if (fallback) return fallback;
    } catch {
      // ignore and start fresh
    }

    const starterScriptLines = parseSampleScreenplay();
    const starterSetups = SAMPLE_SCENES.map((setup) => ({
      ...setup,
      scriptMarks: sampleMarksFor(setup.id, starterScriptLines, setup.sceneNumber),
    }));
    return {
      id: newProjectId(),
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      title: 'Short Film Floor Plan & Shot List',
      director: 'Film Director / Student',
      cinematographer: 'DP / Camera Operator',
      date: new Date().toISOString().split('T')[0],
      scriptTitle: 'Sample scene',
      scriptText: SAMPLE_SCREENPLAY,
      scriptLines: starterScriptLines,
      setups: starterSetups,
      activeSetupId: starterSetups[0].id,
    };
  });

  const [projects, setProjects] = useState<ProjectSummary[]>(() => {
    try {
      return loadLibrary();
    } catch {
      return [];
    }
  });
  // First run (nothing saved yet) opens on the dashboard so the first thing the
  // user does is name their production.
  const [isDashboardOpen, setIsDashboardOpen] = useState(() => {
    try {
      return loadLibrary().length === 0;
    } catch {
      return false;
    }
  });

  const activeSetup =
    project.setups.find((s) => s.id === project.activeSetupId) || project.setups[0];

  // Workspace module visibility (plan §1.2): a local preference keyed by the
  // project id. Projects without a stored preset show every module so legacy
  // behavior is preserved.
  const [workspaceProfile, setWorkspaceProfileState] = useState<WorkspaceProfile>(
    () => getWorkspaceProfile(project.id) ?? ALL_MODULES_PROFILE,
  );
  useEffect(() => {
    setWorkspaceProfileState(getWorkspaceProfile(project.id) ?? ALL_MODULES_PROFILE);
  }, [project.id]);
  const isModuleVisible = (moduleId: ModuleId) => isModuleEnabledIn(workspaceProfile, moduleId);
  const setModuleVisible = (moduleId: ModuleId, visible: boolean) => {
    setWorkspaceProfileState((current) => {
      const next = withModuleToggled(current, moduleId, visible);
      persistWorkspaceProfile(project.id, next);
      return next;
    });
  };

  // Selection & UI state
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [highlightedElementId, setHighlightedElementId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [activePropSubtype, setActivePropSubtype] = useState<PropType>('table_rect');
  const [activeLightFixture, setActiveLightFixture] = useState<LightFixtureType>('fresnel');
  const [activeCameraRig, setActiveCameraRig] = useState<CameraRigType>('Tripod');
  const [activeShapeType, setActiveShapeType] = useState<ShapeType>('rectangle');
  const [activeCableType, setActiveCableType] = useState<CableType>('sdi_12g');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const savedTheme = migrateStorageKey(LEGACY_STORAGE_KEYS.theme, STORAGE_KEYS.theme);
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch {}
    return 'light'; // Default to light mode
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEYS.theme, next);
      } catch {}
      return next;
    });
  };

  // Sync theme class to document element for Tailwind dark mode classes
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Display / label preferences (UI-only, persisted separately from scene data)
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => {
    try {
      const saved = migrateStorageKey(LEGACY_STORAGE_KEYS.display, STORAGE_KEYS.display);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Light names became default-on; migrate any previously-saved "off".
        if (parsed.showLightNameLabels === false) parsed.showLightNameLabels = true;
        // Kelvin and Dim level labels default to OFF; migrate any legacy saved true settings
        if (parsed._v !== 2) {
          parsed.showLightKelvinLabels = false;
          parsed.showLightIntensityLabels = false;
          parsed._v = 2;
          try {
            localStorage.setItem(STORAGE_KEYS.display, JSON.stringify(parsed));
          } catch {}
        }
        return {
          ...DEFAULT_DISPLAY_SETTINGS,
          ...parsed,
          labelCategoryOpacity: {
            ...DEFAULT_DISPLAY_SETTINGS.labelCategoryOpacity,
            ...(parsed.labelCategoryOpacity || {}),
          },
        };
      }
    } catch {}
    return DEFAULT_DISPLAY_SETTINGS;
  });

  const updateDisplaySettings = (updates: Partial<DisplaySettings>) => {
    setDisplaySettings((prev) => {
      const next = { ...prev, ...updates, _v: 2 };
      try {
        localStorage.setItem(STORAGE_KEYS.display, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Viewfinder & Modals
  const [isViewfinderOpen, setIsViewfinderOpen] = useState(false);
  const [viewfinderCameraId, setViewfinderCameraId] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportSection, setExportSection] = useState<ExportSection>('floorplan');

  // Right Sidebar Tab State
  const [activeRightTab, setActiveRightTab] = useState<'shots' | 'storyboard' | 'script' | 'equipment' | 'schedule' | 'moodboard' | 'locations' | 'power' | 'logistics' | 'run_of_show' | 'rigging' | 'contacts' | 'tasks' | 'inspector'>('shots');
  const [scriptLinkShotId, setScriptLinkShotId] = useState<string | null>(null);

  // If the open project's workspace hides the current tab's module, fall back
  // to the always-available Inspector (plan §1.2: hidden module ≠ deleted data).
  useEffect(() => {
    const tabModules: Record<string, ModuleId> = {
      shots: 'shots',
      storyboard: 'storyboard',
      script: 'script',
      equipment: 'equipment',
      schedule: 'schedule',
      power: 'power',
      rigging: 'rigging',
      logistics: 'logistics',
      run_of_show: 'run_of_show',
      moodboard: 'moodboard',
      locations: 'locations',
      contacts: 'contacts',
      tasks: 'tasks',
    };
    const mod = tabModules[activeRightTab];
    if (mod && !isModuleEnabledIn(workspaceProfile, mod)) {
      setActiveRightTab('inspector');
    }
  }, [workspaceProfile, activeRightTab]);

  // Playback engine
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLooping, setIsLooping] = useState(true);

  // Undo / Redo history
  // Whole-project undo history. Every entry is an immutable project snapshot
  // (structural sharing keeps memory flat), so Ctrl+Z spans the screenplay,
  // schedule, mood boards, company info AND every scene's canvas — not just
  // the currently open setup. Session-only UI prefs (displaySettings) stay
  // outside by design (plan rule 38).
  const [history, setHistory] = useState<Project[]>([project]);
  const [historyIndex, setHistoryIndex] = useState(0);
  // Updaters run during React's render phase, so snapshots they want recorded
  // are parked here and flushed once per committed render.
  const pendingSnapshotsRef = useRef<Project[]>([]);
  // Latest known project for code paths that commit WITHOUT a setProject
  // (canvas gesture end), including live drag refs.
  const liveProjectRef = useRef(project);

  /** Push one immutable snapshot (dedupe by reference; cap length). */
  const recordProjectSnapshot = (snapshot: Project, baseHistory: Project[], baseIndex: number) => {
    const nextHistory = baseHistory.slice(0, baseIndex + 1);
    if (nextHistory[nextHistory.length - 1] === snapshot) return;
    nextHistory.push(snapshot);
    if (nextHistory.length > 50) nextHistory.shift();
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

  // Auto-save to localStorage. If the project grows too large for the browser's
  // localStorage quota (most commonly because storyboards are embedded as
  // base64 data URLs), surface a visible warning instead of failing silently —
  // the user can still export the full project as a JSON file.
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  // Autosave is debounced: canvas gestures update the project many times per
  // second and each write serialises the whole project. The latest project is
  // kept in a ref so a flush (project switch, tab hidden, unload) always
  // writes the newest state.
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
    } catch {
      setStorageWarning(
        'Autosave to this browser failed — the project (likely with embedded storyboards) ' +
          'exceeds the local storage limit. Use the download button in the top bar to save your project file.'
      );
    }
  };
  useEffect(() => {
    const previous = autosaveProjectRef.current;
    // Switching projects must not lose the last edits of the one being left.
    if (previous.id !== project.id) persistProjectNow(previous);
    autosaveProjectRef.current = project;
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => persistProjectNow(project), 300);
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
    // Asynchronous IndexedDB failures (quota, blocked database) never throw
    // synchronously — they only reach us through the save-state channel.
    const unsubscribe = subscribeSaveState((state) => {
      if (state === 'error') {
        setStorageWarning(
          'Saving to this browser failed — the storage database rejected the write (usually quota). ' +
            'Export your project file from the top bar so nothing is lost.'
        );
      }
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

  const dismissStorageWarning = () => setStorageWarning(null);

  // Sync history when active setup changes externally (e.g. switched setup)
  const prevSetupIdRef = useRef(project.activeSetupId);
  // Live size of the canvas viewport (reported by FloorPlanCanvas), used to
  // spawn new cameras at the visual center of the canvas.
  const canvasViewportRef = useRef<{ width: number; height: number }>({ width: 1200, height: 800 });
  const setCanvasViewport = (width: number, height: number) => {
    canvasViewportRef.current = { width, height };
  };

  // World-space position at the visual center of the currently visible canvas.
  // Used to spawn elements added via quick search / new cameras.
  const getCanvasCenterPosition = (): Vector2D => {
    const { width, height } = canvasViewportRef.current;
    const scale = activeSetup.canvasScale || 1;
    return {
      x: Math.round((width / 2 - activeSetup.canvasOffset.x) / scale),
      y: Math.round((height / 2 - activeSetup.canvasOffset.y) / scale),
    };
  };

  // Spawn position for a newly added camera: the center of the currently
  // visible canvas. If earlier cameras already sit at/near that spot, nudge
  // diagonally so the new camera is visibly ADDED instead of stacking on top
  // of (and appearing to overwrite) the previous one.
  const getNewCameraPosition = (): Vector2D => {
    const center = getCanvasCenterPosition();
    const camCount = activeSetup.elements.filter((e) => e.type === 'camera').length;
    const nudge = camCount * 40;
    return { x: center.x + nudge, y: center.y + nudge };
  };
  useEffect(() => {
    if (prevSetupIdRef.current !== project.activeSetupId) {
      prevSetupIdRef.current = project.activeSetupId;
      // Undo history is project-wide now: switching scenes keeps it intact so
      // Ctrl+Z can move an edit back across a scene switch.
      setSelectedElementIds([]);
      setSelectedShotId(null);
      setSelectedBackgroundId(null);
      setCurrentBeat(1);
      setIsPlaying(false);
    }
  }, [project.activeSetupId]);

  // Animation Playback loop
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = 2000 / playbackSpeed;
    const interval = setInterval(() => {
      setCurrentBeat((prev) => {
        const next = prev + 0.05;
        if (next > activeSetup.totalBeats) {
          if (isLooping) return 1;
          setIsPlaying(false);
          return activeSetup.totalBeats;
        }
        return Math.round(next * 100) / 100;
      });
    }, intervalMs * 0.05);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, activeSetup.totalBeats, isLooping]);

  // Helper to commit new setup state with history push. The history entry is
  // a whole-project snapshot so unrelated project edits stay undoable too.
  const commitSetupState = (newSetup: SceneSetup, recordHistory = true) => {
    setProject((prev) => {
      const next: Project = {
        ...prev,
        setups: prev.setups.map((s) => (s.id === newSetup.id ? newSetup : s)),
      };
      if (recordHistory) pendingSnapshotsRef.current.push(next);
      return next;
    });
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setProject(history[newIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setProject(history[newIndex]);
    }
  };

  // Selection handlers
  /**
   * Select an element. Locked elements stay unselectable — unless `force` is
   * true, which is the deliberate escape hatch (double-click or the lock chip)
   * used to reach a locked element's inspector so it can be unlocked again.
   */
  const selectElement = (id: string | null, multi = false, force = false) => {
    if (!id) {
      setSelectedElementIds([]);
      return;
    }

    const el = activeSetup.elements.find((e) => e.id === id);
    // Locked elements are not selectable while locked.
    if (el?.locked && !force) return;
    const isCamera = el?.type === 'camera';

    // Selecting on the canvas opens the inspector — unless:
    // 1. The user is reading the lined script, storyboard, or equipment list.
    // 2. The element is a camera, which only opens inspector on double-click unless inspector is already open.
    if (activeRightTab !== 'script' && activeRightTab !== 'storyboard' && activeRightTab !== 'equipment') {
      if (!isCamera || activeRightTab === 'inspector') {
        setActiveRightTab('inspector');
      }
    }
    setSelectedBackgroundId(null);

    if (multi) {
      setSelectedElementIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      );
    } else {
      setSelectedElementIds([id]);
      // If it's a camera, sync selected shot!
      if (el && el.type === 'camera') {
        const cam = el as CameraElement;
        if (cam.associatedShotId) {
          setSelectedShotId(cam.associatedShotId);
        } else {
          // Find any shot linking to this camera
          const matchShot = activeSetup.shots.find((s) => s.cameraId === cam.id);
          if (matchShot) {
            setSelectedShotId(matchShot.id);
          }
        }
      }
    }
  };

  const selectElements = (ids: string[]) => {
    // Locked elements are not selectable while locked.
    const filtered = ids.filter((id) => !activeSetup.elements.find((e) => e.id === id)?.locked);
    setSelectedElementIds(filtered);
    if (filtered.length > 0) {
      const allCameras = filtered.every((id) => activeSetup.elements.find((e) => e.id === id)?.type === 'camera');
      if (activeRightTab !== 'script' && activeRightTab !== 'storyboard' && activeRightTab !== 'equipment') {
        if (!allCameras || activeRightTab === 'inspector') {
          setActiveRightTab('inspector');
        }
      }
      setSelectedBackgroundId(null);
    }
  };

  const clearSelection = () => {
    setSelectedElementIds([]);
    setSelectedShotId(null);
    setSelectedBackgroundId(null);
  };

  // Plan groups (plan §6.4). Groups live on the setup and are updated through
  // the existing setup-update path so history/undo keeps working.
  const groupSelection = () => {
    if (selectedElementIds.length < 2) return;
    const newGroup: PlanGroup = {
      id: createId('group'),
      childIds: [...selectedElementIds],
    };
    updateSetupMeta({ groups: [...(activeSetup.groups || []), newGroup] });
  };

  const ungroupSelection = () => {
    const selection = new Set(selectedElementIds);
    const groups = activeSetup.groups || [];
    const remaining = groups.filter(
      (g) =>
        !(
          g.childIds.length === selection.size &&
          g.childIds.every((id) => selection.has(id))
        )
    );
    if (remaining.length === groups.length) return;
    updateSetupMeta({ groups: remaining });
  };

  // Select shot handler with bidirectional camera sync (keeps current tab by default)
  const selectShot = (shotId: string | null, focusCanvasCamera = true) => {
    setSelectedShotId(shotId);
    if (!shotId) return;

    const shot = activeSetup.shots.find((s) => s.id === shotId);
    if (shot && shot.cameraId) {
      setSelectedElementIds([shot.cameraId]);
      setSelectedBackgroundId(null);
      setHighlightedElementId(shot.cameraId);

      if (focusCanvasCamera) {
        // Flash highlight
        setTimeout(() => {
          setHighlightedElementId(null);
        }, 1500);
      }
    }
  };

  // Element CRUD Operations
  const addElement = (
    partial: Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }
  ): string => {
    const id = `el-${partial.type}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    let newElement: FloorPlanElement;

    const baseDefaults = {
      id,
      name: `${partial.type.toUpperCase()}`,
      x: partial.x ?? 300,
      y: partial.y ?? 300,
      rotation: partial.rotation ?? 0,
      locked: false,
    };

    if (partial.type === 'actor') {
      const existingActors = activeSetup.elements.filter((e) => e.type === 'actor');
      const letterCode = String.fromCharCode(65 + (existingActors.length % 26));
      const color = ACTOR_COLOR_PALETTE[existingActors.length % ACTOR_COLOR_PALETTE.length];

      newElement = {
        ...baseDefaults,
        type: 'actor',
        name: partial.name || `CHARACTER ${letterCode}`,
        characterLetter: letterCode,
        color,
        isStanding: true,
        path: [],
        speechCues: [],
        ...partial,
      };
    } else if (partial.type === 'camera') {
      const existingCams = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
      const isMultiCam = activeSetup.shootMode === 'multi_cam';
      // Every newly added camera is its own element on the floor plan, but it
      // keeps the default 'A' label (single-cam workflow: one physical camera,
      // many positions). Letters B, C, ... are only used in multi-cam mode or
      // when the user actively picks/creates another camera.
      const camLetter = isMultiCam ? String.fromCharCode(65 + (existingCams.length % 26)) : 'A';
      const camColor = CAMERA_COLOR_PALETTE[existingCams.length % CAMERA_COLOR_PALETTE.length];
      const focal = partial.focalLength || 35;
      const sensor = partial.sensorFormat || 'Super35';

      // Auto create a linked shot with format SceneNumber/ShotNumber (e.g. 1/1, 1/2)
      const shotId = newShotId();
      const shotNumber = `${activeSetup.sceneNumber || '1'}/${activeSetup.shots.length + 1}`;

      const createdCamera: CameraElement = {
        ...baseDefaults,
        type: 'camera',
        name: partial.name || `Cam ${camLetter}`,
        cameraLabel: camLetter,
        color: camColor,
        focalLength: focal,
        sensorFormat: sensor,
        fovAngle: calculateFovAngle(focal, sensor),
        aspectRatio: '16:9',
        cameraHeight: 'Eye Level',
        rigType: activeCameraRig,
        throwDistance: 280,
        path: [],
        associatedShotId: shotId,
        cameraModel: 'Cinema Camera',
        ...partial,
      };

      const newShot: Shot = {
        id: shotId,
        sceneNumber: activeSetup.sceneNumber || '1',
        shotNumber,
        name: `Shot ${shotNumber} - ${createdCamera.name}`,
        cameraId: id,
        cameraLabel: camLetter,
        shotSize: 'MS',
        lensMm: focal,
        cameraAngle: 'Eye Level',
        movement: 'Static',
        aspectRatio: '16:9',
        frameRate: 24,
        subjectActorIds: [],
        framingDescription: 'Framed on subject',
        status: 'planned',
        takesCount: 0,
        estDurationSeconds: 15,
        order: activeSetup.shots.length + 1,
      };

      newElement = createdCamera;

      const updatedSetup: SceneSetup = {
        ...activeSetup,
        elements: [...activeSetup.elements, newElement],
        shots: [...activeSetup.shots, newShot],
      };

      const newAVRow: AVScriptRow = {
        id: `av-${shotId}`,
        shotNumber,
        shotName: newShot.name,
        shotSize: newShot.shotSize,
        video: newShot.framingDescription || 'Framed on subject',
        audio: newShot.actionScriptNotes || '',
        durationSec: newShot.estDurationSeconds || 15,
        linkedShotId: shotId,
      };

      setRecordedProject((prev) => ({
        ...prev,
        avScriptRows: [...(prev.avScriptRows || avScriptRows), newAVRow],
      }));

      commitSetupState(updatedSetup);
      setSelectedElementIds([id]);
      setSelectedShotId(shotId);
      return id;
    } else if (partial.type === 'light') {
      const requestedFixture = (partial as Partial<LightElement>).fixtureType;
      const fixture =
        LIGHT_FIXTURES.find((f) => f.type === (requestedFixture ?? activeLightFixture)) ||
        LIGHT_FIXTURES[0];
      newElement = {
        ...baseDefaults,
        type: 'light',
        name: partial.name || fixture.name,
        fixtureType: fixture.type,
        colorTemp: fixture.defaultTemp,
        intensity: 80,
        beamAngle: fixture.defaultBeam,
        throwDistance: 220,
        brand: partial.brand,
        fixtureModel: partial.fixtureModel,
        ...(fixture.isFlag ? { flagSize: '24x36' as const } : {}),
        ...partial,
      };
    } else if (partial.type === 'shape') {
      const requested = (partial as Partial<ShapeElement>).shapeType || activeShapeType;
      newElement = {
        ...baseDefaults,
        type: 'shape',
        name: partial.name || `${requested.charAt(0).toUpperCase()}${requested.slice(1)}`,
        shapeType: requested,
        width: 180,
        height: requested === 'circle' ? 180 : 120,
        color: '#38bdf8',
        filled: true,
        opacity: 0.3,
        strokeColor: '#0ea5e9',
        strokeWidth: 2,
        strokeOpacity: 1,
        dashStyle: 'solid',
        cornerRadius: requested === 'rectangle' ? 8 : 0,
        ...partial,
      } as ShapeElement;
    } else if (partial.type === 'wall') {
      newElement = {
        ...baseDefaults,
        type: 'wall',
        name: partial.name || 'Wall',
        x2: partial.x2 ?? (baseDefaults.x + 200),
        y2: partial.y2 ?? baseDefaults.y,
        thickness: 12,
        ...partial,
      };
    } else if (partial.type === 'door') {
      newElement = {
        ...baseDefaults,
        type: 'door',
        name: partial.name || 'Door',
        width: 60,
        swingAngle: 90,
        swingDirection: 'left',
        ...partial,
      };
    } else if (partial.type === 'window') {
      newElement = {
        ...baseDefaults,
        type: 'window',
        name: partial.name || 'Window',
        width: 100,
        depth: 12,
        beamVisible: false,
        ...partial,
      };
    } else if (partial.type === 'prop') {
      const requestedProp = (partial as Partial<PropElement>).propType;
      const propInfo =
        PROP_CATALOG.find((p) => p.type === (requestedProp ?? activePropSubtype)) || PROP_CATALOG[0];
      newElement = {
        ...baseDefaults,
        type: 'prop',
        name: partial.name || propInfo.name,
        propType: activePropSubtype,
        width: propInfo.defaultWidth,
        height: propInfo.defaultHeight,
        color: propInfo.defaultColor,
        ...partial,
      };
    } else if (partial.type === 'track') {
      newElement = {
        ...baseDefaults,
        type: 'track',
        name: partial.name || 'Dolly Track',
        x2: baseDefaults.x + 240,
        y2: baseDefaults.y,
        ...partial,
      };
    } else if (partial.type === 'measurement') {
      newElement = {
        ...baseDefaults,
        type: 'measurement',
        name: 'Measure Tape',
        x2: baseDefaults.x + 150,
        y2: baseDefaults.y,
        unit: activeSetup.gridSettings.unit,
        ...partial,
      };
    } else if (partial.type === 'arrow') {
      newElement = {
        ...baseDefaults,
        type: 'arrow',
        name: 'Arrow',
        x2: baseDefaults.x + 150,
        y2: baseDefaults.y,
        color: '#f97316',
        strokeWidth: 2.5,
        headStyle: 'single',
        dashStyle: 'solid',
        ...partial,
      };
    } else if (partial.type === 'cable') {
      const requestedCable = (partial as Partial<CableElement>).cableType;
      const cableInfo = CABLE_TYPES.find((c) => c.type === (requestedCable ?? activeCableType)) || CABLE_TYPES[0];
      newElement = {
        ...baseDefaults,
        type: 'cable',
        name: partial.name || `Cable ${cableInfo.shortLabel}`,
        x2: baseDefaults.x + 150,
        y2: baseDefaults.y,
        cableType: cableInfo.type,
        color: cableInfo.color,
        strokeWidth: 3.5,
        showLabel: true,
        fromLabel: 'FROM',
        toLabel: 'TO',
        ...partial,
      };
    } else if (partial.type === 'stroke') {
      newElement = {
        ...baseDefaults,
        type: 'stroke',
        name: partial.name || 'Annotation',
        points: [],
        color: '#f59e0b',
        strokeWidth: 3,
        toolStyle: 'pen',
        ...partial,
      } as StrokeElement;
    } else {
      newElement = {
        ...baseDefaults,
        type: 'text',
        name: 'Text Label',
        text: 'Director Notes',
        fontSize: 16,
        color: '#94a3b8',
        ...partial,
      } as FloorPlanElement;
    }

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: [...activeSetup.elements, newElement],
    };

    commitSetupState(updatedSetup);
    setSelectedElementIds([id]);
    return id;
  };

  // Quick-search placement: drop an element at the center of the currently
  // visible canvas (used by the Shift+Space quick asset search).
  const quickAddElement = (
    partial: Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }
  ): string => {
    const pos = getCanvasCenterPosition();
    const full: Partial<FloorPlanElement> & { type: FloorPlanElement['type'] } = {
      ...partial,
      x: pos.x,
      y: pos.y,
    };

    // Linear elements need a sensible default length when placed via search.
    if ((partial.type === 'wall' || partial.type === 'track' || partial.type === 'measurement' || partial.type === 'arrow' || partial.type === 'cable') && (full as any).x2 === undefined) {
      (full as any).x2 = pos.x + 240;
      (full as any).y2 = pos.y;
    }

    const id = addElement(full);
    setActiveTool('select');
    return id;
  };

  const updateElement = (id: string, updates: Partial<FloorPlanElement>, recordHistory = true) => {
    const el = activeSetup.elements.find((e) => e.id === id);
    if (!el) return;

    // If updating a camera's focal length or sensor format, re-calculate FOV and update linked shot
    let extraUpdates: Partial<FloorPlanElement> = {};
    let updatedShots = activeSetup.shots;
    if (el.type === 'camera') {
      const cam = el as CameraElement;
      const focal = (updates as Partial<CameraElement>).focalLength ?? cam.focalLength;
      const sensor = (updates as Partial<CameraElement>).sensorFormat ?? cam.sensorFormat;
      extraUpdates = { fovAngle: calculateFovAngle(focal, sensor) };

      // Sync the linked shot's lens in the SAME commit — a separate updateShot
      // call would be overwritten by this commit, because both rebuild the
      // setup from the same base state (last write wins per field).
      if ((updates as Partial<CameraElement>).focalLength !== undefined) {
        const linkedShot = activeSetup.shots.find((s) => s.cameraId === id || s.id === cam.associatedShotId);
        if (linkedShot) {
          updatedShots = activeSetup.shots.map((s) =>
            s.id === linkedShot.id ? ({ ...s, lensMm: focal } as Shot) : s
          );
        }
      }

      // A camera that gains its FIRST waypoint is now moving — its linked shot
      // can't stay Static. Flip it to Tracking (only if the user hadn't already
      // picked a real movement).
      if ((updates as Partial<CameraElement>).path !== undefined) {
        const newPath = (updates as Partial<CameraElement>).path;
        const hadMove = !!(cam.path && cam.path.length > 0);
        const hasMove = !!newPath && newPath.length > 0;
        if (hasMove && !hadMove) {
          const linkedShot = activeSetup.shots.find((s) => s.cameraId === id || s.id === cam.associatedShotId);
          if (linkedShot) {
            updatedShots = activeSetup.shots.map((s) =>
              s.id === linkedShot.id
                ? ({ ...s, movement: s.movement === 'Static' ? ('Tracking' as CameraMovement) : s.movement } as Shot)
                : s
            );
          }
        }
      }
    }

    const updatedElements = activeSetup.elements.map((e) =>
      e.id === id ? ({ ...e, ...updates, ...extraUpdates } as FloorPlanElement) : e
    );

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: updatedElements,
      shots: updatedShots,
    };

    liveSetupRef.current = updatedSetup;
    commitSetupState(updatedSetup, recordHistory);
  };

  const updateMultipleElements = (
    updatesList: { id: string; updates: Partial<FloorPlanElement> }[],
    recordHistory = true
  ) => {
    const updateMap = new Map(updatesList.map((u) => [u.id, u.updates]));
    const updatedElements = activeSetup.elements.map((e) => {
      const u = updateMap.get(e.id);
      return u ? ({ ...e, ...u } as FloorPlanElement) : e;
    });

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: updatedElements,
    };

    liveSetupRef.current = updatedSetup;
    commitSetupState(updatedSetup, recordHistory);
  };

  /**
   * Group cleanup after deletions (plan §6.4): removed ids are dropped from
   * every group's childIds; a group that loses its last member dissolves.
   * Deleting a whole group's membership therefore removes the group too.
   */
  const pruneGroups = (
    groups: PlanGroup[] | undefined,
    removedIds: Set<string>
  ): PlanGroup[] | undefined => {
    if (!groups || groups.length === 0) return groups;
    const next = groups
      .map((g) => ({ ...g, childIds: g.childIds.filter((id) => !removedIds.has(id)) }))
      .filter((g) => g.childIds.length > 0);
    return next;
  };

  const deleteElementById = (id: string) => {
    const updatedElements = activeSetup.elements.filter((e) => e.id !== id);
    // If it's a camera, its shots go with it — and so do their linings, so the
    // lined script never keeps a stroke for a shot that no longer exists.
    const removedShotIds = new Set(
      activeSetup.shots.filter((s) => s.cameraId === id).map((s) => s.id)
    );
    const updatedShots = activeSetup.shots.filter((s) => s.cameraId !== id);

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: updatedElements,
      shots: updatedShots,
      scriptMarks: (activeSetup.scriptMarks || []).filter((mark) => !removedShotIds.has(mark.shotId)),
      groups: pruneGroups(activeSetup.groups, new Set([id])),
    };

    setSelectedElementIds((prev) => prev.filter((i) => i !== id));
    if (selectedShotId && !updatedShots.find((s) => s.id === selectedShotId)) {
      setSelectedShotId(null);
    }
    if (removedShotIds.size > 0) {
      setRecordedProject((prev) => ({
        ...prev,
        avScriptRows: (prev.avScriptRows || []).filter((r) => !removedShotIds.has(r.linkedShotId || '')),
      }));
    }
    commitSetupState(updatedSetup);
  };

  const deleteSelectedElements = () => {
    if (selectedElementIds.length === 0) return;
    // Locked elements can never be deleted while locked.
    const idsToDelete = selectedElementIds.filter(
      (id) => !activeSetup.elements.find((e) => e.id === id)?.locked
    );
    if (idsToDelete.length === 0) return;
    const idsSet = new Set(idsToDelete);
    const updatedElements = activeSetup.elements.filter((e) => !idsSet.has(e.id));
    const removedShotIds = new Set(
      activeSetup.shots.filter((s) => idsSet.has(s.cameraId)).map((s) => s.id)
    );
    const updatedShots = activeSetup.shots.filter((s) => !idsSet.has(s.cameraId));

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: updatedElements,
      shots: updatedShots,
      scriptMarks: (activeSetup.scriptMarks || []).filter((mark) => !removedShotIds.has(mark.shotId)),
      groups: pruneGroups(activeSetup.groups, idsSet),
    };

    setSelectedElementIds([]);
    setSelectedShotId(null);
    if (removedShotIds.size > 0) {
      setRecordedProject((prev) => ({
        ...prev,
        avScriptRows: (prev.avScriptRows || []).filter((r) => !removedShotIds.has(r.linkedShotId || '')),
      }));
    }
    commitSetupState(updatedSetup);
  };

  const duplicateSelected = () => {
    if (selectedElementIds.length === 0) return;
    const newElements: FloorPlanElement[] = [];
    const newSelectedIds: string[] = [];
    const duplicateIdMap = new Map<string, string>();

    selectedElementIds.forEach((id) => {
      const el = activeSetup.elements.find((e) => e.id === id);
      if (!el) return;

      const newId = `el-${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      duplicateIdMap.set(id, newId);
      const duplicated: FloorPlanElement = {
        ...el,
        id: newId,
        name: `${el.name} (Copy)`,
        x: el.x + 30,
        y: el.y + 30,
      };

      if (duplicated.type === 'camera') {
        const cam = duplicated as CameraElement;
        const shotId = `shot-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        cam.associatedShotId = shotId;
      }

      newElements.push(duplicated);
      newSelectedIds.push(newId);
    });

    // Duplicating a whole group duplicates the group itself, with childIds
    // remapped to the cloned element ids (plan §6.4).
    const duplicatedGroups: PlanGroup[] = (activeSetup.groups || [])
      .filter((g) => g.childIds.length > 0 && g.childIds.every((cid) => duplicateIdMap.has(cid)))
      .map((g) => ({
        id: createId('group'),
        name: g.name,
        childIds: g.childIds.map((cid) => duplicateIdMap.get(cid)!),
      }));

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: [...activeSetup.elements, ...newElements],
      groups:
        duplicatedGroups.length > 0
          ? [...(activeSetup.groups || []), ...duplicatedGroups]
          : activeSetup.groups,
    };

    commitSetupState(updatedSetup);
    setSelectedElementIds(newSelectedIds);
  };

  // Clipboard for Ctrl+C / Ctrl+V copy & paste of selected assets.
  const clipboardRef = useRef<FloorPlanElement[]>([]);
  const pasteOffsetRef = useRef(30);

  // Holds the most recent LIVE setup produced by a no-history update (drag
  // moves, rotate, endpoint/waypoint drags). Updated synchronously by
  // updateElement / updateMultipleElements so that commitCurrentState (called
  // on release) always pushes the EXACT state shown on the canvas — even if
  // React hasn't re-rendered the pointerup handler with the final position yet.
  const liveSetupRef = useRef<SceneSetup | null>(null);

  const copySelectedElements = () => {
    if (selectedElementIds.length === 0) return;
    clipboardRef.current = selectedElementIds
      .map((id) => activeSetup.elements.find((e) => e.id === id))
      .filter((el): el is FloorPlanElement => !!el)
      .map((el) => JSON.parse(JSON.stringify(el)) as FloorPlanElement);
    pasteOffsetRef.current = 30;
  };

  const pasteElements = () => {
    if (clipboardRef.current.length === 0) return;
    const newElements: FloorPlanElement[] = [];
    const newSelectedIds: string[] = [];
    let newShots = activeSetup.shots;
    let newShotsAdded = 0;

    clipboardRef.current.forEach((el) => {
      const newId = `el-${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const pasted: FloorPlanElement = {
        ...el,
        id: newId,
        name: `${el.name} (Copy)`,
        x: el.x + pasteOffsetRef.current,
        y: el.y + pasteOffsetRef.current,
      };

      // Camera copies also carry a copy of their linked shot so the pasted
      // camera isn't orphaned in the shot list.
      if (pasted.type === 'camera') {
        const cam = pasted as CameraElement;
        const linkedShot = activeSetup.shots.find((s) => s.id === (el as CameraElement).associatedShotId);
        const copiedShotId = newShotId();
        cam.associatedShotId = copiedShotId;
        if (linkedShot) {
          const order = activeSetup.shots.length + newShotsAdded + 1;
          const copiedShot: Shot = {
            ...linkedShot,
            id: copiedShotId,
            cameraId: newId,
            cameraLabel: cam.cameraLabel,
            shotNumber: `${activeSetup.sceneNumber || '1'}/${order}`,
            name: `${linkedShot.name} (Copy)`,
            order,
          };
          newShots = [...newShots, copiedShot];
          newShotsAdded++;
        }
      }

      newElements.push(pasted);
      newSelectedIds.push(newId);
    });

    pasteOffsetRef.current += 30;

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: [...activeSetup.elements, ...newElements],
      shots: newShots,
    };

    commitSetupState(updatedSetup);
    setSelectedElementIds(newSelectedIds);
  };

  // Push the current live canvas state into history. Drags update the project
  // live (recordHistory=false) and call this ONCE on release, so a single
  // drag/move/rotate is exactly one undoable operation. Uses the latest
  // project ref so the snapshot includes every live drag update.
  const commitCurrentState = () => {
    const targetSetup = liveSetupRef.current ?? activeSetup;
    const base = liveProjectRef.current ?? project;
    const snapshot: Project = {
      ...base,
      setups: base.setups.map((s) => (s.id === targetSetup.id ? targetSetup : s)),
    };
    recordProjectSnapshot(snapshot, history, historyIndex);
  };

  const insertDoorInWall = (wallId: string): string | null => {
    const wall = activeSetup.elements.find((e) => e.id === wallId && e.type === 'wall');
    if (!wall) return null;

    const w1 = { x: wall.x, y: wall.y };
    const w2 = { x: (wall as any).x2 ?? wall.x + 200, y: (wall as any).y2 ?? wall.y };
    const midX = (w1.x + w2.x) / 2;
    const midY = (w1.y + w2.y) / 2;
    let angle = (Math.atan2(w2.y - w1.y, w2.x - w1.x) * 180) / Math.PI;
    if (angle < 0) angle += 360;

    const doorId = addElement({
      type: 'door',
      name: 'Single Door',
      x: midX,
      y: midY,
      rotation: Math.round(angle),
      width: 70,
      swingAngle: 90,
      swingDirection: 'right',
      isOpen: true,
    } as any);

    setSelectedElementIds([doorId]);
    return doorId;
  };

  const insertWindowInWall = (wallId: string): string | null => {
    const wall = activeSetup.elements.find((e) => e.id === wallId && e.type === 'wall');
    if (!wall) return null;

    const w1 = { x: wall.x, y: wall.y };
    const w2 = { x: (wall as any).x2 ?? wall.x + 200, y: (wall as any).y2 ?? wall.y };
    const midX = (w1.x + w2.x) / 2;
    const midY = (w1.y + w2.y) / 2;
    let angle = (Math.atan2(w2.y - w1.y, w2.x - w1.x) * 180) / Math.PI;
    if (angle < 0) angle += 360;

    const windowId = addElement({
      type: 'window',
      name: 'Window',
      x: midX,
      y: midY,
      rotation: Math.round(angle),
      width: 80,
      depth: 14,
      beamVisible: false,
    } as any);

    setSelectedElementIds([windowId]);
    return windowId;
  };

  // Shot CRUD Operations
  const setShootMode = (mode: 'single_cam' | 'multi_cam') => {
    const updatedSetup: SceneSetup = {
      ...activeSetup,
      shootMode: mode,
    };
    commitSetupState(updatedSetup);
  };

  const addShot = (shotData?: Partial<Shot>): string => {
    const id = newShotId();
    const nextOrder = activeSetup.shots.length + 1;
    const isMultiCam = activeSetup.shootMode === 'multi_cam';
    const existingCameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
    
    // Format: 1/1, 1/2, 1/3 (SceneNumber/ShotNumber)
    const sceneNum = activeSetup.sceneNumber || '1';
    const shotNumber = `${sceneNum}/${nextOrder}`;
    
    // In Single-Camera mode (default): Camera is 'A' across coverage setups.
    // In Multi-Camera mode: Each concurrent camera gets sequential letter A, B, C...
    const nextCamLetter = isMultiCam 
      ? String.fromCharCode(65 + (existingCameras.length % 26))
      : 'A';

    let camId = shotData?.cameraId || '';
    let camLabel = shotData?.cameraLabel || nextCamLetter;
    let lens = shotData?.lensMm || 35;
    let newElements = [...activeSetup.elements];

    // If no camera was explicitly specified in shotData, reuse the default camera
    // (Camera A) in single-camera mode so we don't spawn a new camera element for
    // every shot. Only create a new camera for multi-camera mode or a fresh project.
    if (!camId) {
      if (existingCameras.length > 0 && !isMultiCam) {
        const defaultCam = existingCameras.find((c) => c.cameraLabel === 'A') || existingCameras[0];
        camId = defaultCam.id;
        camLabel = defaultCam.cameraLabel || 'A';
        lens = defaultCam.focalLength || 35;
      } else {
        const newCamId = `cam-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        const camColor = CAMERA_COLOR_PALETTE[existingCameras.length % CAMERA_COLOR_PALETTE.length];

        // Calculate smart position for new camera
        const actors = activeSetup.elements.filter((e) => e.type === 'actor');
        let posX = 320 + (existingCameras.length * 60);
        let posY = 380 + (existingCameras.length * 40);
        let rotation = 0;

        if (actors.length > 0) {
          const mainActor = actors[0];
          const angleOffset = (existingCameras.length * 45) % 360;
          const rad = ((225 + angleOffset) * Math.PI) / 180;
          posX = Math.round(mainActor.x + Math.cos(rad) * 180);
          posY = Math.round(mainActor.y + Math.sin(rad) * 180);
          const deg = (Math.atan2(mainActor.y - posY, mainActor.x - posX) * 180) / Math.PI;
          rotation = Math.round((deg + 360) % 360);
        }

        const camDisplayName = isMultiCam
          ? `Camera ${nextCamLetter}`
          : `Camera ${camLabel} (Shot ${shotData?.shotNumber || shotNumber})`;

        const newCamera: CameraElement = {
          id: newCamId,
          type: 'camera',
          name: camDisplayName,
          cameraLabel: camLabel,
          color: camColor,
          x: posX,
          y: posY,
          rotation,
          locked: false,
          visible: true,
          focalLength: lens,
          sensorFormat: 'Super35',
          fovAngle: calculateFovAngle(lens, 'Super35'),
          aspectRatio: '16:9',
          cameraHeight: 'Eye Level',
          rigType: 'Tripod',
          throwDistance: 320,
          path: [],
          associatedShotId: id,
        };

        newElements.push(newCamera);
        camId = newCamId;
      }
    }

    const newShot: Shot = {
      id,
      sceneNumber: sceneNum,
      shotNumber: shotData?.shotNumber || shotNumber,
      name: shotData?.name || `Shot ${shotData?.shotNumber || shotNumber} - Coverage`,
      cameraId: camId,
      cameraLabel: camLabel,
      shotSize: shotData?.shotSize || 'MS',
      lensMm: lens,
      cameraAngle: shotData?.cameraAngle || 'Eye Level',
      movement: shotData?.movement || 'Static',
      aspectRatio: '16:9',
      frameRate: 24,
      subjectActorIds: [],
      framingDescription: shotData?.framingDescription || '',
      status: 'planned',
      takesCount: 0,
      estDurationSeconds: 20,
      order: nextOrder,
      ...shotData,
    };

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: newElements,
      shots: [...activeSetup.shots, newShot],
      scriptLines: shotData?.scriptLineId
        ? (activeSetup.scriptLines || []).map((line) =>
            line.id === shotData.scriptLineId ? { ...line, linkedShotId: id } : line
          )
        : activeSetup.scriptLines,
    };

    commitSetupState(updatedSetup);
    setSelectedShotId(id);
    if (camId) {
      setSelectedElementIds([camId]);
    }
    return id;
  };

  const insertShotAfter = (afterShotId: string, options?: { renumberRest?: boolean }): string => {
    const shotIdx = activeSetup.shots.findIndex((s) => s.id === afterShotId);
    const existingCameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
    const isMultiCam = activeSetup.shootMode === 'multi_cam';
    const nextCamLetter = isMultiCam ? String.fromCharCode(65 + (existingCameras.length % 26)) : 'A';

    const sceneNum = activeSetup.sceneNumber || '1';
    let targetShotNumber = `${sceneNum}/1B`;
    const prevShot = shotIdx !== -1 ? activeSetup.shots[shotIdx] : null;

    if (prevShot) {
      const prevNum = prevShot.shotNumber || '';
      if (prevNum.includes('/')) {
        // e.g. "1/1" -> "1/1B" or "1/1B" -> "1/1C"
        const parts = prevNum.split('/');
        const shotPart = parts[1] || '1';
        const match = shotPart.match(/^(\d+)([A-Za-z]*)$/);
        if (match) {
          const num = match[1];
          const currLetter = match[2];
          if (!currLetter) {
            targetShotNumber = `${parts[0]}/${num}A`;
          } else {
            const charCode = currLetter.toUpperCase().charCodeAt(0);
            const nextChar = String.fromCharCode(charCode + 1);
            targetShotNumber = `${parts[0]}/${num}${nextChar}`;
          }
        } else {
          targetShotNumber = `${prevNum}B`;
        }
      } else {
        const match = prevNum.match(/^(\d+)([A-Za-z]*)$/);
        if (match) {
          const sNum = match[1] || sceneNum;
          const currLetter = match[2];
          if (!currLetter) {
            targetShotNumber = `${sNum}A`;
          } else {
            const charCode = currLetter.toUpperCase().charCodeAt(0);
            const nextChar = String.fromCharCode(charCode + 1);
            targetShotNumber = `${sNum}${nextChar}`;
          }
        } else {
          targetShotNumber = `${prevNum}B`;
        }
      }
    }

    // An inserted shot is a NEW setup: it always gets its own camera element on
    // the floor plan (same as "+ Cam & Shot"), never reuses/overwrites the
    // camera of a neighbouring shot. In single-cam mode it keeps the 'A' label.
    const shotId = newShotId();
    const newCamId = `cam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const camColor = CAMERA_COLOR_PALETTE[existingCameras.length % CAMERA_COLOR_PALETTE.length];
    const spawnPos = getNewCameraPosition();
    const newCamera: CameraElement = {
      id: newCamId,
      type: 'camera',
      name: isMultiCam ? `Camera ${nextCamLetter}` : `Camera ${nextCamLetter} (Shot ${targetShotNumber})`,
      cameraLabel: nextCamLetter,
      color: camColor,
      x: spawnPos.x,
      y: spawnPos.y,
      rotation: 0,
      locked: false,
      visible: true,
      focalLength: 50,
      sensorFormat: 'Super35',
      fovAngle: calculateFovAngle(50, 'Super35'),
      aspectRatio: '16:9',
      cameraHeight: 'Eye Level',
      rigType: 'Tripod',
      throwDistance: 320,
      path: [],
      associatedShotId: shotId,
    };
    const shotCamId = newCamId;

    const newShot: Shot = {
      id: shotId,
      sceneNumber: sceneNum,
      shotNumber: targetShotNumber,
      name: `Shot ${targetShotNumber} - Insert Coverage`,
      cameraId: shotCamId,
      cameraLabel: nextCamLetter,
      shotSize: 'CU',
      lensMm: 50,
      cameraAngle: 'Eye Level',
      movement: 'Static',
      aspectRatio: '16:9',
      frameRate: 24,
      subjectActorIds: [],
      framingDescription: '',
      status: 'planned',
      takesCount: 0,
      estDurationSeconds: 15,
      order: shotIdx !== -1 ? shotIdx + 2 : activeSetup.shots.length + 1,
    };

    const nextShots = [...activeSetup.shots];
    const insertPosition = shotIdx !== -1 ? shotIdx + 1 : nextShots.length;
    nextShots.splice(insertPosition, 0, newShot);

    // If renumberRest is requested, update subsequent shot numbers in 1/1, 1/2, 1/3 format
    let finalShots = nextShots;
    if (options?.renumberRest) {
      finalShots = nextShots.map((s, idx) => ({
        ...s,
        shotNumber: `${sceneNum}/${idx + 1}`,
        order: idx + 1,
      }));
    } else {
      finalShots = nextShots.map((s, idx) => ({ ...s, order: idx + 1 }));
    }

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: [...activeSetup.elements, newCamera],
      shots: finalShots,
    };

    commitSetupState(updatedSetup);
    setSelectedShotId(shotId);
    setSelectedElementIds([shotCamId]);
    return shotId;
  };

  // Create a standalone camera (no auto shot) so an existing shot can be re-linked to it
  /**
   * Lined-script coverage: the user highlights a range of screenplay lines and
   * that range becomes a shot (with its own camera on the floor plan) plus the
   * vertical lining mark drawn over those lines.
   */
  // The screenplay lives on the project so it stays open when the user adds or
  // switches scenes; older saves keep it on the setup and are hoisted once.
  const scriptLines: ScriptLine[] = project.scriptLines || activeSetup.scriptLines || [];

  useEffect(() => {
    if (project.scriptLines) return;
    const legacy = project.setups.find((setup) => (setup.scriptLines || []).length > 0);
    if (!legacy) return;
    setRecordedProject((prev) => ({
      ...prev,
      scriptTitle: prev.scriptTitle || legacy.scriptTitle,
      scriptText: prev.scriptText || legacy.scriptText,
      scriptLines: legacy.scriptLines,
    }));
  }, [project.scriptLines, project.setups]);

  const allScriptMarks: ScriptMark[] = project.setups.flatMap((setup) => setup.scriptMarks || []);
  const allShots: Shot[] = project.setups.flatMap((setup) => setup.shots);
  const setupIdForMark = (markId: string): string | null =>
    project.setups.find((setup) => (setup.scriptMarks || []).some((mark) => mark.id === markId))?.id || null;

  /**
   * Apply an update to whichever setup owns a lining. Edits to the scene the
   * user is looking at go through history; edits to another scene's lining are
   * written straight to the project.
   */
  const commitSetupById = (setupId: string, updater: (setup: SceneSetup) => SceneSetup) => {
    if (setupId === activeSetup.id) {
      commitSetupState(updater(activeSetup));
      return;
    }
    setRecordedProject((prev) => ({
      ...prev,
      setups: prev.setups.map((setup) => (setup.id === setupId ? updater(setup) : setup)),
    }));
  };

  const createShotFromScriptRange = (range: {
    startLineId: string;
    endLineId: string;
    startOffset?: number;
    endOffset?: number;
    sceneNumber?: string;
    description?: string;
    shotSize?: Shot['shotSize'];
    text?: string;
  }): string => {
    const lines = scriptLines;
    const startIdx = lines.findIndex((line) => line.id === range.startLineId);
    const endIdx = lines.findIndex((line) => line.id === range.endLineId);
    if (startIdx === -1 || endIdx === -1) { console.warn('[lining] range not found', range, lines.length); return ''; }
    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);

    // Scene number comes from the slugline covering the highlighted range.
    let sceneNum = range.sceneNumber;
    if (!sceneNum) {
      for (let i = from; i >= 0; i -= 1) {
        if (lines[i].sceneNumber) {
          sceneNum = lines[i].sceneNumber;
          break;
        }
      }
    }
    sceneNum = sceneNum || activeSetup.sceneNumber || '1';

    // Numbered against every scene's shots: the lined script shows the whole
    // production, so two setups covering script scene 8 must not both say 8/1.
    const shotsInScene = allShots.filter((shot) => shot.sceneNumber === sceneNum).length;
    const shotNumber = `${sceneNum}/${shotsInScene + 1}`;

    const existingCameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
    const isMultiCam = activeSetup.shootMode === 'multi_cam';
    const camLetter = isMultiCam ? String.fromCharCode(65 + (existingCameras.length % 26)) : 'A';
    const camColor = CAMERA_COLOR_PALETTE[existingCameras.length % CAMERA_COLOR_PALETTE.length];
    const spawnPos = getNewCameraPosition();

    const shotId = newShotId();
    const camId = `cam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const lens = 35;

    const newCamera: CameraElement = {
      id: camId,
      type: 'camera',
      name: `Camera ${camLetter} (Shot ${shotNumber})`,
      cameraLabel: camLetter,
      color: camColor,
      x: spawnPos.x,
      y: spawnPos.y,
      rotation: 0,
      locked: false,
      visible: true,
      focalLength: lens,
      sensorFormat: 'Super35',
      fovAngle: calculateFovAngle(lens, 'Super35'),
      aspectRatio: '16:9',
      cameraHeight: 'Eye Level',
      rigType: activeCameraRig,
      throwDistance: 300,
      path: [],
      associatedShotId: shotId,
    };

    const coveredText = range.text || lines.slice(from, to + 1).map((line) => line.text).join('\n');
    // The shot list's action column defaults to the highlighted screenplay text
    // so a fresh lining already reads like the moment it covers.
    const flattened = coveredText.replace(/\s+/g, ' ').trim();
    const actionSummary = flattened.length > 90 ? `${flattened.slice(0, 90).trimEnd()}…` : flattened;

    const newShot: Shot = {
      id: shotId,
      sceneNumber: sceneNum,
      shotNumber,
      name: range.description || actionSummary || `Shot ${shotNumber}`,
      cameraId: camId,
      cameraLabel: camLetter,
      shotSize: range.shotSize || 'MS',
      lensMm: lens,
      cameraAngle: 'Eye Level',
      movement: 'Static',
      aspectRatio: activeSetup.aspectRatio || '16:9',
      frameRate: 24,
      subjectActorIds: [],
      framingDescription: range.description || '',
      actionScriptNotes: coveredText.slice(0, 600),
      status: 'planned',
      takesCount: 0,
      estDurationSeconds: 20,
      order: activeSetup.shots.length + 1,
      scriptLineId: lines[from].id,
    };

    const mark: ScriptMark = {
      id: newMarkId(),
      shotId,
      startLineId: lines[from].id,
      endLineId: lines[to].id,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      label: shotNumber,
      description: range.description,
      color: camColor,
      sceneNumber: sceneNum,
    };

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: [...activeSetup.elements, newCamera],
      shots: [...activeSetup.shots, newShot],
      scriptMarks: [...(activeSetup.scriptMarks || []), mark],
    };

    const newAVRow: AVScriptRow = {
      id: `av-${shotId}`,
      shotNumber,
      shotName: newShot.name,
      shotSize: newShot.shotSize,
      video: newShot.framingDescription || `${newShot.shotSize} coverage of scene ${sceneNum}`,
      audio: coveredText,
      durationSec: 20,
      linkedShotId: shotId,
    };

    setRecordedProject((prev) => ({
      ...prev,
      avScriptRows: [...(prev.avScriptRows || avScriptRows), newAVRow],
    }));

    commitSetupState(updatedSetup);
    setSelectedShotId(shotId);
    setSelectedElementIds([camId]);
    return shotId;
  };

  const startScriptLinking = (shotId: string) => {
    setScriptLinkShotId(shotId);
    setSelectedShotId(shotId);
    setActiveRightTab('script');
  };

  const cancelScriptLinking = () => setScriptLinkShotId(null);

  const linkShotToScriptRange = (
    shotId: string,
    range: { startLineId: string; endLineId: string; startOffset?: number; endOffset?: number }
  ) => {
    const owner = project.setups.find((setup) => setup.shots.some((shot) => shot.id === shotId));
    if (!owner) return;
    const shot = owner.shots.find((item) => item.id === shotId);
    if (!shot) return;

    const startIdx = scriptLines.findIndex((line) => line.id === range.startLineId);
    const endIdx = scriptLines.findIndex((line) => line.id === range.endLineId);
    if (startIdx === -1 || endIdx === -1) return;
    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);

    const camera = owner.elements.find(
      (element) => element.id === shot.cameraId && element.type === 'camera'
    ) as CameraElement | undefined;

    // The lined text becomes the shot's action: the storyboard frame and the
    // shot list both read these fields, so lining a shot updates them too.
    const coveredText = scriptLines
      .slice(from, to + 1)
      .map((line, index) => {
        const isFirst = index === 0;
        const isLast = from + index === to;
        let text = line.text;
        if (isLast && range.endOffset !== undefined) text = text.slice(0, range.endOffset);
        if (isFirst && range.startOffset !== undefined) text = text.slice(range.startOffset);
        return text;
      })
      .join('\n');
    const flattened = coveredText.replace(/\s+/g, ' ').trim();
    const actionSummary = flattened.length > 90 ? `${flattened.slice(0, 90).trimEnd()}…` : flattened;
    // An untouched auto-name ("Shot 1/2", "Shot 1/2 - Insert Coverage") is
    // replaced by the lined action; a name the user wrote is left alone.
    const autoName = !shot.name || /^Shot\s+\S+(\s+-\s+(Coverage|Insert Coverage))?$/i.test(shot.name);

    const mark: ScriptMark = {
      id: newMarkId(),
      shotId,
      startLineId: scriptLines[from].id,
      endLineId: scriptLines[to].id,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      label: shot.shotNumber,
      description: shot.framingDescription || undefined,
      color: camera?.color || CAMERA_COLOR_PALETTE[0],
      sceneNumber: shot.sceneNumber,
    };

    commitSetupById(owner.id, (setup) => ({
      ...setup,
      shots: setup.shots.map((item) =>
        item.id === shotId
          ? {
              ...item,
              actionScriptNotes: coveredText.slice(0, 600),
              name: autoName && actionSummary ? actionSummary : item.name,
              framingDescription: item.framingDescription || actionSummary,
            }
          : item
      ),
      // One lining per shot: re-lining a shot moves its existing stroke.
      scriptMarks: [...(setup.scriptMarks || []).filter((item) => item.shotId !== shotId), mark],
    }));

    if (owner.id !== activeSetup.id) setActiveSetupId(owner.id);
    setSelectedShotId(shotId);
    setScriptLinkShotId(null);
  };

  const updateScriptMark = (markId: string, updates: Partial<ScriptMark>) => {
    const setupId = setupIdForMark(markId);
    if (!setupId) return;
    commitSetupById(setupId, (setup) => {
      const marks = setup.scriptMarks || [];
      const mark = marks.find((m) => m.id === markId);
      if (!mark) return setup;
      return {
        ...setup,
        shots: setup.shots.map((shot) =>
          shot.id === mark.shotId && updates.description !== undefined
            ? { ...shot, framingDescription: updates.description, name: updates.description || shot.name }
            : shot
        ),
        scriptMarks: marks.map((m) => (m.id === markId ? { ...m, ...updates } : m)),
      };
    });
  };

  const setLiningDescription = (markId: string, text: string) => {
    const setupId = setupIdForMark(markId);
    if (!setupId) return;
    commitSetupById(setupId, (setup) => {
      const marks = setup.scriptMarks || [];
      const mark = marks.find((m) => m.id === markId);
      if (!mark) return setup;
      return {
        ...setup,
        shots: setup.shots.map((shot) =>
          shot.id === mark.shotId ? { ...shot, framingDescription: text } : shot
        ),
        scriptMarks: marks.map((m) => (m.id === markId ? { ...m, description: text } : m)),
      };
    });
  };

  const deleteScriptMark = (markId: string, options?: { deleteShot?: boolean }) => {
    const setupId = setupIdForMark(markId);
    if (!setupId) return;
    commitSetupById(setupId, (setup) => {
      const marks = setup.scriptMarks || [];
      const mark = marks.find((m) => m.id === markId);
      if (!mark) return setup;

      let updatedShots = setup.shots;
      let updatedElements = setup.elements;
      if (options?.deleteShot) {
        const removedShot = setup.shots.find((shot) => shot.id === mark.shotId);
        updatedShots = setup.shots.filter((shot) => shot.id !== mark.shotId);
        if (removedShot?.cameraId && !updatedShots.some((shot) => shot.cameraId === removedShot.cameraId)) {
          updatedElements = setup.elements.filter((e) => e.id !== removedShot.cameraId);
        }
        if (selectedShotId === mark.shotId) setSelectedShotId(null);
      }

      return {
        ...setup,
        elements: updatedElements,
        shots: updatedShots,
        scriptMarks: marks.filter((m) => m.id !== markId),
      };
    });
  };

  /**
   * Replace the production's screenplay. It is stored once for the whole
   * project (every scene sees it) and linings that no longer resolve to a line
   * are dropped from each setup.
   *
   * The derived scene list is persisted here (scene ids are their source
   * heading-line ids) so the scheduler can link strips to scenes. Scenes that
   * disappear from the screenplay do NOT silently orphan their schedule
   * strips: affected scene blocks are stamped with an `omittedLabel` and stay
   * visible as OMITTED until the user deletes them.
   */
  const setScriptLines = (lines: ScriptLine[], meta?: { scriptTitle?: string; scriptText?: string }) => {
    const numbered = lines.map((line, index) => ({ ...line, lineNumber: index + 1 }));
    const ids = new Set(numbered.map((line) => line.id));
    setProject((prev) => {
      // Derive old/new scene lists so removed headings can be detected.
      const oldScenes = deriveScriptBreakdown(prev.scriptLines || [], [], []).scenes;
      const newScenes = deriveScriptBreakdown(numbered, [], []).scenes;
      // A scene counts as "live" only when its heading exists AND is not
      // flagged OMITTED — omitted scenes keep their number but are not shootable.
      const newSceneIds = new Set(newScenes.filter((scene) => !scene.omitted).map((scene) => scene.id));
      const omittedLabelById = new Map(
        [...oldScenes, ...newScenes.filter((scene) => scene.omitted)]
          .filter((scene) => !newSceneIds.has(scene.id))
          .map((scene) => [scene.id, `${scene.sceneNumber} · ${scene.heading}`] as const)
      );

      const next: Project = {
        ...prev,
        scriptTitle: meta?.scriptTitle ?? prev.scriptTitle,
        scriptText: meta?.scriptText ?? prev.scriptText,
        scriptLines: numbered,
        scriptScenes: newScenes,
        setups: prev.setups.map((setup) => ({
          ...setup,
          // The legacy per-setup copy is cleared so there is one source of truth.
          scriptLines: undefined,
          scriptMarks: (setup.scriptMarks || []).filter(
            (mark) => ids.has(mark.startLineId) && ids.has(mark.endLineId)
          ),
        })),
        scheduleBlocks: (prev.scheduleBlocks || []).map((block) => {
          if (block.kind !== 'scene') return block;
          if (newSceneIds.has(block.scriptSceneId)) {
            // Scene exists again (or never vanished): clear a stale omission stamp.
            if (block.omittedLabel === undefined) return block;
            const next: typeof block = { id: block.id, kind: 'scene', scriptSceneId: block.scriptSceneId };
            if (block.estimatedMinutes !== undefined) next.estimatedMinutes = block.estimatedMinutes;
            return next;
          }
          const label = omittedLabelById.get(block.scriptSceneId);
          if (!label && !block.omittedLabel) return block;
          return label ? { ...block, omittedLabel: label } : block;
        }),
      };
      // Screenplay edits (text, title, omissions) are undoable like any other
      // project change.
      pendingSnapshotsRef.current.push(next);
      return next;
    });
  };

  // Backfill the derived scene list for projects saved before it was
  // persisted; absent-safe and idempotent.
  useEffect(() => {
    if (project.scriptScenes || !project.scriptLines?.length) return;
    const scenes = deriveScriptBreakdown(project.scriptLines, [], []).scenes;
    setProject((prev) => (prev.scriptScenes ? prev : { ...prev, scriptScenes: scenes }));
  }, [project.scriptScenes, project.scriptLines]);

  const avScriptRows: AVScriptRow[] = project.avScriptRows || [    {
      id: 'av-1',
      shotNumber: '1',
      shotName: 'WS - Master Establishing',
      shotSize: 'WS',
      video: 'EXT. GLASS PAVILION - SUNRISE. Crane down slowly as the golden morning sun reflects off the glass facade.',
      audio: 'MUSIC: Ethereal synth strings swell gently. Ambient birds chirping in the garden distance.',
      durationSec: 6,
    },
    {
      id: 'av-2',
      shotNumber: '2',
      shotName: 'MS - Protagonist Arrival',
      shotSize: 'MS',
      video: 'TRACKING SHOT with Marcus as he walks briskly toward the security entrance, briefcase in hand.',
      audio: 'MARCUS (V.O.)\n(calm, measured)\nThey told me the vault was impenetrable. They lied.',
      durationSec: 5,
    },
    {
      id: 'av-3',
      shotNumber: '3',
      shotName: 'CU - Biometric Scan',
      shotSize: 'CU',
      video: 'INSERT - Scanner panel flashing emerald green as Marcus places his palm on the glass plate.',
      audio: 'SFX: High-tech confirmation chime (DOUBLE BEEP). Pneumatic door lock releases with a hiss.',
      durationSec: 3,
    },
  ];

  const scriptFormatMode: ScriptFormatMode = project.scriptFormatMode || 'lined_coverage';

  const setScriptFormatMode = (mode: ScriptFormatMode) => {
    setRecordedProject((prev) => ({ ...prev, scriptFormatMode: mode }));
  };

  const setAVScriptRows = (rows: AVScriptRow[]) => {
    setRecordedProject((prev) => ({
      ...prev,
      avScriptRows: rows,
    }));
  };

  const updateAVScriptRow = (id: string, updates: Partial<AVScriptRow>) => {
    // Resolve the linked shot OUTSIDE the updater: updaters must stay pure
    // (StrictMode runs them twice) and must never dispatch other updates.
    const target = avScriptRows.find((r) => r.id === id);
    if (target?.linkedShotId) {
      const shotUpdates: Partial<Shot> = {};
      if (updates.shotNumber !== undefined) shotUpdates.shotNumber = updates.shotNumber;
      if (updates.shotName !== undefined) shotUpdates.name = updates.shotName;
      if (updates.shotSize !== undefined) shotUpdates.shotSize = updates.shotSize;
      if (updates.video !== undefined) shotUpdates.framingDescription = updates.video;
      if (updates.audio !== undefined) shotUpdates.actionScriptNotes = updates.audio;
      if (updates.durationSec !== undefined) shotUpdates.estDurationSeconds = updates.durationSec;
      updateShot(target.linkedShotId, shotUpdates);
    }
    setRecordedProject((prev) => {
      const current = prev.avScriptRows || avScriptRows;
      return {
        ...prev,
        avScriptRows: current.map((row) => (row.id === id ? { ...row, ...updates } : row)),
      };
    });
  };

  const addAVScriptRow = (row?: Partial<AVScriptRow>): string => {
    const shotId = newShotId();
    const existingCameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
    const isMultiCam = activeSetup.shootMode === 'multi_cam';
    const camLetter = isMultiCam ? String.fromCharCode(65 + (existingCameras.length % 26)) : 'A';
    const camColor = CAMERA_COLOR_PALETTE[existingCameras.length % CAMERA_COLOR_PALETTE.length];
    const spawnPos = getNewCameraPosition();
    const camId = `cam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const currentRows = project.avScriptRows || avScriptRows;
    const nextNum = row?.shotNumber || String(currentRows.length + 1);
    const shotName = row?.shotName || `Shot ${nextNum}`;
    const shotSize = row?.shotSize || 'MS';
    const video = row?.video || `Framed on subject (${shotSize})`;
    const audio = row?.audio || '';
    const duration = row?.durationSec || 5;

    const newCamera: CameraElement = {
      id: camId,
      type: 'camera',
      name: `Camera ${camLetter} (${shotName})`,
      cameraLabel: camLetter,
      color: camColor,
      x: spawnPos.x,
      y: spawnPos.y,
      rotation: 0,
      locked: false,
      visible: true,
      focalLength: 35,
      sensorFormat: 'Super35',
      fovAngle: calculateFovAngle(35, 'Super35'),
      aspectRatio: '16:9',
      cameraHeight: 'Eye Level',
      rigType: 'Tripod',
      throwDistance: 160,
      path: [],
      associatedShotId: shotId,
    };

    const newShotItem: Shot = {
      id: shotId,
      sceneNumber: activeSetup.sceneNumber || '1',
      shotNumber: nextNum,
      name: shotName,
      cameraId: camId,
      cameraLabel: camLetter,
      shotSize,
      lensMm: 35,
      cameraAngle: 'Eye Level',
      movement: 'Static',
      aspectRatio: '16:9',
      frameRate: 24,
      subjectActorIds: [],
      framingDescription: video,
      actionScriptNotes: audio,
      status: 'planned',
      takesCount: 0,
      estDurationSeconds: duration,
      order: activeSetup.shots.length + 1,
    };

    const avRowId = `av-${shotId}`;
    const newRow: AVScriptRow = {
      id: avRowId,
      shotNumber: nextNum,
      shotName,
      shotSize,
      video,
      audio,
      durationSec: duration,
      linkedShotId: shotId,
    };

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: [...activeSetup.elements, newCamera],
      shots: [...activeSetup.shots, newShotItem],
    };

    commitSetupState(updatedSetup);

    setRecordedProject((prev) => ({
      ...prev,
      avScriptRows: [...(prev.avScriptRows || currentRows), newRow],
    }));

    setSelectedShotId(shotId);
    setSelectedElementIds([camId]);
    return avRowId;
  };

  const deleteAVScriptRow = (id: string) => {
    const current = project.avScriptRows || avScriptRows;
    const row = current.find((r) => r.id === id);
    if (row?.linkedShotId) {
      deleteShot(row.linkedShotId);
    }
    setRecordedProject((prev) => {
      const rows = prev.avScriptRows || current;
      return {
        ...prev,
        avScriptRows: rows.filter((r) => r.id !== id && r.linkedShotId !== row?.linkedShotId),
      };
    });
  };

  const syncAVRowToShot = (rowId: string): string => {
    const current = project.avScriptRows || avScriptRows;
    const row = current.find((r) => r.id === rowId);
    if (!row) return '';

    const existingCameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
    const isMultiCam = activeSetup.shootMode === 'multi_cam';
    const camLetter = isMultiCam ? String.fromCharCode(65 + (existingCameras.length % 26)) : 'A';
    const camColor = CAMERA_COLOR_PALETTE[existingCameras.length % CAMERA_COLOR_PALETTE.length];
    const spawnPos = getNewCameraPosition();

    const shotId = newShotId();
    const camId = `cam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const newCamera: CameraElement = {
      id: camId,
      type: 'camera',
      name: `Camera ${camLetter} (${row.shotName || `Shot ${row.shotNumber}`})`,
      cameraLabel: camLetter,
      color: camColor,
      x: spawnPos.x,
      y: spawnPos.y,
      rotation: 0,
      locked: false,
      visible: true,
      focalLength: 35,
      sensorFormat: 'Super35',
      fovAngle: calculateFovAngle(35, 'Super35'),
      aspectRatio: '16:9',
      cameraHeight: 'Eye Level',
      rigType: 'Tripod',
      throwDistance: 160,
      path: [],
      associatedShotId: shotId,
    };

    const newShotItem: Shot = {
      id: shotId,
      sceneNumber: activeSetup.sceneNumber || '1',
      shotNumber: row.shotNumber,
      name: row.shotName || `Shot ${row.shotNumber}`,
      cameraId: camId,
      cameraLabel: camLetter,
      shotSize: row.shotSize || 'MS',
      lensMm: 35,
      cameraAngle: 'Eye Level',
      movement: 'Static',
      aspectRatio: '16:9',
      frameRate: 24,
      subjectActorIds: [],
      framingDescription: row.video,
      actionScriptNotes: row.audio,
      status: 'planned',
      takesCount: 0,
      estDurationSeconds: row.durationSec || 5,
      order: activeSetup.shots.length,
    };

    // Update active scene setup with new camera and shot
    commitSetupState({
      ...activeSetup,
      elements: [...activeSetup.elements, newCamera],
      shots: [...activeSetup.shots, newShotItem],
    });

    // Link row back to created shot
    updateAVScriptRow(rowId, { linkedShotId: shotId });
    setSelectedShotId(shotId);
    return shotId;
  };

  const createCameraOnly = (name: string, pos?: Vector2D): string => {
    const existingCams = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
    // Assign the first camera letter not currently in use (A is the shared
    // default, so user-created cameras get B, C, ...) regardless of how many
    // Camera A positions exist on the floor plan.
    const usedLetters = new Set(existingCams.map((c) => (c.cameraLabel || 'A').toUpperCase()));
    let camLetter = 'B';
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!usedLetters.has(letter)) {
        camLetter = letter;
        break;
      }
    }
    const camColor = CAMERA_COLOR_PALETTE[existingCams.length % CAMERA_COLOR_PALETTE.length];
    const focal = 35;
    const sensor = 'Super35';
    const id = `el-camera-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const spawnPos = pos ?? getNewCameraPosition();

    const newCamera: CameraElement = {
      id,
      type: 'camera',
      name,
      x: spawnPos.x,
      y: spawnPos.y,
      rotation: 0,
      locked: false,
      cameraLabel: camLetter,
      color: camColor,
      focalLength: focal,
      sensorFormat: sensor,
      fovAngle: calculateFovAngle(focal, sensor),
      aspectRatio: '16:9',
      cameraHeight: 'Eye Level',
      rigType: 'Tripod',
      throwDistance: 280,
      path: [],
      associatedShotId: null,
      cameraModel: 'Cinema Camera',
    };

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: [...activeSetup.elements, newCamera],
    };

    commitSetupState(updatedSetup);
    return id;
  };

  // Create a new camera on the floor plan AND link an existing shot to it in
  // ONE commit. (Creating the camera and updating the shot in two separate
  // commits would lose the camera again, because each commit rebuilds the
  // setup from the same base state — last write wins per field.)
  const createCameraForShot = (name: string, shotId: string, lensMm?: number, pos?: Vector2D): string => {
    const existingCams = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
    const usedLetters = new Set(existingCams.map((c) => (c.cameraLabel || 'A').toUpperCase()));
    let camLetter = 'B';
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!usedLetters.has(letter)) {
        camLetter = letter;
        break;
      }
    }
    const camColor = CAMERA_COLOR_PALETTE[existingCams.length % CAMERA_COLOR_PALETTE.length];
    const focal = 35;
    const sensor = 'Super35';
    const id = `el-camera-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const spawnPos = pos ?? getNewCameraPosition();

    const newCamera: CameraElement = {
      id,
      type: 'camera',
      name,
      x: spawnPos.x,
      y: spawnPos.y,
      rotation: 0,
      locked: false,
      cameraLabel: camLetter,
      color: camColor,
      focalLength: focal,
      sensorFormat: sensor,
      fovAngle: calculateFovAngle(focal, sensor),
      aspectRatio: '16:9',
      cameraHeight: 'Eye Level',
      rigType: 'Tripod',
      throwDistance: 280,
      path: [],
      associatedShotId: shotId,
      cameraModel: 'Cinema Camera',
    };

    const updatedShots = activeSetup.shots.map((s) =>
      s.id === shotId
        ? ({ ...s, cameraId: id, cameraLabel: camLetter, lensMm: lensMm ?? s.lensMm ?? 35 } as Shot)
        : s
    );

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: [...activeSetup.elements, newCamera],
      shots: updatedShots,
    };

    commitSetupState(updatedSetup);
    setSelectedShotId(shotId);
    setSelectedElementIds([id]);
    return id;
  };

  // Keep the shot's CAM letter in the shot list and its camera element on the
  // floor plan linked: changing the letter here re-labels the shot's own
  // camera element (and renames it if it still uses the auto "Cam X" name) in
  // ONE commit, so the icon on the canvas shows the new letter.
  /**
   * Change which camera shoots a setup, **without moving the camera**.
   *
   * A shot's camera element is that setup's position on the floor plan; the
   * letter says which physical camera stands there. So assigning a shot from A
   * to B re-letters the camera that is already blocked for that shot instead of
   * jumping the coverage to wherever B happens to sit. If other shots share the
   * same camera element, it is copied in place for this shot only, so their
   * blocking is untouched.
   */
  const assignCameraToShot = (shotId: string, cameraId: string | null) => {
    const owner = project.setups.find((setup) => setup.shots.some((shot) => shot.id === shotId));
    if (!owner) return;

    let focusCameraId: string | null = null;

    commitSetupById(owner.id, (setup) => {
      const shot = setup.shots.find((item) => item.id === shotId);
      if (!shot) return setup;

      const current = setup.elements.find(
        (element) => element.id === shot.cameraId && element.type === 'camera'
      ) as CameraElement | undefined;

      // "— No Camera —": unlink, and drop the position if nothing else uses it.
      if (!cameraId) {
        const shots = setup.shots.map((item) =>
          item.id === shotId ? { ...item, cameraId: '', cameraLabel: 'A' } : item
        );
        const orphaned = current && !shots.some((item) => item.cameraId === current.id);
        return {
          ...setup,
          elements: orphaned
            ? setup.elements.filter((element) => element.id !== current!.id)
            : setup.elements,
          shots,
        };
      }

      const target = setup.elements.find(
        (element) => element.id === cameraId && element.type === 'camera'
      ) as CameraElement | undefined;
      if (!target) return setup;

      const letter = (target.cameraLabel || 'A').toUpperCase();

      // No camera blocked for this shot yet — link it to the picked one.
      if (!current) {
        focusCameraId = target.id;
        return {
          ...setup,
          shots: setup.shots.map((item) =>
            item.id === shotId
              ? { ...item, cameraId: target.id, cameraLabel: letter, lensMm: target.focalLength ?? item.lensMm }
              : item
          ),
        };
      }

      if ((current.cameraLabel || 'A').toUpperCase() === letter) {
        focusCameraId = current.id;
        return setup;
      }

      // Auto-generated names ("Cam A", "Camera A (Shot 1/2)") follow the letter.
      const renameToLetter = (name: string, from: string) => {
        const auto = new RegExp(`^((?:Cam|Camera) )${from}(\\s*\\(.*\\))?$`, 'i');
        return auto.test(name) ? name.replace(auto, `$1${letter}$2`) : name;
      };

      const sharedWithOtherShots = setup.shots.some(
        (item) => item.id !== shotId && item.cameraId === current.id
      );

      if (sharedWithOtherShots) {
        // Copy the position for this shot alone so the other shots keep theirs.
        const copyId = `el-camera-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const copy: CameraElement = {
          ...current,
          id: copyId,
          cameraLabel: letter,
          color: target.color,
          name: renameToLetter(current.name || `Cam ${letter}`, (current.cameraLabel || 'A').toUpperCase()),
          associatedShotId: shotId,
        };
        focusCameraId = copyId;
        return {
          ...setup,
          elements: [...setup.elements, copy],
          shots: setup.shots.map((item) =>
            item.id === shotId ? { ...item, cameraId: copyId, cameraLabel: letter } : item
          ),
        };
      }

      // Only this shot uses the camera: re-letter it where it stands.
      focusCameraId = current.id;
      return {
        ...setup,
        elements: setup.elements.map((element) =>
          element.id === current.id
            ? ({
                ...element,
                cameraLabel: letter,
                color: target.color,
                name: renameToLetter(current.name || `Cam ${letter}`, (current.cameraLabel || 'A').toUpperCase()),
              } as CameraElement)
            : element
        ),
        shots: setup.shots.map((item) =>
          item.id === shotId ? { ...item, cameraId: current.id, cameraLabel: letter } : item
        ),
      };
    });

    setSelectedShotId(shotId);
    if (focusCameraId) setSelectedElementIds([focusCameraId]);
  };

  /**
   * Put this setup on a camera that doesn't exist yet (the next free letter).
   * The camera stays exactly where the shot is already blocked; only when the
   * shot has no camera at all is a new one placed on the canvas.
   */
  const addCameraForShot = (shotId: string): string => {
    const owner = project.setups.find((setup) => setup.shots.some((shot) => shot.id === shotId));
    if (!owner) return '';

    const existingCams = owner.elements.filter((e) => e.type === 'camera') as CameraElement[];
    const used = new Set(existingCams.map((cam) => (cam.cameraLabel || 'A').toUpperCase()));
    let letter = 'B';
    for (let i = 0; i < 26; i += 1) {
      const candidate = String.fromCharCode(65 + i);
      if (!used.has(candidate)) {
        letter = candidate;
        break;
      }
    }

    const color = CAMERA_COLOR_PALETTE[existingCams.length % CAMERA_COLOR_PALETTE.length];
    const shot = owner.shots.find((item) => item.id === shotId);
    const current = owner.elements.find(
      (element) => element.id === shot?.cameraId && element.type === 'camera'
    ) as CameraElement | undefined;
    const sharedWithOtherShots =
      !!current && owner.shots.some((item) => item.id !== shotId && item.cameraId === current.id);

    const newId = `el-camera-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let focusCameraId = newId;

    commitSetupById(owner.id, (setup) => {
      // Re-letter in place when this shot owns its camera position.
      if (current && !sharedWithOtherShots) {
        focusCameraId = current.id;
        return {
          ...setup,
          elements: setup.elements.map((element) =>
            element.id === current.id
              ? ({ ...element, cameraLabel: letter, color, name: `Cam ${letter}` } as CameraElement)
              : element
          ),
          shots: setup.shots.map((item) =>
            item.id === shotId ? { ...item, cameraLabel: letter } : item
          ),
        };
      }

      const focal = current?.focalLength ?? 35;
      const spawn = current ? { x: current.x, y: current.y } : getNewCameraPosition();
      const camera: CameraElement = {
        id: newId,
        type: 'camera',
        name: `Cam ${letter}`,
        x: spawn.x,
        y: spawn.y,
        rotation: current?.rotation ?? 0,
        locked: false,
        visible: true,
        cameraLabel: letter,
        color,
        focalLength: focal,
        sensorFormat: current?.sensorFormat ?? 'Super35',
        fovAngle: calculateFovAngle(focal, current?.sensorFormat ?? 'Super35'),
        aspectRatio: '16:9',
        cameraHeight: current?.cameraHeight ?? 'Eye Level',
        rigType: current?.rigType ?? activeCameraRig,
        throwDistance: current?.throwDistance ?? 280,
        path: [],
        associatedShotId: shotId,
        cameraModel: 'Cinema Camera',
      };

      return {
        ...setup,
        elements: [...setup.elements, camera],
        shots: setup.shots.map((item) =>
          item.id === shotId ? { ...item, cameraId: newId, cameraLabel: letter, lensMm: focal } : item
        ),
      };
    });

    setSelectedShotId(shotId);
    setSelectedElementIds([focusCameraId]);
    return focusCameraId;
  };

  const setShotCameraLetter = (shotId: string, letter: string) => {
    const clean = letter.trim().toUpperCase() || 'A';
    const shot = activeSetup.shots.find((s) => s.id === shotId);
    if (!shot) return;

    let updatedElements = activeSetup.elements;
    let cameraId = shot.cameraId || '';

    const currentCam = shot.cameraId
      ? activeSetup.elements.find((e) => e.id === shot.cameraId)
      : undefined;

    if (currentCam && currentCam.type === 'camera') {
      const cam = currentCam as CameraElement;
      const oldLabel = (cam.cameraLabel || 'A').toUpperCase();
      if (oldLabel === clean) return; // already this letter

      // If the camera still carries an auto-generated name (e.g. "Cam A" or
      // "Camera A (Shot 1/2)"), update it to match the new letter so the icon
      // keeps showing the letter rather than a stale name.
      const autoRe = new RegExp(`^((?:Cam|Camera) )${oldLabel}(\\s*\\(.*\\))?$`, 'i');
      const name = cam.name || '';
      const newName = autoRe.test(name) ? name.replace(autoRe, `$1${clean}$2`) : name;

      updatedElements = activeSetup.elements.map((e) =>
        e.id === currentCam.id ? ({ ...e, cameraLabel: clean, name: newName } as CameraElement) : e
      );
    } else {
      // Shot has no camera element — link it to an existing camera carrying
      // this letter.
      const rep = activeSetup.elements.find(
        (e) => e.type === 'camera' && ((e as CameraElement).cameraLabel || 'A').toUpperCase() === clean
      );
      if (!rep) return; // no camera with this letter exists
      cameraId = rep.id;
    }

    const updatedShots = activeSetup.shots.map((s) =>
      s.id === shotId ? ({ ...s, cameraId, cameraLabel: clean } as Shot) : s
    );

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: updatedElements,
      shots: updatedShots,
    };

    commitSetupState(updatedSetup);
    setSelectedShotId(shotId);
    if (cameraId) setSelectedElementIds([cameraId]);
  };

  const updateShot = (id: string, updates: Partial<Shot>) => {
    // Shots can be edited from the "all scenes" shot list, so the update is
    // applied to whichever setup actually owns the shot.
    const owner = project.setups.find((setup) => setup.shots.some((s) => s.id === id));
    if (!owner) return;

    commitSetupById(owner.id, (setup) => {
      const shot = setup.shots.find((s) => s.id === id);
      if (!shot) return setup;

      // If lens changed in shot, reflect in floor plan camera IN THE SAME
      // COMMIT — a separate updateElement call would be overwritten by this
      // commit, because both rebuild the setup from the same base state.
      let updatedElements = setup.elements;
      if (shot.cameraId && updates.lensMm !== undefined) {
        updatedElements = setup.elements.map((e) => {
          if (e.id === shot.cameraId && e.type === 'camera') {
            const cam = e as CameraElement;
            return {
              ...e,
              focalLength: updates.lensMm,
              fovAngle: calculateFovAngle(updates.lensMm, cam.sensorFormat),
            } as FloorPlanElement;
          }
          return e;
        });
      }

      return {
        ...setup,
        elements: updatedElements,
        shots: setup.shots.map((s) => (s.id === id ? ({ ...s, ...updates } as Shot) : s)),
      };
    });

    setRecordedProject((prev) => ({
      ...prev,
      avScriptRows: (prev.avScriptRows || []).map((r) => {
        if (r.linkedShotId !== id) return r;
        return {
          ...r,
          ...(updates.shotNumber !== undefined ? { shotNumber: updates.shotNumber } : {}),
          ...(updates.name !== undefined ? { shotName: updates.name } : {}),
          ...(updates.shotSize !== undefined ? { shotSize: updates.shotSize } : {}),
          ...(updates.framingDescription !== undefined ? { video: updates.framingDescription } : {}),
          ...(updates.actionScriptNotes !== undefined ? { audio: updates.actionScriptNotes } : {}),
          ...(updates.estDurationSeconds !== undefined ? { durationSec: updates.estDurationSeconds } : {}),
        };
      }),
    }));
  };

  const deleteShot = (id: string) => {
    const owner = project.setups.find((setup) => setup.shots.some((s) => s.id === id));
    if (!owner) return;
    if (selectedShotId === id) setSelectedShotId(null);

    commitSetupById(owner.id, (setup) => {
      const updatedShots = setup.shots.filter((s) => s.id !== id);
      const removedShot = setup.shots.find((s) => s.id === id);
      let updatedElements = setup.elements;

      // If the removed shot was the only one using its camera, remove that
      // camera from the floor plan too so it doesn't linger on the canvas.
      if (removedShot?.cameraId && !updatedShots.some((s) => s.cameraId === removedShot.cameraId)) {
        updatedElements = setup.elements.filter((e) => e.id !== removedShot.cameraId);
      }

      return {
        ...setup,
        elements: updatedElements,
        shots: updatedShots,
        scriptMarks: (setup.scriptMarks || []).filter((mark) => mark.shotId !== id),
      };
    });

    setRecordedProject((prev) => ({
      ...prev,
      avScriptRows: (prev.avScriptRows || []).filter((r) => r.linkedShotId !== id),
    }));
  };

  const reorderShots = (arg1: number | Shot[], arg2?: number) => {
    let reindexed: Shot[] = [];
    if (Array.isArray(arg1)) {
      reindexed = arg1.map((item, idx) => ({ ...item, order: idx + 1 }));
    } else if (typeof arg1 === 'number' && typeof arg2 === 'number') {
      const result = Array.from(activeSetup.shots);
      const [removed] = result.splice(arg1, 1);
      if (removed) {
        result.splice(arg2, 0, removed);
      }
      reindexed = result.map((item: Shot, idx: number) => ({ ...item, order: idx + 1 }));
    } else {
      return;
    }

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      shots: reindexed,
    };

    commitSetupState(updatedSetup);
  };

  const setStoryboardOrder = (shotIds: string[]) => {
    commitSetupState({ ...activeSetup, storyboardOrder: shotIds });
  };

  const moveShot = (shotId: string, direction: 'up' | 'down') => {
    const idx = activeSetup.shots.findIndex((s) => s.id === shotId);
    if (idx === -1) return;
    if (direction === 'up' && idx > 0) {
      reorderShots(idx, idx - 1);
    } else if (direction === 'down' && idx < activeSetup.shots.length - 1) {
      reorderShots(idx, idx + 1);
    }
  };

  const moveShotToScene = (
    shotId: string,
    sourceSetupId: string,
    targetSetupId: string,
    targetIndex?: number
  ) => {
    if (sourceSetupId === targetSetupId) {
      const setup = project.setups.find((s) => s.id === sourceSetupId);
      if (!setup) return;
      const shotIdx = setup.shots.findIndex((s) => s.id === shotId);
      if (shotIdx === -1) return;
      const newShots: Shot[] = Array.from(setup.shots);
      const [moved] = newShots.splice(shotIdx, 1);
      if (!moved) return;
      const targetPos = typeof targetIndex === 'number' ? targetIndex : newShots.length;
      newShots.splice(targetPos, 0, moved);
      const reindexed: Shot[] = newShots.map((s: Shot, i: number) => ({ ...s, order: i + 1 }));

      if (sourceSetupId === activeSetup.id) {
        commitSetupState({ ...activeSetup, shots: reindexed });
      } else {
        setRecordedProject((prev) => ({
          ...prev,
          setups: prev.setups.map((s) => (s.id === sourceSetupId ? { ...s, shots: reindexed } : s)),
        }));
      }
      return;
    }

    const sourceSetup = project.setups.find((s) => s.id === sourceSetupId);
    const targetSetup = project.setups.find((s) => s.id === targetSetupId);
    if (!sourceSetup || !targetSetup) return;

    const shotToMove = sourceSetup.shots.find((s) => s.id === shotId);
    if (!shotToMove) return;

    const cameraEl = sourceSetup.elements.find((e) => e.id === shotToMove.cameraId);
    const updatedSourceShots = sourceSetup.shots.filter((s) => s.id !== shotId);
    const updatedSourceElements = cameraEl
      ? sourceSetup.elements.filter((e) => e.id !== cameraEl.id)
      : sourceSetup.elements;

    const targetShots: Shot[] = Array.from(targetSetup.shots);
    const targetPos = typeof targetIndex === 'number' ? targetIndex : targetShots.length;

    const movedShot: Shot = {
      ...shotToMove,
      sceneNumber: targetSetup.sceneNumber || '1',
      order: targetPos + 1,
    };
    targetShots.splice(targetPos, 0, movedShot);
    const reindexedTargetShots: Shot[] = targetShots.map((s: Shot, i: number) => ({ ...s, order: i + 1 }));

    const updatedTargetElements = cameraEl
      ? [...targetSetup.elements, cameraEl]
      : targetSetup.elements;

    setRecordedProject((prev) => ({
      ...prev,
      setups: prev.setups.map((s) => {
        if (s.id === sourceSetupId) {
          return { ...s, shots: updatedSourceShots, elements: updatedSourceElements };
        }
        if (s.id === targetSetupId) {
          return { ...s, shots: reindexedTargetShots, elements: updatedTargetElements };
        }
        return s;
      }),
    }));
  };

  const renumberAllShots = (format: 'scene_slash_number' | 'scene_alphabetic' | 'numeric' | 'alphabetic' = 'scene_slash_number') => {
    const scene = activeSetup.sceneNumber || '1';
    const renumbered = activeSetup.shots.map((shot, idx) => {
      let num = '';
      if (format === 'numeric') {
        num = `${idx + 1}`;
      } else if (format === 'alphabetic') {
        num = String.fromCharCode(65 + (idx % 26)) + (idx >= 26 ? `${Math.floor(idx / 26)}` : '');
      } else if (format === 'scene_alphabetic') {
        // scene_alphabetic: 1A, 1B, 1C...
        const letter = String.fromCharCode(65 + (idx % 26)) + (idx >= 26 ? `${Math.floor(idx / 26)}` : '');
        num = `${scene}${letter}`;
      } else {
        // scene_slash_number (Default: 1/1, 1/2, 1/3...)
        num = `${scene}/${idx + 1}`;
      }
      return {
        ...shot,
        shotNumber: num,
        order: idx + 1,
      };
    });

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      shots: renumbered,
    };
    commitSetupState(updatedSetup);
  };

  const sortShotsBy = (criteria: 'custom' | 'shotNumber' | 'camera' | 'lens' | 'status') => {
    const sorted = [...activeSetup.shots];
    if (criteria === 'shotNumber') {
      sorted.sort((a, b) => (a.shotNumber || '').localeCompare(b.shotNumber || '', undefined, { numeric: true }));
    } else if (criteria === 'camera') {
      sorted.sort((a, b) => (a.cameraLabel || '').localeCompare(b.cameraLabel || ''));
    } else if (criteria === 'lens') {
      sorted.sort((a, b) => (a.lensMm || 0) - (b.lensMm || 0));
    } else if (criteria === 'status') {
      const statusOrder = { planned: 1, rehearsed: 2, ready: 3, taken: 4, omitted: 5 };
      sorted.sort((a, b) => (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0));
    }
    const reindexed = sorted.map((s, idx) => ({ ...s, order: idx + 1 }));
    const updatedSetup: SceneSetup = {
      ...activeSetup,
      shots: reindexed,
    };
    commitSetupState(updatedSetup);
  };

  // Derive the list of reference images (migrates legacy single-image setups).
  // Once `backgroundImages` exists (even empty), it is authoritative.
  const backgroundImages: BackgroundImage[] = Array.isArray(activeSetup.backgroundImages)
    ? activeSetup.backgroundImages
    : activeSetup.backgroundImage
    ? [{ ...activeSetup.backgroundImage, id: activeSetup.backgroundImage.id || 'bg-legacy' }]
    : [];

  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);
  const [calibratingBackgroundId, setCalibratingBackgroundId] = useState<string | null>(null);
  const startBackgroundCalibration = (id: string) => {
    setSelectedBackgroundId(id);
    setCalibratingBackgroundId(id);
    setActiveTool('select');
  };
  const cancelBackgroundCalibration = () => setCalibratingBackgroundId(null);

  const addBackgroundImage = (bg: BackgroundImage) => {
    const newBg = { ...bg, id: bg.id || `bg-${Date.now()}` };
    // Spawn at a spot that doesn't sit underneath existing elements/images,
    // so the imported image is immediately visible and clickable. Then open
    // the inspector with the image's settings (opacity, lock, visibility...).
    const freePos = findFreeSpawnPoint(
      newBg.width || 800,
      newBg.height || 600,
      backgroundImages,
      activeSetup.elements
    );
    newBg.x = freePos.x;
    newBg.y = freePos.y;
    const updatedSetup: SceneSetup = {
      ...activeSetup,
      backgroundImages: [...backgroundImages, newBg],
      backgroundImage: null,
    };
    commitSetupState(updatedSetup);
    setSelectedBackgroundId(newBg.id);
    setActiveRightTab('inspector');
  };

  const updateBackgroundImage = (id: string, updates: Partial<BackgroundImage>, recordHistory = false) => {
    const updatedSetup: SceneSetup = {
      ...activeSetup,
      backgroundImages: backgroundImages.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    };
    commitSetupState(updatedSetup, recordHistory);
  };

  const removeBackgroundImage = (id: string) => {
    const remaining = backgroundImages.filter((b) => b.id !== id);
    const updatedSetup: SceneSetup = {
      ...activeSetup,
      backgroundImages: remaining,
      backgroundImage: remaining.length === 0 ? null : activeSetup.backgroundImage,
    };
    commitSetupState(updatedSetup);
    setSelectedBackgroundId((prev) => (prev === id ? null : prev));
    setCalibratingBackgroundId((current) => (current === id ? null : current));
  };

  const rotateElementBy = (id: string, deltaDegrees: number) => {
    const el = activeSetup.elements.find((e) => e.id === id);
    if (!el) return;
    let newRotation = ((el.rotation || 0) + deltaDegrees) % 360;
    if (newRotation < 0) newRotation += 360;
    updateElement(id, { rotation: Math.round(newRotation) });
  };

  const createCameraAndShot = (pos?: Vector2D) => {
    // Always place an ADDITIONAL camera element on the floor plan (never
    // overwrite/reuse the existing one). In single-camera mode it still gets
    // the default 'A' label until the user picks another camera in the shot
    // list's CAM dropdown or renames it in the inspector.
    const spawnPos = pos ?? getNewCameraPosition();
    const camId = addElement({
      type: 'camera',
      x: spawnPos.x,
      y: spawnPos.y,
    });
    const createdCam = activeSetup.elements.find((e) => e.id === camId) as CameraElement;
    return {
      cameraId: camId,
      shotId: createdCam?.associatedShotId || '',
    };
  };

  // Setup / Project Management
  const setActiveSetupId = (setupId: string) => {
    setProject((prev) => ({ ...prev, activeSetupId: setupId }));
  };

  const addSetup = (name?: string) => {
    const nextNum = project.setups.length + 1;
    const newSetup = blankSetup(`${nextNum}`, name || `Coverage ${nextNum}`);

    setRecordedProject((prev) => ({
      ...prev,
      setups: [...prev.setups, newSetup],
      activeSetupId: newSetup.id,
    }));
  };

  const duplicateCurrentSetup = () => {
    const newId = `setup-${Date.now()}`;
    const duplicatedSetup: SceneSetup = {
      ...JSON.parse(JSON.stringify(activeSetup)),
      id: newId,
      name: `${activeSetup.name} (Copy)`,
    };

    setRecordedProject((prev) => ({
      ...prev,
      setups: [...prev.setups, duplicatedSetup],
      activeSetupId: newId,
    }));
  };

  const deleteSetup = (setupId: string) => {
    if (project.setups.length <= 1) return; // Keep at least one setup
    const remaining = project.setups.filter((s) => s.id !== setupId);
    setRecordedProject((prev) => ({
      ...prev,
      setups: remaining,
      activeSetupId: remaining[0].id,
    }));
  };

  const updateSetupMeta = (updates: Partial<SceneSetup>) => {
    const updatedSetup: SceneSetup = {
      ...activeSetup,
      ...updates,
    };
    commitSetupState(updatedSetup);
  };

  /** Switch the workspace to another project, saving nothing in flight. */
  const loadProjectIntoWorkspace = (next: Project) => {
    setProject(next);
    setActiveProjectId(next.id);
    // A fresh project starts a fresh undo timeline.
    setHistory([next]);
    setHistoryIndex(0);
    liveProjectRef.current = next;
    setSelectedElementIds([]);
    setSelectedShotId(null);
    setSelectedBackgroundId(null);
    setCalibratingBackgroundId(null);
    setActiveRightTab('shots');
    setIsDashboardOpen(false);
  };

  const openDashboard = () => setIsDashboardOpen(true);
  const closeDashboard = () => setIsDashboardOpen(false);

  const createNewProject = (options?: NewProjectOptions) => {
    const created = buildProject(options);
    writeProject(created);
    // The workspace preset is a local preference about module visibility,
    // stored outside the project document (plan §1.2, §5.7).
    if (options?.workspacePreset) {
      persistWorkspaceProfile(created.id, createWorkspaceProfile(options.workspacePreset));
    }
    setProjects(loadLibrary());
    loadProjectIntoWorkspace(created);
  };

  const openProjectById = (id: string) => {
    if (id === project.id) {
      setIsDashboardOpen(false);
      return;
    }
    const next = readProject(id);
    if (next) loadProjectIntoWorkspace(next);
  };

  const duplicateProject = (id: string) => {
    const source = id === project.id ? project : readProject(id);
    if (!source) return;
    const copy = cloneProject(source);
    writeProject(copy);
    setProjects(loadLibrary());
  };

  const renameProject = (id: string, title: string) => {
    const trimmed = title.trim() || 'Untitled project';
    if (id === project.id) {
      setProject((prev) => ({ ...prev, title: trimmed }));
      return;
    }
    const target = readProject(id);
    if (!target) return;
    writeProject({ ...target, title: trimmed });
    setProjects(loadLibrary());
  };

  const deleteProjectById = (id: string) => {
    removeProject(id);
    const remaining = loadLibrary();
    setProjects(remaining);

    // Deleting the open project drops the workspace onto the next one, or onto
    // a brand new project if that was the last one.
    if (id === project.id) {
      const next = remaining.length ? readProject(remaining[0].id) : null;
      if (next) loadProjectIntoWorkspace(next);
      else createNewProject({ title: 'Untitled project' });
    }
  };

  /**
   * Project-level metadata update. Recorded in the undo history by default so
   * schedule, mood-board, location and company edits are all Ctrl+Z-able.
   * Pass `record: false` for bookkeeping that should stay outside history.
   */
  const updateProjectMeta = (updates: Partial<Project>, record = true) => {
    setProject((prev) => {
      const next: Project = { ...prev, ...updates };
      if (record) pendingSnapshotsRef.current.push(next);
      return next;
    });
  };

  /**
   * Functional project mutation recorded in undo history. Used by every
   * content mutation that builds its next state from `prev` directly
   * (AV-script rows, setup add/duplicate/delete, cross-scene lining edits…).
   */
  const setRecordedProject = (updater: (prev: Project) => Project) => {
    setProject((prev) => {
      const next = updater(prev);
      if (next !== prev) pendingSnapshotsRef.current.push(next);
      return next;
    });
  };

  // Named revisions (plan §13.2): user-created milestones, separate from the
  // per-setup undo history. Persisted on the project so autosave keeps them.
  const revisions: ProjectRevision[] = project.revisions || [];

  const saveRevision = (name: string, note?: string) => {
    setProject((prev) => {
      const revision: ProjectRevision = {
        id: createId('rev'),
        name: name.trim() || 'Untitled revision',
        createdAt: new Date().toISOString(),
        ...(note && note.trim() ? { note: note.trim() } : {}),
        snapshot: cloneProjectForSnapshot(prev),
      };
      return { ...prev, revisions: capRevisions([...(prev.revisions || []), revision]) };
    });
  };

  const restoreRevision = (revisionId: string, projectId?: string) => {
    const targetId = projectId || project.id;

    // Restoring into a stored (non-open) project: apply and persist directly,
    // then switch the workspace to it.
    if (targetId !== project.id) {
      const stored = readProject(targetId);
      if (!stored) return;
      const revision = (stored.revisions || []).find((r) => r.id === revisionId);
      if (!revision) return;
      const restored = applyRevisionRestore(stored, revision);
      writeProject(restored);
      setProjects(loadLibrary());
      loadProjectIntoWorkspace(restored);
      return;
    }

    const revision = revisions.find((r) => r.id === revisionId);
    if (!revision) return;
    const restored = applyRevisionRestore(project, revision);

    setProject(restored);
    // The workspace content changed wholesale — selection resets and the
    // undo history restarts from the restored state.
    setSelectedElementIds([]);
    setSelectedShotId(null);
    setSelectedBackgroundId(null);
    setHistory([restored]);
    setHistoryIndex(0);
    liveProjectRef.current = restored;
  };

  /**
   * Add one of the example scenes to this project. Everything in it is re-ided
   * so loading a template twice can't collide, and the sample screenplay comes
   * with it (lined against the template's shots) unless the project already has
   * a script of its own.
   */
  const loadTemplateScene = (templateIndex: number) => {
    const template = SAMPLE_SCENES[templateIndex];
    if (!template) return;

    const newSetupId = `setup-${Date.now().toString(36)}`;
    const clone: SceneSetup = JSON.parse(JSON.stringify(template));
    const suffix = Date.now().toString(36);

    // Fresh ids, with every reference remapped
    const elementIdMap = new Map<string, string>();
    clone.elements.forEach((element) => elementIdMap.set(element.id, `${element.id}-${suffix}`));
    const shotIdMap = new Map<string, string>();
    clone.shots.forEach((shot) => shotIdMap.set(shot.id, `${shot.id}-${suffix}`));

    clone.id = newSetupId;
    clone.elements = clone.elements.map((element) => {
      const next: any = { ...element, id: elementIdMap.get(element.id)! };
      if (next.associatedShotId) next.associatedShotId = shotIdMap.get(next.associatedShotId) || next.associatedShotId;
      if (next.lookAtTargetId) next.lookAtTargetId = elementIdMap.get(next.lookAtTargetId) || next.lookAtTargetId;
      return next;
    });
    clone.shots = clone.shots.map((shot) => ({
      ...shot,
      id: shotIdMap.get(shot.id)!,
      cameraId: elementIdMap.get(shot.cameraId) || shot.cameraId,
      subjectActorIds: (shot.subjectActorIds || []).map((id) => elementIdMap.get(id) || id),
    }));

    // Decided outside the updater: React may run a state updater twice, and a
    // second parse would hand the linings line ids that aren't in the script.
    // Each template brings its own screenplay, not the combined sample text.
    const existingLines = project.scriptLines || [];
    const hasScript = existingLines.length > 0;
    // Only bring the sample screenplay in when there is nothing to overwrite
    const lines = hasScript ? existingLines : parseSampleScreenplay(templateIndex === 1 ? 'noir' : 'dialogue');
    clone.scriptMarks = sampleMarksFor(template.id, lines, clone.sceneNumber, (shotId) =>
      shotIdMap.get(shotId)
    );

    setRecordedProject((prev) => ({
      ...prev,
      scriptTitle: hasScript
        ? prev.scriptTitle
        : templateIndex === 1
          ? 'Noir interrogation sample'
          : 'Dialogue sample',
      scriptText: hasScript ? prev.scriptText : templateIndex === 1 ? SAMPLE_NOIR_SCREENPLAY : SAMPLE_DIALOGUE_SCREENPLAY,
      scriptLines: lines,
      setups: [...prev.setups, clone],
      activeSetupId: newSetupId,
    }));
  };

  const loadProjectFromJson = (newProject: Project) => {
    if (!newProject?.setups?.length) return;
    // Imports are staged through migration + structural validation before
    // anything is committed to the library (plan §3.6): partially parsed or
    // corrupt files must never replace a valid saved project.
    let candidate: Project;
    try {
      candidate = migrateProject(newProject).project;
    } catch (err) {
      alert(
        `This project file could not be migrated: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      return;
    }
    const errors = validateProject(candidate).filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      alert(
        `Import rejected — ${errors.length} structural problem${errors.length === 1 ? '' : 's'} found:\n\n` +
          errors.slice(0, 5).map((issue) => `• ${issue.message}`).join('\n') +
          (errors.length > 5 ? `\n… and ${errors.length - 5} more` : ''),
      );
      return;
    }
    // Imported files land in the library as their own project, so importing
    // never overwrites what is already saved here.
    const imported: Project = {
      ...candidate,
      id: projects.some((entry) => entry.id === candidate.id) || candidate.id === project.id
        ? newProjectId()
        : candidate.id || newProjectId(),
    };
    writeProject(imported);
    setProjects(loadLibrary());
    loadProjectIntoWorkspace(imported);
  };

  // Canvas View Controls
  const zoomIn = () => {
    const newScale = Math.min(3.0, Math.round((activeSetup.canvasScale + 0.15) * 100) / 100);
    setCanvasTransform(newScale, activeSetup.canvasOffset);
  };

  const zoomOut = () => {
    const newScale = Math.max(0.2, Math.round((activeSetup.canvasScale - 0.15) * 100) / 100);
    setCanvasTransform(newScale, activeSetup.canvasOffset);
  };

  const resetZoom = () => {
    setCanvasTransform(1, { x: 50, y: 50 });
  };

  const setCanvasScale = (scale: number) => {
    setCanvasTransform(Math.max(0.15, Math.min(4.0, scale)), activeSetup.canvasOffset);
  };

  const setCanvasOffset = (offset: Vector2D | ((prev: Vector2D) => Vector2D)) => {
    const nextOffset = typeof offset === 'function' ? offset(activeSetup.canvasOffset) : offset;
    setCanvasTransform(activeSetup.canvasScale, nextOffset);
  };

  const setCanvasTransform = (scale: number, offset: Vector2D) => {
    const updatedSetup: SceneSetup = {
      ...activeSetup,
      canvasScale: Math.max(0.15, Math.min(4.0, scale)),
      canvasOffset: offset,
    };
    // Do not record history for smooth continuous zoom & pan
    commitSetupState(updatedSetup, false);
  };

  const setGridSettings = (settings: Partial<SceneSetup['gridSettings']>) => {
    updateSetupMeta({
      gridSettings: {
        ...activeSetup.gridSettings,
        ...settings,
      },
    });
  };

  // Playback Controls
  const togglePlayback = () => {
    setIsPlaying((prev) => !prev);
  };

  const addBeat = () => {
    updateSetupMeta({ totalBeats: (activeSetup.totalBeats || 3) + 1 });
  };

  const removeBeat = () => {
    if (activeSetup.totalBeats > 2) {
      updateSetupMeta({ totalBeats: activeSetup.totalBeats - 1 });
      if (currentBeat > activeSetup.totalBeats - 1) {
        setCurrentBeat(activeSetup.totalBeats - 1);
      }
    }
  };

  // Viewfinder Modal
  const openViewfinder = (cameraId?: string) => {
    if (cameraId) {
      setViewfinderCameraId(cameraId);
    } else {
      const activeCam = activeSetup.elements.find((e) => e.type === 'camera');
      setViewfinderCameraId(activeCam ? activeCam.id : null);
    }
    setIsViewfinderOpen(true);
  };

  const closeViewfinder = () => {
    setIsViewfinderOpen(false);
  };

  const openExportModal = (section?: ExportSection) => {
    if (section) setExportSection(section);
    setIsExportModalOpen(true);
  };
  const closeExportModal = () => setIsExportModalOpen(false);

  // Equipment Management
  const addCustomEquipmentItem = (item: Omit<EquipmentItem, 'id'>) => {
    const newItem: EquipmentItem = {
      ...item,
      id: `equip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      isCustom: true,
    };
    const current = activeSetup.customEquipment || [];
    updateSetupMeta({ customEquipment: [...current, newItem] });
  };

  const updateEquipmentItem = (id: string, updates: Partial<EquipmentItem>) => {
    const current = activeSetup.customEquipment || [];
    const existingIndex = current.findIndex((c) => c.id === id || c.elementId === id);
    if (existingIndex >= 0) {
      const next = [...current];
      next[existingIndex] = { ...next[existingIndex], ...updates };
      updateSetupMeta({ customEquipment: next });
    } else {
      // Find the base item in derived equipment to preserve all auto attributes
      const allDerived = deriveSceneEquipment(activeSetup);
      const baseItem = allDerived.find((d) => d.id === id || d.elementId === id);
      const newItem: EquipmentItem = {
        id,
        elementId: id.startsWith('auto-') ? id.replace(/^auto-[a-z]+-/, '') : undefined,
        category: updates.category || baseItem?.category || 'other',
        name: updates.name !== undefined ? updates.name : (baseItem?.name || 'Equipment Item'),
        brand: updates.brand !== undefined ? updates.brand : baseItem?.brand,
        model: updates.model !== undefined ? updates.model : baseItem?.model,
        quantity: updates.quantity !== undefined ? updates.quantity : (baseItem?.quantity || 1),
        roleOrFunction: updates.roleOrFunction !== undefined ? updates.roleOrFunction : baseItem?.roleOrFunction,
        specs: updates.specs !== undefined ? updates.specs : baseItem?.specs,
        notes: updates.notes !== undefined ? updates.notes : baseItem?.notes,
        isCustom: false,
        ...updates,
      };
      updateSetupMeta({ customEquipment: [...current, newItem] });
    }
  };

  const deleteEquipmentItem = (id: string) => {
    const current = activeSetup.customEquipment || [];
    const next = current.filter((c) => c.id !== id && c.elementId !== id);
    updateSetupMeta({ customEquipment: next });
  };

  const resetSceneEquipment = () => {
    updateSetupMeta({ customEquipment: [] });
  };

  const addPackageItem = (packageId: string, item: Omit<EquipmentPackageItem, 'id'>) => {
    const allDerived = deriveSceneEquipment(activeSetup);
    const baseItem = allDerived.find((d) => d.id === packageId || d.elementId === packageId);
    const existingCustom = (activeSetup.customEquipment || []).find((c) => c.id === packageId || c.elementId === packageId);

    const existingPackageItems = existingCustom?.packageItems || baseItem?.packageItems || [];
    const newSubItem: EquipmentPackageItem = {
      ...item,
      id: `pkg-item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    };

    updateEquipmentItem(packageId, {
      isPackage: true,
      packageItems: [...existingPackageItems, newSubItem],
    });
  };

  const updatePackageItem = (
    packageId: string,
    itemId: string,
    updates: Partial<EquipmentPackageItem>
  ) => {
    const allDerived = deriveSceneEquipment(activeSetup);
    const baseItem = allDerived.find((d) => d.id === packageId || d.elementId === packageId);
    const existingCustom = (activeSetup.customEquipment || []).find((c) => c.id === packageId || c.elementId === packageId);

    const existingPackageItems = existingCustom?.packageItems || baseItem?.packageItems || [];
    const nextPackageItems = existingPackageItems.map((p) => (p.id === itemId ? { ...p, ...updates } : p));

    updateEquipmentItem(packageId, {
      isPackage: true,
      packageItems: nextPackageItems,
    });
  };

  const deletePackageItem = (packageId: string, itemId: string) => {
    const allDerived = deriveSceneEquipment(activeSetup);
    const baseItem = allDerived.find((d) => d.id === packageId || d.elementId === packageId);
    const existingCustom = (activeSetup.customEquipment || []).find((c) => c.id === packageId || c.elementId === packageId);

    const existingPackageItems = existingCustom?.packageItems || baseItem?.packageItems || [];
    const nextPackageItems = existingPackageItems.filter((p) => p.id !== itemId);

    updateEquipmentItem(packageId, {
      isPackage: true,
      packageItems: nextPackageItems,
    });
  };

  return (
    <FloorPlanContext.Provider
      value={{
        project,
        activeSetup,
        selectedElementIds,
        selectedShotId,
        highlightedElementId,
        activeTool,
        activePropSubtype,
        activeLightFixture,
        activeCameraRig,
        historyIndex,
        historyLength: history.length,
        playback: {
          isPlaying,
          currentBeat,
          totalBeats: activeSetup.totalBeats || 3,
          speed: playbackSpeed,
          isLooping,
        },
        isViewfinderOpen,
        viewfinderCameraId,
        isExportModalOpen,
        exportSection,
        setExportSection,
        theme,

        activeRightTab,
        setActiveRightTab,
        workspaceProfile,
        isModuleVisible,
        setModuleVisible,

        addCustomEquipmentItem,
        updateEquipmentItem,
        deleteEquipmentItem,
        resetSceneEquipment,
        addPackageItem,
        updatePackageItem,
        deletePackageItem,

        toggleTheme,
        setTheme,
        setTool: setActiveTool,
        setPropSubtype: setActivePropSubtype,
        setLightFixture: setActiveLightFixture,
        setCameraRig: setActiveCameraRig,
        activeShapeType,
        setShapeType: setActiveShapeType,
        activeCableType,
        setCableType: setActiveCableType,
        quickSearchOpen,
        setQuickSearchOpen,
        selectElement,
        selectElements,
        clearSelection,
        selectShot,
        setHighlightedElement: setHighlightedElementId,

        addElement,
        quickAddElement,
        updateElement,
        updateMultipleElements,
        deleteSelectedElements,
        deleteElementById,
        duplicateSelected,
        copySelectedElements,
        pasteElements,
        setShootMode,
        insertDoorInWall,
        insertWindowInWall,
        groupSelection,
        ungroupSelection,
        getCanvasCenterPosition,

        addShot,
        insertShotAfter,
        scriptLines,
        scriptTitle: project.scriptTitle,
        allScriptMarks,
        allShots,
        setupIdForMark,
        createShotFromScriptRange,
        linkShotToScriptRange,
        scriptLinkShotId,
        startScriptLinking,
        cancelScriptLinking,
        updateScriptMark,
        setLiningDescription,
        deleteScriptMark,
        setScriptLines,
        avScriptRows,
        setAVScriptRows,
        updateAVScriptRow,
        addAVScriptRow,
        deleteAVScriptRow,
        scriptFormatMode,
        setScriptFormatMode,
        syncAVRowToShot,
        updateShot,
        deleteShot,
        reorderShots,
        setStoryboardOrder,
        moveShot,
        moveShotToScene,
        renumberAllShots,
        sortShotsBy,
        createCameraAndShot,
        createCameraOnly,
        createCameraForShot,
        setShotCameraLetter,
        assignCameraToShot,
        addCameraForShot,

        backgroundImages,
        selectedBackgroundId,
        addBackgroundImage,
        updateBackgroundImage,
        removeBackgroundImage,
        setSelectedBackgroundId,
        calibratingBackgroundId,
        startBackgroundCalibration,
        cancelBackgroundCalibration,
        rotateElementBy,

        setActiveSetupId,
        addSetup,
        duplicateCurrentSetup,
        deleteSetup,
        updateSetupMeta,
        updateProjectMeta,
        revisions,
        saveRevision,
        restoreRevision,
        projects,
        activeProjectId: project.id,
        isDashboardOpen,
        openDashboard,
        closeDashboard,
        createNewProject,
        openProjectById,
        duplicateProject,
        renameProject,
        deleteProjectById,
        loadTemplateScene,
        loadProjectFromJson,

        undo,
        redo,
        commitCurrentState,

        zoomIn,
        zoomOut,
        resetZoom,
        setCanvasScale,
        setCanvasOffset,
        setCanvasTransform,
        setCanvasViewport,
        setGridSettings,

        togglePlayback,
        setCurrentBeat,
        setPlaybackSpeed,
        setIsLooping,
        addBeat,
        removeBeat,

        openViewfinder,
        closeViewfinder,
        setViewfinderCameraId,
        openExportModal,
        closeExportModal,

        displaySettings,
        updateDisplaySettings,
        storageWarning,
        dismissStorageWarning,
      }}
    >
      {children}
    </FloorPlanContext.Provider>
  );
};

export const useFloorPlan = () => {
  const context = useContext(FloorPlanContext);
  if (!context) {
    throw new Error('useFloorPlan must be used within a FloorPlanProvider');
  }
  return context;
};
