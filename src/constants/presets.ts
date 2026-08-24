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

/**
 * Shot-angle choices offered on the shot list.
 *
 * A superset of `CAMERA_HEIGHTS`: a height is where the camera physically is,
 * an angle is what the frame reads as, and the shot list has always offered
 * both. It lives here rather than as a literal in the panel because the same
 * list was written out three times in `ShotListPanel`, and each copy could
 * drift from `CameraHeight` on its own — which is exactly what the `as any` at
 * the `onChange` was hiding.
 */
export const CAMERA_ANGLES: CameraHeight[] = [
  'Eye Level',
  'Low Angle',
  'High Angle',
  'Ground',
  'Knee',
  'Waist',
  'High',
  "Bird's Eye",
  "Worm's Eye",
  'Dutch Angle',
];


/** Exposure / recording options shared by the viewfinder and the inspector. */
export const APERTURES = ['f/1.2', 'f/1.4', 'f/2', 'f/2.8', 'f/4', 'f/5.6', 'f/8', 'f/11', 'f/16', 'f/22'];
export const ISO_VALUES = [100, 200, 400, 640, 800, 1250, 1600, 3200, 6400, 12800];
export const SHUTTER_ANGLES = [45, 90, 144, 172.8, 180, 270, 360];
export const FRAME_RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 60, 120];
export const ND_FILTERS = ['None', '0.3', '0.6', '0.9', '1.2', '1.5', '1.8', '2.1'];

