import {
  CameraElement,
  EquipmentCategory,
  EquipmentItem,
  FloorPlanElement,
  LightElement,
  MasterEquipmentItem,
  PropElement,
  SceneSetup,
  TrackElement,
} from '../types';

export interface CategoryMeta {
  key: EquipmentCategory;
  label: string;
  shortLabel: string;
  iconName: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  accentColor: string;
  description: string;
}

export const EQUIPMENT_CATEGORIES: CategoryMeta[] = [
  {
    key: 'camera',
    label: 'Camera & Optics',
    shortLabel: 'Camera',
    iconName: 'Camera',
    badgeBg: 'bg-sky-500/15',
    badgeText: 'text-sky-400',
    borderColor: 'border-sky-500/30',
    accentColor: '#0ea5e9',
    description: 'A/B/C Camera bodies, lenses, matte boxes, follow focus, wireless video transmitters, monitors',
  },
  {
    key: 'lighting',
    label: 'Lighting & Electrics',
    shortLabel: 'Lighting',
    iconName: 'Sun',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    accentColor: '#f59e0b',
    description: 'LED, HMI, Tungsten fixtures, tube lights, diffusions, softboxes, grids, gels',
  },
  {
    key: 'grip',
    label: 'Grip & Rigging',
    shortLabel: 'Grip',
    iconName: 'Anchor',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    accentColor: '#10b981',
    description: 'C-Stands, combo stands, apple boxes, dolly track, sandbags, flags, frames, clamps',
  },
  {
    key: 'audio',
    label: 'Sound & Audio',
    shortLabel: 'Audio',
    iconName: 'Mic',
    badgeBg: 'bg-rose-500/15',
    badgeText: 'text-rose-400',
    borderColor: 'border-rose-500/30',
    accentColor: '#f43f5e',
    description: 'Boom mics, lavaliers, wireless transmitters, field audio recorders, comms & walkies',
  },
  {
    key: 'power_media',
    label: 'Power & Media',
    shortLabel: 'Power & Media',
    iconName: 'BatteryCharging',
    badgeBg: 'bg-violet-500/15',
    badgeText: 'text-violet-400',
    borderColor: 'border-violet-500/30',
    accentColor: '#8b5cf6',
    description: 'V-Mount/Gold-Mount batteries, chargers, CFexpress/SD cards, SSDs, AC distribution, generators',
  },
  {
    key: 'cables',
    label: 'Cables & Distribution',
    shortLabel: 'Cables',
    iconName: 'Cable',
    badgeBg: 'bg-cyan-500/15',
    badgeText: 'text-cyan-400',
    borderColor: 'border-cyan-500/30',
    accentColor: '#06b6d4',
    description: '12G-SDI, HDMI 2.1, XLR audio, DMX 5-pin, heavy stingers, PowerCon',
  },
  {
    key: 'props',
    label: 'Props & Set Dressing',
    shortLabel: 'Props',
    iconName: 'Package',
    badgeBg: 'bg-orange-500/15',
    badgeText: 'text-orange-400',
    borderColor: 'border-orange-500/30',
    accentColor: '#f97316',
    description: 'Furnishings, practical set pieces, vehicles, hand props, staged items',
  },
  {
    key: 'expendables',
    label: 'Expendables & Supplies',
    shortLabel: 'Expendables',
    iconName: 'Sparkles',
    badgeBg: 'bg-fuchsia-500/15',
    badgeText: 'text-fuchsia-400',
    borderColor: 'border-fuchsia-500/30',
    accentColor: '#d946ef',
    description: 'Gaffer tape, paper tape, C-47s, lens wipes, compressed air, fog fluid, blackwrap',
  },
  {
    key: 'other',
    label: 'Miscellaneous Gear',
    shortLabel: 'Other',
    iconName: 'Boxes',
    badgeBg: 'bg-slate-500/15',
    badgeText: 'text-slate-400',
    borderColor: 'border-slate-500/30',
    accentColor: '#64748b',
    description: 'General production equipment, safety kits, tools',
  },
];

