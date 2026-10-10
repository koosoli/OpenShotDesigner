/**
 * Display and label preferences (UI-only, stored per browser apart from the
 * project) and the browser storage keys they live under. Split out of
 * `FloorPlanContext`; re-exported from there so existing imports still work.
 */
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
  /**
   * The derived planning warnings — coverage on the shot list, health on the
   * schedule.
   *
   * OFF by default. They sit above the content people came to the panel for,
   * and a checker nobody asked for that is wrong even occasionally is worse
   * than one they turned on deliberately. Anyone who wants them switches them
   * on in Viewing Options and keeps them.
   */
  showPlanningWarnings?: boolean;
  /** Floating cross-department readiness summary. Off by default. */
  showProductionReadiness?: boolean;
  /**
   * Floating review-notes button over the canvas. Off by default: it sits
   * above the plan people came to work on, so it waits until asked for in
   * Viewing Options like the other floating chrome.
   */
  showReviewNotes?: boolean;
  /**
   * Per-tab explanation strips ("what is this panel for"). Off by default;
   * switch on in Viewing Options. Per-panel dismissal still applies while on.
   */
  showPanelIntros?: boolean;
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
  showPlanningWarnings: false,
  showProductionReadiness: false,
  showReviewNotes: false,
  showPanelIntros: false,
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

export const STORAGE_KEY = 'openshotdesigner_project_v1';

export const LEGACY_STORAGE_KEYS = {
  project: 'cineplan_project_v1',
  theme: 'cineplan_theme',
  display: 'cineplan_display',
};

export const STORAGE_KEYS = {
  project: STORAGE_KEY,
  theme: 'openshotdesigner_theme',
  display: 'openshotdesigner_display',
};

/**
 * Reads from the new storage key. If it doesn't exist yet, the value is migrated
 * from the legacy (cineplan_*) key exactly once, so no saved projects are lost
 * when the app is renamed.
 */
export function migrateStorageKey(oldKey: string, newKey: string): string | null {
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

