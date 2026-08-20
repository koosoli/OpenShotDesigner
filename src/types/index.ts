export type ElementType =
  | 'actor'
  | 'camera'
  | 'light'
  | 'wall'
  | 'door'
  | 'window'
  | 'prop'
  | 'track'
  | 'text'
  | 'measurement'
  | 'arrow'
  | 'shape';

export interface Vector2D {
  x: number;
  y: number;
}

export interface Waypoint {
  id: string;
  x: number;
  y: number;
  rotation?: number;
  beat: number; // 1-indexed beat number (e.g. Beat 1 = start, Beat 2 = intermediate, Beat 3 = final)
  dialogueCue?: string;
  hideCue?: boolean;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  rotation: number; // in degrees (0 = pointing right / 90 = down)
  name: string;
  locked?: boolean;
  visible?: boolean;
  opacity?: number;
}

export interface ActorElement extends BaseElement {
  type: 'actor';
  characterLetter: string; // e.g. "A", "B", "JOHN", "SARAH"
  characterName?: string;
  color: string;
  heightCm?: number;
  isStanding: boolean; // standing or seated
  path: Waypoint[];
  actionNotes?: string;
  lookAtTargetId?: string; // another actor or camera or position
}

export type SensorFormat = 'FullFrame' | 'Super35' | 'MFT' | 'LargeFormat';
export type AspectRatio = '16:9' | '2.39:1' | '1.85:1' | '4:3' | '9:16';
export type CameraRigType =
  | 'Tripod'
  | 'Dana Dolly'
  | 'Steadicam'
  | 'Handheld'
  | 'Jib / Crane'
  | 'TechnoCrane'
  | 'Gimbal'
  | 'Drone'
  | 'Slider'
  | 'Car Mount'
  | 'Cable Cam';
export type CameraHeight =
  | 'Ground'
  | 'Knee'
  | 'Waist'
  | 'Eye Level'
  | 'High'
  | 'Low Angle'
  | 'High Angle'
  | 'Bird\'s Eye'
  | 'Overhead / Bird\'s Eye'
  | 'Worm\'s Eye'
  | 'Dutch Angle';

export interface CameraElement extends BaseElement {
  type: 'camera';
  cameraLabel: string; // "A", "B", "C", etc.
  color: string;
  focalLength: number; // in mm (e.g. 18, 24, 35, 50, 85, 135)
  sensorFormat: SensorFormat;
  fovAngle: number; // calculated field of view in degrees
  aspectRatio: AspectRatio;
  cameraHeight: CameraHeight;
  rigType: CameraRigType;
  throwDistance: number; // visual reach of the FOV cone in pixels
  fovOpacity?: number; // opacity of FOV cone (0.05 to 1.0)
  coneDistance?: number;
  path: Waypoint[];
  lookAtTargetId?: string;
  lookAtPoint?: Vector2D;
  associatedShotId?: string;
  cameraModel?: string;
  /** Exposure settings shown on the viewfinder HUD and in exports. */
  aperture?: string;
  iso?: number;
  shutterAngle?: number;
  ndFilter?: string;
}

export type LightFixtureType =
  | 'fresnel'
  | 'led_panel'
  | 'softbox'
  | 'spotlight'
  | 'tube_light'
  | 'practical'
  | 'china_ball'
  | 'reflector'
  | 'hmi'
  | 'par_can'
  | 'kino_flo'
  | 'c_stand_flag'
  | 'tripod'
  | 'flag_solid'
  | 'flag_silk'
  | 'flag_net'
  | 'flag_cutter'
  | 'overhead_diffusion';

export type FlagSize =
  | '4x4'
  | '6x6'
  | '12x12'
  | '12x18'
  | '18x18'
  | '18x24'
  | '24x24'
  | '24x36'
  | '30x36'
  | '36x36'
  | '36x48'
  | '42x42'
  | '48x48'
  | '48x60';
export type FlagNetValue = 'single' | 'double';

export type LightRole =
  | 'key'
  | 'fill'
  | 'negative_fill'
  | 'kicker'
  | 'backlight'
  | 'background'
  | 'hair'
  | 'eye'
  | 'accent'
  | 'practical'
  | 'bounce'
  | 'ambient'
  | 'unassigned';

