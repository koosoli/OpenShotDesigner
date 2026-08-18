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
  | 'measurement';

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
  coneDistance?: number;
  path: Waypoint[];
  lookAtTargetId?: string;
  lookAtPoint?: Vector2D;
  associatedShotId?: string;
  cameraModel?: string;
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
  | 'c_stand_flag'
  | 'overhead_diffusion';

export interface LightElement extends BaseElement {
  type: 'light';
  fixtureType: LightFixtureType;
  colorTemp: number; // Kelvin (e.g. 3200, 4300, 5600) or 0 for RGB
  rgbColor?: string; // for RGB gels (e.g. #ff0055)
  intensity: number; // 0 to 100 %
  beamAngle: number; // 10 to 120 degrees
  throwDistance: number;
  hasBarnDoors?: boolean;
  hasDiffusionGrid?: boolean;
  fixtureModel?: string; // e.g. "Aputure 600d", "ARRI Skypanel S60"
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
  | 'stairs'
  | 'plant'
  | 'tv'
  | 'sound_boom'
  | 'c_stand'
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
}

export interface MeasurementElement extends BaseElement {
  type: 'measurement';
  x2: number;
  y2: number;
  unit: 'ft' | 'm';
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
  | MeasurementElement;

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
  framingDescription: string;
  actionScriptNotes?: string;
  status: ShotStatus;
  takesCount: number;
  estDurationSeconds: number;
  order: number;
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
  director: string;
  cinematographer: string;
  productionCompany?: string;
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
  | 'text';
