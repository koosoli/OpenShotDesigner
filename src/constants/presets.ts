import {
  AspectRatio,
  CameraHeight,
  CameraMovement,
  CameraRigType,
  FlagSize,
  LightFixtureType,
  PropType,
  SceneSetup,
  SensorFormat,
  ShotSize,
} from '../types';
import { calculateFovAngle } from '../utils/geometry';

export const FOCAL_LENGTH_PRESETS = [14, 18, 24, 28, 35, 50, 75, 85, 105, 135, 200];

export const ASPECT_RATIOS: { value: AspectRatio; label: string; ratio: number }[] = [
  { value: '16:9', label: '16:9 (1.78:1 HD/UHD)', ratio: 16 / 9 },
  { value: '2.39:1', label: '2.39:1 (Anamorphic Scope)', ratio: 2.39 },
  { value: '1.85:1', label: '1.85:1 (Theatrical Flat)', ratio: 1.85 },
  { value: '4:3', label: '4:3 (Classic Academy 1.33:1)', ratio: 4 / 3 },
  { value: '9:16', label: '9:16 (Vertical Video)', ratio: 9 / 16 },
];

export const SENSOR_FORMATS: { value: SensorFormat; label: string }[] = [
  { value: 'Super35', label: 'Super 35 (Standard Cinema)' },
  { value: 'FullFrame', label: 'Full Frame / 35mm VistaVision' },
  { value: 'LargeFormat', label: 'Large Format (ARRI LF / Alexa 65)' },
  { value: 'MFT', label: 'Micro 4/3 (Pocket Cinema)' },
];

export const CAMERA_HEIGHTS: { value: CameraHeight; label: string }[] = [
  { value: 'Ground', label: 'Ground Level (0-1 ft)' },
  { value: 'Knee', label: 'Knee Level (2 ft)' },
  { value: 'Waist', label: 'Waist / Hip Level (3-4 ft)' },
  { value: 'Eye Level', label: 'Eye Level (5-6 ft)' },
  { value: 'High', label: 'High Angle (7-9 ft)' },
  { value: 'Overhead / Bird\'s Eye', label: 'Overhead / Bird\'s Eye' },
];

/** Exposure / recording options shared by the viewfinder and the inspector. */
export const APERTURES = ['f/1.2', 'f/1.4', 'f/2', 'f/2.8', 'f/4', 'f/5.6', 'f/8', 'f/11', 'f/16', 'f/22'];
export const ISO_VALUES = [100, 200, 400, 640, 800, 1250, 1600, 3200, 6400, 12800];
export const SHUTTER_ANGLES = [45, 90, 144, 172.8, 180, 270, 360];
export const FRAME_RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 60, 120];
export const ND_FILTERS = ['None', '0.3', '0.6', '0.9', '1.2', '1.5', '1.8', '2.1'];

export const CAMERA_RIGS: { value: CameraRigType; label: string; icon: string }[] = [
  { value: 'Tripod', label: 'Tripod (Locked off)', icon: 'camera' },
  { value: 'Dana Dolly', label: 'Dana Dolly / Rail Track', icon: 'rail-symbol' },
  { value: 'Slider', label: 'Camera Slider Track', icon: 'move-horizontal' },
  { value: 'Steadicam', label: 'Steadicam / Snorricam Vest', icon: 'navigation' },
  { value: 'Handheld', label: 'Handheld / Shoulder Rig', icon: 'hand' },
  { value: 'Gimbal', label: 'Motorized 3-Axis Gimbal (Ronin)', icon: 'compass' },
  { value: 'Jib / Crane', label: 'Jib Arm / Crane Boom', icon: 'maximize-2' },
  { value: 'TechnoCrane', label: 'TechnoCrane (Telescopic)', icon: 'sliders' },
  { value: 'Car Mount', label: 'Car Mount / Hostess Tray', icon: 'truck' },
  { value: 'Drone', label: 'Aerial Drone Quadcopter', icon: 'wind' },
  { value: 'Cable Cam', label: 'Cable Cam Aerial Rig', icon: 'anchor' },
];

