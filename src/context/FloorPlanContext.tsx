import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  ActiveTool,
  AspectRatio,
  BackgroundImage,
  CameraElement,
  FloorPlanElement,
  Project,
  PropType,
  SceneSetup,
  Shot,
  Vector2D,
} from '../types';
import {
  ACTOR_COLOR_PALETTE,
  CAMERA_COLOR_PALETTE,
  LIGHT_FIXTURES,
  PROP_CATALOG,
  SAMPLE_SCENES,
} from '../constants/presets';
import { calculateFovAngle } from '../utils/geometry';

interface FloorPlanContextType {
  project: Project;
  activeSetup: SceneSetup;
  selectedElementIds: string[];
  selectedShotId: string | null;
  highlightedElementId: string | null;
  activeTool: ActiveTool;
  activePropSubtype: PropType;
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
  theme: 'dark' | 'light';
  displaySettings: DisplaySettings;

  // Actions
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  updateDisplaySettings: (updates: Partial<DisplaySettings>) => void;
  setTool: (tool: ActiveTool) => void;
  setPropSubtype: (type: PropType) => void;
  activeRightTab: 'shots' | 'inspector';
  setActiveRightTab: (tab: 'shots' | 'inspector') => void;
  selectElement: (id: string | null, multi?: boolean) => void;
  selectElements: (ids: string[]) => void;
  clearSelection: () => void;
  selectShot: (shotId: string | null, focusCanvasCamera?: boolean) => void;
  setHighlightedElement: (id: string | null) => void;

  // Element CRUD
  addElement: (element: Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }) => string;
  updateElement: (id: string, updates: Partial<FloorPlanElement>, recordHistory?: boolean) => void;
  updateMultipleElements: (updates: { id: string; updates: Partial<FloorPlanElement> }[], recordHistory?: boolean) => void;
  deleteSelectedElements: () => void;
  deleteElementById: (id: string) => void;
  duplicateSelected: () => void;
  insertDoorInWall: (wallId: string) => string | null;
  insertWindowInWall: (wallId: string) => string | null;

  // Shot CRUD (Synchronized with Cameras)
  addShot: (shotData?: Partial<Shot>) => string;
  insertShotAfter: (afterShotId: string, options?: { renumberRest?: boolean }) => string;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  deleteShot: (id: string) => void;
  reorderShots: (arg1: number | Shot[], arg2?: number) => void;
  moveShot: (shotId: string, direction: 'up' | 'down') => void;
  moveShotToScene: (shotId: string, sourceSetupId: string, targetSetupId: string, targetIndex?: number) => void;
  renumberAllShots: (format?: 'scene_slash_number' | 'scene_alphabetic' | 'numeric' | 'alphabetic') => void;
  sortShotsBy: (criteria: 'custom' | 'shotNumber' | 'camera' | 'lens' | 'status') => void;
  createCameraAndShot: (pos?: Vector2D) => { cameraId: string; shotId: string };
  createCameraOnly: (name: string, pos?: Vector2D) => string;
  createCameraForShot: (name: string, shotId: string, lensMm?: number, pos?: Vector2D) => string;
  setShotCameraLetter: (shotId: string, letter: string) => void;
  setShootMode: (mode: 'single_cam' | 'multi_cam') => void;

  // Background Screenshots / Reference Blueprints (multiple supported)
  backgroundImages: BackgroundImage[];
  selectedBackgroundId: string | null;
  addBackgroundImage: (bg: BackgroundImage) => void;
  updateBackgroundImage: (id: string, updates: Partial<BackgroundImage>) => void;
  removeBackgroundImage: (id: string) => void;
  setSelectedBackgroundId: (id: string | null) => void;

  // Rotation Helper
  rotateElementBy: (id: string, deltaDegrees: number) => void;

  // Setup / Project Management
  setActiveSetupId: (setupId: string) => void;
  addSetup: (name?: string) => void;
  duplicateCurrentSetup: () => void;
  deleteSetup: (setupId: string) => void;
  updateSetupMeta: (updates: Partial<SceneSetup>) => void;
  updateProjectMeta: (updates: Partial<Project>) => void;
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
  openExportModal: () => void;
  closeExportModal: () => void;
  setCanvasTransform: (scale: number, offset: Vector2D) => void;
  setCanvasViewport: (width: number, height: number) => void;
  createNewProject: () => void;
}

