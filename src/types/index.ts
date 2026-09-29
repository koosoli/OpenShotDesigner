import type { DocumentLanguage } from '../domain/documentText';
import type { LightModifier, LightPhotometricReference } from '../domain/lighting/types';

export type ElementType =
  | 'actor'
  | 'camera'
  | 'light'
  | 'wall'
  | 'door'
  | 'window'
  | 'prop'
  | 'track'
  | 'road'
  | 'text'
  | 'measurement'
  | 'arrow'
  | 'shape'
  | 'cable'
  | 'stroke'
  | 'annotation';

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

/** Dialogue shown above a virtual actor when the scene reaches this beat. */
export interface ActorSpeechCue {
  id: string;
  beat: number;
  text: string;
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
  /** Owning plan layer (plan §6.1). Undefined = unlayered, always rendered. */
  layerId?: string;
}

export interface ActorElement extends BaseElement {
  type: 'actor';
  characterLetter: string; // e.g. "A", "B", "JOHN", "SARAH"
  characterName?: string;
  /** Script `Character.id` this marker plays (optional; absent = not linked / no script). */
  characterId?: string;
  color: string;
  heightCm?: number;
  isStanding: boolean; // standing or seated
  path: Waypoint[];
  actionNotes?: string;
  /** Speech is independent from movement, so stationary actors can speak on any beat. */
  speechCues?: ActorSpeechCue[];
  lookAtTargetId?: string; // another actor or camera or position
}

export type SensorFormat = 'FullFrame' | 'Super35' | 'MFT' | 'LargeFormat';
export type AspectRatio = '16:9' | '2.39:1' | '1.85:1' | '4:3' | '9:16';
export type CameraRigType =
  | 'Tripod'
  | 'Broadcast Pedestal'
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
  | 'flag_cucoloris'
  | 'flag_branchaloris'
  | 'flag_shutter'
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
  /** Ordered, independently configurable fixture accessories/modifiers. */
  modifiers?: LightModifier[];
  /** Explicit source-backed output reference; absent means output is unknown. */
  photometricReference?: LightPhotometricReference;
  /** Per-fixture opt-in; stays off unless the user enables it. */
  photometricOverlayVisible?: boolean;
  brand?: string; // e.g. "ARRI", "Aputure", "Nanlite", "Astera", "Kino Flo"
  fixtureModel?: string; // e.g. "Aputure 600d", "ARRI Skypanel S60"
  lightRole?: LightRole; // Key, Fill, Negative Fill, Kicker, Backlight, Background, etc.
  flagSize?: FlagSize; // fabric size for C-stand flags (18×24", 24×36", ...)
  netValue?: FlagNetValue; // single (≈½ stop) vs double (≈1 stop) net
  /**
   * Barn-door / framing-shutter cut angle in degrees (0 = doors folded flat
   * against the fixture face, 85 = wide open). Absent = the 35° default; never
   * backfilled, so older saves keep drawing the default (plan rule 13).
   */
  shutterCutDeg?: number;
  labelColor?: string; // per-fixture custom label color (e.g. #ffffff, #f59e0b)
  roleColor?: string; // custom color for this fixture's function/role tag (e.g. #f59e0b)
  /** DMX-512 control universe (1-32). Absent/undefined = not on a DMX network. */
  dmxUniverse?: number;
  /** DMX-512 start address (1-512). */
  dmxAddress?: number;
  /** Explicit footprint for the selected fixture mode. Unknown until configured. */
  dmxChannelCount?: number;
  /** Human-readable selected mode, e.g. "RGBW 16-bit". */
  dmxModeName?: string;
  /** Stable id of the selected bundled or project fixture profile. */
  fixtureProfileId?: string;
  /** Stable id of the selected control mode within fixtureProfileId. */
  fixtureModeId?: string;
  /** Original MVR UUID, retained so import/export round-trips remain stable. */
  mvrUuid?: string;
  /** Content-addressed bytes of the real GDTF archive referenced by this fixture. */
  gdtfAssetId?: string;
  /** Root-level filename used by MVR's GDTFSpec node. */
  gdtfFileName?: string;
  /**
   * Optional movement path — same beats and semantics as actors, cameras and
   * props. Lights move more often than the plan model used to assume: followspots
   * and practicals travel during a take, and on an event the whole position
   * changes between numbers. Absent = the fixture stays where it was placed.
   */
  path?: Waypoint[];
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
  // Architecture & fixtures: the built-in things a location HAS rather than
  // things a set dresser brings. They do not move between setups, which is
  // exactly why they belong on the plan — a bathroom's toilet decides where a
  // camera can stand.
  | 'toilet'
  | 'sink'
  | 'bathtub'
  | 'shower'
  | 'kitchen_counter'
  | 'kitchen_island'
  | 'fridge'
  | 'stove'
  | 'column'
  | 'railing'
  | 'radiator'
  | 'fireplace'
  | 'plant'
  | 'tree'
  | 'tv'
  | 'sound_boom'
  | 'c_stand'
  | 'tripod'
  | 'box'
  | 'circle'
  // Concert & Live Event Staging
  | 'stage'
  | 'stage_riser'
  | 'stage_runway'
  | 'stage_truss'
  | 'drum_kit'
  | 'keyboard_rig'
  | 'amp_stack'
  | 'speaker_stack'
  | 'speaker_array'
  | 'sub_stack'
  | 'monitor_wedge'
  | 'foh_console'
  | 'monitor_console'
  | 'mic_stand'
  | 'barricade'
  | 'video_wall'
  // Broadcast & Production
  | 'broadcast_truck'
  | 'broadcast_van'
  | 'sat_truck';