export const getCategoryMeta = (cat: EquipmentCategory): CategoryMeta =>
  EQUIPMENT_CATEGORIES.find((c) => c.key === cat) || EQUIPMENT_CATEGORIES[EQUIPMENT_CATEGORIES.length - 1];

/** Formats fixture types into human-readable names. */
const formatFixtureType = (type: string): { brand?: string; model: string } => {
  switch (type) {
    case 'arri_skypanel_s60':
      return { brand: 'ARRI', model: 'SkyPanel S60-C' };
    case 'aputure_600d':
      return { brand: 'Aputure', model: 'LS 600d Pro' };
    case 'aputure_1200d':
      return { brand: 'Aputure', model: 'LS 1200d Pro' };
    case 'aputure_300x':
      return { brand: 'Aputure', model: 'LS 300x Bi-Color' };
    case 'nanlite_forza_720':
      return { brand: 'Nanlite', model: 'Forza 720B' };
    case 'nanlite_pavotube_4ft':
      return { brand: 'Nanlite', model: 'PavoTube II 30C 4ft' };
    case 'astera_titan_tube':
      return { brand: 'Astera', model: 'Titan Tube FP1' };
    case 'arri_m18':
      return { brand: 'ARRI', model: 'M18 1800W HMI' };
    case 'arri_m40':
      return { brand: 'ARRI', model: 'M40 4000W HMI' };
    case 'kino_flo_4bank':
      return { brand: 'Kino Flo', model: '4Bank 4ft' };
    case 'spotlight':
      return { brand: 'Generic', model: 'Spotlight Ellipsoidal' };
    case 'fresnel':
      return { brand: 'Generic', model: 'Fresnel Studio Tungsten' };
    case 'led_panel':
      return { brand: 'Generic', model: '1x1 Bi-Color LED Panel' };
    case 'tube_light':
      return { brand: 'Generic', model: 'RGBWW Pixel Tube 4ft' };
    case 'c_stand_flag':
      return { brand: 'Matthews', model: 'C-Stand Flag Solid' };
    case 'c_stand_net':
      return { brand: 'Matthews', model: 'C-Stand Scrim Net' };
    default:
      return { model: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) };
  }
};

/** Formats prop types into appropriate department items. */
const formatPropEquipment = (prop: PropElement): { category: EquipmentCategory; name: string; brand?: string; model?: string; specs?: string } => {
  switch (prop.propType) {
    case 'c_stand':
      return { category: 'grip', name: 'C-Stand with Grip Arm & Head', brand: 'Matthews / Avenger', model: '40" Century Stand', specs: '10.5ft Max Height, 2.5" Grip Head' };
    case 'tripod':
      return { category: 'grip', name: 'Heavy Duty Video Tripod & Head', brand: 'Sachtler / Manfrotto', model: 'Fluid Head System', specs: '75mm / 100mm Bowl' };
    case 'apple_box':
      return { category: 'grip', name: 'Nesting Apple Box Set', brand: 'Kupo / Matthews', model: 'Full, Half, Quarter, Pancake', specs: '9-Ply Baltic Birch' };
    case 'camera_cart':
      return { category: 'grip', name: 'Senior Camera Production Cart', brand: 'Inovativ / YaegerPro', model: 'Voyager 36/42 EVO', specs: 'Locking Casters & Mast Mounts' };
    case 'sound_boom':
      return { category: 'audio', name: 'Boom Pole with Shotgun Microphone', brand: 'Sennheiser / Røde', model: 'MKH 416 + Carbon Boom', specs: 'Supercardioid RF Condenser + Shockmount' };
    case 'director_chair':
      return { category: 'props', name: "Director's Folding Chair", brand: 'Filmtools', model: 'Tall Hardwood Chair', specs: '30" Bar Height Canvas' };
    case 'green_screen':
      return { category: 'grip', name: 'Chroma Green Screen Backdrop', brand: 'Westcott / Matthews', model: '12x12 Chroma Key Green', specs: 'Wrinkle-Resistant Seamless' };
    case 'car':
    case 'vehicle_suv':
    case 'vehicle_truck':
    case 'vehicle_police':
      return { category: 'props', name: `Picture Vehicle (${prop.label || prop.propType.replace(/_/g, ' ')})`, model: prop.label || 'Action Vehicle', specs: 'Staged Production Vehicle' };
    default:
      return { category: 'props', name: prop.label || prop.propType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), specs: `${Math.round(prop.width)}×${Math.round(prop.height)}px footprint` };
  }
};