export interface DisplaySettings {
  // Master label switch
  showLabels: boolean;
  labelScale: number; // 0.5 - 2.0 multiplier
  labelOpacity: number; // 0 - 1
  // Per-category label visibility
  showActorLabels: boolean;
  showCameraLabels: boolean;
  showPropLabels: boolean;
  showTrackLabels: boolean;
  showLightLabels: boolean;
  showMeasurementLabels: boolean;
  // Per-category label color overrides (null = use element's own color)
  actorLabelColor: string | null;
  cameraLabelColor: string | null;
  propLabelColor: string | null;
  trackLabelColor: string | null;
  lightLabelColor: string | null;
  // Decluttering toggles
  showWaypoints: boolean;
  showFovCones: boolean;
  showLightBeams: boolean;
  showGrid: boolean;
  // Shot info shown on the camera label
  showShotSizeOnCamera: boolean;
  showShotLensOnCamera: boolean;
  showShotAngleOnCamera: boolean;
  showShotNumberOnCamera: boolean;
  showLensFovLabel: boolean;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showLabels: true,
  labelScale: 1,
  labelOpacity: 1,
  showActorLabels: true,
  showCameraLabels: true,
  showPropLabels: true,
  showTrackLabels: true,
  showLightLabels: true,
  showMeasurementLabels: true,
  actorLabelColor: null,
  cameraLabelColor: null,
  propLabelColor: null,
  trackLabelColor: null,
  lightLabelColor: null,
  showWaypoints: true,
  showFovCones: true,
  showLightBeams: true,
  showGrid: true,
  showShotSizeOnCamera: false,
  showShotLensOnCamera: false,
  showShotAngleOnCamera: false,
  showShotNumberOnCamera: true,
  showLensFovLabel: false,
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

export const FloorPlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize project state from localStorage or default template
  const [project, setProject] = useState<Project>(() => {
    try {
      const saved = migrateStorageKey(LEGACY_STORAGE_KEYS.project, STORAGE_KEYS.project);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.setups?.length > 0) return parsed;
      }
    } catch {
      // ignore
    }