export const CAMERA_RIGS: { value: CameraRigType; label: string; icon: string }[] = [
  { value: 'Tripod', label: 'Tripod (Locked off)', icon: 'camera' },
  { value: 'Broadcast Pedestal', label: 'Broadcast Pedestal (Studio/OB)', icon: 'monitor' },
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

export const CAMERA_BODY_PRESETS: {
  brand: string;
  model: string;
  sensor: SensorFormat;
  label: string;
}[] = [
  // Sony Cinema & Camcorders
  { brand: 'Sony', model: 'Sony FX30 Cinema Line (Super 35 4K 10-bit)', sensor: 'Super35', label: 'Sony FX30 (Super 35 4K 10-bit)' },
  { brand: 'Sony', model: 'Sony FX3 Cinema Line (Full Frame 4K)', sensor: 'FullFrame', label: 'Sony FX3 (Full Frame 4K)' },
  { brand: 'Sony', model: 'Sony FX6 Cinema Line (Full Frame 4K)', sensor: 'FullFrame', label: 'Sony FX6 (Full Frame 4K)' },
  { brand: 'Sony', model: 'Sony FX9 (Full Frame 6K Sensor)', sensor: 'FullFrame', label: 'Sony FX9 (Full Frame 6K)' },
  { brand: 'Sony', model: 'Sony PXW-FS5 / FS5 II (Super 35 4K RAW)', sensor: 'Super35', label: 'Sony FS5 / FS5 II (Super 35 4K RAW)' },
  { brand: 'Sony', model: 'Sony PXW-FS7 / FS7 II (Super 35 XAVC 4K)', sensor: 'Super35', label: 'Sony FS7 / FS7 II (Super 35 XAVC 4K)' },
  { brand: 'Sony', model: 'Sony NEX-FS700 / FS700R (Super 35 4K High Speed)', sensor: 'Super35', label: 'Sony NEX-FS700 (Super 35 4K/240fps)' },
  { brand: 'Sony', model: 'Sony NEX-EA50 (Large Sensor NXCAM)', sensor: 'Super35', label: 'Sony NEX-EA50 (Large Sensor NXCAM)' },
  { brand: 'Sony', model: 'Sony Burano 8K (Full Frame PL/E-mount)', sensor: 'FullFrame', label: 'Sony Burano 8K (Full Frame)' },
  { brand: 'Sony', model: 'Sony VENICE 2 8K (Full Frame)', sensor: 'FullFrame', label: 'Sony VENICE 2 8K' },
  { brand: 'Sony', model: 'Sony VENICE 2 6K (Full Frame)', sensor: 'FullFrame', label: 'Sony VENICE 2 6K' },
  { brand: 'Sony', model: 'Sony F55 / F5 CineAlta (Super 35 4K)', sensor: 'Super35', label: 'Sony F55 / F5 CineAlta (Super 35)' },
  { brand: 'Sony', model: 'Sony a7S III (Full Frame 4K120p)', sensor: 'FullFrame', label: 'Sony a7S III (Full Frame 4K)' },
  { brand: 'Sony', model: 'Sony FR7 Cinema PTZ (Full Frame)', sensor: 'FullFrame', label: 'Sony FR7 Cinema PTZ' },

  // ARRI Cinema & 35mm
  { brand: 'ARRI', model: 'ARRI Alexa 35 (Super 35 4.6K REVEAL)', sensor: 'Super35', label: 'ARRI Alexa 35 (Super 35 4.6K REVEAL)' },
  { brand: 'ARRI', model: 'ARRI Alexa Mini LF (Large Format 4.5K)', sensor: 'LargeFormat', label: 'ARRI Alexa Mini LF (Large Format 4.5K)' },
  { brand: 'ARRI', model: 'ARRI Alexa LF (Large Format 4.5K)', sensor: 'LargeFormat', label: 'ARRI Alexa LF (Large Format 4.5K)' },
  { brand: 'ARRI', model: 'ARRI Alexa Mini (Super 35 3.2K ARRIRAW)', sensor: 'Super35', label: 'ARRI Alexa Mini (Super 35 3.2K)' },
  { brand: 'ARRI', model: 'ARRI Alexa Plus / Classic (Super 35)', sensor: 'Super35', label: 'ARRI Alexa Classic / Plus (Super 35)' },
  { brand: 'ARRI', model: 'ARRI Alexa Studio (Super 35 Optical)', sensor: 'Super35', label: 'ARRI Alexa Studio (Optical Viewfinder)' },
  { brand: 'ARRI', model: 'ARRI Alexa 65 (65mm 6.5K Sensor)', sensor: 'LargeFormat', label: 'ARRI Alexa 65 (65mm 6.5K)' },
  { brand: 'ARRI', model: 'ARRI Amira (Super 35 4K UHD)', sensor: 'Super35', label: 'ARRI Amira (Super 35 4K UHD)' },
  { brand: 'ARRI', model: 'ARRI Arriflex 416 (16mm Film Camera)', sensor: 'Super35', label: 'ARRI Arriflex 416 (16mm Film)' },
  { brand: 'ARRI', model: 'ARRI Arriflex 435 / 235 (35mm Film Camera)', sensor: 'Super35', label: 'ARRI Arriflex 435 / 235 (35mm Film)' },
  { brand: 'ARRI', model: 'ARRI Arricam ST / LT (35mm Film Camera)', sensor: 'Super35', label: 'ARRI Arricam ST / LT (35mm Film)' },

  // RED Digital Cinema
  { brand: 'RED', model: 'RED V-Raptor 8K VV (VistaVision)', sensor: 'FullFrame', label: 'RED V-Raptor 8K VV (VistaVision)' },
  { brand: 'RED', model: 'RED V-Raptor XL 8K VV', sensor: 'FullFrame', label: 'RED V-Raptor XL 8K VV' },
  { brand: 'RED', model: 'RED Komodo-X 6K (Super 35 Global Shutter)', sensor: 'Super35', label: 'RED Komodo-X 6K (Global Shutter)' },
  { brand: 'RED', model: 'RED Komodo 6K (Super 35 Global Shutter)', sensor: 'Super35', label: 'RED Komodo 6K (Global Shutter)' },
  { brand: 'RED', model: 'RED Monstro 8K VV (VistaVision)', sensor: 'FullFrame', label: 'RED Monstro 8K VV' },
  { brand: 'RED', model: 'RED Helium 8K S35', sensor: 'Super35', label: 'RED Helium 8K S35' },
  { brand: 'RED', model: 'RED Gemini 5K S35 Dual ISO', sensor: 'Super35', label: 'RED Gemini 5K S35' },

  // Blackmagic Design
  { brand: 'Blackmagic', model: 'Blackmagic URSA Cine 12K (Full Frame RGBW)', sensor: 'FullFrame', label: 'Blackmagic URSA Cine 12K' },
  { brand: 'Blackmagic', model: 'Blackmagic URSA Mini Pro 12K (Super 35)', sensor: 'Super35', label: 'Blackmagic URSA Mini Pro 12K' },
  { brand: 'Blackmagic', model: 'Blackmagic Cinema Camera 6K (Full Frame L-Mount)', sensor: 'FullFrame', label: 'Blackmagic Cinema Camera 6K' },
  { brand: 'Blackmagic', model: 'Blackmagic Pocket Cinema Camera 6K Pro (Super 35)', sensor: 'Super35', label: 'Blackmagic Pocket 6K Pro' },
  { brand: 'Blackmagic', model: 'Blackmagic Pocket Cinema Camera 4K (MFT)', sensor: 'MFT', label: 'Blackmagic Pocket 4K (MFT)' },
  { brand: 'Blackmagic', model: 'Blackmagic Micro Studio Camera 4K G2', sensor: 'MFT', label: 'Blackmagic Micro Studio 4K' },

  // Canon
  { brand: 'Canon', model: 'Canon Cinema EOS C500 Mk II (Full Frame 5.9K)', sensor: 'FullFrame', label: 'Canon C500 Mk II (Full Frame 5.9K)' },
  { brand: 'Canon', model: 'Canon Cinema EOS C300 Mk III (Super 35 DGO 4K)', sensor: 'Super35', label: 'Canon C300 Mk III (Super 35)' },
  { brand: 'Canon', model: 'Canon Cinema EOS C70 (Super 35 RF Mount)', sensor: 'Super35', label: 'Canon C70 (Super 35 RF)' },
  { brand: 'Canon', model: 'Canon EOS R5 C (Full Frame 8K RAW)', sensor: 'FullFrame', label: 'Canon R5 C (Full Frame 8K RAW)' },
  { brand: 'Canon', model: 'Canon Cinema EOS C200 (Super 35 4K)', sensor: 'Super35', label: 'Canon C200 (Super 35 4K RAW Light)' },

  // Panasonic
  { brand: 'Panasonic', model: 'Panasonic VariCam LT 4K (Super 35 Dual ISO)', sensor: 'Super35', label: 'Panasonic VariCam LT 4K' },
  { brand: 'Panasonic', model: 'Panasonic Lumix S1H (Full Frame 6K)', sensor: 'FullFrame', label: 'Panasonic Lumix S1H (Full Frame 6K)' },
  { brand: 'Panasonic', model: 'Panasonic AU-EVA1 5.7K (Super 35)', sensor: 'Super35', label: 'Panasonic AU-EVA1 5.7K' },
  { brand: 'Panasonic', model: 'Panasonic Lumix GH6 (MFT 5.7K)', sensor: 'MFT', label: 'Panasonic Lumix GH6 (MFT)' },

  // Broadcast / OB (Outside Broadcast) Studio & Live Production
  { brand: 'Grass Valley', model: 'Grass Valley LDX 100 Studio/OB Camera', sensor: 'Super35', label: 'Grass Valley LDX 100 (Studio/OB)' },
  { brand: 'Grass Valley', model: 'Grass Valley LDX 86 Studio Camera', sensor: 'Super35', label: 'Grass Valley LDX 86 (Studio)' },
  { brand: 'Grass Valley', model: 'Grass Valley LDX C Flex Compact Camera', sensor: 'Super35', label: 'Grass Valley LDX C Flex (Compact)' },
  { brand: 'Grass Valley', model: 'Grass Valley LDX 84 Studio/OB Camera', sensor: 'Super35', label: 'Grass Valley LDX 84 (Studio/OB)' },
  { brand: 'Sony', model: 'Sony HDC-5500 4K Ultra High Frame Rate Camera', sensor: 'Super35', label: 'Sony HDC-5500 (4K UHD OB)' },
  { brand: 'Sony', model: 'Sony HDC-4300 4K Super Slow Motion Camera', sensor: 'Super35', label: 'Sony HDC-4300 (4K HSS)' },
  { brand: 'Sony', model: 'Sony HDC-3500 4K Studio/OB Camera', sensor: 'Super35', label: 'Sony HDC-3500 (Studio/OB)' },
  { brand: 'Sony', model: 'Sony HDC-3100 HDR Studio/OB Camera', sensor: 'Super35', label: 'Sony HDC-3100 (HDR Studio/OB)' },
  { brand: 'Hitachi', model: 'Hitachi SK-HD1800 Studio/OB Camera', sensor: 'Super35', label: 'Hitachi SK-HD1800 (Studio/OB)' },
  { brand: 'Hitachi', model: 'Hitachi Z-HD5500 Studio/OB Camera', sensor: 'Super35', label: 'Hitachi Z-HD5500 (Studio/OB)' },
  { brand: 'Ikegami', model: 'Ikegami UHK-430 4K Studio/OB Camera', sensor: 'Super35', label: 'Ikegami UHK-430 (4K Studio/OB)' },
  { brand: 'Ikegami', model: 'Ikegami UHK-750 8K Camera', sensor: 'Super35', label: 'Ikegami UHK-750 (8K)' },
  { brand: 'Panasonic', model: 'Panasonic AK-UC4000 4K Studio Camera', sensor: 'Super35', label: 'Panasonic AK-UC4000 (4K Studio)' },
  { brand: 'Panasonic', model: 'Panasonic AW-UE160 4K PTZ Camera', sensor: 'Super35', label: 'Panasonic AW-UE160 (4K PTZ)' },
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

export const LIGHT_ROLES: {
  value: import('../types').LightRole;
  label: string;
  description: string;
  color: string;
}[] = [
  { value: 'key', label: 'Key Light', description: 'Primary subject illumination source', color: '#f59e0b' },
  { value: 'fill', label: 'Fill Light', description: 'Softens shadows created by key light', color: '#38bdf8' },
  { value: 'negative_fill', label: 'Negative Fill / Floppy', description: 'Blocks light, deepens shadows & contrast', color: '#64748b' },
  { value: 'kicker', label: 'Kicker / Side Light', description: 'Highlight along side of face/body', color: '#eab308' },
  { value: 'backlight', label: 'Backlight / Rim Light', description: 'Separates subject from background', color: '#a855f7' },
  { value: 'background', label: 'Background / Set Light', description: 'Illuminates set walls & props', color: '#10b981' },
  { value: 'hair', label: 'Hair Light', description: 'Top/rear light accentuating hair detail', color: '#ec4899' },
  { value: 'eye', label: 'Eye Light / Catchlight', description: 'Creates reflection in subject eyes', color: '#06b6d4' },
  { value: 'accent', label: 'Accent / Top Light', description: 'Highlights specific set elements', color: '#f97316' },
  { value: 'practical', label: 'Practical Light', description: 'Visible in-camera lamp or bulb', color: '#fbbf24' },
  { value: 'bounce', label: 'Bounce / Ambient', description: 'Diffused indirect fill light', color: '#94a3b8' },
  { value: 'unassigned', label: 'Unassigned', description: 'General production lighting', color: '#cbd5e1' },
];

/** Production cable / patch run types for the floor plan cable planner. */
export const CABLE_TYPES: {
  type: import('../types').CableType;
  name: string;
  shortLabel: string;
  color: string;
  connector: string;
  isPower: boolean;
  rating?: string;
}[] = [
  { type: 'sdi_12g', name: 'SDI 12G (4K/8K Video)', shortLabel: '12G-SDI', color: '#38bdf8', connector: 'BNC', isPower: false },
  { type: 'sdi_3g', name: 'SDI 3G (HD Video)', shortLabel: '3G-SDI', color: '#0ea5e9', connector: 'BNC', isPower: false },
  { type: 'hdmi', name: 'HDMI 2.1 (Monitor / Rec)', shortLabel: 'HDMI', color: '#a855f7', connector: 'HDMI-A', isPower: false },
  { type: 'fiber', name: 'Fiber Optic (12-strand)', shortLabel: 'Fiber', color: '#f59e0b', connector: 'LC / MTP', isPower: false },
  { type: 'ethernet', name: 'Ethernet / Network (CAT6)', shortLabel: 'NET', color: '#10b981', connector: 'RJ45', isPower: false },
  { type: 'dmx', name: 'DMX-512 Control', shortLabel: 'DMX', color: '#eab308', connector: '5-pin XLR', isPower: false },
  { type: 'audio_xlr', name: 'Audio XLR (Balanced)', shortLabel: 'XLR', color: '#ec4899', connector: '3-pin XLR', isPower: false },
  { type: 'aes_ebu', name: 'AES/EBU Digital Audio (XLR)', shortLabel: 'AES', color: '#f43f5e', connector: 'XLR-3 · 110Ω', isPower: false },
  { type: 'speakon', name: 'Speakon Speaker Cable (NL4)', shortLabel: 'SPK', color: '#6366f1', connector: 'Speakon NL4', isPower: false },
  { type: 'socapex', name: 'SOCAPEX Multi-Cable (Lighting)', shortLabel: 'SOCA', color: '#facc15', connector: 'SOCAPEX 19-pin', isPower: false },
  { type: 'smpte_fiber', name: 'SMPTE Hybrid Fiber (Camera)', shortLabel: 'SMPTE', color: '#22d3ee', connector: 'SMPTE LEMO', isPower: false },
  { type: 'power_20a', name: 'AC Power 20A (120V)', shortLabel: '20A', color: '#ef4444', connector: '20A Edison / Stage Pin', isPower: true, rating: '20A · 2400W @120V' },
  { type: 'power_60a', name: 'AC Power 60A (120/208V)', shortLabel: '60A', color: '#f97316', connector: '60A Bates / Stage Pin', isPower: true, rating: '60A · 7200W @120V' },
  { type: 'power_100a', name: 'AC Power 100A (3-phase)', shortLabel: '100A', color: '#dc2626', connector: '100A Camlok', isPower: true, rating: '100A · 24000W @120V' },
  { type: 'power_schuko', name: 'Schuko Power (CEE 7/7) 230V', shortLabel: 'SCHUKO', color: '#ef4444', connector: 'Schuko CEE 7/7', isPower: true, rating: '16A · 3680W @230V' },
  { type: 'power_true1', name: 'powerCON TRUE1 (Neutrik)', shortLabel: 'TRUE1', color: '#fb7185', connector: 'powerCON TRUE1', isPower: true, rating: '20A · 5000W @250V' },
  { type: 'power_cee16', name: 'CEEform 16A (3-phase)', shortLabel: 'CEE16', color: '#f97316', connector: 'CEE 16A 5-pin', isPower: true, rating: '16A · 11kW @400V 3ph' },
  { type: 'power_cee32', name: 'CEEform 32A (3-phase)', shortLabel: 'CEE32', color: '#f59e0b', connector: 'CEE 32A 5-pin', isPower: true, rating: '32A · 22kW @400V 3ph' },
  { type: 'power_cee63', name: 'CEEform 63A (3-phase)', shortLabel: 'CEE63', color: '#d97706', connector: 'CEE 63A 5-pin', isPower: true, rating: '63A · 43kW @400V 3ph' },
  { type: 'power_cee125', name: 'CEEform 125A (3-phase)', shortLabel: 'CEE125', color: '#b91c1c', connector: 'CEE 125A 5-pin', isPower: true, rating: '125A · 86kW @400V 3ph' },
];

export const LIGHTING_BRANDS = [
  { brand: 'ARRI', models: ['SkyPanel S60-C', 'SkyPanel S30-C', 'SkyPanel S360-C', 'Orbiter', 'M18 HMI', 'M40 HMI', 'L7-C LED Fresnel', 'L5-C LED Fresnel', '1K Tungsten Fresnel', '300W Tungsten Fresnel'] },
  { brand: 'Aputure', models: ['LS 600d Pro', 'LS 600c Pro', 'LS 1200d Pro', 'LS 300d II', 'Nova P600c', 'Nova P300c', 'Electro Storm CS15', 'Electro Storm XT26', 'Amaran 200d', 'B7c Practical Bulb'] },
  { brand: 'Nanlite', models: ['Forza 720B', 'Forza 500', 'Forza 300B', 'Pavotube II 30X', 'Pavotube II 15X', 'Compac 200'] },
  { brand: 'Astera', models: ['Titan Tube FP1', 'Helios Tube FP2', 'Hyperion Tube FP3', 'AX5 TriplePAR', 'NYX Bulb FP5', 'LeoFresnel'] },
  { brand: 'Quasar Science', models: ['Double Rainbow', 'Rainbow 2', 'Crossfade X'] },
  { brand: 'Kino Flo', models: ['Celeb 850', 'Freestyle 31', 'Diva-Lite 400', '4Bank 4ft'] },
  { brand: 'Creamsource', models: ['Vortex8', 'Vortex4', 'Micro Colour'] },
  { brand: 'Litepanels', models: ['Gemini 2x1 RGBW', 'Gemini 1x1 RGBW', 'Astra 6X'] },
  { brand: 'Matthews / Grip', models: ['C-Stand 40" w/ Arm', 'Solid Floppy 4x4', 'Silk 4x4', 'Single Net 4x4', 'Double Net 4x4', 'Cutter 18x48'] },
  { brand: 'Generic / Custom', models: ['Custom Fixture'] },
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
    type: 'softbox',
    name: 'Softbox / Dome Diffuser',
    defaultBeam: 90,
    defaultTemp: 5600,
    defaultModel: 'Aputure Light Storm 600d + Light Dome',
  },
  {
    type: 'tube_light',
    name: 'Light Tube / Astera Pixel Tube',
    defaultBeam: 160,
    defaultTemp: 5600,
    defaultModel: 'Astera Titan Tube FP1 / Quasar Science',
  },
  {
    type: 'led_panel',
    name: 'Soft LED Panel',
    defaultBeam: 110,
    defaultTemp: 5600,
    defaultModel: 'ARRI SkyPanel S60-C',
  },
  {
    type: 'spotlight',
    name: 'Hard Leko / Ellipsoidal',
    defaultBeam: 19,
    defaultTemp: 5600,
    defaultModel: 'ETC Source Four / Aputure Spotlight Mount',
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
    type: 'flag_cucoloris',
    name: 'Cucoloris / Cookie (Dappled Shadow)',
    defaultBeam: 0,
    defaultTemp: 0,
    defaultModel: 'Matthews 24x36 Wood Cucoloris',
    isFlag: true,
  },
  {
    type: 'flag_branchaloris',
    name: 'Branchaloris (Branch on a C-Stand)',
    defaultBeam: 0,
    defaultTemp: 0,
    defaultModel: 'Practical Branch on 40" C-Stand Arm',
    isFlag: true,
  },
  {
    type: 'flag_shutter',
    name: 'Barn Doors / Framing Shutter',
    defaultBeam: 0,
    defaultTemp: 0,
    defaultModel: '4-Leaf Barndoor / Framing Shutter Set',
    isFlag: true,
  },
  {
    type: 'c_stand_flag',
    name: 'C-Stand + 40" Grip Arm',
    defaultBeam: 0,
    defaultTemp: 0,
    defaultModel: 'Matthews 40" C-Stand with Grip Arm',
    isFlag: true,
  },
  {
    type: 'tripod',
    name: 'Heavy-Duty Tripod Stand (Baby/Combo)',
    defaultBeam: 0,
    defaultTemp: 0,
    defaultModel: 'Matthews Heavy Duty Baby Stand / Combo Tripod',
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
  if (light.fixtureType === 'flag_branchaloris') {
    // A branch rigged on a grip arm reads wider than tall from above.
    return { w: Math.max(14, size.w * 1.15), h: Math.max(12, size.h * 0.9) };
  }
  if (light.fixtureType === 'flag_shutter') {
    // Barn doors clamp to the fixture face, so they stay compact.
    return { w: Math.max(10, size.w * 0.5), h: Math.max(10, size.h * 0.5) };
  }
  return { w: size.w, h: size.h };
}

export const PROP_CATALOG: {
  type: PropType;
  name: string;
  category: 'Living' | 'Dining & Office' | 'Bedroom' | 'Studio & Stage' | 'Concert & Stage' | 'Broadcast & Production' | 'Vehicles' | 'Weapons & Explosives' | 'Documents & Hand Props' | 'Architecture' | 'Generic';
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
  { type: 'table_round', name: 'Round Dining Table + 4 Chairs', category: 'Dining & Office', defaultWidth: 150, defaultHeight: 150, defaultColor: '#854d0e' },
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
  { type: 'sound_boom', name: 'Sound Boom Operator', category: 'Studio & Stage', defaultWidth: 50, defaultHeight: 50, defaultColor: '#d97706' },
  { type: 'c_stand', name: 'C-Stand + 40" Grip Arm', category: 'Studio & Stage', defaultWidth: 50, defaultHeight: 50, defaultColor: '#64748b' },
  { type: 'tripod', name: 'Generic Heavy-Duty Tripod Stand', category: 'Studio & Stage', defaultWidth: 45, defaultHeight: 45, defaultColor: '#475569' },
  { type: 'director_chair', name: "Director's Folding Chair", category: 'Studio & Stage', defaultWidth: 45, defaultHeight: 45, defaultColor: '#1e293b' },
  { type: 'apple_box', name: 'Apple Box (Full/Half)', category: 'Studio & Stage', defaultWidth: 40, defaultHeight: 30, defaultColor: '#b45309' },
  { type: 'camera_cart', name: 'Camera Magliner Cart', category: 'Studio & Stage', defaultWidth: 110, defaultHeight: 55, defaultColor: '#475569' },
  { type: 'green_screen', name: 'Chroma Green / Seamless Backdrop', category: 'Studio & Stage', defaultWidth: 240, defaultHeight: 20, defaultColor: '#16a34a' },

  // Vehicles — realistic footprints at 30 px/m (sedan ≈ 4.8 × 1.9 m).
  // Symbols keep their original artwork; only default scale is true-to-size.
  { type: 'car', name: 'Sedan Passenger Car (4-Door)', category: 'Vehicles', defaultWidth: 74, defaultHeight: 145, defaultColor: '#2563eb' },
  { type: 'vehicle_suv', name: 'SUV / 4x4 Vehicle', category: 'Vehicles', defaultWidth: 78, defaultHeight: 152, defaultColor: '#475569' },
  { type: 'vehicle_truck', name: 'Production Grip Truck', category: 'Vehicles', defaultWidth: 92, defaultHeight: 230, defaultColor: '#334155' },
  { type: 'vehicle_police', name: 'Police Cruiser (4-Door)', category: 'Vehicles', defaultWidth: 76, defaultHeight: 148, defaultColor: '#0284c7' },

  // Concert & Live Event Staging
  { type: 'stage', name: 'Concert Stage Platform', category: 'Concert & Stage', defaultWidth: 480, defaultHeight: 240, defaultColor: '#1e293b' },
  { type: 'stage_riser', name: 'Stage Riser / Platform Deck', category: 'Concert & Stage', defaultWidth: 180, defaultHeight: 120, defaultColor: '#334155' },
  { type: 'stage_runway', name: 'Runway / Catwalk Extension', category: 'Concert & Stage', defaultWidth: 320, defaultHeight: 60, defaultColor: '#475569' },
  { type: 'stage_truss', name: 'Lighting Truss Tower', category: 'Concert & Stage', defaultWidth: 40, defaultHeight: 220, defaultColor: '#0f172a' },
  { type: 'drum_kit', name: 'Drum Riser + Full Drum Kit', category: 'Concert & Stage', defaultWidth: 160, defaultHeight: 140, defaultColor: '#1e293b' },
  { type: 'keyboard_rig', name: 'Keyboard Rig / Synth Station', category: 'Concert & Stage', defaultWidth: 90, defaultHeight: 50, defaultColor: '#334155' },
  { type: 'amp_stack', name: 'Guitar Amp Stack', category: 'Concert & Stage', defaultWidth: 70, defaultHeight: 70, defaultColor: '#111827' },
  { type: 'speaker_stack', name: 'PA Speaker Stack', category: 'Concert & Stage', defaultWidth: 70, defaultHeight: 110, defaultColor: '#0f172a' },
  { type: 'speaker_array', name: 'Line Array Speaker Hang', category: 'Concert & Stage', defaultWidth: 30, defaultHeight: 120, defaultColor: '#1e293b' },
  { type: 'sub_stack', name: 'Subwoofer Stack', category: 'Concert & Stage', defaultWidth: 90, defaultHeight: 60, defaultColor: '#0f172a' },
  { type: 'monitor_wedge', name: 'Floor Monitor Wedge', category: 'Concert & Stage', defaultWidth: 45, defaultHeight: 30, defaultColor: '#334155' },
  { type: 'foh_console', name: 'FOH Mixing Console Position', category: 'Concert & Stage', defaultWidth: 140, defaultHeight: 60, defaultColor: '#1e293b' },
  { type: 'monitor_console', name: 'Monitor Mixing Position', category: 'Concert & Stage', defaultWidth: 120, defaultHeight: 50, defaultColor: '#1e293b' },
  { type: 'mic_stand', name: 'Microphone Stand', category: 'Concert & Stage', defaultWidth: 25, defaultHeight: 25, defaultColor: '#475569' },
  { type: 'barricade', name: 'Crowd Barrier / Barricade', category: 'Concert & Stage', defaultWidth: 180, defaultHeight: 20, defaultColor: '#64748b' },
  { type: 'video_wall', name: 'LED Video Wall / Screen', category: 'Concert & Stage', defaultWidth: 300, defaultHeight: 180, defaultColor: '#020617' },

  // Broadcast & Production — realistic footprints at 30 px/m.
  { type: 'broadcast_truck', name: 'Broadcast Production Truck', category: 'Broadcast & Production', defaultWidth: 140, defaultHeight: 330, defaultColor: '#1e293b' },
  { type: 'broadcast_van', name: 'ENG / News Van', category: 'Broadcast & Production', defaultWidth: 95, defaultHeight: 175, defaultColor: '#0f172a' },
  { type: 'sat_truck', name: 'Satellite Uplink Truck', category: 'Broadcast & Production', defaultWidth: 110, defaultHeight: 255, defaultColor: '#111827' },

  // Weapons & Explosives
  { type: 'gun', name: 'Handgun / Pistol Firearm', category: 'Weapons & Explosives', defaultWidth: 44, defaultHeight: 32, defaultColor: '#1e293b' },
  { type: 'rifle', name: 'Tactical Rifle / Shotgun', category: 'Weapons & Explosives', defaultWidth: 95, defaultHeight: 26, defaultColor: '#0f172a' },
  { type: 'bomb', name: 'Time Bomb / Explosive C4', category: 'Weapons & Explosives', defaultWidth: 46, defaultHeight: 34, defaultColor: '#dc2626' },

  // Documents & Hand Props
  { type: 'letter', name: 'Sealed Letter / Envelope', category: 'Documents & Hand Props', defaultWidth: 36, defaultHeight: 24, defaultColor: '#f8fafc' },

  // Architecture & Generic
  { type: 'tree', name: 'Scenic Tree / Foliage', category: 'Architecture', defaultWidth: 120, defaultHeight: 120, defaultColor: '#15803d' },
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
 * Screenplays for the bundled sample scenes. Each template ships its own
 * script so it can be lined straight away on its own, while SAMPLE_SCREENPLAY
 * keeps both scenes concatenated for projects that carry both templates.
 */
export const SAMPLE_DIALOGUE_SCREENPLAY = `1   INT. LIVING ROOM - NIGHT   1

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
`;

/**
 * The noir interrogation scene with its own full dialogue pass, so the
 * per-character tools have real material to work with.
 */
export const SAMPLE_NOIR_SCREENPLAY = `2   INT. INTERROGATION ROOM - NIGHT   2

One lamp over a metal table. A tape recorder turns slowly at
the edge of the pool of light. The SUSPECT sits cuffed to the
table ring, shirt dark with sweat. The DETECTIVE sits opposite,
jacket off, sleeves rolled.

DETECTIVE
Twelve minutes. That's how long you were
in that stairwell.

SUSPECT
I was having a smoke.

The DETECTIVE leans in and taps the tabletop twice.

DETECTIVE
(sweet)
Second floor of a non-smoking building.

SUSPECT
So I broke a rule. Arrest me.

The DETECTIVE stands, walks around behind him, and lets him
feel it.

DETECTIVE
Who was holding the door?

SUSPECT
Nobody held a door.

The DETECTIVE stops. He reaches past the SUSPECT's shoulder
and switches off the lamp. Just the blind slashes now, blue
and hard across the room.

DETECTIVE
(off his shoulder)
A woman died in that stairwell.

SUSPECT
(quiet)
That wasn't me.

DETECTIVE
Then say it louder.

SUSPECT
That wasn't me!

DETECTIVE
There it is. The first honest thing
out of you all night.

The SUSPECT laughs once, and there is nothing funny in it.

SUSPECT
You had nothing an hour ago. You have
nothing now.

DETECTIVE
I have twelve minutes.

He sits back down and slides a photograph across the metal
into the light.

SUSPECT
(not looking at it)
I want a lawyer.

DETECTIVE
A lawyer gets you what you had before
midnight. Talk to me and maybe you
keep what you have after.

The SUSPECT looks at the photograph. Whatever is on it, he
does not blink.

SUSPECT
Turn the lamp back on.

The DETECTIVE clicks the lamp back on and keeps his hand on
the hot shade a moment longer than he needs to.

DETECTIVE
Start with the stairwell.
`;

export const SAMPLE_SCREENPLAY = SAMPLE_DIALOGUE_SCREENPLAY + SAMPLE_NOIR_SCREENPLAY;

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
      showGrid: false,
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
      showGrid: false,
      unit: 'm',
      pixelsPerUnit: 30,
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
        name: 'SUSPECT',
        characterLetter: 'S',
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
        name: 'DETECTIVE',
        characterLetter: 'D',
        color: '#3b82f6',
        x: 500,
        y: 330,
        rotation: 180,
        isStanding: false,
        actionNotes: 'Gets up on beat 2 and comes round behind the suspect.',
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
        name: 'Suspect — low angle push in',
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
        framingDescription: 'Low angle close-up, the suspect alone in the pool of light.',
        actionScriptNotes: 'Push in as he breaks.',
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
        actionScriptNotes: 'Detective circles him on beat 2.',
        status: 'planned',
        takesCount: 0,
        estDurationSeconds: 40,
        order: 2,
      },
    ],
  },
];