/**
 * Derives all equipment for a single scene setup.
 * Auto-aggregates gear from cameras, lights, props, and tracks,
 * then merges with any user overrides/custom additions in `setup.customEquipment`.
 */
export const deriveSceneEquipment = (setup: SceneSetup): EquipmentItem[] => {
  const autoItems: EquipmentItem[] = [];
  const elements = setup.elements || [];

  elements.forEach((elem: FloorPlanElement) => {
    if (elem.type === 'camera') {
      const cam = elem as CameraElement;
      const lensMm = cam.focalLength || 35;
      const rig = cam.rigType || 'tripod';
      const label = (cam.cameraLabel || 'A').toUpperCase();

      autoItems.push({
        id: `auto-cam-${cam.id}`,
        elementId: cam.id,
        category: 'camera',
        name: `Camera ${label} Package`,
        brand: cam.cameraModel ? cam.cameraModel.split(' ')[0] : 'Sony / ARRI',
        model: cam.cameraModel || `Cinema Camera (Cam ${label})`,
        quantity: 1,
        roleOrFunction: `Camera ${label} Main`,
        specs: `Prime Lens ${lensMm}mm · Rig: ${rig.toUpperCase()} · Sensor: ${cam.sensorFormat || 'Full Frame 35mm'}`,
        isCustom: false,
      });
    } else if (elem.type === 'light') {
      const light = elem as LightElement;
      const parsed = formatFixtureType(light.fixtureType);
      const kelvinStr = light.colorTemp ? `${light.colorTemp}K` : light.rgbColor ? `RGB Gel (${light.rgbColor})` : '5600K';
      const isFlagOrNet =
        light.fixtureType === 'c_stand_flag' ||
        light.fixtureType === 'flag_solid' ||
        light.fixtureType === 'flag_silk' ||
        light.fixtureType === 'flag_net' ||
        light.fixtureType === 'flag_cutter' ||
        light.fixtureType === 'overhead_diffusion';

      let modifierSpecs = `${kelvinStr} · ${light.intensity}% intensity · ${light.beamAngle}° beam`;
      if (isFlagOrNet) {
        modifierSpecs = `Flag Size: ${light.flagSize || '24×36"'} ${light.netValue ? `· Net: ${light.netValue}` : ''}`;
      } else {
        const mods: string[] = [];
        if (light.hasBarnDoors) mods.push('Barn Doors');
        if (light.hasDiffusionGrid) mods.push('Diffusion Grid');
        if (mods.length > 0) modifierSpecs += ` · [${mods.join(', ')}]`;
      }

      autoItems.push({
        id: `auto-light-${light.id}`,
        elementId: light.id,
        category: isFlagOrNet ? 'grip' : 'lighting',
        name: light.fixtureModel || parsed.model,
        brand: light.brand || parsed.brand || 'Aputure / ARRI',
        model: light.fixtureModel || parsed.model,
        quantity: 1,
        roleOrFunction: light.lightRole ? `${light.lightRole.toUpperCase()} Light` : 'Key / Set Lighting',
        specs: modifierSpecs,
        isCustom: false,
      });
    } else if (elem.type === 'prop') {
      const prop = elem as PropElement;
      const formatted = formatPropEquipment(prop);
      autoItems.push({
        id: `auto-prop-${prop.id}`,
        elementId: prop.id,
        category: formatted.category,
        name: formatted.name,
        brand: formatted.brand,
        model: formatted.model,
        quantity: 1,
        roleOrFunction: prop.label || 'Set Piece / Practical',
        specs: formatted.specs,
        isCustom: false,
      });
    } else if (elem.type === 'track') {
      const track = elem as TrackElement;
      autoItems.push({
        id: `auto-track-${track.id}`,
        elementId: track.id,
        category: 'grip',
        name: track.isCurved ? 'Curved Camera Dolly Track Section' : 'Straight Camera Dolly Track (8ft)',
        brand: 'Matthews / Fisher',
        model: track.isCurved ? 'Curved Steel Track 45°' : 'Precision Steel Dolly Track',
        quantity: 1,
        roleOrFunction: 'Camera Dolly Movement',
        specs: 'Standard 24.5" Center-to-Center Gauge',
        isCustom: false,
      });
    }
  });

  // Apply custom equipment overrides and add extra items
  const customList = setup.customEquipment || [];
  const result: EquipmentItem[] = [];

  // 1. Process auto-derived items, checking for overrides
  autoItems.forEach((autoItem) => {
    const override = customList.find((c) => c.elementId === autoItem.elementId || c.id === autoItem.id);
    if (override) {
      result.push({
        ...autoItem,
        ...override,
        id: override.id || autoItem.id,
        elementId: autoItem.elementId,
        isCustom: false, // still linked to canvas element
      });
    } else {
      result.push(autoItem);
    }
  });

  // 2. Append purely custom items (not tied to any canvas element)
  customList.forEach((customItem) => {
    if (!customItem.elementId && !result.some((r) => r.id === customItem.id)) {
      result.push({
        ...customItem,
        isCustom: true,
      });
    }
  });

  // Sort by category order then name
  const catOrder = EQUIPMENT_CATEGORIES.map((c) => c.key);
  return result.sort((a, b) => {
    const catDiff = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    return a.name.localeCompare(b.name);
  });
};