export interface LightElement extends BaseElement {
  type: 'light';
  fixtureType: LightFixtureType;
  colorTemp: number; // Kelvin (e.g. 3200, 4300, 5600) or 0 for RGB / flags
  rgbColor?: string; // for RGB gels (e.g. #ff0055)
  intensity: number; // 0 to 100 %
  beamAngle: number; // 10 to 120 degrees (0 for flags / non-emitting fixtures)
  throwDistance: number;
  beamVisible?: boolean; // false hides this light's beam cone/glow (default true)
  hasBarnDoors?: boolean;
  hasDiffusionGrid?: boolean;
  brand?: string; // e.g. "ARRI", "Aputure", "Nanlite", "Astera", "Kino Flo"
  fixtureModel?: string; // e.g. "Aputure 600d", "ARRI Skypanel S60"
  lightRole?: LightRole; // Key, Fill, Negative Fill, Kicker, Backlight, Background, etc.
  flagSize?: FlagSize; // fabric size for C-stand flags (18×24", 24×36", ...)
  netValue?: FlagNetValue; // single (≈½ stop) vs double (≈1 stop) net
  labelColor?: string; // per-fixture custom label color (e.g. #ffffff, #f59e0b)
  roleColor?: string; // custom color for this fixture's function/role tag (e.g. #f59e0b)
}

export interface WallElement extends BaseElement {
  type: 'wall';
  x2: number;
  y2: number;
  thickness: number;
  wallColor?: string;
}

export interface DoorElement extends BaseElement {
  type: 'door';
  width: number;
  swingAngle: number; // 0 to 180 degrees (how far open: 0 = closed, 45 = ajar, 90 = standard, 180 = wide)
  swingDirection: 'left' | 'right'; // hinge position (left or right side of frame)
  flipSide?: boolean; // false = opens inward (side A), true = opens outward (side B)
  isOpen?: boolean;
}

export interface WindowElement extends BaseElement {
  type: 'window';
  width: number;
  depth: number;
  sunlightAngle?: number;
  hasCurtains?: boolean;
  /** Hide the sunlight throw cone on this individual window. */
  beamVisible?: boolean;
}

export type PropType =
  | 'table_rect'
  | 'table_round'
  | 'table_coffee'
  | 'dining_set'
  | 'chair'
  | 'armchair'
  | 'sofa'
  | 'sofa_sectional'
  | 'bed'
  | 'bed_king'
  | 'nightstand'
  | 'wardrobe'
  | 'desk'
  | 'bookshelf'
  | 'bar_counter'
  | 'bar_stool'
  | 'director_chair'
  | 'apple_box'
  | 'camera_cart'
  | 'green_screen'
  | 'car'
  | 'vehicle_suv'
  | 'vehicle_truck'
  | 'vehicle_police'
  | 'gun'
  | 'rifle'
  | 'bomb'
  | 'letter'
  | 'stairs'
  | 'plant'
  | 'tree'
  | 'tv'
  | 'sound_boom'
  | 'c_stand'
  | 'tripod'
  | 'box'
  | 'circle';

export interface PropElement extends BaseElement {
  type: 'prop';
  propType: PropType;
  width: number;
  height: number;
  color?: string;
  label?: string;
}

export interface TrackElement extends BaseElement {
  type: 'track';
  x2: number;
  y2: number;
  isCurved?: boolean;
  curveOffset?: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
  /** 'normal' | 'bold' | numeric weights like '600' */
  fontWeight?: string;
  /** 'normal' | 'italic' */
  fontStyle?: string;
  underline?: boolean;
  strikethrough?: boolean;
  /** CSS font family stack */
  fontFamily?: string;
  /** SVG text-anchor: where the text aligns relative to the element point */
  textAlign?: 'left' | 'center' | 'right';
}

export interface MeasurementElement extends BaseElement {
  type: 'measurement';
  x2: number;
  y2: number;
  unit: 'ft' | 'm';
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  x2: number;
  y2: number;
  /** Stroke color */
  color?: string;
  strokeWidth?: number;
  /** Arrowhead configuration */
  headStyle?: 'single' | 'double' | 'open';
  /** Line dash pattern */
  dashStyle?: 'solid' | 'dashed' | 'dotted';
  /** Optional label shown above the line midpoint */
  label?: string;
}

export type ShapeType =
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'line';

/** A free-form graphic: blocking zone, set piece footprint, callout area. */
export interface ShapeElement extends BaseElement {
  type: 'shape';
  shapeType: ShapeType;
  width: number;
  height: number;
  /** Fill colour; `filled: false` leaves the shape as an outline only. */
  color: string;
  filled?: boolean;
  /** Fill opacity, 0 – 1. */
  opacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  dashStyle?: 'solid' | 'dashed' | 'dotted';
  /** Rounded corners, rectangles only. */
  cornerRadius?: number;
  label?: string;
}