export const SHOT_SIZES: {
  value: ShotSize;
  code: string;
  name: string;
  description: string;
  badgeBg: string;
}[] = [
  {
    value: 'ELS',
    code: 'ELS',
    name: 'Extreme Long Shot',
    description: 'Vast environment where subject is tiny; establishes geography and scale.',
    badgeBg: 'bg-indigo-900/60 text-indigo-300 border-indigo-700/50',
  },
  {
    value: 'WS',
    code: 'WS',
    name: 'Wide Shot / Master',
    description: 'Subject fits head to toe with surrounding environment clearly visible.',
    badgeBg: 'bg-blue-900/60 text-blue-300 border-blue-700/50',
  },
  {
    value: 'FS',
    code: 'FS',
    name: 'Full Shot',
    description: 'Frames entire character from head to feet, emphasizing posture and action.',
    badgeBg: 'bg-sky-900/60 text-sky-300 border-sky-700/50',
  },
  {
    value: 'MWS',
    code: 'MWS',
    name: 'Medium Wide (Cowboy)',
    description: 'Framed from mid-thigh up; traditional western framing.',
    badgeBg: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
  },
  {
    value: 'MS',
    code: 'MS',
    name: 'Medium Shot',
    description: 'Framed from waist up; standard conversation framing for physical gesture.',
    badgeBg: 'bg-amber-900/60 text-amber-300 border-amber-700/50',
  },
  {
    value: 'MCU',
    code: 'MCU',
    name: 'Medium Close-Up',
    description: 'Framed from chest/bust up; focuses on facial emotion while keeping context.',
    badgeBg: 'bg-orange-900/60 text-orange-300 border-orange-700/50',
  },
  {
    value: 'CU',
    code: 'CU',
    name: 'Close-Up',
    description: 'Frames face from neck up; intense emotional resonance.',
    badgeBg: 'bg-rose-900/60 text-rose-300 border-rose-700/50',
  },
  {
    value: 'ECU',
    code: 'ECU',
    name: 'Extreme Close-Up',
    description: 'Tight focus on eyes, lips, or single critical physical detail.',
    badgeBg: 'bg-pink-900/60 text-pink-300 border-pink-700/50',
  },
  {
    value: 'OTS',
    code: 'OTS',
    name: 'Over the Shoulder',
    description: 'Shot from behind one subject looking at another; establishes 3D conversation space.',
    badgeBg: 'bg-purple-900/60 text-purple-300 border-purple-700/50',
  },
  {
    value: 'POV',
    code: 'POV',
    name: 'Point of View',
    description: 'Directly replicates what a character sees through their eyes.',
    badgeBg: 'bg-violet-900/60 text-violet-300 border-violet-700/50',
  },
  {
    value: 'Insert',
    code: 'INS',
    name: 'Insert / Cutaway',
    description: 'Close shot of an object, letter, phone screen, clock, or weapon.',
    badgeBg: 'bg-teal-900/60 text-teal-300 border-teal-700/50',
  },
  {
    value: 'Dutch',
    code: 'DUT',
    name: 'Dutch Angle',
    description: 'Tilted horizon creating psychological unease or dynamic tension.',
    badgeBg: 'bg-red-900/60 text-red-300 border-red-700/50',
  },
];

export const CAMERA_MOVEMENTS: { value: CameraMovement; label: string }[] = [
  { value: 'Static', label: 'Static (Locked Off)' },
  { value: 'Pan', label: 'Pan (Horizontal rotation)' },
  { value: 'Tilt', label: 'Tilt (Vertical rotation)' },
  { value: 'Dolly In', label: 'Dolly In (Push In)' },
  { value: 'Dolly Out', label: 'Dolly Out (Pull Out)' },
  { value: 'Tracking', label: 'Tracking / Lateral Dolly' },
  { value: 'Pedestal', label: 'Pedestal (Move straight up/down)' },
  { value: 'Boom / Crane', label: 'Boom / Crane Sweep' },
  { value: 'Handheld', label: 'Handheld Kinetic' },
  { value: 'Steadicam', label: 'Steadicam Dynamic Walk' },
  { value: 'Whip Pan', label: 'Whip Pan / Swish' },
  { value: 'Zoom', label: 'Optical / Crash Zoom' },
];