/**
 * Derives the consolidated Master Production Equipment Manifest across all scenes/setups in the project.
 * Aggregates duplicate/similar items, calculates total quantity and peak concurrent quantity,
 * and attaches scene breakdown tags (`usedInSetups`).
 */
export const deriveAllScenesEquipment = (setups: SceneSetup[]): MasterEquipmentItem[] => {
  const map = new Map<string, MasterEquipmentItem>();

  setups.forEach((setup) => {
    const sceneItems = deriveSceneEquipment(setup);

    sceneItems.forEach((item) => {
      // Key grouping: category + clean brand + clean model/name
      const brandKey = (item.brand || '').trim().toLowerCase();
      const modelKey = (item.model || item.name).trim().toLowerCase();
      const groupKey = `${item.category}:${brandKey}:${modelKey}`;

      const existing = map.get(groupKey);
      if (!existing) {
        map.set(groupKey, {
          ...item,
          id: `master-${groupKey.replace(/[^a-z0-9]/gi, '-')}`,
          quantity: item.quantity,
          maxConcurrentQuantity: item.quantity,
          usedInSetups: [
            {
              id: setup.id,
              name: setup.name,
              sceneNumber: setup.sceneNumber,
              quantity: item.quantity,
            },
          ],
        });
      } else {
        existing.quantity += item.quantity;
        existing.maxConcurrentQuantity = Math.max(existing.maxConcurrentQuantity, item.quantity);
        existing.usedInSetups.push({
          id: setup.id,
          name: setup.name,
          sceneNumber: setup.sceneNumber,
          quantity: item.quantity,
        });

        // Merge specs / notes if missing
        if (!existing.specs && item.specs) existing.specs = item.specs;
        if (!existing.brand && item.brand) existing.brand = item.brand;
        if (!existing.model && item.model) existing.model = item.model;
      }
    });
  });

  const catOrder = EQUIPMENT_CATEGORIES.map((c) => c.key);
  return Array.from(map.values()).sort((a, b) => {
    const catDiff = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    return a.name.localeCompare(b.name);
  });
};