export type FloorPlanElement =
  | ActorElement
  | CameraElement
  | LightElement
  | WallElement
  | DoorElement
  | WindowElement
  | PropElement
  | TrackElement
  | TextElement
  | MeasurementElement
  | ArrowElement
  | ShapeElement;

export type ShotSize =
  | 'ELS' // Extreme Long Shot
  | 'WS'  // Wide Shot / Master
  | 'FS'  // Full Shot
  | 'MWS' // Medium Wide Shot / Cowboy
  | 'MS'  // Medium Shot
  | 'MCU' // Medium Close-Up
  | 'CU'  // Close-Up
  | 'ECU' // Extreme Close-Up
  | 'OTS' // Over the Shoulder
  | 'POV' // Point of View
  | 'Insert' // Detail / Insert
  | 'Dutch';

export type CameraMovement =
  | 'Static'
  | 'Pan'
  | 'Tilt'
  | 'Dolly In'
  | 'Dolly Out'
  | 'Tracking'
  | 'Pedestal'
  | 'Boom / Crane'
  | 'Handheld'
  | 'Steadicam'
  | 'Whip Pan'
  | 'Zoom';

export type ShotStatus = 'planned' | 'rehearsed' | 'ready' | 'taken' | 'omitted';

/** A single storyboard frame attached to one camera keyframe. */
export interface StoryboardFrame {
  image: string;
  fit?: 'cover' | 'contain';
  /** Where its thumbnail sits on the floor plan. */
  canvasPosition?: Vector2D;
  note?: string;
}

export interface Shot {
  id: string;
  sceneNumber: string;
  shotNumber: string; // e.g. "1A", "1B"
  name: string;
  cameraId: string; // references CameraElement.id
  cameraLabel: string; // "A", "B", etc.
  shotSize: ShotSize;
  lensMm: number;
  cameraAngle: CameraHeight;
  movement: CameraMovement;
  aspectRatio: AspectRatio;
  frameRate: number; // e.g. 24, 25, 30, 48, 60
  subjectActorIds: string[];
  equipmentNotes?: string;
  storyboardImage?: string;
  storyboardFit?: 'cover' | 'contain';
  storyboardPosition?: { x: number; y: number };
  storyboardCanvasPosition?: { x: number; y: number };
  /**
   * One storyboard frame per camera keyframe, keyed by waypoint id ('start' for
   * the camera's base position). See utils/storyboardFrames.
   */
  storyboardFrames?: Record<string, StoryboardFrame>;
  /**
   * Slot keys explicitly omitted from the storyboard and export contact sheet
   * (e.g. intermediate waypoints or specific unboarded frames).
   */
  omittedStoryboardSlots?: string[];
  /** Legacy single end frame, folded into `storyboardFrames` when read. */
  storyboardImageEnd?: string;
  storyboardFitEnd?: 'cover' | 'contain';
  storyboardCanvasPositionEnd?: { x: number; y: number };
  framingDescription: string;
  actionScriptNotes?: string;
  status: ShotStatus;
  takesCount: number;
  estDurationSeconds: number;
  order: number;
  /** Optional link back to the imported/created lined script row. */
  scriptLineId?: string;
}

/** Standard Hollywood screenplay element types. */
export type ScriptElementType =
  | 'scene'          // slugline / scene heading (INT. KITCHEN - DAY)
  | 'action'         // action / description
  | 'character'      // character cue
  | 'parenthetical'  // (beat)
  | 'dialogue'
  | 'transition'     // CUT TO:
  | 'shot'           // ANGLE ON / CLOSE ON
  | 'note'
  | 'page-break';

/** Script view / format mode: Hollywood Screenplay, AV (Audio-Visual) 2-column, or Lined coverage. */
export type ScriptFormatMode = 'screenplay' | 'av_script' | 'lined_coverage';

/** A row in an Audio-Visual (AV) dual-column script (Commercials, Documentaries, Multi-Cam). */
export interface AVScriptRow {
  id: string;
  shotNumber: string; // e.g. "1", "1A"
  shotName?: string; // e.g. "WS - Office Lobby"
  shotSize?: ShotSize; // e.g. "WS", "CU", "MS"
  video: string; // Visuals, camera moves, lighting, graphics
  audio: string; // Voiceover, dialogue, SFX, music
  durationSec?: number; // Estimated timing in seconds
  linkedShotId?: string; // Linked camera shot on floor plan
}