export const LIGHT_FIXTURES: {
  type: LightFixtureType;
  name: string;
  defaultBeam: number;
  defaultTemp: number;
  defaultModel: string;
  isFlag?: boolean;
}[] = [
  {
    type: 'fresnel',
    name: 'Fresnel Spotlight',
    defaultBeam: 35,
    defaultTemp: 3200,
    defaultModel: 'ARRI 1K Tungsten Fresnel',
  },
  {
    type: 'led_panel',
    name: 'Soft LED Panel',
    defaultBeam: 110,
    defaultTemp: 5600,
    defaultModel: 'ARRI SkyPanel S60-C',
  },
  {
    type: 'softbox',
    name: 'Bowens Softbox Dome',
    defaultBeam: 90,
    defaultTemp: 5600,
    defaultModel: 'Aputure Light Storm 600d + Light Dome',
  },
  {
    type: 'spotlight',
    name: 'Hard Leko / Ellipsoidal',
    defaultBeam: 19,
    defaultTemp: 5600,
    defaultModel: 'ETC Source Four / Aputure Spotlight Mount',
  },
  {
    type: 'tube_light',
    name: 'Pixel LED Tube',
    defaultBeam: 160,
    defaultTemp: 5600,
    defaultModel: 'Astera Titan Tube FP1',
  },
  {
    type: 'china_ball',
    name: 'China Ball / Lantern Diffuser',
    defaultBeam: 360,
    defaultTemp: 3200,
    defaultModel: 'Chimera 30" China Ball Lantern',
  },
  {
    type: 'practical',
    name: 'Practical Lamp / Bulb',
    defaultBeam: 360,
    defaultTemp: 2700,
    defaultModel: 'Tungsten Table Lamp / Aputure B7c',
  },
  {
    type: 'reflector',
    name: 'Reflector Bounce Board',
    defaultBeam: 75,
    defaultTemp: 5600,
    defaultModel: '4x4 Foamcore / Beadboard Bounce',
  },
  {
    type: 'hmi',
    name: 'HMI Daylight (Joker / Par)',
    defaultBeam: 40,
    defaultTemp: 5600,
    defaultModel: 'ARRI M18 / Joker Bug 800W HMI',
  },
  {
    type: 'par_can',
    name: 'Par Can (Beam Projector)',
    defaultBeam: 20,
    defaultTemp: 3200,
    defaultModel: 'PAR64 1kW / Source 4 PAR',
  },
  {
    type: 'kino_flo',
    name: 'Kino Flo Fluorescent Panel',
    defaultBeam: 140,
    defaultTemp: 5600,
    defaultModel: 'Kino Flo Diva-Lite 400 / 4Bank',
  },
  {
    type: 'flag_solid',
    name: 'C-Stand Solid Flag (Negative Fill)',
    defaultBeam: 0,
    defaultTemp: 0,
    defaultModel: 'Matthews 24x36 Solid Flag',
    isFlag: true,
  },
  {
    type: 'flag_silk',
    name: 'C-Stand Silk Flag (Diffusion)',
    defaultBeam: 0,
    defaultTemp: 0,
    defaultModel: 'Matthews 24x36 Silk Flag',
    isFlag: true,
  },
  {
    type: 'flag_net',
    name: 'C-Stand Net Flag (Cut ½–1 Stop)',
    defaultBeam: 0,
    defaultTemp: 0,
    defaultModel: 'Matthews 24x36 Single Net Flag',
    isFlag: true,
  },
  {
    type: 'flag_cutter',
    name: 'C-Stand Cutter Flag (Shape Light)',
    defaultBeam: 0,
    defaultTemp: 0,
    defaultModel: 'Matthews 18x48 Cutter Flag',
    isFlag: true,
  },
  {
    type: 'c_stand_flag',
    name: 'C-Stand Flag (Legacy Solid)',
    defaultBeam: 0,
    defaultTemp: 0,
    defaultModel: 'Matthews 24x36 Solid Flag',
    isFlag: true,
  },
  {
    type: 'overhead_diffusion',
    name: 'Overhead 8x8 Diffusion Frame',
    defaultBeam: 120,
    defaultTemp: 5600,
    defaultModel: '8x8 Silent Frost Silk Frame',
  },
];

/** Standard C-stand flag fabric sizes → SVG panel dimensions (pixels). */
export const FLAG_SIZE_PRESETS: { value: string; label: string; w: number; h: number }[] = [
  { value: '4x4', label: '4×4"', w: 8, h: 8 },
  { value: '6x6', label: '6×6"', w: 12, h: 12 },
  { value: '12x12', label: '12×12"', w: 24, h: 24 },
  { value: '12x18', label: '12×18"', w: 24, h: 36 },
  { value: '18x18', label: '18×18"', w: 36, h: 36 },
  { value: '18x24', label: '18×24"', w: 36, h: 48 },
  { value: '24x24', label: '24×24"', w: 48, h: 48 },
  { value: '24x36', label: '24×36"', w: 48, h: 72 },
  { value: '30x36', label: '30×36"', w: 60, h: 72 },
  { value: '36x36', label: '36×36"', w: 72, h: 72 },
  { value: '36x48', label: '36×48"', w: 72, h: 96 },
  { value: '42x42', label: '42×42"', w: 84, h: 84 },
  { value: '48x48', label: '48×48"', w: 96, h: 96 },
  { value: '48x60', label: '48×60"', w: 96, h: 120 },
];

export const DEFAULT_FLAG_SIZE = '24x36';

/** Returns the SVG panel dimensions (w, h) for a flag element. */
export function getFlagPanelDims(light: {
  fixtureType: LightFixtureType;
  flagSize?: FlagSize;
}): { w: number; h: number } {
  const size =
    FLAG_SIZE_PRESETS.find((s) => s.value === (light.flagSize || DEFAULT_FLAG_SIZE)) ||
    FLAG_SIZE_PRESETS.find((s) => s.value === DEFAULT_FLAG_SIZE)!;
  if (light.fixtureType === 'flag_cutter') {
    // Cutter is an elongated blade, but it still scales with the selected size.
    return { w: Math.max(10, size.w * 0.6), h: Math.max(10, size.h * 1.6) };
  }
  return { w: size.w, h: size.h };
}

