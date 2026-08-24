import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActiveTool,
  BackgroundImage,
  IdentifiedBackgroundImage,
  CableElement,
  ActorElement,
  CableType,
  CameraElement,
  CameraRigType,
  ElementPatch,
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
import { nextActorLetter, nextCameraLabel } from '../domain/plan/cameraLabels';
import { endpointsOf, hasEndpoints, hasSize } from '../domain/plan/elementGuards';
import { buildShotForSetup } from '../domain/shots/createShot';
import { insertedShotNumber, takenShotNumbers } from '../domain/shots/numbering';
import { useStableContextValue } from './stableContextValue';
import { deriveScriptBreakdown, scriptScenesHaveDriftedIds } from '../domain/script/logic';
import { hasProductionSceneNumbers, normaliseSceneNumbers } from '../domain/script/numbering';
import { rowsAfterShotRemoval } from '../domain/script';

/**
 * Every shot in a project, flattened across setups — what an AV row's number
 * is resolved against. Read from a `prev` snapshot so it is correct inside a
 * state updater rather than one render behind.
 */
const allShotsOf = (project: Project): Shot[] => project.setups.flatMap((setup) => setup.shots || []);
import type { ScreenplayTitlePage } from '../domain/script';
import { removeSetupReferences, removeShotReferences } from '../domain/integrity';
import { applyMediaReplacements, migrateProjectMedia } from '../utils/projectMedia';
import {
  ACTOR_COLOR_PALETTE,
  CAMERA_COLOR_PALETTE,
  CABLE_TYPES,
  LIGHT_FIXTURES,
  PROP_CATALOG,
  SAMPLE_DIALOGUE_SCREENPLAY,
  SAMPLE_NOIR_SCREENPLAY,
  SAMPLE_SCENES,
} from '../constants/presets';
import { calculateFovAngle } from '../utils/geometry';
import { buildExampleProductionFill, parseSampleScreenplay, sampleMarksFor } from '../utils/sampleContent';
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
import { deriveSceneEquipment } from '../utils/equipmentList';
import { migrateProject } from '../domain/migrations';
import { cloneSetupWithNewIds } from '../domain/clone';
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
export type ExportSection = 'floorplan' | 'shotlist' | 'storyboard' | 'linedscript' | 'avscript' | 'sides' | 'scriptreports' | 'equipment' | 'dmx' | 'power' | 'rigging' | 'logistics' | 'runofshow' | 'continuity' | 'camerareport' | 'soundreport' | 'dailyprogress' | 'moodboard' | 'crew' | 'combined';

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
  activeRightTab: 'shots' | 'storyboard' | 'script' | 'equipment' | 'schedule' | 'moodboard' | 'locations' | 'power' | 'logistics' | 'run_of_show' | 'continuity' | 'rigging' | 'contacts' | 'tasks' | 'budget' | 'inspector';
  setActiveRightTab: (tab: 'shots' | 'storyboard' | 'script' | 'equipment' | 'schedule' | 'moodboard' | 'locations' | 'power' | 'logistics' | 'run_of_show' | 'continuity' | 'rigging' | 'contacts' | 'tasks' | 'budget' | 'inspector') => void;
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
  updateElement: (id: string, updates: ElementPatch, recordHistory?: boolean) => void;
  updateMultipleElements: (updates: { id: string; updates: ElementPatch }[], recordHistory?: boolean) => void;
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
  setScriptLines: (lines: ScriptLine[], meta?: { scriptTitle?: string; scriptText?: string; titlePage?: ScreenplayTitlePage }) => void;
  /** Edit the screenplay's cover; merges, so one field at a time is fine. */
  setTitlePage: (updates: Partial<ScreenplayTitlePage>) => void;
  /** Lock the current numbers as production numbers, or return to numbering by position. */
  setSceneNumbersLocked: (locked: boolean) => void;
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
  backgroundImages: IdentifiedBackgroundImage[];
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
  updateSetupMeta: (updates: Partial<SceneSetup>, recordHistory?: boolean) => void;
  /**
   * Patch project-level fields. Pass a function to build the patch from the
   * LATEST state — required after an `await`, where the render-time `project`
   * is already stale and a plain object patch would discard whatever the user
   * changed while the request was in flight.
   */
  /**
   * `record` defaults to true. Pass false for the intermediate steps of a live
   * gesture and true once on release, so a drag is one undo step rather than
   * one per pointer move — the implementation has always taken this, but the
   * type hid it, so callers could not use it.
   */
  updateProjectMeta: (
    updates: Partial<Project> | ((prev: Project) => Partial<Project>),
    record?: boolean,
  ) => void;
  /**
   * Fill the modules that are still empty with the bundled example production.
   * Strictly additive — anything the user already has is untouched. Returns the
   * names of what was filled so the caller can confirm it.
   */
  loadExampleProductionData: () => string[];

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
      // An element's far corner is its second endpoint when it has one, and
      // its box otherwise. Guards rather than casts so a malformed x2 — null or
      // NaN from an import — falls back to the box instead of producing NaN
      // bounds, which compare false against everything and would silently
      // report occupied space as free.
      const ex = el.x ?? 0;
      const ey = el.y ?? 0;
      const ex2 = hasEndpoints(el) ? el.x2 : ex + (hasSize(el) ? el.width : 80);
      const ey2 = hasEndpoints(el) ? el.y2 : ey + (hasSize(el) ? el.height : 60);
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
/**
 * Shared empty arrays for the "absent" case of optional project collections.
 *
 * These land on the context value, which is compared field by field to decide
 * whether consumers need to re-render. A fresh `[]` per render is never equal
 * to the last one, so a single `|| []` is enough to re-render the whole
 * application on every keystroke — and the absent case is the DEFAULT for a
 * new project, so it would be the common path, not an edge case.
 */