export interface PropElement extends BaseElement {
  type: 'prop';
  propType: PropType;
  width: number;
  height: number;
  color?: string;
  label?: string;
  /** Optional movement path (cars, trucks, furniture moves) — same beats as actors & cameras. */
  path?: Waypoint[];
}

export interface TrackElement extends BaseElement {
  type: 'track';
  x2: number;
  y2: number;
  isCurved?: boolean;
  curveOffset?: number;
}

/** Road / street surface: an exterior counterpart to the dolly track. */
export type RoadSurface = 'asphalt' | 'concrete' | 'gravel' | 'cobble' | 'dirt' | 'rail';

/** Centre-line marking painted down the carriageway. */
export type RoadMarking = 'none' | 'dashed' | 'solid' | 'double' | 'crosswalk';

/**
 * A street, road, path or driveway drawn as a two-endpoint run with optional
 * curve — the same geometry as a dolly track, so endpoint dragging, curving,
 * group transforms and snapping all work identically. Exterior plans need a
 * carriageway with real width and markings, not a line.
 */
export interface RoadElement extends BaseElement {
  type: 'road';
  x2: number;
  y2: number;
  isCurved?: boolean;
  curveOffset?: number;
  /** Carriageway width in plan px (kerb to kerb, excluding pavements). */
  width: number;
  surface?: RoadSurface;
  marking?: RoadMarking;
  /** Number of lanes; 1 draws no lane divider. Absent = 2. */
  lanes?: number;
  /** Draw a pavement / sidewalk strip along both kerbs. */
  sidewalks?: boolean;
  /** Pavement width in plan px; absent = a proportion of the carriageway. */
  sidewalkWidth?: number;
  color?: string;
  label?: string;
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
  /** Shared Asset Library symbol rendered inside this shape footprint. */
  symbolId?: string;
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

/** Standard production cable / signal / power run types. */
export type CableType =
  | 'sdi_12g'
  | 'sdi_3g'
  | 'hdmi'
  | 'fiber'
  | 'ethernet'
  | 'dmx'
  | 'audio_xlr'
  | 'aes_ebu'
  | 'speakon'
  | 'socapex'
  | 'smpte_fiber'
  | 'power_20a'
  | 'power_60a'
  | 'power_100a'
  | 'power_schuko'
  | 'power_true1'
  | 'power_cee16'
  | 'power_cee32'
  | 'power_cee63'
  | 'power_cee125';

/** A single draggable routing handle along a cable run. */
export interface CablePathPoint {
  id: string;
  x: number;
  y: number;
}

/** A patch / signal / power cable run drawn between two points on the floor plan. */
export interface CableElement extends BaseElement {
  type: 'cable';
  x2: number;
  y2: number;
  cableType: CableType;
  /** Where this cable originates (e.g. "CAM A", "CCU 1", "FOH", "Distro 1"). */
  fromLabel: string;
  /** Where this cable terminates (e.g. "CCU 1", "MON 3", "Sub 1", "20A Ckt 4"). */
  toLabel: string;
  /** Semantic endpoints (plan §20): element/port references when known. */
  fromElementId?: string;
  toElementId?: string;
  fromPortId?: string;
  toPortId?: string;
  /** Stroke color (defaults to the cable type's color). */
  color?: string;
  strokeWidth?: number;
  showLabel?: boolean;
  notes?: string;
  /** Optional intermediate routing points. Cable renders as a polyline through these. */
  path?: CablePathPoint[];
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
  | RoadElement
  | TextElement
  | MeasurementElement
  | ArrowElement
  | ShapeElement
  | CableElement
  | StrokeElement
  | AnnotationElement;

type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type ValueOfUnion<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;

/**
 * A partial update to any floor-plan element.
 *
 * `Partial<FloorPlanElement>` looks like the right type and is not: over a
 * union it distributes to `Partial<ActorElement> | Partial<CameraElement> | …`,
 * so `{ path: [...] }` matches no member on its own and every caller reached
 * for `as any` to get past it. Seventy-odd of those accumulated in the canvas,
 * and each one is a place where a misspelled key writes a junk property
 * straight into persisted project state with nothing to complain.
 *
 * This flattens the union instead: every key any element declares, optional,
 * with that key's real value type. `{ x2: 12 }` type-checks; `{ x2: 'twelve' }`
 * and `{ xx2: 12 }` do not.
 */
export type ElementPatch = {
  [K in KeysOfUnion<FloorPlanElement>]?: ValueOfUnion<FloorPlanElement, K>;
};

/** A single sampled point of a freehand stroke (plan §6.2). */
export interface StrokePoint {
  x: number;
  y: number;
  /** Pointer pressure 0–1 where the browser reports it. */
  pressure?: number;
}

/**
 * Freehand annotation stroke (plan §6.2). Lives on the Annotations layer;
 * drawn with pen/highlighter via Pointer Events (mouse, touch, stylus).
 */
export interface StrokeElement extends BaseElement {
  type: 'stroke';
  points: StrokePoint[];
  color: string;
  strokeWidth: number;
  toolStyle?: 'pen' | 'highlighter';
}

/**
 * A callout annotation pinned to another plan element (plan §6.2).
 *
 * `x`/`y` is the freely-movable text anchor; the leader line is derived at
 * render time from the target element's position to this anchor, so dragging
 * either end keeps the line connected. `targetElementId` references any other
 * element's id; when the target is gone the annotation renders detached
 * rather than guessing a position (rule 13).
 */
export interface AnnotationElement extends BaseElement {
  type: 'annotation';
  /** Id of the element this callout points at. */
  targetElementId: string;
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
  /** Fill behind the text pill; absent = theme default. */
  backgroundColor?: string;
  /** False hides the text pill background (text only). Absent = shown. */
  showBackground?: boolean;
  /** Leader-line stroke color; absent = theme default. */
  lineColor?: string;
  /** Leader-line width in px; absent = default. */
  lineWidth?: number;
  /** Leader-line opacity 0–1; absent = faint default. */
  lineOpacity?: number;
  /** Leader-line dash pattern; absent = solid. */
  lineDash?: 'solid' | 'dashed' | 'dotted';
}

/** A real plan group (plan §6.4): table + chairs, drum kit, FOH tower… */
export interface PlanGroup {
  id: string;
  name?: string;
  childIds: string[];
  /**
   * Group animation keyframes (v14). Optional and absent-safe; reuses the
   * Waypoint shape with group-specific semantics:
   * - x/y = GROUP PIVOT position at that beat (not any member's position),
   * - rotation = ROTATION DELTA in degrees relative to the members' base pose.
   */
  path?: Waypoint[];
  /** Pivot (bbox centre of members) captured when the first keyframe was added. */
  basePivot?: { x: number; y: number };
}

/** Plan layer defaults (plan §6.1). */
export interface PlanLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0–1; undefined = fully opaque. */
  opacity?: number;
  /** Whether this layer appears in print/PDF exports. */
  printVisible?: boolean;
  order: number;
}

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
  /**
   * Legacy stored take count. Superseded by the continuity log: the truth is
   * `takesCountFor(project.takes, shot.id)`. Kept on the type so projects
   * written before the log existed still load; nothing writes it any more, and
   * two counters that can disagree means one of them is a lie.
   *
   * @deprecated Derive from `project.takes` instead.
   */
  takesCount: number;
  /**
   * Shot on the day without having been planned — the pickup, the safety, the
   * insert. It is a real shot with a real number (see
   * `domain/shots/numbering.ts`), and it never joins the plan retroactively:
   * the checklist compares planned against actual, and a pickup silently
   * becoming "planned" would hide the shot that was actually missed.
   */
  unplanned?: boolean;
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
  /**
   * This row is deliberately not a shot: titles, a lower third, graphics,
   * stock or archive footage, a music-only beat. It still prints, and the
   * coverage check stops asking it to become a camera on the floor plan.
   * Absent = an ordinary shot row.
   */
  noShot?: boolean;
  /** Board art for this row (data URL). Absent = fall back to the linked shot's storyboard. */
  storyboardImage?: string;
  storyboardFit?: 'cover' | 'contain';
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
  /**
   * Scene heading whose scene was cut. The slugline stays in place (numbering
   * never shifts) and renders as "SCENE n — OMITTED" until deleted again.
   */
  omitted?: boolean;
  /** Body lines parked when the scene was omitted; restored verbatim by "Restore". */
  omittedBody?: ScriptLine[];
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

/**
 * Sun planning for an exterior (plan §37). All optional and absent-safe: a
 * project that never opens the sun tools is unaffected.
 */
export interface SunSettings {
  /** Draw the sun/compass overlay on the plan. */
  enabled?: boolean;
  /**
   * Where true north points on this plan, clockwise from screen-up. A floor
   * plan is drawn to fit the page, not to point north, so this is explicit
   * rather than assumed.
   */
  planNorthDeg?: number;
  /** ISO date being planned (YYYY-MM-DD); absent = the project date. */
  date?: string;
  /** Local time of day in minutes past midnight; absent = 12:00. */
  timeMinutes?: number;
}

export interface GridSettings {
  size: number; // in pixels (e.g. 40px = 1 meter or 2.5 ft)
  snap: boolean;
  showGrid: boolean;
  unit: 'ft' | 'm';
  pixelsPerUnit: number; // 30px = 1m, or 25px = 1ft
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
  /** Last real-world scale calibration applied to this reference image. */
  calibration?: BackgroundImageCalibration;
}

/**
 * A reference image that has been through the legacy normalisation and is
 * therefore guaranteed an id.
 *
 * `BackgroundImage.id` is optional because a pre-v3 project stored one
 * unnamed image per setup. Everything that renders or edits an image goes
 * through that normalisation first, so the render layer should not have to
 * keep asking whether the id exists — and, more to the point, should not be
 * able to pass `undefined` where a selection id is expected.
 */
export type IdentifiedBackgroundImage = BackgroundImage & { id: string };

export interface BackgroundImageCalibration {
  realLength: number;
  unit: 'm' | 'ft';
  measuredCanvasPixels: number;
  appliedScaleFactor: number;
  gridUnitAtCalibration: 'm' | 'ft';
  pixelsPerUnitAtCalibration: number;
  calibratedAt: string;
}

export type EquipmentCategory =
  | 'camera'
  | 'lighting'
  | 'grip'
  | 'audio'
  | 'power_media'
  | 'cables'
  | 'props'
  | 'expendables'
  | 'other';

export interface EquipmentPackageItem {
  id: string;
  category: EquipmentCategory;
  name: string;
  brand?: string;
  model?: string;
  quantity: number;
  roleOrFunction?: string;
  specs?: string;
  notes?: string;
}

export interface EquipmentItem {
  id: string;
  category: EquipmentCategory;
  name: string;
  brand?: string;
  model?: string;
  quantity: number;
  roleOrFunction?: string;
  specs?: string;
  notes?: string;
  isCustom?: boolean;
  elementId?: string; // Links to canvas element if overridden
  /**
   * The catalogue fixture this row came from, when the plan element named one.
   *
   * Downstream consumers (the load list's weight lookup) otherwise have only
   * brand and model strings to match on, which fails as soon as two profiles
   * share a model name or a user renames one. An id is the fact; the strings
   * are a description of it.
   */
  fixtureProfileId?: string;
  /**
   * The DMX personality chosen on that profile. Kept as an id beside the
   * profile so the footprint stays a fact after `specs` is edited by hand —
   * `specs` is a printed description, not the source of truth.
   */
  fixtureModeId?: string;
  isPackage?: boolean; // Whether this item is an expandable kit/package
  packageItems?: EquipmentPackageItem[]; // Nested accessories (batteries, cards, monitors, follow focus, etc.)
}

export interface MasterEquipmentItem extends EquipmentItem {
  /** Setup / scene IDs and names where this gear is required */
  usedInSetups: Array<{ id: string; name: string; sceneNumber?: string; quantity: number }>;
  /** Peak concurrent quantity needed in any single scene */
  maxConcurrentQuantity: number;
}

export interface SceneSetup {
  id: string;
  name: string; // e.g. "Setup 1: Master Wide & Dinner Dialogue"
  sceneNumber: string;
  scriptPage?: string;
  location: string;
  timeOfDay: 'Day INT' | 'Night INT' | 'Day EXT' | 'Night EXT';
  /** Semantic link to a canonical Location entity (plan §4.13). */
  locationId?: string;
  /** When set, this setup is the reusable MASTER PLAN for that location (§13). */
  masterPlanForLocationId?: string;
  elements: FloorPlanElement[];
  shots: Shot[];
  /** Custom added or overridden equipment items for this scene */
  customEquipment?: EquipmentItem[];
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
  /** Plan layers (plan §6.1). Absent in pre-v3 projects; migrated to defaults. */
  layers?: PlanLayer[];
  /** Real plan groups (plan §6.4). */
  groups?: PlanGroup[];
  currentBeat: number;
  totalBeats: number;
  shootMode?: 'single_cam' | 'multi_cam'; // single_cam (default: Cam A across shots) vs multi_cam (Cam A, B, C concurrent)
  aspectRatio?: AspectRatio; // project / storyboard aspect ratio for this scene
  gridSettings: GridSettings;
  /** Sun/compass planning for this scene; absent = never configured. */
  sunSettings?: SunSettings;
  canvasScale: number;
  canvasOffset: Vector2D;
}

/**
 * A named revision is an intentional, user-created milestone — distinct from
 * the per-setup undo history. The snapshot holds the full project content at
 * the moment the revision was saved (minus the revisions list itself, so
 * revisions never nest).
 */
export interface ProjectRevision {
  id: string;
  name: string;
  /** ISO timestamp of when the revision was saved. */
  createdAt: string;
  note?: string;
  snapshot: Project;
}

export interface ScriptImportRevision {
  id: string;
  createdAt: string;
  sourceFileName: string;
  scriptTitle: string;
  /** Fountain/plain-text source before the newer draft replaced it. */
  scriptText: string;
  summary: { added: number; removed: number; changed: number; unchanged: number };
}

export interface Project {
  id: string;
  /**
   * Persisted schema version (plan §3.2). Absent = legacy v1; every schema
   * change bumps this and adds a migration in src/domain/migrations/.
   */
  schemaVersion?: number;
  title: string;
  /** ISO timestamp of the last persisted save; stamped by the project library. */
  updatedAt?: string;
  /**
   * The screenplay is a property of the production, not of one scene: it stays
   * open when you switch or add scenes. (Per-scene `SceneSetup.scriptLines` is
   * the legacy location, still read once for older saved projects.)
   */
  scriptTitle?: string;
  scriptText?: string;
  scriptLines?: ScriptLine[];
  /** Previous drafts retained when a revised screenplay is imported. */
  scriptRevisions?: ScriptImportRevision[];
  /**
   * The screenplay's cover: title, credit, author, draft and contact block,
   * using Fountain's standard title-page keys so an import and an export
   * round-trip. Absent = no cover is printed.
   */
  titlePage?: import('../domain/script').ScreenplayTitlePage;
  /**
   * Scene numbers are production numbers. Absent or false: headings are
   * numbered by position and renumbered on every edit. True: every heading
   * keeps its number, inserts become 3A/3B, removals leave gaps — the state a
   * script enters once breakdowns and schedules refer to its numbers. See
   * domain/script/numbering.ts.
   */
  sceneNumbersLocked?: boolean;
  avScriptRows?: AVScriptRow[];
  scriptFormatMode?: ScriptFormatMode;
  director: string;
  cinematographer: string;
  productionCompany?: string;
  /** Production logo (data URL) stamped on exported plans and call sheets. */
  logo?: string;
  logoName?: string;
  /**
   * Production-company contact details rendered on paperwork (call sheets).
   * Optional and absent-safe; the canonical single source (plan rule 37) —
   * reports derive from it instead of storing hidden copies.
   */
  /**
   * Call-sheet content that belongs to the production rather than to one day —
   * walkie channels, unit base, the standing safety policy. Every day inherits
   * these live and may override any single field; only the override is stored,
   * so changing a channel here changes every sheet that has not overridden it.
   */
  standingCallSheet?: import('../domain/reports').StandingCallSheet;
  /**
   * Language the production's PAPERWORK is printed in.
   *
   * A project setting, not a browser one: a call sheet is a shared document,
   * and if it followed the exporting browser the crew would be holding two
   * different pages. Absent means English, so older projects keep printing
   * exactly what they printed before.
   */
  documentLanguage?: DocumentLanguage;
  productionCompanyInfo?: {
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  date: string;
  setups: SceneSetup[];
  activeSetupId: string;
  /**
   * vNext production collections (plan §4). All optional for backward
   * compatibility; absent in pre-v4 projects and backfilled to empty arrays
   * by the v3→v4 migration.
   */
  locations?: import('../domain/locations').Location[];
  people?: import('../domain/people').Person[];
  castAssignments?: import('../domain/people').CastAssignment[];
  characters?: import('../domain/script').Character[];
  scriptScenes?: import('../domain/script').ScriptScene[];
  breakdownItems?: import('../domain/script').BreakdownItem[];
  productionSegments?: import('../domain/shots').ProductionSegment[];
  productionDays?: import('../domain/scheduling').ProductionDay[];
  scheduleBlocks?: import('../domain/scheduling').ScheduleBlock[];
  productionCalendarEvents?: import('../domain/scheduling').ProductionCalendarEvent[];
  /** v5 additions (plan §15.2, §22, §24). Optional; backfilled by migration. */
  runOfShowCues?: import('../domain/scheduling').RunOfShowCue[];
  powerPlan?: import('../domain/power').PowerPlan;
  logisticsContainers?: import('../domain/logistics').LogisticsContainer[];
  packedItems?: import('../domain/logistics').PackedItem[];
  /**
   * Which shoot day the load list is scoped to (`ProductionDay.id`); absent
   * means the whole production, which is what every project stored before this
   * existed, so nothing needs migrating. It lives on the project rather than in
   * panel state because the printed sheet is built from the project alone — a
   * driver has to be able to print the day they are looking at.
   */
  logisticsDayFilterId?: string;
  moodBoards?: import('../domain/moodboard').MoodBoard[];
  /** Production task board (v13). Optional and absent-safe. */
  taskBoards?: import('../domain/tasks').TaskBoard[];
  tasks?: import('../domain/tasks').Task[];
  /** Offline review threads attached to production entities. */
  reviewComments?: import('../domain/comments').ReviewComment[];
  /** User-acknowledged readiness findings. A changed fingerprint resurfaces. */
  readinessDismissals?: import('../domain/readiness').ReadinessDismissal[];
  /**
   * vNext rigging collections (plan §11, §23). Optional and absent-safe —
   * legacy projects without them load unchanged, so no migration is required
   * yet; the next migration wave will formalize/backfill these fields.
   */
  trussProfiles?: import('../domain/rigging').TrussProfile[];
  trussElements?: import('../domain/rigging').TrussElement[];
  suspendedLoads?: import('../domain/rigging').SuspendedLoad[];
  riggingItems?: import('../domain/rigging').RiggingItem[];
  /**
   * Hardware weight assumptions for the rigging plot — per clamp, per safety,
   * and a flat cable allowance per run. Optional and absent-safe: a project
   * that has never set them is planned with `DEFAULT_RIGGING_ASSUMPTIONS`, the
   * same figures the panel used while these lived in session state.
   */
  riggingAssumptions?: import('../domain/rigging').RiggingAssumptions;
  /** Named revisions (milestone snapshots, plan §13.2). Optional and absent-safe
   *  legacy projects without them load unchanged; formalized/backfilled in the
   *  next migration wave.
   */
  revisions?: ProjectRevision[];
  /**
   * Names typed on the continuity page for the two crew roles that have no
   * project field of their own. A fallback only: anyone assigned the role on
   * the crew list wins, so building the crew list later takes over instead of
   * leaving a stale name on the paperwork. Optional and absent-safe.
   */
  continuityCrew?: import('../domain/continuity').ContinuityCrewDefaults;
  /**
   * Which shoot day the continuity page is scoped to (`ProductionDay.id`);
   * absent means the whole production. It lives on the project rather than in
   * panel state for the same reason the load list's does — the printed report
   * is built from the project alone, and the script supervisor has to be able
   * to print the day they are looking at.
   */
  continuityDayFilterId?: string;
  /**
   * Continuity log (v24): one record per take actually shot. The source of the
   * shooting-day checklist and of the DaVinci Resolve metadata export.
   * Optional and absent-safe — a project that has never shot anything has no
   * takes, which is not the same as an empty day.
   */
  takes?: import('../domain/continuity').Take[];
  /**
   * The continuity binder: wardrobe, hair, make-up and props notes, keyed on
   * script day so out-of-order shooting stays checkable (plan §36). Optional
   * and absent-safe — a project that keeps no binder has none, which is not
   * the same as an empty one.
   */
  continuityNotes?: import('../domain/continuity').ContinuityNote[];
  /** Multi-camera coverage plan (plan §15.3). Optional and absent-safe. */
  coverageMatrix?: import('../domain/scheduling').CoverageMatrix;
  /**
   * Budget inputs (v21): currency and VAT settings, equipment rates keyed by
   * the master-list grouping, and hand-entered lines. People carry their own
   * rate card. The budget itself is derived, never stored (rule 37).
   */
  budget?: import('../domain/budget').ProjectBudget;
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
  | 'road'
  | 'measure'
  | 'arrow'
  | 'text'
  | 'shape'
  | 'cable'
  | 'stroke';