export interface ScriptLine {
  id: string;
  lineNumber: number;
  text: string;
  type?: ScriptElementType;
  /** Scene number detected on the nearest preceding slugline (e.g. "8"). */
  sceneNumber?: string;
  /** True when this line is itself a slugline carrying a scene number. */
  isSceneHeading?: boolean;
  linkedShotId?: string;
}

/**
 * A lining mark: the vertical line drawn over a range of screenplay lines that
 * marks which part of the script a shot covers (classic lined script).
 */
export interface ScriptMark {
  id: string;
  shotId: string;
  /** Inclusive range of script line ids covered by the shot. */
  startLineId: string;
  endLineId: string;
  /**
   * Optional character offsets inside the first/last line, so a lining can
   * cover as little as a single word rather than whole lines.
   */
  startOffset?: number;
  endOffset?: number;
  /** Shot number shown in the bubble at the top of the vertical line. */
  label: string;
  /** Short description above the line, e.g. "CU Jenna". */
  description?: string;
  /** Stroke color (matches the linked camera color when available). */
  color: string;
  sceneNumber?: string;
  /**
   * Classic convention: the lining ends on a crossbar. It only gets an
   * arrowhead when the shot carries on past the bottom of the page.
   */
  continuesNext?: boolean;
  /**
   * Squiggle sub-range — the stretch of the shot where the subject is out of
   * frame. Both ids must fall inside [startLineId, endLineId].
   */
  wavyStartLineId?: string;
  wavyEndLineId?: string;
  wavyStartOffset?: number;
  wavyEndOffset?: number;
}

export interface GridSettings {
  size: number; // in pixels (e.g. 40px = 1 meter or 2.5 ft)
  snap: boolean;
  showGrid: boolean;
  unit: 'ft' | 'm';
  pixelsPerUnit: number; // 40px = 1m, or 25px = 1ft
}

export interface BackgroundImage {
  id?: string;
  url: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number; // 0 to 1
  rotation?: number;
  locked: boolean;
  visible: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface SceneSetup {
  id: string;
  name: string; // e.g. "Setup 1: Master Wide & Dinner Dialogue"
  sceneNumber: string;
  scriptPage?: string;
  location: string;
  timeOfDay: 'Day INT' | 'Night INT' | 'Day EXT' | 'Night EXT';
  elements: FloorPlanElement[];
  shots: Shot[];
  scriptTitle?: string;
  scriptText?: string;
  scriptLines?: ScriptLine[];
  scriptMarks?: ScriptMark[];
  avScriptRows?: AVScriptRow[];
  scriptFormatMode?: ScriptFormatMode;
  /**
   * Shot ids in storyboard order. The board can be arranged independently of
   * the shot list; shots missing from this list simply follow at the end.
   */
  storyboardOrder?: string[];
  backgroundImage?: BackgroundImage | null;
  backgroundImages?: BackgroundImage[];
  currentBeat: number;
  totalBeats: number;
  shootMode?: 'single_cam' | 'multi_cam'; // single_cam (default: Cam A across shots) vs multi_cam (Cam A, B, C concurrent)
  aspectRatio?: AspectRatio; // project / storyboard aspect ratio for this scene
  gridSettings: GridSettings;
  canvasScale: number;
  canvasOffset: Vector2D;
}

export interface Project {
  id: string;
  title: string;
  /**
   * The screenplay is a property of the production, not of one scene: it stays
   * open when you switch or add scenes. (Per-scene `SceneSetup.scriptLines` is
   * the legacy location, still read once for older saved projects.)
   */
  scriptTitle?: string;
  scriptText?: string;
  scriptLines?: ScriptLine[];
  avScriptRows?: AVScriptRow[];
  scriptFormatMode?: ScriptFormatMode;
  director: string;
  cinematographer: string;
  productionCompany?: string;
  /** Production logo (data URL) stamped on exported plans and call sheets. */
  logo?: string;
  logoName?: string;
  date: string;
  setups: SceneSetup[];
  activeSetupId: string;
}

export type ActiveTool =
  | 'select'
  | 'pan'
  | 'actor'
  | 'camera'
  | 'light'
  | 'wall'
  | 'door'
  | 'window'
  | 'prop'
  | 'track'
  | 'measure'
  | 'arrow'
  | 'text'
  | 'shape';