/** Quick-add presets library for common production items. */
export interface EquipmentPreset {
  category: EquipmentCategory;
  name: string;
  brand: string;
  model: string;
  quantity: number;
  roleOrFunction: string;
  specs: string;
}

export const QUICK_EQUIPMENT_PRESETS: EquipmentPreset[] = [
  // Power & Media
  {
    category: 'power_media',
    name: 'V-Mount High-Draw Battery 98Wh (×4)',
    brand: 'FXLION / Core SWX',
    model: 'Nano Two 98Wh Micro V-Mount',
    quantity: 4,
    roleOrFunction: 'Camera & On-Board Lighting Power',
    specs: '14.8V 6.6Ah · Dual D-Tap + USB-C PD 60W',
  },
  {
    category: 'power_media',
    name: 'Gold-Mount Battery 150Wh (×2)',
    brand: 'Anton/Bauer',
    model: 'Titon 150 14.4V Lithium-Ion',
    quantity: 2,
    roleOrFunction: 'Production Monitor & Wireless Video Power',
    specs: '156Wh High-Current Draw · P-Tap & USB Out',
  },
  {
    category: 'power_media',
    name: 'CFexpress Type B Media 512GB (×4)',
    brand: 'SanDisk / Angelbird',
    model: 'Extreme PRO CFexpress Type B',
    quantity: 4,
    roleOrFunction: 'Primary RAW/ProRes Recording Media',
    specs: '1700 MB/s Read · 1400 MB/s Write',
  },
  {
    category: 'power_media',
    name: 'V90 SDXC Memory Cards 128GB (×4)',
    brand: 'Sony',
    model: 'TOUGH-M Series UHS-II V90',
    quantity: 4,
    roleOrFunction: 'Internal 4K All-Intra Camera Recording',
    specs: '300 MB/s Read · 299 MB/s Write · Ruggedized',
  },
  {
    category: 'power_media',
    name: 'Samsung T7 Shield SSD 2TB (×2)',
    brand: 'Samsung',
    model: 'T7 Shield Rugged USB-C 3.2',
    quantity: 2,
    roleOrFunction: 'On-Set DIT Backup & Direct Record',
    specs: '1050 MB/s NVMe · IP65 Water & Dust Resistant',
  },
  {
    category: 'power_media',
    name: 'Quad V-Mount Fast Simultaneous Charger',
    brand: 'FXLION / SWIT',
    model: 'PL-Q280B 4-Channel Charger',
    quantity: 1,
    roleOrFunction: 'Basecamp Battery Charging Station',
    specs: '16.8V/3A Fast Charge per channel · AC 100-240V',
  },

  // Cables & Distribution
  {
    category: 'cables',
    name: '12G-SDI 4K BNC Coaxial Cable 50ft (×2)',
    brand: 'Canare / Belden',
    model: 'L-4.5CHD High-Flex 12G BNC',
    quantity: 2,
    roleOrFunction: 'Main Video Feed to Video Village / Director',
    specs: '4K60p 12G-SDI Lossless Transmission · 75 Ohm',
  },
  {
    category: 'cables',
    name: '12G-SDI Thin BNC Cable 25ft (×4)',
    brand: 'Kondor Blue / Canare',
    model: 'Ultra-Thin Flexible BNC Cable',
    quantity: 4,
    roleOrFunction: 'On-Camera Monitor & Wireless Transmitter Links',
    specs: 'High-Flex Thin BNC · 12G Rated',
  },
  {
    category: 'cables',
    name: 'Heavy Duty 50ft AC Stinger Extension (×4)',
    brand: 'Hubbell / Filmtools',
    model: '12/3 SOOW Heavy Duty Stinger',
    quantity: 4,
    roleOrFunction: 'Set Power Distribution for High-Draw Lights',
    specs: '12 AWG / 3 Conductor 15A · Oil & Water Resistant',
  },
  {
    category: 'cables',
    name: 'Heavy Duty Metal 6-Outlet Power Strip (×2)',
    brand: 'Tripp Lite',
    model: 'TLM615NC Industrial Steel Strip',
    quantity: 2,
    roleOrFunction: 'DIT & Charging Station Power Distribution',
    specs: '15A 120V · 15ft Cord · Heavy Steel Enclosure',
  },
  {
    category: 'cables',
    name: 'XLR 3-Pin Balanced Audio Cable 25ft (×2)',
    brand: 'Mogami / Neutrik',
    model: 'Gold Studio 3-Pin XLR Cable',
    quantity: 2,
    roleOrFunction: 'Boom Mic to Field Recorder Connection',
    specs: 'Ultra-Low Noise OFC Core · Gold Neutrik Pins',
  },
  {
    category: 'cables',
    name: 'DMX 5-Pin Data Cable 50ft (×2)',
    brand: 'Lex Products',
    model: 'Opti-Cable 5-Pin XLR DMX',
    quantity: 2,
    roleOrFunction: 'Lighting Board / CRMX Console Distribution',
    specs: '120-Ohm Shielded Twisted Pair',
  },

  // Camera Accessories & Optics
  {
    category: 'camera',
    name: '4x5.65 Carbon Fiber Matte Box Kit',
    brand: 'Tilta',
    model: 'Mirage / MB-T12 Carbon Matte Box',
    quantity: 1,
    roleOrFunction: 'Lens Flare & ND Filter Control',
    specs: '2-Stage 4x5.65 Trays · 15mm LWS Rod Mount + French Flag',
  },
  {
    category: 'camera',
    name: 'Wireless Lens Control Follow Focus Kit',
    brand: 'Tilta',
    model: 'Nucleus-M Wireless Focus/Iris/Zoom',
    quantity: 1,
    roleOrFunction: '1st AC Precision Focus Pulling',
    specs: 'Hand Unit + 2× High-Torque Motors · 1000ft Range',
  },
  {
    category: 'camera',
    name: 'Zero-Delay 4K Wireless Video Tx/Rx Kit',
    brand: 'Teradek',
    model: 'Bolt 4K 750 12G-SDI / HDMI Kit',
    quantity: 1,
    roleOrFunction: 'Director & Client Wireless Video Feeds',
    specs: 'Zero Latency (<1ms) · 10-bit 4:2:2 HDR · 750ft Range',
  },
  {
    category: 'camera',
    name: 'On-Camera High-Bright 7" Monitor',
    brand: 'SmallHD',
    model: 'Cine 7 Touchscreen Monitor',
    quantity: 1,
    roleOrFunction: 'Camera Operator & Focus Puller Viewfinder',
    specs: '1800 nits Daylight Viewable · 12G-SDI/HDMI · RED/ARRI Control',
  },
  {
    category: 'camera',
    name: "Director's Handheld Monitor Cage System",
    brand: 'Wooden Camera',
    model: "Director's Monitor Cage v3",
    quantity: 1,
    roleOrFunction: 'Mobile Director & DP Monitoring',
    specs: 'Carbon Fiber Handles · V-Mount Plate · Neck Strap',
  },

  // Lighting Modifiers & Grip
  {
    category: 'lighting',
    name: '8x8 Modular Butterfly Diffusion Frame',
    brand: 'Matthews / Modern',
    model: '8x8 Breakdown Aluminum Frame + Silk',
    quantity: 1,
    roleOrFunction: 'Overhead Sun & Key Light Softening',
    specs: '1" Square Tube Frame + Full Silk & Solid Rag + Ear Mounts',
  },
  {
    category: 'grip',
    name: 'Solid Black Floppy Flag 40x40" (×2)',
    brand: 'Matthews Studio Equipment',
    model: '40x40" Floppy Top/Bottom Drop',
    quantity: 2,
    roleOrFunction: 'Negative Fill & Light Spill Cut',
    specs: 'Solid Black Commando Cloth · Unfolds to 40x80"',
  },
  {
    category: 'grip',
    name: 'Shot Bag / Saddle Sandbag 20lb (×6)',
    brand: 'Matthews / Filmtools',
    model: '20 lb Cordura Dual-Wing Shot Bag',
    quantity: 6,
    roleOrFunction: 'C-Stand & Lighting Safety Ballast',
    specs: 'Dual-Zipper Heavy Cordura · Stainless Shot Ballast',
  },
  {
    category: 'grip',
    name: 'Cardellini / Matthellini Center Jaw Clamp (×4)',
    brand: 'Cardellini',
    model: '2" End Jaw Matthellini Clamp',
    quantity: 4,
    roleOrFunction: 'Rigging Lights & Modifiers to Grid / Pipes',
    specs: '5/8" Baby Pin · Hardened Steel Jaws (0-2" capacity)',
  },

  // Sound & Comms
  {
    category: 'audio',
    name: 'Production UHF Walkie-Talkies (6-Pack)',
    brand: 'Motorola',
    model: 'CP200d Digital 16-Channel 5W',
    quantity: 6,
    roleOrFunction: 'Crew Comms (AD, Cam, G&E, Sound)',
    specs: '16 Channels · Surveillance Acoustic Tube Headsets + 6-Bank Charger',
  },
  {
    category: 'audio',
    name: 'Dual Wireless Lavalier Microphone Kit',
    brand: 'Sennheiser',
    model: 'EW-DP ME2 Set (2-Channel System)',
    quantity: 1,
    roleOrFunction: 'Cast Dialogue Wireless Capture',
    specs: '134 dB Dynamic Range · All-Digital UHF · Timecode Sync',
  },
  {
    category: 'audio',
    name: 'Field Audio Recorder 8-Track 32-Bit Float',
    brand: 'Sound Devices / Zoom',
    model: '833 / F8n Pro Timecode Recorder',
    quantity: 1,
    roleOrFunction: 'Production Sound Multi-Track Master',
    specs: 'Dual A/D Converters 32-Bit Float · BNC Timecode I/O · 8 Preamps',
  },

  // Expendables & Supplies
  {
    category: 'expendables',
    name: 'Pro Gaff Matte Black Cloth Tape 2" (×2)',
    brand: 'ProTapes',
    model: 'Pro Gaff 2" Heavy Duty Cloth',
    quantity: 2,
    roleOrFunction: 'Cable Dressing & Grip Safety',
    specs: '55 Yard Roll · Clean Removal Adhesive',
  },
  {
    category: 'expendables',
    name: 'Pro Gaff Camera White Paper Tape 1" (×2)',
    brand: 'ProTapes',
    model: 'Pro 1" Console & Camera Tape',
    quantity: 2,
    roleOrFunction: 'Actor Floor Marks & Camera Labeling',
    specs: '60 Yard Roll · Writable Surface',
  },
  {
    category: 'expendables',
    name: 'C-47 Hardwood Clothespins (Bag of 50)',
    brand: 'Filmtools',
    model: 'C-47 Heavy Duty Spring Pins',
    quantity: 1,
    roleOrFunction: 'Securing Diffusion & Gels to Barn Doors',
    specs: '50-Pack Solid Natural Birch Wood',
  },
  {
    category: 'expendables',
    name: 'Pancro Professional Lens Cleaning Kit',
    brand: 'Pancro',
    model: '4oz Spray Bottle + Kimwipes Box',
    quantity: 1,
    roleOrFunction: 'Precision Optical Glass Cleaning',
    specs: 'Smear-Free Fluid + 280-Count Lint-Free Delicate Task Wipes',
  },
];