export const PROP_CATALOG: {
  type: PropType;
  name: string;
  category: 'Living' | 'Dining & Office' | 'Bedroom' | 'Studio & Stage' | 'Vehicles' | 'Architecture' | 'Generic';
  defaultWidth: number;
  defaultHeight: number;
  defaultColor: string;
}[] = [
  // Living
  { type: 'sofa', name: 'Couch / 3-Seat Sofa', category: 'Living', defaultWidth: 160, defaultHeight: 70, defaultColor: '#475569' },
  { type: 'sofa_sectional', name: 'L-Sectional Couch', category: 'Living', defaultWidth: 200, defaultHeight: 180, defaultColor: '#334155' },
  { type: 'armchair', name: 'Armchair / Recliner', category: 'Living', defaultWidth: 75, defaultHeight: 75, defaultColor: '#64748b' },
  { type: 'table_coffee', name: 'Coffee Table', category: 'Living', defaultWidth: 100, defaultHeight: 50, defaultColor: '#92400e' },
  { type: 'tv', name: 'Television & Media Stand', category: 'Living', defaultWidth: 120, defaultHeight: 30, defaultColor: '#1e293b' },
  { type: 'bookshelf', name: 'Bookshelf / Storage', category: 'Living', defaultWidth: 120, defaultHeight: 35, defaultColor: '#78350f' },
  { type: 'plant', name: 'Potted Plant / Tree', category: 'Living', defaultWidth: 45, defaultHeight: 45, defaultColor: '#15803d' },

  // Dining & Office
  { type: 'dining_set', name: 'Dining Table + 4 Chairs', category: 'Dining & Office', defaultWidth: 160, defaultHeight: 120, defaultColor: '#7c2d12' },
  { type: 'table_rect', name: 'Rectangular Table', category: 'Dining & Office', defaultWidth: 140, defaultHeight: 70, defaultColor: '#854d0e' },
  { type: 'table_round', name: 'Round Dining Table', category: 'Dining & Office', defaultWidth: 90, defaultHeight: 90, defaultColor: '#854d0e' },
  { type: 'chair', name: 'Dining Chair', category: 'Dining & Office', defaultWidth: 40, defaultHeight: 40, defaultColor: '#a16207' },
  { type: 'desk', name: 'Executive Office Desk', category: 'Dining & Office', defaultWidth: 140, defaultHeight: 70, defaultColor: '#334155' },
  { type: 'bar_counter', name: 'Bar Counter', category: 'Dining & Office', defaultWidth: 180, defaultHeight: 50, defaultColor: '#713f12' },
  { type: 'bar_stool', name: 'Bar Stool', category: 'Dining & Office', defaultWidth: 35, defaultHeight: 35, defaultColor: '#ca8a04' },

  // Bedroom
  { type: 'bed_king', name: 'King Size Bed', category: 'Bedroom', defaultWidth: 180, defaultHeight: 200, defaultColor: '#475569' },
  { type: 'bed', name: 'Double / Queen Bed', category: 'Bedroom', defaultWidth: 150, defaultHeight: 180, defaultColor: '#64748b' },
  { type: 'nightstand', name: 'Nightstand', category: 'Bedroom', defaultWidth: 45, defaultHeight: 45, defaultColor: '#78350f' },
  { type: 'wardrobe', name: 'Wardrobe / Closet', category: 'Bedroom', defaultWidth: 140, defaultHeight: 60, defaultColor: '#52525b' },

  // Studio & Stage Equipment
  { type: 'c_stand', name: 'C-Stand + Arm Grip', category: 'Studio & Stage', defaultWidth: 40, defaultHeight: 40, defaultColor: '#64748b' },
  { type: 'sound_boom', name: 'Sound Boom Operator', category: 'Studio & Stage', defaultWidth: 50, defaultHeight: 50, defaultColor: '#d97706' },
  { type: 'director_chair', name: "Director's Folding Chair", category: 'Studio & Stage', defaultWidth: 45, defaultHeight: 45, defaultColor: '#1e293b' },
  { type: 'apple_box', name: 'Apple Box (Full/Half)', category: 'Studio & Stage', defaultWidth: 40, defaultHeight: 30, defaultColor: '#b45309' },
  { type: 'camera_cart', name: 'Camera Magliner Cart', category: 'Studio & Stage', defaultWidth: 110, defaultHeight: 55, defaultColor: '#475569' },
  { type: 'green_screen', name: 'Chroma Green / Seamless Backdrop', category: 'Studio & Stage', defaultWidth: 240, defaultHeight: 20, defaultColor: '#16a34a' },

  // Vehicles
  { type: 'car', name: 'Sedan Passenger Car', category: 'Vehicles', defaultWidth: 180, defaultHeight: 360, defaultColor: '#2563eb' },
  { type: 'vehicle_suv', name: 'SUV / 4x4 Vehicle', category: 'Vehicles', defaultWidth: 200, defaultHeight: 400, defaultColor: '#475569' },
  { type: 'vehicle_truck', name: 'Production Grip Truck', category: 'Vehicles', defaultWidth: 220, defaultHeight: 520, defaultColor: '#334155' },
  { type: 'vehicle_police', name: 'Police Cruiser', category: 'Vehicles', defaultWidth: 190, defaultHeight: 380, defaultColor: '#0284c7' },

  // Architecture & Generic
  { type: 'stairs', name: 'Staircase Flight', category: 'Architecture', defaultWidth: 100, defaultHeight: 180, defaultColor: '#475569' },
  { type: 'box', name: 'Generic Box / Block', category: 'Generic', defaultWidth: 60, defaultHeight: 60, defaultColor: '#64748b' },
  { type: 'circle', name: 'Generic Pillar / Circle', category: 'Generic', defaultWidth: 50, defaultHeight: 50, defaultColor: '#64748b' },
];