    return {
      id: 'proj-' + Date.now(),
      title: 'Short Film Floor Plan & Shot List',
      director: 'Film Director / Student',
      cinematographer: 'DP / Camera Operator',
      date: new Date().toISOString().split('T')[0],
      setups: SAMPLE_SCENES,
      activeSetupId: SAMPLE_SCENES[0].id,
    };
  });

  const activeSetup =
    project.setups.find((s) => s.id === project.activeSetupId) || project.setups[0];

  // Selection & UI state
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [highlightedElementId, setHighlightedElementId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [activePropSubtype, setActivePropSubtype] = useState<PropType>('table_rect');
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

  // Display / label preferences (UI-only, persisted separately from scene data)
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => {
    try {
      const saved = migrateStorageKey(LEGACY_STORAGE_KEYS.display, STORAGE_KEYS.display);
      if (saved) return { ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_DISPLAY_SETTINGS;
  });

  const updateDisplaySettings = (updates: Partial<DisplaySettings>) => {
    setDisplaySettings((prev) => {
      const next = { ...prev, ...updates };
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

  // Right Sidebar Tab State
  const [activeRightTab, setActiveRightTab] = useState<'shots' | 'inspector'>('shots');

  // Playback engine
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLooping, setIsLooping] = useState(true);

  // Undo / Redo history
  const [history, setHistory] = useState<SceneSetup[]>([activeSetup]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Auto-save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      // ignore storage errors
    }
  }, [project]);

  // Sync history when active setup changes externally (e.g. switched setup)
  const prevSetupIdRef = useRef(project.activeSetupId);
  // Live size of the canvas viewport (reported by FloorPlanCanvas), used to
  // spawn new cameras at the visual center of the canvas.
  const canvasViewportRef = useRef<{ width: number; height: number }>({ width: 1200, height: 800 });
  const setCanvasViewport = (width: number, height: number) => {
    canvasViewportRef.current = { width, height };
  };

  // Spawn position for a newly added camera: the center of the currently
  // visible canvas. If earlier cameras already sit at/near that spot, nudge
  // diagonally so the new camera is visibly ADDED instead of stacking on top
  // of (and appearing to overwrite) the previous one.
  const getNewCameraPosition = (): Vector2D => {
    const { width, height } = canvasViewportRef.current;
    const scale = activeSetup.canvasScale || 1;
    const centerX = (width / 2 - activeSetup.canvasOffset.x) / scale;
    const centerY = (height / 2 - activeSetup.canvasOffset.y) / scale;
    const camCount = activeSetup.elements.filter((e) => e.type === 'camera').length;
    const nudge = camCount * 40;
    return { x: Math.round(centerX + nudge), y: Math.round(centerY + nudge) };
  };
  useEffect(() => {
    if (prevSetupIdRef.current !== project.activeSetupId) {
      prevSetupIdRef.current = project.activeSetupId;
      setHistory([activeSetup]);
      setHistoryIndex(0);
      setSelectedElementIds([]);
      setSelectedShotId(null);
      setSelectedBackgroundId(null);
      setCurrentBeat(1);
      setIsPlaying(false);
    }
  }, [project.activeSetupId, activeSetup]);

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

  // Helper to commit new setup state with history push
  const commitSetupState = (newSetup: SceneSetup, recordHistory = true) => {
    setProject((prev) => ({
      ...prev,
      setups: prev.setups.map((s) => (s.id === newSetup.id ? newSetup : s)),
    }));

    if (recordHistory) {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push(newSetup);
      if (nextHistory.length > 50) nextHistory.shift();
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    }
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const targetState = history[newIndex];
      setHistoryIndex(newIndex);
      setProject((prev) => ({
        ...prev,
        setups: prev.setups.map((s) => (s.id === targetState.id ? targetState : s)),
      }));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const targetState = history[newIndex];
      setHistoryIndex(newIndex);
      setProject((prev) => ({
        ...prev,
        setups: prev.setups.map((s) => (s.id === targetState.id ? targetState : s)),
      }));
    }
  };

  // Selection handlers
  const selectElement = (id: string | null, multi = false) => {
    if (!id) {
      setSelectedElementIds([]);
      return;
    }

    // When an element on the canvas is selected, open the inspector tab
    setActiveRightTab('inspector');

    if (multi) {
      setSelectedElementIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      );
    } else {
      setSelectedElementIds([id]);
      // If it's a camera, sync selected shot!
      const el = activeSetup.elements.find((e) => e.id === id);
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
    setSelectedElementIds(ids);
    if (ids.length > 0) {
      setActiveRightTab('inspector');
    }
  };

  const clearSelection = () => {
    setSelectedElementIds([]);
    setSelectedShotId(null);
  };

  // Select shot handler with bidirectional camera sync (keeps current tab by default)
  const selectShot = (shotId: string | null, focusCanvasCamera = true) => {
    setSelectedShotId(shotId);
    if (!shotId) return;

    const shot = activeSetup.shots.find((s) => s.id === shotId);
    if (shot && shot.cameraId) {
      setSelectedElementIds([shot.cameraId]);
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
      const shotId = `shot-${Date.now()}`;
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
        rigType: 'Tripod',
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

      commitSetupState(updatedSetup);
      setSelectedElementIds([id]);
      setSelectedShotId(shotId);
      return id;
    } else if (partial.type === 'light') {
      const fixture = LIGHT_FIXTURES[0];
      newElement = {
        ...baseDefaults,
        type: 'light',
        name: partial.name || fixture.name,
        fixtureType: fixture.type,
        colorTemp: fixture.defaultTemp,
        intensity: 80,
        beamAngle: fixture.defaultBeam,
        throwDistance: 220,
        fixtureModel: fixture.defaultModel,
        ...partial,
      };
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
        ...partial,
      };
    } else if (partial.type === 'prop') {
      const propInfo = PROP_CATALOG.find((p) => p.type === activePropSubtype) || PROP_CATALOG[0];
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
    } else {
      newElement = {
        ...baseDefaults,
        type: 'text',
        name: 'Text Label',
        text: 'Director Notes',
        fontSize: 16,
        color: '#94a3b8',
        ...partial,
      };
    }

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: [...activeSetup.elements, newElement],
    };

    commitSetupState(updatedSetup);
    setSelectedElementIds([id]);
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
    }

    const updatedElements = activeSetup.elements.map((e) =>
      e.id === id ? ({ ...e, ...updates, ...extraUpdates } as FloorPlanElement) : e
    );

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: updatedElements,
      shots: updatedShots,
    };

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

    commitSetupState(updatedSetup, recordHistory);
  };

  const deleteElementById = (id: string) => {
    const updatedElements = activeSetup.elements.filter((e) => e.id !== id);
    // If it's a camera, remove or unlink shot
    const updatedShots = activeSetup.shots.filter((s) => s.cameraId !== id);

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: updatedElements,
      shots: updatedShots,
    };

    setSelectedElementIds((prev) => prev.filter((i) => i !== id));
    if (selectedShotId && !updatedShots.find((s) => s.id === selectedShotId)) {
      setSelectedShotId(null);
    }
    commitSetupState(updatedSetup);
  };

  const deleteSelectedElements = () => {
    if (selectedElementIds.length === 0) return;
    const idsSet = new Set(selectedElementIds);
    const updatedElements = activeSetup.elements.filter((e) => !idsSet.has(e.id));
    const updatedShots = activeSetup.shots.filter((s) => !idsSet.has(s.cameraId));

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: updatedElements,
      shots: updatedShots,
    };

    setSelectedElementIds([]);
    setSelectedShotId(null);
    commitSetupState(updatedSetup);
  };

  const duplicateSelected = () => {
    if (selectedElementIds.length === 0) return;
    const newElements: FloorPlanElement[] = [];
    const newSelectedIds: string[] = [];

    selectedElementIds.forEach((id) => {
      const el = activeSetup.elements.find((e) => e.id === id);
      if (!el) return;

      const newId = `el-${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
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

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: [...activeSetup.elements, ...newElements],
    };

    commitSetupState(updatedSetup);
    setSelectedElementIds(newSelectedIds);
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
    const id = `shot-${Date.now()}`;
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
            targetShotNumber = `${parts[0]}/${num}B`;
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
            targetShotNumber = `${sNum}B`;
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

    // Reuse the default camera (Camera A) in single-camera mode instead of
    // creating a new camera element for the inserted shot.
    const shotId = `shot-${Date.now()}`;
    let shotCamId: string;
    let newCamera: CameraElement | null = null;
    if (existingCameras.length > 0 && !isMultiCam) {
      const defaultCam = existingCameras.find((c) => c.cameraLabel === 'A') || existingCameras[0];
      shotCamId = defaultCam.id;
    } else {
      const newCamId = `cam-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const camColor = CAMERA_COLOR_PALETTE[existingCameras.length % CAMERA_COLOR_PALETTE.length];
      newCamera = {
        id: newCamId,
        type: 'camera',
        name: isMultiCam ? `Camera ${nextCamLetter}` : `Camera A (Shot ${targetShotNumber})`,
        cameraLabel: nextCamLetter,
        color: camColor,
        x: 350 + (existingCameras.length * 30),
        y: 380 + (existingCameras.length * 20),
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
      shotCamId = newCamId;
    }

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
      elements: newCamera ? [...activeSetup.elements, newCamera] : [...activeSetup.elements],
      shots: finalShots,
    };

    commitSetupState(updatedSetup);
    setSelectedShotId(shotId);
    setSelectedElementIds([shotCamId]);
    return shotId;
  };

  // Create a standalone camera (no auto shot) so an existing shot can be re-linked to it
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
    const shot = activeSetup.shots.find((s) => s.id === id);
    if (!shot) return;

    // If lens changed in shot, reflect in floor plan camera IN THE SAME
    // COMMIT — a separate updateElement call would be overwritten by this
    // commit, because both rebuild the setup from the same base state.
    let updatedElements = activeSetup.elements;
    if (shot.cameraId && updates.lensMm !== undefined) {
      updatedElements = activeSetup.elements.map((e) => {
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

    const updatedShots = activeSetup.shots.map((s) =>
      s.id === id ? ({ ...s, ...updates } as Shot) : s
    );

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: updatedElements,
      shots: updatedShots,
    };

    commitSetupState(updatedSetup);
  };

  const deleteShot = (id: string) => {
    const updatedShots = activeSetup.shots.filter((s) => s.id !== id);
    const removedShot = activeSetup.shots.find((s) => s.id === id);
    let updatedElements = activeSetup.elements;

    // If the removed shot was the only one using its camera, remove that
    // camera from the floor plan too so it doesn't linger on the canvas.
    if (removedShot && removedShot.cameraId) {
      const stillUsed = updatedShots.some((s) => s.cameraId === removedShot.cameraId);
      if (!stillUsed) {
        updatedElements = activeSetup.elements.filter((e) => e.id !== removedShot.cameraId);
      }
    }

    const updatedSetup: SceneSetup = {
      ...activeSetup,
      elements: updatedElements,
      shots: updatedShots,
    };

    if (selectedShotId === id) setSelectedShotId(null);
    commitSetupState(updatedSetup);
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
        setProject((prev) => ({
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

    setProject((prev) => ({
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

  const addBackgroundImage = (bg: BackgroundImage) => {
    const newBg = { ...bg, id: bg.id || `bg-${Date.now()}` };
    const updatedSetup: SceneSetup = {
      ...activeSetup,
      backgroundImages: [...backgroundImages, newBg],
      backgroundImage: null,
    };
    commitSetupState(updatedSetup);
    setSelectedBackgroundId(newBg.id);
  };

  const updateBackgroundImage = (id: string, updates: Partial<BackgroundImage>) => {
    const updatedSetup: SceneSetup = {
      ...activeSetup,
      backgroundImages: backgroundImages.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    };
    commitSetupState(updatedSetup, false);
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
    const newSetup: SceneSetup = {
      id: `setup-${Date.now()}`,
      name: name || `Setup ${nextNum}: Scene ${nextNum} Coverage`,
      sceneNumber: `${nextNum}`,
      location: 'INT. STUDIO - DAY',
      timeOfDay: 'Day INT',
      elements: [],
      shots: [],
      currentBeat: 1,
      totalBeats: 1,
      canvasScale: 1,
      canvasOffset: { x: 50, y: 50 },
      gridSettings: {
        size: 30,
        snap: true,
        showGrid: true,
        unit: 'ft',
        pixelsPerUnit: 25,
      },
    };

    setProject((prev) => ({
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

    setProject((prev) => ({
      ...prev,
      setups: [...prev.setups, duplicatedSetup],
      activeSetupId: newId,
    }));
  };

  const deleteSetup = (setupId: string) => {
    if (project.setups.length <= 1) return; // Keep at least one setup
    const remaining = project.setups.filter((s) => s.id !== setupId);
    setProject((prev) => ({
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

  const updateProjectMeta = (updates: Partial<Project>) => {
    setProject((prev) => ({ ...prev, ...updates }));
  };

  const loadTemplateScene = (templateIndex: number) => {
    const template = SAMPLE_SCENES[templateIndex];
    if (!template) return;

    const newSetupId = `setup-${Date.now()}`;
    const clonedSetup: SceneSetup = {
      ...JSON.parse(JSON.stringify(template)),
      id: newSetupId,
    };

    setProject((prev) => ({
      ...prev,
      setups: [...prev.setups, clonedSetup],
      activeSetupId: newSetupId,
    }));
  };

  const loadProjectFromJson = (newProject: Project) => {
    if (newProject?.setups?.length > 0) {
      setProject(newProject);
    }
  };

  const createNewProject = () => {
    const newSetup: SceneSetup = {
      id: `setup-${Date.now()}`,
      name: 'Scene 1: Master Setup',
      sceneNumber: '1',
      location: 'INT. STUDIO - DAY',
      timeOfDay: 'Day INT',
      elements: [],
      shots: [],
      currentBeat: 1,
      totalBeats: 3,
      canvasScale: 1,
      canvasOffset: { x: 50, y: 50 },
      gridSettings: {
        size: 30,
        snap: true,
        showGrid: true,
        unit: 'ft',
        pixelsPerUnit: 25,
      },
    };

    const newProj: Project = {
      id: 'proj-' + Date.now(),
      title: 'New Film Production Project',
      director: 'Director',
      cinematographer: 'DP',
      date: new Date().toISOString().split('T')[0],
      setups: [newSetup],
      activeSetupId: newSetup.id,
    };

    setProject(newProj);
    setSelectedElementIds([]);
    setSelectedShotId(null);
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

  const openExportModal = () => setIsExportModalOpen(true);
  const closeExportModal = () => setIsExportModalOpen(false);

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
        theme,

        activeRightTab,
        setActiveRightTab,

        toggleTheme,
        setTheme,
        setTool: setActiveTool,
        setPropSubtype: setActivePropSubtype,
        selectElement,
        selectElements,
        clearSelection,
        selectShot,
        setHighlightedElement: setHighlightedElementId,

        addElement,
        updateElement,
        updateMultipleElements,
        deleteSelectedElements,
        deleteElementById,
        duplicateSelected,
        insertDoorInWall,
        insertWindowInWall,

        addShot,
        insertShotAfter,
        updateShot,
        deleteShot,
        reorderShots,
        moveShot,
        moveShotToScene,
        renumberAllShots,
        sortShotsBy,
        createCameraAndShot,
        createCameraOnly,
        createCameraForShot,
        setShotCameraLetter,

        backgroundImages,
        selectedBackgroundId,
        addBackgroundImage,
        updateBackgroundImage,
        removeBackgroundImage,
        setSelectedBackgroundId,
        rotateElementBy,

        setActiveSetupId,
        addSetup,
        duplicateCurrentSetup,
        deleteSetup,
        updateSetupMeta,
        updateProjectMeta,
        loadTemplateScene,
        loadProjectFromJson,
        createNewProject,

        undo,
        redo,

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