const NO_SCRIPT_LINES: ScriptLine[] = [];
const NO_REVISIONS: ProjectRevision[] = [];

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
  const [project, setProjectState] = useState<Project>(() => {
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

    // The first-run project is a normal sample project, built by the one
    // factory that knows about every module's example data. It used to be
    // hand-rolled here with only the scenes and the screenplay, which is why
    // the very first project a user ever opened had an empty schedule, crew
    // list, locations, tasks, rig and power plan while a project created from
    // the dashboard had all of them.
    return buildProject({
      title: 'Short Film Floor Plan & Shot List',
      withSampleScenes: true,
    });
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
  const [activeRightTab, setActiveRightTab] = useState<'shots' | 'storyboard' | 'script' | 'equipment' | 'schedule' | 'moodboard' | 'locations' | 'power' | 'logistics' | 'run_of_show' | 'continuity' | 'rigging' | 'contacts' | 'tasks' | 'budget' | 'inspector'>('shots');
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
      continuity: 'continuity',
      moodboard: 'moodboard',
      locations: 'locations',
      contacts: 'contacts',
      tasks: 'tasks',
      budget: 'budget',
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

  /**
   * Every project write goes through here, so `liveProjectRef` can never fall
   * behind the committed project.
   *
   * It matters because `commitCurrentState` — the drag-release path — records
   * whatever this ref holds. The ref used to be written only by
   * `commitSetupUpdate` and by an effect that runs after the render, which
   * left a window after an undo, a scene switch or any non-setup edit where
   * releasing a drag would record a project from before it and silently
   * revert the edit. Wrapping the setter closes that by construction rather
   * than by remembering to update the ref at each of the dozen call sites,
   * which is the mistake the old `liveSetupRef` made.
   */
  const setProject = useCallback((value: Project | ((prev: Project) => Project)) => {
    setProjectState((prev) => {
      const next = typeof value === 'function' ? (value as (p: Project) => Project)(prev) : value;
      liveProjectRef.current = next;
      return next;
    });
  }, []);

  // Stable, like `setProject`: both only ever touch the state setter and refs,
  // so an effect that writes the project does not have to re-subscribe on
  // every render just to list them as dependencies.
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

  /**
   * Commit a change to the ACTIVE setup computed from the latest committed
   * project state rather than from the render-time `activeSetup`.
   *
   * This is the difference between one write and two surviving: a handler that
   * calls two setup mutations in the same render would otherwise have the
   * second rebuild the whole setup from the stale render snapshot and silently
   * discard the first. Returning `null` from the updater means "nothing to do"
   * and leaves the project untouched.
   */
  const commitSetupUpdate = (
    updater: (prevSetup: SceneSetup) => SceneSetup | null,
    recordHistory = true,
  ) => {
    setProject((prev) => {
      const currentSetup =
        prev.setups.find((s) => s.id === prev.activeSetupId) || prev.setups[0];
      if (!currentSetup) return prev;
      const nextSetup = updater(currentSetup);
      if (!nextSetup || nextSetup === currentSetup) return prev;
      const next: Project = {
        ...prev,
        setups: prev.setups.map((s) => (s.id === nextSetup.id ? nextSetup : s)),
      };
      // `liveProjectRef` is kept in step by `setProject` itself, so a drag
      // released before React re-renders still records what the canvas shows.
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
    const id = createId(`el-${partial.type}`);
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
      // First free letter, not a count: with actors A and C on the plan (B
      // deleted) a count of 2 proposes C, and two markers claiming to be the
      // same character defeats the point of lettering them.
      const existingActors = activeSetup.elements.filter(
        (element): element is ActorElement => element.type === 'actor',
      );
      const letterCode = nextActorLetter(existingActors);
      const color = ACTOR_COLOR_PALETTE[existingActors.length % ACTOR_COLOR_PALETTE.length];

      newElement = {
        ...baseDefaults,
        name: partial.name || `CHARACTER ${letterCode}`,
        characterLetter: letterCode,
        color,
        isStanding: true,
        path: [],
        speechCues: [],
        ...partial,
        type: 'actor',
      };
    } else if (partial.type === 'camera') {
      // A camera on the plan is a shot: the two are created together, by the
      // same builder every other shot path uses. Everything derived — the shot
      // number, the camera letter and colour — is resolved INSIDE the updater
      // against the committed setup, so two cameras added in one batch cannot
      // both claim the same letter. This branch used to compute all of it from
      // the render closure.
      const shotId = (partial as Partial<CameraElement>).associatedShotId || newShotId();
      let createdShot: Shot | undefined;

      commitSetupUpdate((prevSetup) => {
        const built = buildShotForSetup({
          setup: prevSetup,
          shotId,
          cameraId: id,
          cameraColors: CAMERA_COLOR_PALETTE,
          // Placing a camera on the plan is the act of adding one, so it never
          // reuses a neighbour's even in single-camera mode.
          forceNewCamera: true,
          shotName: ({ shotNumber, cameraName }) => `Shot ${shotNumber} - ${cameraName ?? 'Camera'}`,
          shotData: {
            cameraId: '',
            shotSize: 'MS',
            framingDescription: 'Framed on subject',
            estDurationSeconds: 15,
            lensMm: partial.focalLength || 35,
          },
          cameraOverrides: {
            ...baseDefaults,
            sensorFormat: partial.sensorFormat || 'Super35',
            rigType: activeCameraRig,
            throwDistance: 280,
            cameraModel: 'Cinema Camera',
            ...partial,
          } as Partial<CameraElement>,
        });
        createdShot = built.shot;

        return {
          ...prevSetup,
          elements: built.camera ? [...prevSetup.elements, built.camera] : prevSetup.elements,
          shots: [...prevSetup.shots, built.shot],
        };
      });

      // Queued after the setup commit so it can read the number the builder
      // resolved; the updater below runs at flush time, by which point
      // `createdShot` is filled in.
      setRecordedProject((prev) => ({
        ...prev,
        avScriptRows: [
          ...(prev.avScriptRows || avScriptRows),
          {
            id: `av-${shotId}`,
            shotNumber: createdShot?.shotNumber ?? '',
            shotName: createdShot?.name ?? '',
            shotSize: createdShot?.shotSize ?? 'MS',
            video: createdShot?.framingDescription || 'Framed on subject',
            audio: createdShot?.actionScriptNotes || '',
            durationSec: createdShot?.estDurationSeconds || 15,
            linkedShotId: shotId,
          } as AVScriptRow,
        ],
      }));

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
        type: 'light',
      };
    } else if (partial.type === 'shape') {
      const requested = (partial as Partial<ShapeElement>).shapeType || activeShapeType;
      newElement = {
        ...baseDefaults,
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
        type: 'shape',
      } as ShapeElement;
    } else if (partial.type === 'wall') {
      newElement = {
        ...baseDefaults,
        name: partial.name || 'Wall',
        x2: partial.x2 ?? (baseDefaults.x + 200),
        y2: partial.y2 ?? baseDefaults.y,
        thickness: 12,
        ...partial,
        type: 'wall',
      };
    } else if (partial.type === 'door') {
      newElement = {
        ...baseDefaults,
        name: partial.name || 'Door',
        width: 60,
        swingAngle: 90,
        swingDirection: 'left',
        ...partial,
        type: 'door',
      };
    } else if (partial.type === 'window') {
      newElement = {
        ...baseDefaults,
        name: partial.name || 'Window',
        width: 100,
        depth: 12,
        beamVisible: false,
        ...partial,
        type: 'window',
      };
    } else if (partial.type === 'prop') {
      const requestedProp = (partial as Partial<PropElement>).propType;
      const propInfo =
        PROP_CATALOG.find((p) => p.type === (requestedProp ?? activePropSubtype)) || PROP_CATALOG[0];
      newElement = {
        ...baseDefaults,
        name: partial.name || propInfo.name,
        propType: activePropSubtype,
        width: propInfo.defaultWidth,
        height: propInfo.defaultHeight,
        color: propInfo.defaultColor,
        ...partial,
        type: 'prop',
      };
    } else if (partial.type === 'track') {
      newElement = {
        ...baseDefaults,
        name: partial.name || 'Dolly Track',
        x2: baseDefaults.x + 240,
        y2: baseDefaults.y,
        ...partial,
        type: 'track',
      };
    } else if (partial.type === 'road') {
      newElement = {
        ...baseDefaults,
        name: partial.name || 'Street',
        x2: baseDefaults.x + 320,
        y2: baseDefaults.y,
        width: 120,
        surface: 'asphalt',
        marking: 'dashed',
        lanes: 2,
        sidewalks: true,
        ...partial,
        type: 'road',
      };
    } else if (partial.type === 'measurement') {
      newElement = {
        ...baseDefaults,
        name: 'Measure Tape',
        x2: baseDefaults.x + 150,
        y2: baseDefaults.y,
        unit: activeSetup.gridSettings.unit,
        ...partial,
        type: 'measurement',
      };
    } else if (partial.type === 'arrow') {
      newElement = {
        ...baseDefaults,
        name: 'Arrow',
        x2: baseDefaults.x + 150,
        y2: baseDefaults.y,
        color: '#f97316',
        strokeWidth: 2.5,
        headStyle: 'single',
        dashStyle: 'solid',
        ...partial,
        type: 'arrow',
      };
    } else if (partial.type === 'cable') {
      const requestedCable = (partial as Partial<CableElement>).cableType;
      const cableInfo = CABLE_TYPES.find((c) => c.type === (requestedCable ?? activeCableType)) || CABLE_TYPES[0];
      newElement = {
        ...baseDefaults,
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
        type: 'cable',
      };
    } else if (partial.type === 'stroke') {
      newElement = {
        ...baseDefaults,
        name: partial.name || 'Annotation',
        points: [],
        color: '#f59e0b',
        strokeWidth: 3,
        toolStyle: 'pen',
        ...partial,
        type: 'stroke',
      } as StrokeElement;
    } else {
      newElement = {
        ...baseDefaults,
        name: 'Text Label',
        text: 'Director Notes',
        fontSize: 16,
        color: '#94a3b8',
        ...partial,
        type: 'text',
      } as FloorPlanElement;
    }

    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, newElement],
    }));
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

    // A two-point element placed from the search palette has no drag to give
    // it a length, so it gets a default horizontal run. Typed as the partial
    // shape rather than cast: `as any` here would also silence a typo in the
    // field names, and a wall with no x2 renders as a zero-length nub.
    const linear: ReadonlySet<FloorPlanElement['type']> = new Set([
      'wall',
      'track',
      'road',
      'measurement',
      'arrow',
      'cable',
    ]);
    const endpoints = full as Partial<{ x2: number; y2: number }>;
    if (linear.has(partial.type) && endpoints.x2 === undefined) {
      endpoints.x2 = pos.x + 240;
      endpoints.y2 = pos.y;
    }

    const id = addElement(full);
    setActiveTool('select');
    return id;
  };

  const updateElement = (id: string, updates: ElementPatch, recordHistory = true) => {
    // Built from the latest committed setup (see commitSetupUpdate) so two
    // element updates in the same render both land.
    commitSetupUpdate((activeSetup) => {
      const el = activeSetup.elements.find((e) => e.id === id);
      if (!el) return null;

      // If updating a camera's focal length or sensor format, re-calculate FOV and update linked shot
      let extraUpdates: ElementPatch = {};
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

      return {
        ...activeSetup,
        elements: updatedElements,
        shots: updatedShots,
      } satisfies SceneSetup;
    }, recordHistory);
  };

  const updateMultipleElements = (
    updatesList: { id: string; updates: ElementPatch }[],
    recordHistory = true
  ) => {
    const updateMap = new Map(updatesList.map((u) => [u.id, u.updates]));
    commitSetupUpdate(
      (activeSetup) => ({
        ...activeSetup,
        elements: activeSetup.elements.map((e) => {
          const u = updateMap.get(e.id);
          return u ? ({ ...e, ...u } as FloorPlanElement) : e;
        }),
      }),
      recordHistory,
    );
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
    // If it's a camera, its shots go with it — and so do their linings, so the
    // lined script never keeps a stroke for a shot that no longer exists.
    const removedShotIds = new Set(
      activeSetup.shots.filter((s) => s.cameraId === id).map((s) => s.id)
    );
    const updatedShots = activeSetup.shots.filter((s) => s.cameraId !== id);

    setSelectedElementIds((prev) => prev.filter((i) => i !== id));
    if (selectedShotId && !updatedShots.find((s) => s.id === selectedShotId)) {
      setSelectedShotId(null);
    }
    if (removedShotIds.size > 0) {
      setRecordedProject((prev) => {
        // Deleting a camera takes its shots, and their schedule strips and
        // lined script lines have to go with them — the same cleanup
        // `deleteShot` does for one shot.
        const cleaned = removeShotReferences(
          {
            scheduleBlocks: prev.scheduleBlocks,
            productionDays: prev.productionDays,
            scriptLines: prev.scriptLines,
            takes: prev.takes,
          },
          [...removedShotIds],
        );
        return {
          ...prev,
          ...cleaned,
          // A row nobody wrote in goes with its shot; one carrying video or
          // audio copy survives, unlinked, with its number frozen. Deleting a
          // camera from a floor plan is not a reason to destroy written copy.
          avScriptRows: rowsAfterShotRemoval(prev.avScriptRows || [], removedShotIds, allShotsOf(prev)),
        };
      });
    }
    // Derived from the committed setup, not the render-time one: an element
    // added or moved earlier in the same render would otherwise be resurrected
    // by writing back a whole setup built before it existed.
    commitSetupUpdate((prevSetup) => {
      const shotsGone = new Set(
        prevSetup.shots.filter((s) => s.cameraId === id).map((s) => s.id),
      );
      return {
        ...prevSetup,
        elements: prevSetup.elements.filter((e) => e.id !== id),
        shots: prevSetup.shots.filter((s) => s.cameraId !== id),
        scriptMarks: (prevSetup.scriptMarks || []).filter((mark) => !shotsGone.has(mark.shotId)),
        groups: pruneGroups(prevSetup.groups, new Set([id])),
      };
    });
  };

  const deleteSelectedElements = () => {
    if (selectedElementIds.length === 0) return;
    // Locked elements can never be deleted while locked.
    const idsToDelete = selectedElementIds.filter(
      (id) => !activeSetup.elements.find((e) => e.id === id)?.locked
    );
    if (idsToDelete.length === 0) return;
    const idsSet = new Set(idsToDelete);
    const removedShotIds = new Set(
      activeSetup.shots.filter((s) => idsSet.has(s.cameraId)).map((s) => s.id)
    );
    setSelectedElementIds([]);
    setSelectedShotId(null);
    if (removedShotIds.size > 0) {
      setRecordedProject((prev) => {
        // Same cleanup as the single-element path: shots taken by a deleted
        // camera lose their schedule strips and lined script lines too.
        const cleaned = removeShotReferences(
          {
            scheduleBlocks: prev.scheduleBlocks,
            productionDays: prev.productionDays,
            scriptLines: prev.scriptLines,
            takes: prev.takes,
          },
          [...removedShotIds],
        );
        return {
          ...prev,
          ...cleaned,
          // A row nobody wrote in goes with its shot; one carrying video or
          // audio copy survives, unlinked, with its number frozen. Deleting a
          // camera from a floor plan is not a reason to destroy written copy.
          avScriptRows: rowsAfterShotRemoval(prev.avScriptRows || [], removedShotIds, allShotsOf(prev)),
        };
      });
    }
    commitSetupUpdate((prevSetup) => {
      const shotsGone = new Set(
        prevSetup.shots.filter((s) => idsSet.has(s.cameraId)).map((s) => s.id),
      );
      return {
        ...prevSetup,
        elements: prevSetup.elements.filter((e) => !idsSet.has(e.id)),
        shots: prevSetup.shots.filter((s) => !idsSet.has(s.cameraId)),
        scriptMarks: (prevSetup.scriptMarks || []).filter((mark) => !shotsGone.has(mark.shotId)),
        groups: pruneGroups(prevSetup.groups, idsSet),
      };
    });
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

    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, ...newElements],
      groups:
        duplicatedGroups.length > 0
          ? [...(prevSetup.groups || []), ...duplicatedGroups]
          : prevSetup.groups,
    }));
    setSelectedElementIds(newSelectedIds);
  };

  // Clipboard for Ctrl+C / Ctrl+V copy & paste of selected assets.
  const clipboardRef = useRef<FloorPlanElement[]>([]);
  const pasteOffsetRef = useRef(30);

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
    // The shots the paste adds, in paste order. Their `order` and shot number
    // depend on how many shots the scene already has, which is only known
    // against the committed setup — so they are numbered inside the updater
    // below rather than here.
    const pastedShots: Shot[] = [];

    clipboardRef.current.forEach((el) => {
      // `Date.now()` plus four random characters collides when two elements are
      // pasted inside the same millisecond, which breaks React keys and drag
      // targeting alike (rule 16).
      const newId = createId(`el-${el.type}`);
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
          pastedShots.push({
            ...linkedShot,
            id: copiedShotId,
            cameraId: newId,
            cameraLabel: cam.cameraLabel,
            name: `${linkedShot.name} (Copy)`,
            // Placeholders; numbered against the committed setup below.
            shotNumber: linkedShot.shotNumber,
            order: linkedShot.order,
          });
        }
      }

      newElements.push(pasted);
      newSelectedIds.push(newId);
    });

    pasteOffsetRef.current += 30;

    // Built against the committed setup, not the render-time one: the shot
    // list used to be rebuilt from a snapshot taken before the paste, so two
    // pastes in the same render kept only the second one's shots — and the
    // copies were numbered from a shot count that was already out of date.
    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, ...newElements],
      shots: [
        ...prevSetup.shots,
        ...pastedShots.map((shot, index) => {
          const order = prevSetup.shots.length + index + 1;
          return { ...shot, order, shotNumber: `${prevSetup.sceneNumber || '1'}/${order}` };
        }),
      ],
    }));
    setSelectedElementIds(newSelectedIds);
  };

  // Push the current live canvas state into history. Drags update the project
  // live (recordHistory=false) and call this ONCE on release, so a single
  // drag/move/rotate is exactly one undoable operation. Uses the latest
  // project ref so the snapshot includes every live drag update.
  const commitCurrentState = () => {
    recordProjectSnapshot(liveProjectRef.current ?? project, history, historyIndex);
  };

  const insertDoorInWall = (wallId: string): string | null => {
    const wall = activeSetup.elements.find((e) => e.id === wallId && e.type === 'wall');
    if (!wall) return null;

    const w1 = { x: wall.x, y: wall.y };
    // 200 is this path's own default run length for a wall with no endpoint.
    const { x2: wallX2, y2: wallY2 } = endpointsOf(wall, 200);
    const w2 = { x: wallX2, y: wallY2 };
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
    });

    setSelectedElementIds([doorId]);
    return doorId;
  };

  const insertWindowInWall = (wallId: string): string | null => {
    const wall = activeSetup.elements.find((e) => e.id === wallId && e.type === 'wall');
    if (!wall) return null;

    const w1 = { x: wall.x, y: wall.y };
    // 200 is this path's own default run length for a wall with no endpoint.
    const { x2: wallX2, y2: wallY2 } = endpointsOf(wall, 200);
    const w2 = { x: wallX2, y: wallY2 };
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
    });

    setSelectedElementIds([windowId]);
    return windowId;
  };

  // Shot CRUD Operations
  const setShootMode = (mode: 'single_cam' | 'multi_cam') => {
    commitSetupUpdate((prevSetup) => ({ ...prevSetup, shootMode: mode }));
  };

  /**
   * Create a shot on the active setup, with a camera when one is needed.
   *
   * Everything derived — the shot number, the camera letter, colour, position
   * and lens — is computed by `buildShotForSetup` INSIDE the state updater,
   * against the committed setup. That placement is the point: computed out
   * here, from the render closure, two calls in the same batch both read the
   * pre-batch setup and both claim the same number and the same letter. The
   * number half of that was fixed once already; the letter half was not, and
   * the letter reaches the Camera # column of the Resolve export.
   *
   * Ids are minted here so the action can return them synchronously.
   */
  const addShot = (shotData?: Partial<Shot>): string => {
    const id = newShotId();
    const cameraId = createId('cam');
    let createdCameraId = '';

    commitSetupUpdate((prevSetup) => {
      const { shot, camera } = buildShotForSetup({
        setup: prevSetup,
        shotId: id,
        cameraId,
        shotData,
        cameraColors: CAMERA_COLOR_PALETTE,
      });
      createdCameraId = shot.cameraId;

      return {
        ...prevSetup,
        elements: camera ? [...prevSetup.elements, camera] : prevSetup.elements,
        shots: [...prevSetup.shots, shot],
        scriptLines: shotData?.scriptLineId
          ? (prevSetup.scriptLines || []).map((line) =>
              line.id === shotData.scriptLineId ? { ...line, linkedShotId: id } : line,
            )
          : prevSetup.scriptLines,
      };
    });

    setSelectedShotId(id);
    if (createdCameraId) {
      setSelectedElementIds([createdCameraId]);
    }
    return id;
  };

  /**
   * Insert a shot directly after another.
   *
   * The number comes from `insertedShotNumber`, the same letter algebra locked
   * scene numbers use: after `1/1` comes `1/1A`, and one squeezed between
   * `1/1A` and `1/2` becomes `1/1B`. This had its own copy of that rule — a
   * third implementation, and the only one that could not see what numbers
   * were already taken, so it could hand out a duplicate. Everything is
   * resolved inside the updater against the committed shot list.
   *
   * An inserted shot always gets its own camera element: it is a new setup on
   * the floor plan, not a second use of a neighbour's camera.
   */
  const insertShotAfter = (afterShotId: string, options?: { renumberRest?: boolean }): string => {
    const shotId = newShotId();
    const cameraId = createId('cam');
    let createdCameraId = '';

    commitSetupUpdate((prevSetup) => {
      const shots = [...prevSetup.shots];
      const afterIndex = shots.findIndex((shot) => shot.id === afterShotId);
      const insertAt = afterIndex !== -1 ? afterIndex + 1 : shots.length;

      const shotNumber = insertedShotNumber(
        shots[insertAt - 1]?.shotNumber,
        shots[insertAt]?.shotNumber,
        takenShotNumbers(shots),
        prevSetup.sceneNumber,
      );

      const { shot, camera } = buildShotForSetup({
        setup: prevSetup,
        shotId,
        cameraId,
        cameraColors: CAMERA_COLOR_PALETTE,
        cameraPosition: getNewCameraPosition(),
        // An insert is its own setup on the floor plan, so it always gets its
        // own camera rather than sharing the neighbour's.
        forceNewCamera: true,
        shotData: {
          shotNumber,
          name: `Shot ${shotNumber} - Insert Coverage`,
          // An insert is a detail by default: tighter, longer lens, shorter.
          shotSize: 'CU',
          lensMm: 50,
          estDurationSeconds: 15,
          order: insertAt + 1,
        },
      });
      createdCameraId = shot.cameraId;

      shots.splice(insertAt, 0, shot);
      const renumbered = options?.renumberRest
        ? shots.map((entry, index) => ({
            ...entry,
            shotNumber: `${prevSetup.sceneNumber || '1'}/${index + 1}`,
            order: index + 1,
          }))
        : shots.map((entry, index) => ({ ...entry, order: index + 1 }));

      return {
        ...prevSetup,
        elements: camera ? [...prevSetup.elements, camera] : prevSetup.elements,
        shots: renumbered,
      };
    });

    setSelectedShotId(shotId);
    if (createdCameraId) setSelectedElementIds([createdCameraId]);
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
  // Memoised, and the empty case is a shared constant. A bare `|| []` here
  // allocates a new array on every render, and because the context value is
  // compared field by field that one field is enough to re-render all fifty-odd
  // consumers on every keystroke — for every project that has no screenplay,
  // which is most of them.
  const scriptLines: ScriptLine[] = useMemo(
    () => project.scriptLines || activeSetup.scriptLines || NO_SCRIPT_LINES,
    [project.scriptLines, activeSetup.scriptLines],
  );

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
  }, [project.scriptLines, project.setups, setRecordedProject]);

  // Memoised so the context value keeps its identity across renders that did
  // not touch the setups. A fresh array here would make every consumer of the
  // context re-render on every keystroke, however unrelated.
  const allScriptMarks: ScriptMark[] = useMemo(
    () => project.setups.flatMap((setup) => setup.scriptMarks || []),
    [project.setups],
  );
  const allShots: Shot[] = useMemo(
    () => project.setups.flatMap((setup) => setup.shots),
    [project.setups],
  );
  const setupIdForMark = (markId: string): string | null =>
    project.setups.find((setup) => (setup.scriptMarks || []).some((mark) => mark.id === markId))?.id || null;

  /**
   * Apply an update to whichever setup owns a lining. Edits to the scene the
   * user is looking at go through history; edits to another scene's lining are
   * written straight to the project.
   */
  const commitSetupById = (setupId: string, updater: (setup: SceneSetup) => SceneSetup) => {
    if (setupId === activeSetup.id) {
      commitSetupUpdate((prevSetup) => updater(prevSetup));
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
    const camLetter = isMultiCam ? nextCameraLabel(existingCameras) : 'A';
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

    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, newCamera],
      shots: [...prevSetup.shots, newShot],
      scriptMarks: [...(prevSetup.scriptMarks || []), mark],
    }));
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
  const setScriptLines = (lines: ScriptLine[], meta?: { scriptTitle?: string; scriptText?: string; titlePage?: ScreenplayTitlePage }) => {
    const ids = new Set(lines.map((line) => line.id));
    setProject((prev) => {
      // Scene numbers follow the project's regime (domain/script/numbering.ts).
      // A project that has never chosen one is decided by its script: numbers
      // that are not simply positional — an imported production draft with a
      // 12A in it — are kept, anything else is numbered by position.
      const locked = prev.sceneNumbersLocked ?? hasProductionSceneNumbers(lines);
      const numbered = normaliseSceneNumbers(
        lines.map((line, index) => ({ ...line, lineNumber: index + 1 })),
        locked,
      );
      // Derive old/new scene lists so removed headings can be detected.
      //
      // The persisted characters MUST be passed in. `buildCharacterCatalog`
      // mints a fresh id for every cue it finds, and `mergeCharacterCatalogs`
      // only preserves a stable id when it has the existing catalog to match
      // against. Deriving with `[]` therefore stamped every scene with
      // character ids that existed nowhere else — so `castAssignments`, which
      // key on the persisted character ids, matched nothing and a scheduled
      // scene produced a call sheet with an empty cast table.
      const oldScenes = deriveScriptBreakdown(
        prev.scriptLines || [],
        prev.characters || [],
        prev.locations || [],
      ).scenes;
      const derived = deriveScriptBreakdown(numbered, prev.characters || [], prev.locations || []);
      const newScenes = derived.scenes;
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
        // An imported cover belongs to the draft that just arrived; when the
        // file carries none the existing one is kept rather than blanked.
        titlePage: meta?.titlePage ?? prev.titlePage,
        scriptLines: numbered,
        sceneNumbersLocked: locked,
        scriptScenes: newScenes,
        // Persist the merged catalog too: a character discovered by this edit
        // has a fresh id, and it has to be the SAME id next time or the scenes
        // and the cast list drift apart again.
        characters: derived.characters,
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

  /** The screenplay's cover. Merged, so the editor can write one field at a time. */
  const setTitlePage = (updates: Partial<ScreenplayTitlePage>) => {
    updateProjectMeta((prev) => ({ titlePage: { ...(prev.titlePage ?? {}), ...updates } }));
  };

  /**
   * Locking stamps every heading with its current number so nothing shifts
   * again; unlocking renumbers by position. Both go through `setScriptLines`
   * so the derived scene list, strips and omission labels follow.
   */
  const setSceneNumbersLocked = (locked: boolean) => {
    setProject((prev) => {
      const next = { ...prev, sceneNumbersLocked: locked };
      pendingSnapshotsRef.current.push(next);
      return next;
    });
    // Runs after the flag write above (state updates apply in order), so the
    // regime `setScriptLines` reads from `prev` is already the new one.
    setScriptLines(normaliseSceneNumbers(project.scriptLines || [], locked));
  };

  /**
   * Keep the persisted character catalog and the derived scene list in step.
   *
   * `buildCharacterCatalog` mints a fresh id for every cue it finds. Only
   * `mergeCharacterCatalogs`, given the persisted catalog, keeps a stable one.
   * So a project whose `characters` were never persisted regenerates every id
   * each time anything re-derives — and a cast assignment made against one of
   * those ids stops resolving the moment it does. That is silent data loss: the
   * assignment is still in the file, pointing at a character that no longer
   * exists under that id, and the call sheet simply shows no cast.
   *
   * This runs when the catalog is missing, when the scene list is missing, or
   * when the scenes reference characters the project does not have. Projects
   * already saved in that state cannot fix themselves — the old backfill only
   * ran when the scene list was absent, and theirs is present and wrong.
   */
  useEffect(() => {
    if (!project.scriptLines?.length) return;
    const catalogMissing = !project.characters?.length;
    const needsRepair =
      catalogMissing ||
      !project.scriptScenes ||
      scriptScenesHaveDriftedIds(project.scriptScenes, project.characters);
    if (!needsRepair) return;

    setProject((prev) => {
      const stillNeeded =
        !prev.characters?.length ||
        !prev.scriptScenes ||
        scriptScenesHaveDriftedIds(prev.scriptScenes, prev.characters);
      if (!stillNeeded) return prev;
      const derived = deriveScriptBreakdown(
        prev.scriptLines || [],
        prev.characters || [],
        prev.locations || [],
      );
      // Nothing to persist for a screenplay with no cues in it; returning `prev`
      // keeps this effect from looping on projects that will never have any.
      if (derived.characters.length === 0) return prev;
      return { ...prev, scriptScenes: derived.scenes, characters: derived.characters };
    });
  }, [project.scriptScenes, project.scriptLines, project.characters, setProject]);

  const avScriptRows: AVScriptRow[] = useMemo(
    () =>
      project.avScriptRows || [    {
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
  ],
    // Same reason as `scriptLines`: the fallback builds three fresh objects,
    // which would change the context value's identity on every render.
    [project.avScriptRows],
  );

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
    const camLetter = isMultiCam ? nextCameraLabel(existingCameras) : 'A';
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

    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, newCamera],
      shots: [...prevSetup.shots, newShotItem],
    }));

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
    const camLetter = isMultiCam ? nextCameraLabel(existingCameras) : 'A';
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
    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, newCamera],
      shots: [...prevSetup.shots, newShotItem],
    }));

    // Link row back to created shot
    updateAVScriptRow(rowId, { linkedShotId: shotId });
    setSelectedShotId(shotId);
    return shotId;
  };

  const createCameraOnly = (name: string, pos?: Vector2D): string => {
    const existingCams = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
    // First letter not currently in use — A is the shared default, so
    // user-created cameras get B, C, … however many Camera A positions exist.
    const camLetter = nextCameraLabel(existingCams);
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
      associatedShotId: undefined,
      cameraModel: 'Cinema Camera',
    };

    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, newCamera],
    }));
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

    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, newCamera],
      shots: prevSetup.shots.map((s) =>
        s.id === shotId
          ? ({ ...s, cameraId: id, cameraLabel: camLetter, lensMm: lensMm ?? s.lensMm ?? 35 } as Shot)
          : s,
      ),
    }));
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
    const letter = nextCameraLabel(existingCams);

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

    // Only the KEYS this call changes, and the id they belong to. Carrying a
    // whole rebuilt camera would write back the render-time copy of every
    // other field, so relabelling a camera that had just been dragged in the
    // same batch would snap it back to where the drag started.
    let relabel: { id: string; patch: Partial<CameraElement> } | null = null;
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

      relabel = { id: cam.id, patch: { cameraLabel: clean, name: newName } };
    } else {
      // Shot has no camera element — link it to an existing camera carrying
      // this letter.
      const rep = activeSetup.elements.find(
        (e) => e.type === 'camera' && ((e as CameraElement).cameraLabel || 'A').toUpperCase() === clean
      );
      if (!rep) return; // no camera with this letter exists
      cameraId = rep.id;
    }

    const relabelled = relabel;
    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: relabelled
        ? prevSetup.elements.map((e) =>
            e.id === relabelled.id ? ({ ...e, ...relabelled.patch } as FloorPlanElement) : e,
          )
        : prevSetup.elements,
      shots: prevSetup.shots.map((s) =>
        s.id === shotId ? ({ ...s, cameraId, cameraLabel: clean } as Shot) : s,
      ),
    }));
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
      // Read out of the patch before the closure: narrowing a property of a
      // parameter does not survive into a nested function.
      const nextLensMm = updates.lensMm;
      if (shot.cameraId && nextLensMm !== undefined) {
        updatedElements = setup.elements.map((e) => {
          if (e.id === shot.cameraId && e.type === 'camera') {
            const cam = e as CameraElement;
            return {
              ...e,
              focalLength: nextLensMm,
              fovAngle: calculateFovAngle(nextLensMm, cam.sensorFormat),
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

    setRecordedProject((prev) => {
      // Everything outside the owning setup that pointed at this shot: its
      // schedule strip, and the script line it was lined for. Left behind,
      // those rendered as an empty strip on the board and on every call sheet
      // for that day, with nothing the user could do about it.
      const cleaned = removeShotReferences(
        {
          scheduleBlocks: prev.scheduleBlocks,
          productionDays: prev.productionDays,
          scriptLines: prev.scriptLines,
          takes: prev.takes,
        },
        id,
      );
      return {
        ...prev,
        ...cleaned,
        avScriptRows: rowsAfterShotRemoval(prev.avScriptRows || [], new Set([id]), allShotsOf(prev)),
      };
    });
  };

  /**
   * Re-apply an ordering the UI worked out from a render-time shot list to the
   * committed one.
   *
   * Reordering, sorting and renumbering all arrive as "here is the whole list,
   * in the new order", computed from what the panel was showing. Writing that
   * list back wholesale replaces the committed one — so a shot added, deleted
   * or edited by another handler in the same render is undone by a drag that
   * had nothing to do with it. Ordering by id instead keeps the committed
   * objects (so concurrent edits survive), honours a deletion by simply not
   * finding the id, and appends anything the UI had not seen yet at the end
   * rather than dropping it.
   */
  const reorderCommittedShots = (
    committed: Shot[],
    orderedIds: readonly string[],
    numberFor?: (shot: Shot, index: number) => string,
  ): Shot[] => {
    const byId = new Map(committed.map((shot) => [shot.id, shot]));
    const out: Shot[] = [];
    for (const id of orderedIds) {
      const shot = byId.get(id);
      if (!shot) continue;
      byId.delete(id);
      out.push(shot);
    }
    for (const shot of committed) if (byId.has(shot.id)) out.push(shot);
    return out.map((shot, index) => ({
      ...shot,
      order: index + 1,
      ...(numberFor ? { shotNumber: numberFor(shot, index) } : null),
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

    const orderedIds = reindexed.map((shot) => shot.id);
    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      shots: reorderCommittedShots(prevSetup.shots, orderedIds),
    }));
  };

  const setStoryboardOrder = (shotIds: string[]) => {
    commitSetupUpdate((prevSetup) => ({ ...prevSetup, storyboardOrder: shotIds }));
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
        const orderedIds = reindexed.map((shot) => shot.id);
        commitSetupUpdate((prevSetup) => ({
          ...prevSetup,
          shots: reorderCommittedShots(prevSetup.shots, orderedIds),
        }));
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
    // Renumbering covers whatever is committed, in its committed order — the
    // scene number included, since another handler may have changed it in the
    // same render.
    commitSetupUpdate((prevSetup) => {
      const scene = prevSetup.sceneNumber || '1';
      const numberAt = (index: number): string => {
        const letter =
          String.fromCharCode(65 + (index % 26)) + (index >= 26 ? `${Math.floor(index / 26)}` : '');
        if (format === 'numeric') return `${index + 1}`;
        if (format === 'alphabetic') return letter;
        if (format === 'scene_alphabetic') return `${scene}${letter}`;
        // scene_slash_number (Default: 1/1, 1/2, 1/3...)
        return `${scene}/${index + 1}`;
      };
      return {
        ...prevSetup,
        shots: reorderCommittedShots(
          prevSetup.shots,
          prevSetup.shots.map((shot) => shot.id),
          (_shot, index) => numberAt(index),
        ),
      };
    });
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
    const orderedIds = sorted.map((shot) => shot.id);
    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      shots: reorderCommittedShots(prevSetup.shots, orderedIds),
    }));
  };

  // Derive the list of reference images (migrates legacy single-image setups).
  // Once `backgroundImages` exists (even empty), it is authoritative.
  //
  // Taken as a function of a setup rather than of the render-time one, because
  // the writers below have to apply it to whichever setup is committed at the
  // time they run, not to the copy the component rendered with.
  const imagesOfSetup = (setup: SceneSetup): IdentifiedBackgroundImage[] => {
    if (Array.isArray(setup.backgroundImages)) {
      // Hand back the stored array untouched when every image already has an
      // id, which is every image this app has ever created. Mapping
      // unconditionally would allocate a fresh object per image on every read
      // — and since the writers below feed this result back into state, it
      // would also rewrite the whole list on every background edit.
      if (setup.backgroundImages.every((image) => !!image.id)) {
        return setup.backgroundImages as IdentifiedBackgroundImage[];
      }
      // A save old enough to hold images without ids still has to be usable.
      // The id has to be DISTINCT per image: giving them all 'bg-legacy'
      // collides their React keys, and selecting one would select, move and
      // delete every other id-less image with it.
      return setup.backgroundImages.map((image, index) => ({
        ...image,
        id: image.id || `bg-legacy-${index}`,
      }));
    }
    return setup.backgroundImage
      ? [{ ...setup.backgroundImage, id: setup.backgroundImage.id || 'bg-legacy' }]
      : [];
  };
  const backgroundImages: IdentifiedBackgroundImage[] = useMemo(
    () => imagesOfSetup(activeSetup),
    [activeSetup],
  );

  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);
  const [calibratingBackgroundId, setCalibratingBackgroundId] = useState<string | null>(null);
  const startBackgroundCalibration = (id: string) => {
    setSelectedBackgroundId(id);
    setCalibratingBackgroundId(id);
    setActiveTool('select');
  };
  const cancelBackgroundCalibration = () => setCalibratingBackgroundId(null);

  const addBackgroundImage = (bg: BackgroundImage) => {
    const newBg = { ...bg, id: bg.id || createId('bg') };
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
    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      backgroundImages: [...imagesOfSetup(prevSetup), newBg],
      backgroundImage: null,
    }));
    setSelectedBackgroundId(newBg.id);
    setActiveRightTab('inspector');
  };

  const updateBackgroundImage = (id: string, updates: Partial<BackgroundImage>, recordHistory = false) => {
    commitSetupUpdate(
      (prevSetup) => ({
        ...prevSetup,
        backgroundImages: imagesOfSetup(prevSetup).map((b) => (b.id === id ? { ...b, ...updates } : b)),
      }),
      recordHistory,
    );
  };

  const removeBackgroundImage = (id: string) => {
    commitSetupUpdate((prevSetup) => {
      const remaining = imagesOfSetup(prevSetup).filter((b) => b.id !== id);
      return {
        ...prevSetup,
        backgroundImages: remaining,
        backgroundImage: remaining.length === 0 ? null : prevSetup.backgroundImage,
      };
    });
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
    // The shot id is minted HERE and handed to addElement. Looking the camera
    // up in `activeSetup` afterwards could never work: the element is created
    // in a state update, so the render-time setup will never contain it, and
    // this always returned an empty shotId.
    const shotId = newShotId();
    const camId = addElement({
      type: 'camera',
      x: spawnPos.x,
      y: spawnPos.y,
      associatedShotId: shotId,
    } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] });
    return { cameraId: camId, shotId };
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
    // A deep JSON copy kept every element, shot, waypoint and lining id from
    // the original, so the duplicate shared ids with the setup it came from —
    // exactly what rule 16 forbids, and what makes a later edit or export
    // ambiguous about which setup it meant. cloneSetupWithNewIds remaps them
    // all and rewrites the internal references.
    const duplicatedSetup: SceneSetup = {
      ...cloneSetupWithNewIds(activeSetup),
      name: `${activeSetup.name} (Copy)`,
    };

    setRecordedProject((prev) => ({
      ...prev,
      setups: [...prev.setups, duplicatedSetup],
      activeSetupId: duplicatedSetup.id,
    }));
  };

  const deleteSetup = (setupId: string) => {
    if (project.setups.length <= 1) return; // Keep at least one setup
    setRecordedProject((prev) => {
      // Everything is derived from `prev`, the committed project, not from the
      // render-time copy. Deriving `remaining` outside and writing it back
      // inside discarded any setup write committed earlier in the same render
      // — including a live drag's final commit.
      if (prev.setups.length <= 1) return prev;
      const doomed = prev.setups.find((s) => s.id === setupId);
      if (!doomed) return prev;
      const remaining = prev.setups.filter((s) => s.id !== setupId);
      const shotIdsOnSetup = (doomed.shots ?? []).map((shot) => shot.id);
      // Deleting a setup used to leave its schedule strip and the strips
      // covering its shots behind, reading "Unresolved setup 8f3c…" on the
      // board and on every call sheet for that day — permanently, and with no
      // way to tell which strips were affected.
      const cleaned = removeSetupReferences(
        {
          scheduleBlocks: prev.scheduleBlocks,
          productionDays: prev.productionDays,
          scriptLines: prev.scriptLines,
          takes: prev.takes,
        },
        setupId,
        shotIdsOnSetup,
      );
      return {
        ...prev,
        ...cleaned,
        setups: remaining,
        avScriptRows: rowsAfterShotRemoval(
          prev.avScriptRows || [],
          new Set(shotIdsOnSetup),
          remaining.flatMap((setup) => setup.shots || []),
        ),
        // Only follow the deletion if it took the scene being edited. Deleting
        // a different scene from the dropdown used to yank the user off theirs.
        activeSetupId: remaining.some((s) => s.id === prev.activeSetupId)
          ? prev.activeSetupId
          : remaining[0].id,
      };
    });
  };

  /**
   * Patch fields on the active setup. Built from the latest committed state, so
   * two setup writes in the same render both land.
   *
   * `recordHistory = false` is for live gestures (dragging a group keyframe):
   * the drag updates the project on every pointer move and the caller pushes a
   * single history entry on release, so one drag stays one undo step instead of
   * hundreds.
   */
  const updateSetupMeta = (updates: Partial<SceneSetup>, recordHistory = true) => {
    commitSetupUpdate((prevSetup) => ({ ...prevSetup, ...updates }), recordHistory);
  };

  /** Switch the workspace to another project, saving nothing in flight. */
  /**
   * Move any inline images this project still carries into the asset store
   * (rule 26).
   *
   * Not a schema migration: those are pure functions over JSON, which is what
   * makes them fixture-testable and replayable, and moving bytes into
   * IndexedDB is neither pure nor synchronous. So it runs once per project
   * here, and the schema version is not involved.
   *
   * The result is applied as replacements rather than as a whole project, so
   * edits made while it ran are not overwritten by a stale snapshot. It is
   * silent on purpose — nothing the user asked for happened, and a toast about
   * housekeeping is noise.
   */
  useEffect(() => {
    let cancelled = false;
    const projectId = project.id;
    void (async () => {
      const result = await migrateProjectMedia(liveProjectRef.current ?? project);
      if (cancelled || !result.changed) return;
      setProject((prev) => {
        if (prev.id !== projectId) return prev;
        const { project: next, applied } = applyMediaReplacements(prev, result.replacements);
        return applied > 0 ? next : prev;
      });
      // The undo stack has to be rewritten too, or the migration is only
      // skin-deep: `history[0]` still holds the project with the images inline,
      // so undoing to the bottom of the stack puts every base64 blob back and
      // the next autosave writes it out again — the housekeeping silently
      // undone by a keystroke that had nothing to do with it. Replacing the
      // data URL with its asset id inside each snapshot keeps the timeline
      // intact (same number of steps, same edits) while making the swap
      // unconditional. This is not an undo step of its own: nothing the user
      // did caused it, so `historyIndex` does not move.
      setHistory((entries) =>
        entries.map((entry) => {
          if (entry.id !== projectId) return entry;
          const { project: next, applied } = applyMediaReplacements(entry, result.replacements);
          return applied > 0 ? next : entry;
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // Once per project: re-running on every edit would re-scan a large project
    // continuously for images that are, by then, already asset ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

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
  const updateProjectMeta = (
    updates: Partial<Project> | ((prev: Project) => Partial<Project>),
    record = true,
  ) => {
    setProject((prev) => {
      const patch = typeof updates === 'function' ? updates(prev) : updates;
      const next: Project = { ...prev, ...patch };
      if (record) pendingSnapshotsRef.current.push(next);
      return next;
    });
  };

  /**
   * Functional project mutation recorded in undo history. Used by every
   * content mutation that builds its next state from `prev` directly
   * (AV-script rows, setup add/duplicate/delete, cross-scene lining edits…).
   */
  // Named revisions (plan §13.2): user-created milestones, separate from the
  // per-setup undo history. Persisted on the project so autosave keeps them.
  const revisions: ProjectRevision[] = project.revisions || NO_REVISIONS;

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
  /**
   * Load the bundled example production into the CURRENT project, filling only
   * the collections that are still empty. Projects created before a module
   * existed — or started from an empty stage — otherwise have no way to see
   * what the Schedule, Crew, Rigging or Power pages are for.
   */
  const loadExampleProductionData = (): string[] => {
    const { patch, filled } = buildExampleProductionFill(project);
    if (filled.length === 0) return [];
    updateProjectMeta(patch);
    return filled;
  };

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
      // The two reference fields any element type may carry. Named rather
      // than reached through `any`, so renaming either one breaks here instead
      // of silently leaving the clone pointing at the original's shot.
      const next = { ...element, id: elementIdMap.get(element.id)! } as FloorPlanElement & {
        associatedShotId?: string;
        lookAtTargetId?: string;
      };
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
    // Do not record history for smooth continuous zoom & pan
    commitSetupUpdate(
      (prevSetup) => ({
        ...prevSetup,
        canvasScale: Math.max(0.15, Math.min(4.0, scale)),
        canvasOffset: offset,
      }),
      false,
    );
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

  // Grouped, and memoised, because the context value is compared field by
  // field: a fresh object here would change identity on every render and
  // defeat the comparison for every consumer, not just the ones that watch
  // playback.
  const playback = useMemo(
    () => ({
      isPlaying,
      currentBeat,
      totalBeats: activeSetup.totalBeats || 3,
      speed: playbackSpeed,
      isLooping,
    }),
    [isPlaying, currentBeat, activeSetup.totalBeats, playbackSpeed, isLooping],
  );

  const contextValue = useStableContextValue<FloorPlanContextType>({
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
        playback,
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
        setSceneNumbersLocked,
        setTitlePage,
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
        loadExampleProductionData,
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
  });

  return (
    <FloorPlanContext.Provider value={contextValue}>
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