export const ACTOR_COLOR_PALETTE = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
];

export const CAMERA_COLOR_PALETTE = [
  '#0284c7', // Sky Blue (Cam A)
  '#dc2626', // Crimson (Cam B)
  '#16a34a', // Green (Cam C)
  '#9333ea', // Purple (Cam D)
  '#ea580c', // Orange (Cam E)
];

// Sample Scenes for Film Students & Directors
/**
 * A page of screenplay that matches the two sample scenes, so a new project
 * started from the templates can be lined straight away.
 */
export const SAMPLE_SCREENPLAY = `1   INT. LIVING ROOM - NIGHT   1

Rain on the window. ALEX sits on the sofa, a ledger open on the
coffee table. SARAH watches him from the armchair.

ALEX
You want to tell me where it went?

SARAH
I don't know what you're talking about.

He turns a page. Slowly. Lets the silence do the work.

ALEX
Forty thousand, Sarah. It doesn't just
walk out of a building.

She stands, crosses to the door and stops with her hand on the
handle.

SARAH
Ask your brother.

She leaves. Alex doesn't move.

CUT TO:

2   INT. INTERROGATION ROOM - NIGHT   2

One lamp over a metal table. MARCUS, cuffed, sweating. DET.
MILLER sits opposite, jacket off.

MILLER
Twelve minutes. That's how long you were
in that stairwell.

MARCUS
I was having a smoke.

Miller stands, walks around behind him, and lets him feel it.

MILLER
Then you won't mind telling me who was
holding the door.

Marcus says nothing. The blinds cut the light across his face.
`;

export const SAMPLE_SCENES: SceneSetup[] = [
  /**
   * Template 1 — the coverage every dialogue scene starts from: a master and
   * two matching over-the-shoulders. Furniture sits along one axis so the two
   * actors read clearly, and the cameras stand clear of the playing area so the
   * plan stays readable at a glance.
   */
  {
    id: 'setup-dialogue-classic',
    name: 'Dialogue — Master + Shot / Reverse',
    sceneNumber: '1',
    scriptPage: 'p. 1-3',
    location: 'INT. LIVING ROOM - NIGHT',
    timeOfDay: 'Night INT',
    currentBeat: 1,
    totalBeats: 3,
    aspectRatio: '2.39:1',
    canvasScale: 1,
    canvasOffset: { x: 50, y: 50 },
    gridSettings: {
      size: 30,
      snap: true,
      showGrid: true,
      unit: 'm',
      pixelsPerUnit: 30,
    },
    elements: [
      // ---- Room -------------------------------------------------------------
      { id: 'wall-n', type: 'wall', name: 'North', x: 120, y: 120, x2: 760, y2: 120, thickness: 12, rotation: 0 },
      { id: 'wall-w', type: 'wall', name: 'West', x: 120, y: 120, x2: 120, y2: 540, thickness: 12, rotation: 0 },
      { id: 'wall-s', type: 'wall', name: 'South', x: 120, y: 540, x2: 760, y2: 540, thickness: 12, rotation: 0 },
      { id: 'wall-e', type: 'wall', name: 'East', x: 760, y: 120, x2: 760, y2: 540, thickness: 12, rotation: 0 },
      {
        id: 'door-1',
        type: 'door',
        name: 'Door',
        x: 760,
        y: 460,
        rotation: 90,
        width: 60,
        swingAngle: 90,
        swingDirection: 'left',
      },
      {
        id: 'window-1',
        type: 'window',
        name: 'Window',
        x: 440,
        y: 120,
        rotation: 0,
        width: 140,
        depth: 15,
      },

      // ---- Set dressing: one clean seating axis ------------------------------
      {
        id: 'prop-sofa',
        type: 'prop',
        propType: 'sofa',
        name: 'Sofa',
        x: 330,
        y: 220,
        rotation: 0,
        width: 170,
        height: 60,
        color: '#334155',
      },
      {
        id: 'prop-table',
        type: 'prop',
        propType: 'table_coffee',
        name: 'Coffee table',
        x: 330,
        y: 335,
        rotation: 0,
        width: 120,
        height: 60,
        color: '#78350f',
      },
      {
        id: 'prop-chair',
        type: 'prop',
        propType: 'armchair',
        name: 'Armchair',
        x: 330,
        y: 450,
        rotation: 180,
        width: 60,
        height: 60,
        color: '#475569',
      },

      // ---- Cast: seated just in front of their furniture ---------------------
      {
        id: 'actor-alex',
        type: 'actor',
        name: 'ALEX',
        characterLetter: 'A',
        color: '#3b82f6',
        x: 330,
        y: 268,
        rotation: 90,
        isStanding: false,
        actionNotes: 'Stays seated through the scene.',
        path: [],
      },
      {
        id: 'actor-sarah',
        type: 'actor',
        name: 'SARAH',
        characterLetter: 'S',
        color: '#ef4444',
        x: 330,
        y: 402,
        rotation: 270,
        isStanding: false,
        actionNotes: 'Stands on beat 2 and leaves through the door on beat 3.',
        path: [
          { id: 'wp-s2', x: 470, y: 450, rotation: 340, beat: 2, dialogueCue: 'stands, crosses right' },
          { id: 'wp-s3', x: 690, y: 470, rotation: 0, beat: 3, dialogueCue: 'exits through the door' },
        ],
      },

      // ---- Three-point light, named for the plan not the truck --------------
      {
        id: 'light-key',
        type: 'light',
        name: 'Key',
        fixtureType: 'softbox',
        x: 170,
        y: 250,
        rotation: 35,
        colorTemp: 4500,
        intensity: 85,
        beamAngle: 75,
        throwDistance: 240,
        fixtureModel: 'Aputure 600d + Light Dome II',
      },
      {
        id: 'light-fill',
        type: 'light',
        name: 'Fill (bounce)',
        fixtureType: 'reflector',
        x: 520,
        y: 300,
        rotation: 160,
        colorTemp: 4500,
        intensity: 40,
        beamAngle: 90,
        throwDistance: 180,
        fixtureModel: '4x4 white beadboard',
      },
      {
        id: 'light-rim',
        type: 'light',
        name: 'Rim',
        fixtureType: 'tube_light',
        x: 330,
        y: 155,
        rotation: 90,
        colorTemp: 5600,
        intensity: 60,
        beamAngle: 120,
        throwDistance: 150,
        fixtureModel: 'Astera Titan Tube',
      },

      // ---- Coverage: A wide from the side, B and C the reverse pair ---------
      {
        id: 'cam-a',
        type: 'camera',
        name: 'Cam A',
        cameraLabel: 'A',
        color: '#0284c7',
        x: 165,
        y: 335,
        rotation: 0,
        focalLength: 24,
        sensorFormat: 'Super35',
        fovAngle: calculateFovAngle(24, 'Super35'),
        aspectRatio: '2.39:1',
        cameraHeight: 'Eye Level',
        rigType: 'Tripod',
        throwDistance: 340,
        associatedShotId: 'shot-1a',
        cameraModel: 'ARRI Alexa Mini LF',
        path: [],
      },
      {
        id: 'cam-b',
        type: 'camera',
        name: 'Cam B',
        cameraLabel: 'B',
        color: '#dc2626',
        x: 470,
        y: 480,
        rotation: 243,
        focalLength: 50,
        sensorFormat: 'Super35',
        fovAngle: calculateFovAngle(50, 'Super35'),
        aspectRatio: '2.39:1',
        cameraHeight: 'Eye Level',
        rigType: 'Tripod',
        throwDistance: 300,
        associatedShotId: 'shot-1b',
        cameraModel: 'ARRI Alexa Mini LF',
        path: [],
      },
      {
        id: 'cam-c',
        type: 'camera',
        name: 'Cam C',
        cameraLabel: 'C',
        color: '#16a34a',
        x: 470,
        y: 190,
        rotation: 115,
        focalLength: 85,
        sensorFormat: 'Super35',
        fovAngle: calculateFovAngle(85, 'Super35'),
        aspectRatio: '2.39:1',
        cameraHeight: 'Eye Level',
        rigType: 'Dana Dolly',
        throwDistance: 320,
        associatedShotId: 'shot-1c',
        cameraModel: 'ARRI Alexa Mini LF',
        path: [{ id: 'wp-c2', x: 415, y: 255, rotation: 122, beat: 2, dialogueCue: 'push in as she denies it' }],
      },
    ],
    shots: [
      {
        id: 'shot-1a',
        sceneNumber: '1',
        shotNumber: '1/1',
        name: 'Master — the room and both of them',
        cameraId: 'cam-a',
        cameraLabel: 'A',
        shotSize: 'WS',
        lensMm: 24,
        cameraAngle: 'Eye Level',
        movement: 'Static',
        aspectRatio: '2.39:1',
        frameRate: 24,
        subjectActorIds: ['actor-alex', 'actor-sarah'],
        equipmentNotes: '24mm on sticks',
        framingDescription: 'Profile two-shot: Alex on the sofa, Sarah in the armchair, door in the background.',
        actionScriptNotes: 'Runs the whole scene — the safety and the geography.',
        status: 'ready',
        takesCount: 0,
        estDurationSeconds: 45,
        order: 1,
      },
      {
        id: 'shot-1b',
        sceneNumber: '1',
        shotNumber: '1/2',
        name: 'OTS Alex',
        cameraId: 'cam-b',
        cameraLabel: 'B',
        shotSize: 'MCU',
        lensMm: 50,
        cameraAngle: 'Eye Level',
        movement: 'Static',
        aspectRatio: '2.39:1',
        frameRate: 24,
        subjectActorIds: ['actor-alex'],
        equipmentNotes: '50mm at T2',
        framingDescription: "Over Sarah's shoulder, Alex on the left third.",
        actionScriptNotes: 'His side of the argument.',
        status: 'planned',
        takesCount: 0,
        estDurationSeconds: 25,
        order: 2,
      },
      {
        id: 'shot-1c',
        sceneNumber: '1',
        shotNumber: '1/3',
        name: 'OTS Sarah — push in',
        cameraId: 'cam-c',
        cameraLabel: 'C',
        shotSize: 'CU',
        lensMm: 85,
        cameraAngle: 'Eye Level',
        movement: 'Dolly In',
        aspectRatio: '2.39:1',
        frameRate: 24,
        subjectActorIds: ['actor-sarah'],
        equipmentNotes: '85mm on a Dana Dolly',
        framingDescription: "Over Alex's shoulder, tightening on Sarah as she denies it.",
        actionScriptNotes: 'Push in across beat 2, then she stands and goes.',
        status: 'planned',
        takesCount: 0,
        estDurationSeconds: 30,
        order: 3,
      },
    ],
  },

  /**
   * Template 2 — one table, two people, hard light. Deliberately sparse: a
   * single practical over the table plus a slash of light through the blinds,
   * and two cameras that never cross the line.
   */
  {
    id: 'setup-noir-interrogation',
    name: 'Interrogation — hard key, two cameras',
    sceneNumber: '2',
    scriptPage: 'p. 8-10',
    location: 'INT. INTERROGATION ROOM - NIGHT',
    timeOfDay: 'Night INT',
    currentBeat: 1,
    totalBeats: 2,
    aspectRatio: '2.39:1',
    canvasScale: 1,
    canvasOffset: { x: 50, y: 50 },
    gridSettings: {
      size: 30,
      snap: true,
      showGrid: true,
      unit: 'ft',
      pixelsPerUnit: 25,
    },
    elements: [
      // ---- Room -------------------------------------------------------------
      { id: 'noir-wall-n', type: 'wall', name: 'North', x: 160, y: 140, x2: 660, y2: 140, thickness: 12, rotation: 0 },
      { id: 'noir-wall-w', type: 'wall', name: 'Mirror wall', x: 160, y: 140, x2: 160, y2: 520, thickness: 12, rotation: 0 },
      { id: 'noir-wall-s', type: 'wall', name: 'South', x: 160, y: 520, x2: 660, y2: 520, thickness: 12, rotation: 0 },
      { id: 'noir-wall-e', type: 'wall', name: 'East', x: 660, y: 140, x2: 660, y2: 520, thickness: 12, rotation: 0 },
      {
        id: 'noir-door',
        type: 'door',
        name: 'Door',
        x: 660,
        y: 210,
        rotation: 90,
        width: 60,
        swingAngle: 90,
        swingDirection: 'left',
      },

      // ---- One table, two chairs -------------------------------------------
      {
        id: 'noir-table',
        type: 'prop',
        propType: 'desk',
        name: 'Table',
        x: 410,
        y: 330,
        rotation: 0,
        width: 150,
        height: 70,
        color: '#334155',
      },
      {
        id: 'noir-chair-suspect',
        type: 'prop',
        propType: 'chair',
        name: 'Suspect chair',
        x: 285,
        y: 330,
        rotation: 90,
        width: 44,
        height: 44,
        color: '#475569',
      },
      {
        id: 'noir-chair-detective',
        type: 'prop',
        propType: 'chair',
        name: 'Detective chair',
        x: 535,
        y: 330,
        rotation: 270,
        width: 44,
        height: 44,
        color: '#475569',
      },

      // ---- Cast -------------------------------------------------------------
      {
        id: 'actor-suspect',
        type: 'actor',
        name: 'MARCUS',
        characterLetter: 'M',
        color: '#ef4444',
        x: 320,
        y: 330,
        rotation: 0,
        isStanding: false,
        actionNotes: 'Cuffed to the table, holds still all scene.',
        path: [],
      },
      {
        id: 'actor-detective',
        type: 'actor',
        name: 'MILLER',
        characterLetter: 'D',
        color: '#3b82f6',
        x: 500,
        y: 330,
        rotation: 180,
        isStanding: false,
        actionNotes: 'Gets up on beat 2 and comes round behind Marcus.',
        path: [{ id: 'wp-d2', x: 330, y: 240, rotation: 135, beat: 2, dialogueCue: 'circles behind him' }],
      },

      // ---- Two sources only -------------------------------------------------
      {
        id: 'noir-light-practical',
        type: 'light',
        name: 'Practical over table',
        fixtureType: 'spotlight',
        x: 410,
        y: 250,
        rotation: 90,
        colorTemp: 3000,
        intensity: 95,
        beamAngle: 60,
        throwDistance: 170,
        fixtureModel: 'Enamel shade, 500W',
      },
      {
        id: 'noir-light-blinds',
        type: 'light',
        name: 'Blinds slash',
        fixtureType: 'spotlight',
        x: 195,
        y: 470,
        rotation: 315,
        colorTemp: 5600,
        intensity: 80,
        beamAngle: 26,
        throwDistance: 320,
        fixtureModel: 'Source Four with venetian gobo',
      },

      // ---- Coverage ---------------------------------------------------------
      {
        id: 'noir-cam-a',
        type: 'camera',
        name: 'Cam A',
        cameraLabel: 'A',
        color: '#0284c7',
        x: 590,
        y: 330,
        rotation: 180,
        focalLength: 35,
        sensorFormat: 'Super35',
        fovAngle: calculateFovAngle(35, 'Super35'),
        aspectRatio: '2.39:1',
        cameraHeight: 'Low Angle',
        rigType: 'Tripod',
        throwDistance: 300,
        associatedShotId: 'shot-2a',
        cameraModel: 'ARRI Alexa Mini LF',
        path: [],
      },
      {
        id: 'noir-cam-b',
        type: 'camera',
        name: 'Cam B',
        cameraLabel: 'B',
        color: '#dc2626',
        x: 410,
        y: 480,
        rotation: 270,
        focalLength: 28,
        sensorFormat: 'Super35',
        fovAngle: calculateFovAngle(28, 'Super35'),
        aspectRatio: '2.39:1',
        cameraHeight: 'Eye Level',
        rigType: 'Handheld',
        throwDistance: 280,
        associatedShotId: 'shot-2b',
        cameraModel: 'ARRI Alexa Mini LF',
        path: [],
      },
    ],
    shots: [
      {
        id: 'shot-2a',
        sceneNumber: '2',
        shotNumber: '2/1',
        name: 'Marcus — low angle push in',
        cameraId: 'noir-cam-a',
        cameraLabel: 'A',
        shotSize: 'CU',
        lensMm: 35,
        cameraAngle: 'Low Angle',
        movement: 'Dolly In',
        aspectRatio: '2.39:1',
        frameRate: 24,
        subjectActorIds: ['actor-suspect'],
        equipmentNotes: '35mm at T1.5',
        framingDescription: 'Low angle close-up, Marcus alone in the pool of light.',
        actionScriptNotes: 'He says nothing.',
        status: 'ready',
        takesCount: 0,
        estDurationSeconds: 30,
        order: 1,
      },
      {
        id: 'shot-2b',
        sceneNumber: '2',
        shotNumber: '2/2',
        name: 'Two-shot — handheld',
        cameraId: 'noir-cam-b',
        cameraLabel: 'B',
        shotSize: 'MS',
        lensMm: 28,
        cameraAngle: 'Dutch Angle',
        movement: 'Handheld',
        aspectRatio: '2.39:1',
        frameRate: 24,
        subjectActorIds: ['actor-suspect', 'actor-detective'],
        equipmentNotes: '28mm handheld, slight dutch',
        framingDescription: 'Both in profile, blind slashes across the back wall.',
        actionScriptNotes: 'Miller circles him on beat 2.',
        status: 'planned',
        takesCount: 0,
        estDurationSeconds: 40,
        order: 2,
      },
    ],
  },
];
