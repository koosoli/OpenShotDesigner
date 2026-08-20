import {
  CameraElement,
  EquipmentCategory,
  EquipmentItem,
  EquipmentPackageItem,
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

export interface BrandModelOption {
  brand: string;
  models: string[];
}

export const DEPARTMENT_BRANDS_CATALOG: Record<EquipmentCategory, BrandModelOption[]> = {
  lighting: [
    {
      brand: 'ARRI',
      models: [
        'SkyPanel S60-C',
        'SkyPanel S30-C',
        'SkyPanel S360-C',
        'SkyPanel S120-C',
        'Orbiter LED Spotlight',
        'M18 1800W HMI',
        'M40 4000W HMI',
        'M90 9000W HMI',
        'L7-C LED Fresnel',
        'L5-C LED Fresnel',
        'True Blue T1 1K Fresnel',
        'True Blue T2 2K Fresnel',
        '300W Tungsten Fresnel',
        '650W Tungsten Fresnel',
      ],
    },
    {
      brand: 'Aputure',
      models: [
        'LS 600d Pro Daylight',
        'LS 600c Pro RGBWW',
        'LS 1200d Pro Daylight',
        'LS 300d II Daylight',
        'LS 300x Bi-Color',
        'Nova P600c 2x1 Panel',
        'Nova P300c 1x1 Panel',
        'Electro Storm CS15 (1500W)',
        'Electro Storm XT26 (2600W)',
        'Amaran 200d S',
        'Amaran 300c RGBWW',
        'Accent B7c Practical Bulb',
        'MC Pro RGBWW Mini',
        'Infinibar PB12 Pixel Bar',
      ],
    },
    {
      brand: 'Nanlite',
      models: [
        'Forza 720B Bi-Color',
        'Forza 500 II Daylight',
        'Forza 300B II Bi-Color',
        'Forza 60C RGBLAC',
        'PavoTube II 30X 4ft Pixel Tube',
        'PavoTube II 15X 2ft Pixel Tube',
        'PavoTube II 6C 10"',
        'Compac 200B Slim Studio Panel',
        'PavoSlim 120C 2x1 RGBWW',
      ],
    },
    {
      brand: 'Astera',
      models: [
        'Titan Tube FP1 (4ft RGBWW)',
        'Helios Tube FP2 (2ft RGBWW)',
        'Hyperion Tube FP3 (8ft RGBWW)',
        'AX5 TriplePAR Battery LED',
        'AX9 PowerPAR 105W',
        'NYX Bulb FP5 RGBWW',
        'LeoFresnel Wireless Battery',
        'PlutoFresnel Wireless Battery',
        'PixelBar PB15 Wireless',
      ],
    },
    {
      brand: 'Quasar Science',
      models: [
        'Double Rainbow (RR100 / RR50)',
        'Rainbow 2 (R2 4ft / 2ft)',
        'Crossfade X Linear LED (4ft / 2ft)',
        'Q-Lion Battery Powered Tube (24" / 12")',
      ],
    },
    {
      brand: 'Kino Flo',
      models: [
        'Celeb 850 LED DMX',
        'Celeb 450Q LED',
        'Celeb 250 LED',
        'Freestyle 31 LED Fixture',
        'Freestyle 21 LED Fixture',
        'Diva-Lite 400 Fluorescent',
        '4Bank 4ft Fluorescent System',
        '2Bank 4ft Fluorescent System',
      ],
    },
    {
      brand: 'Creamsource',
      models: [
        'Vortex8 650W High Power 2x1',
        'Vortex4 325W 1x1 RGBW',
        'Micro Colour RGBW',
        'SpaceMAX LED Spacelight',
      ],
    },
    {
      brand: 'Litepanels',
      models: [
        'Gemini 2x1 RGBW Soft Panel',
        'Gemini 1x1 RGBW Soft Panel',
        'Astra 6X Bi-Color 1x1',
        'Astra 3X Bi-Color 1x1',
      ],
    },
    {
      brand: 'K5600 / Joker',
      models: [
        'Joker2 800W HMI Bug-Lite',
        'Joker2 1600W HMI Bug-Lite',
        'Joker 400W HMI Bug-Lite',
        'Bug-A-Beam Source 4 Adapter',
      ],
    },
    {
      brand: 'ETC / Lekos',
      models: [
        'Source Four Ellipsoidal 750W (19°/26°/36°/50°)',
        'Source Four LED Series 3 Lustr X8',
        'Source 4 PAR 750W EA',
      ],
    },
    {
      brand: 'Matthews / Grip Flags',
      models: [
        'C-Stand 40" w/ Turtle Base & Arm',
        'Solid Floppy Flag 4x4',
        'Artificial Silk 4x4',
        'Single Black Net 4x4',
        'Double Black Net 4x4',
        'Cutter Flag 18x48',
        'Solid Flag 24x36',
        'Single Net Flag 24x36',
        'Double Net Flag 24x36',
        'Silk Flag 24x36',
        'Overhead Butterfly Frame 8x8 w/ Silk',
        'Overhead Butterfly Frame 12x12 w/ Solid',
      ],
    },
    {
      brand: 'Generic / Custom',
      models: ['Custom Lighting Fixture', 'Tungsten Open Face 1K', 'Par64 1kW Chrome Can', 'Beadboard 4x4 Bounce'],
    },
  ],
  camera: [
    {
      brand: 'ARRI',
      models: [
        'Alexa 35 (Super 35 4.6K)',
        'Alexa Mini LF (Large Format 4.5K)',
        'Alexa LF (Large Format 4.5K)',
        'Alexa Mini (Super 35 3.2K)',
        'Amira (Super 35 4K UHD)',
      ],
    },
    {
      brand: 'Sony',
      models: [
        'FX6 Cinema Line (Full Frame 4K)',
        'FX3 Cinema Line (Full Frame 4K)',
        'FX9 (Full Frame 6K Sensor)',
        'VENICE 2 8K (Full Frame)',
        'VENICE 2 6K (Full Frame)',
        'Burano 8K (Full Frame PL/E-mount)',
        'FR7 Cinema PTZ (Full Frame)',
        'a7S III (Full Frame 4K120p)',
      ],
    },
    {
      brand: 'RED Digital Cinema',
      models: [
        'V-Raptor 8K VV (VistaVision)',
        'V-Raptor XL 8K VV',
        'Komodo-X 6K (Super 35 Global Shutter)',
        'Komodo 6K (Super 35 Global Shutter)',
        'Monstro 8K VV',
        'Gemini 5K S35',
        'Helium 8K S35',
      ],
    },
    {
      brand: 'Blackmagic Design',
      models: [
        'URSA Cine 12K (Full Frame RGBW)',
        'URSA Mini Pro 12K (Super 35)',
        'Cinema Camera 6K (Full Frame L-Mount)',
        'Pocket Cinema Camera 6K Pro',
        'Pocket Cinema Camera 6K G2',
        'Pocket Cinema Camera 4K',
        'Micro Studio Camera 4K G2',
      ],
    },
    {
      brand: 'Canon',
      models: [
        'Cinema EOS C500 Mk II (Full Frame 5.9K)',
        'Cinema EOS C300 Mk III (Super 35 DGO 4K)',
        'Cinema EOS C70 (Super 35 RF Mount)',
        'EOS R5 C (Full Frame 8K RAW)',
        'Cinema EOS C200 (Super 35 4K)',
      ],
    },
    {
      brand: 'Panasonic',
      models: [
        'VariCam LT 4K (Super 35 Dual ISO)',
        'Lumix S1H (Full Frame 6K)',
        'Lumix BS1H Box Camera (Full Frame)',
        'Lumix BGH1 Box Camera (MFT)',
        'Lumix GH6 (MFT 5.7K)',
      ],
    },
    {
      brand: 'Cinema Lenses & Optics',
      models: [
        'Cooke S4/i Prime Set (18, 25, 35, 50, 75, 100mm)',
        'ARRI / Zeiss Master Prime Set (T1.3)',
        'Zeiss Supreme Prime Radiance Set',
        'ARRI Signature Prime Set (T1.8 LPL)',
        'Atlas Orion Anamorphic Prime Set (2x)',
        'Angénieux Optimo Zoom 24-290mm T2.8',
        'Canon Cine-Servo 17-120mm T2.95 PL',
        'Fujinon Premista 28-100mm T2.9 Large Format',
        'Sony FE C 16-35mm T3.1 G Cinema Zoom',
        'DZOFilm Vespid Prime Lens Set (PL/EF)',
      ],
    },
    {
      brand: 'Wireless Video & Monitors',
      models: [
        'Teradek Bolt 4K LT 750 Transmitter & Receiver',
        'Teradek Bolt 4K MAX Zero-Delay System',
        'SmallHD Cine 7 7" Touchscreen On-Camera',
        'SmallHD Indie 7 7" Touchscreen',
        'SmallHD 702 Touch 7" Daylight Monitor',
        'SmallHD Cine 13 4K High-Bright Production Monitor',
        'OSee Megamon 15" Production Field Monitor',
        'Hollyland Cosmo C1 SDI Wireless Video System',
      ],
    },
    {
      brand: 'Follow Focus & Matte Boxes',
      models: [
        'Tilta Nucleus-M Wireless Follow Focus Kit',
        'ARRI WCU-4 Wireless Compact Unit',
        'ARRI Hi-5 Wireless Hand Unit System',
        'ARRI LMB 4x5 Lightweight Clamp-on Matte Box',
        'Tilta Mirage 4x5.65 Matte Box w/ VND',
        'Wooden Camera Zip Focus 15mm Rod System',
      ],
    },
  ],
  grip: [
    {
      brand: 'Matthews Studio Equipment',
      models: [
        'C-Stand 40" w/ Turtle Base & Grip Arm',
        'C-Stand 20" Shorty w/ Grip Arm',
        'Combo Stand 3-Riser Steel (Junior 1-1/8")',
        'Beefy Baby Stand 3-Riser Steel (Baby 5/8")',
        'Low Boy Junior Roller Stand (2-Riser)',
        'Solid Floppy Flag 4x4 (Blackout)',
        'Artificial Silk 4x4 Diffuser',
        'Single Black Net Scrim 4x4',
        'Double Black Net Scrim 4x4',
        'Cutter Flag 18x48',
        'Solid Flag 24x36',
        'Full Apple Box Set (Baltic Birch)',
        'Cardellini Clamp 2" End Jaw',
        'Mafer Clamp w/ 5/8" Baby Pin',
        'Duckbill / Quacker Beadboard Clamp',
        'C-Boom Arm Telescopic Clamp',
      ],
    },
    {
      brand: 'Avenger / Manfrotto',
      models: [
        'A2033F C-Stand 40" w/ Grip Arm & Head',
        'B6039CS Chrome Steel Wind-Up Stand 3-Riser',
        'Baby Grid Clamp 1-1/4" Pipe (5/8" Pin)',
        'Junior Pipe Clamp (1-1/8" Receiver)',
        'Autopole 2.1m–3.7m Support System',
        'Super Clamp 035 w/ Standard Stud',
      ],
    },
    {
      brand: 'Dana Dolly',
      models: [
        'Dana Dolly Portable Kit (Universal Track Ends)',
        '6ft Precision Seamless Aluminum Pipe Set',
        '8ft Precision Seamless Aluminum Pipe Set',
        'Dana Dolly 100mm / 75mm Bowl Adapters',
      ],
    },
    {
      brand: 'Kupo',
      models: [
        'Master High C-Stand w/ Turtle Base 40"',
        'Grip Head 2.5" w/ Ergonomic T-Handle',
        'Junior Boom Arm Steel (Supports 66 lbs)',
        'Convi Clamp Heavy Duty w/ Hex Baby Pin',
        'Nesting Apple Box Set 4-Piece',
      ],
    },
    {
      brand: 'Modern Studio Equipment',
      models: [
        'Speed Rail 1-1/4" Schedule 40 Aluminum (10ft)',
        'Speed Rail 1-1/4" Schedule 40 Aluminum (6ft)',
        'Speed Rail External Pipe Joiner Sleeve',
        'Corner Wall Spreader 3-Piece 2x4/Pipe Kit',
        'Menace Arm Rigging Hardware Kit',
        'Car Mount Hostess Tray & Suction Cup Kit',
      ],
    },
    {
      brand: 'Grip Truck Standard',
      models: [
        'Sandbag 20lb Shot Bag Heavy Duty Cordura',
        'Sandbag 35lb Saddle Sandbag',
        'Safety Aircraft Cable (Pack of 5)',
        'Grip Clip #1 / #2 / #3 Spring Clamps (10pk)',
        'C-47 Wooden Clothes Pins (Box of 50)',
        'Ratchet Straps 1" x 15ft Heavy Duty',
      ],
    },
  ],
  audio: [
    {
      brand: 'Sennheiser',
      models: [
        'MKH 416-P48 Short Shotgun Interference Tube Mic',
        'MKH 50-P48 Supercardioid Condenser Mic',
        'MKH 8060 Moisture-Resistant Shotgun Mic',
        'AVX Wireless ME2 Lavalier Digital Set',
        'EW-DP ME2 All-in-One Digital Wireless Set',
        'MKE 600 Camcorder Shotgun Microphone',
      ],
    },
    {
      brand: 'Sound Devices',
      models: [
        'Scorpio 32-Track / 16-Preamp Portable Mixer-Recorder',
        '888 16-Track / 8-Preamp Production Recorder',
        '833 8-Channel / 6-Preamp Field Recorder',
        'MixPre-10 II 10-Channel 32-Bit Float Audio Recorder',
        'MixPre-6 II 6-Channel 32-Bit Float Audio Recorder',
        'CL-16 Linear Fader Mixing Surface',
      ],
    },
    {
      brand: 'Schoeps',
      models: [
        'CMIT 5U Blue Shotgun Microphone',
        'MiniCMIT Compact Shotgun Microphone',
        'Colette Modular Set CMC641 (MK41 Supercardioid)',
        'SuperCMIT 2U Digital Shotgun Mic',
      ],
    },
    {
      brand: 'Røde',
      models: [
        'NTG3 Precision RF-Biased Shotgun Mic',
        'NTG5 Lightweight Moisture-Resistant Shotgun',
        'Wireless PRO Dual-Channel 32-Bit Float Lav Kit',
        'Wireless GO II Dual Compact System',
        'RødeLink Filmmaker Digital Wireless Kit',
      ],
    },
    {
      brand: 'Deity Microphones',
      models: [
        'S-Mic 2 Moisture-Resistant Shotgun Mic',
        'Theos Digital Wireless Dual Transmitter Kit',
        'PR-2 32-Bit Float Stereo Pocket Recorder',
        'Connect 2.4GHz Digital Wireless Dual System',
      ],
    },
    {
      brand: 'Lectrosonics',
      models: [
        'DSQD 4-Channel Half-Rack Digital Receiver',
        'DCR822 Dual-Channel Slot-Mount Digital Receiver',
        'SMWB Wideband Miniature Beltpack Transmitter',
        'HMa Plug-On Wireless Transmitter (Phantom Power)',
      ],
    },
    {
      brand: 'Wisycom',
      models: [
        'MCR54 Quad-Channel True-Diversity Receiver',
        'MTP40S Wideband Miniature Bodypack Transmitter',
        'BSR52 Smart Portable Dual Receiver',
      ],
    },
    {
      brand: 'K-Tek / Rycote / Comms',
      models: [
        'K-Tek Avalon Carbon Fiber Boom Pole 12ft (Internal XLR)',
        'Rycote Modular Windshield WS 4 Complete Kit',
        'Rycote Super-Shield Medium Shotgun Kit',
        'Motorola CP200d UHF 16-Channel Walkie-Talkies (6-Pack)',
        'Hollyland Solidcom C1 Pro Full-Duplex Wireless Intercom (4-Headsets)',
        'Eartec UltraLITE Full Duplex Wireless Headset System',
      ],
    },
  ],
  power_media: [
    {
      brand: 'Anton Bauer',
      models: [
        'Titon 90 V-Mount (98Wh / 14.4V / 10A)',
        'Titon 150 V-Mount (156Wh / 14.4V / 10A)',
        'Titon 240 V-Mount (238Wh High-Draw)',
        'Titon 150 Gold-Mount (156Wh)',
        'Dionic XT90 Gold-Mount 99Wh',
        'Performance Quad V-Mount Fast Charger',
        'Performance Dual Charger',
      ],
    },
    {
      brand: 'Core SWX',
      models: [
        'Hypercore NEO 9 Mini V-Mount (98Wh)',
        'Hypercore NEO 150 Mini V-Mount (147Wh)',
        'Helix Dual Voltage 14.4V/28.8V B-Mount',
        'Fleet Micro 4-Bay Simultaneous Fast Charger',
      ],
    },
    {
      brand: 'FXlion',
      models: [
        'Nano Two Ultra-Compact V-Mount 98Wh (D-Tap/USB-C)',
        'Nano One Pocket V-Mount 50Wh',
        'Nano Three V-Mount 150Wh',
        'BP-M200 Square V-Mount 198Wh High-Power',
        'FX-M4S 4-Channel Quad Simultaneous Charger',
      ],
    },
    {
      brand: 'SanDisk Professional',
      models: [
        'PRO-CINEMA CFexpress Type B Card 512GB (VPG400)',
        'PRO-CINEMA CFexpress Type B Card 1TB',
        'Extreme PRO SDXC UHS-II V90 128GB (300MB/s)',
        'Extreme PRO SDXC UHS-II V90 256GB',
        'PRO-BLADE Transport Modular NVMe SSD 2TB',
        'PRO-BLADE Transport Modular NVMe SSD 4TB',
        'G-DRIVE ArmorATD Rugged All-Terrain Drive 4TB',
      ],
    },
    {
      brand: 'Angelbird',
      models: [
        'AV PRO CFexpress Type B MK2 1TB',
        'AV PRO CFexpress Type B MK2 2TB',
        'Match Pack for ARRI Alexa 35 (2x 2TB)',
        'AV PRO SD MK2 V90 UHS-II 128GB',
        'AV PRO SD MK2 V90 UHS-II 256GB',
        'SSD2GO PKT MK2 Rugged USB-C SSD 2TB',
      ],
    },
    {
      brand: 'Sony Media',
      models: [
        'TOUGH CFexpress Type A 160GB (800MB/s)',
        'TOUGH CFexpress Type A 320GB (800MB/s)',
        'TOUGH CFexpress Type A 640GB (800MB/s)',
        'TOUGH SDXC UHS-II V90 128GB (SF-G128T)',
        'TOUGH SDXC UHS-II V90 256GB (SF-G256T)',
      ],
    },
    {
      brand: 'Samsung',
      models: [
        'T7 Shield Rugged USB-C Portable SSD 2TB',
        'T7 Shield Rugged USB-C Portable SSD 4TB',
        '990 PRO NVMe PCIe 4.0 Internal M.2 SSD 2TB',
      ],
    },
    {
      brand: 'Generators & Inverters',
      models: [
        'Honda EU2200i Inverter Generator 2200W Ultra-Quiet',
        'Honda EU7000iS Inverter Generator 7000W EFI',
        'EcoFlow Delta Pro Portable Power Station (3.6kWh)',
        'Goal Zero Yeti 3000X Lithium Portable Power',
      ],
    },
  ],
  cables: [
    {
      brand: 'Canare / Neutrik (SDI Video)',
      models: [
        '12G-SDI 4K/8K BNC Video Cable 50ft (L-5.5CUHD)',
        '12G-SDI 4K/8K BNC Video Cable 25ft',
        '12G-SDI 4K/8K BNC Video Cable 10ft',
        'Thin 12G-SDI BNC Flexible Jumper Cable 3ft',
        '3G-SDI Heavy Duty BNC Cable 100ft Reel',
      ],
    },
    {
      brand: 'Kondor Blue / Alvin’s Cables',
      models: [
        'Right-Angle 12G-SDI Coiled High-Flex Cable',
        'High-Speed Braided HDMI 2.1 4K120 / 8K60 6ft',
        'Thin Micro-HDMI to Full-HDMI Braided Cable 3ft',
        'D-Tap to 2-Pin LEMO ARRI/RED Power Cable',
        'D-Tap to 4-Pin XLR 12V Regulated Camera Cable',
        '2-Pin LEMO to 2-Pin LEMO Teradek Power Cable',
      ],
    },
    {
      brand: 'Mogami / Canare (Audio XLR)',
      models: [
        'Mogami Gold Studio XLR-M to XLR-F Cable 50ft',
        'Mogami Gold Studio XLR-M to XLR-F Cable 25ft',
        'Mogami Gold Studio XLR-M to XLR-F Cable 10ft',
        'Canare Star Quad XLR Balanced Audio Cable 50ft',
        'Mini-XLR (TA3F) to Standard XLR-M 1.5ft Boom Cable',
      ],
    },
    {
      brand: 'Hubbell / Lex Products (AC Distro)',
      models: [
        'Heavy Duty AC Stinger Extension 12/3 AWG 50ft',
        'Heavy Duty AC Stinger Extension 12/3 AWG 25ft',
        'Heavy Duty AC Stinger Extension 10/3 AWG 100ft',
        'Quad Box 12/3 15A Industrial Distro Stage Box',
        'Neutrik PowerCon TRUE1 TOP Extension Cable 25ft',
        'Bates 60A to 100A Stage Pin Distribution Cable',
      ],
    },
    {
      brand: 'Accu-Cable / ProPlex (DMX Control)',
      models: [
        '5-Pin DMX Shielded Lighting Cable 50ft',
        '5-Pin DMX Shielded Lighting Cable 25ft',
        '5-Pin DMX Shielded Lighting Cable 10ft',
        '5-Pin XLR to 3-Pin XLR DMX Turnaround Adapter',
        'DMX Terminator 120-Ohm 5-Pin Male Plug',
      ],
    },
  ],
  props: [
    {
      brand: 'Production Staged Furnishings',
      models: [
        'Mid-Century Leather Armchair',
        'Executive Conference Table 8ft',
        'Modern Office Desk & Ergonomic Chair',
        'Solid Oak Dining Table & 6 Chairs',
        'Velvet Living Room Sectional Sofa',
        'Vintage Wooden Bookshelf 6ft (Set Dressed)',
      ],
    },
    {
      brand: 'Set Dressing & Practical Art',
      models: [
        'Floor Standing Brass Lamp (Practical Ready)',
        'Area Rug 8x10ft Geometric Contemporary',
        'Framed Clearance-Free Wall Art Pieces (Set of 3)',
        'Indoor Potted Ficus Tree (6ft Silk)',
        'Ceramic Tabletop Vases & Plant Dressing',
      ],
    },
    {
      brand: 'Hero Action Props',
      models: [
        'Cleared Hero Prop Smartphone (Custom Screen)',
        'Vintage Leather Briefcase Satchel',
        'Champagne Flutes & Wine Bottle Set (Cleared)',
        'Restaurant Dinnerware & Cutlery Place Settings',
        'Stunt Rubber Wrench / Prop Tools',
      ],
    },
    {
      brand: 'Picture Vehicles',
      models: [
        'Hero Sedan Production Picture Vehicle',
        'Vintage Coupe 1968 Picture Vehicle',
        'Police Cruiser Stunt Picture Vehicle',
      ],
    },
  ],
  expendables: [
    {
      brand: 'Pro Tapes / Pro Gaff',
      models: [
        'Pro Gaff 2" Premium Matte Black (55 yds)',
        'Pro Gaff 2" Premium Matte White (55 yds)',
        'Pro Gaff 2" Premium Matte Grey (55 yds)',
        'Pro Gaff 1" Spike Tape (Set of 5 Fluorescent Colors)',
        'Pro Artist Tape 1" White Low-Residue Console Paper',
      ],
    },
    {
      brand: 'Filmtools / Production Supplies',
      models: [
        'C-47 Wooden Clothes Pins (Box of 50)',
        'Trick Line / Sash Cord #4 Black Glazed (100ft)',
        'Blackwrap Cinefoil Matte Black Aluminum 24" x 50ft',
        'Bongo Ties Elastic Heavy Duty Cable Wraps (10pk)',
        'Dulling Spray 11oz Aerosol Can (Anti-Glare)',
        'Compressed Air Duster Can 10oz (Dust-Off)',
        'Velcro One-Wrap Cable Straps 8" (Pack of 25)',
      ],
    },
    {
      brand: 'Rosco / LEE Filters (Lighting Gels)',
      models: [
        'Rosco Cinegel Full CTO Orange Sheet 20" x 24"',
        'Rosco Cinegel 1/2 CTO Orange Sheet 20" x 24"',
        'Rosco Cinegel Full CTB Blue Sheet 20" x 24"',
        'LEE 216 Full White Diffusion Sheet 21" x 24"',
        'LEE 250 Half White Diffusion Sheet 21" x 24"',
        'Rosco Cinegel Tough Plusgreen Sheet 20" x 24"',
        'Rosco Cinegel 0.6 Neutral Density Sheet 20" x 24"',
      ],
    },
    {
      brand: 'Pancro / Kimwipes (Lens Cleaning)',
      models: [
        'Pancro Professional Lens Cleaning Fluid 4oz Spray',
        'Kimwipes Delicate Task Optical Wipers (Box of 280)',
        'Microfiber Optical Lens Cleaning Cloths (6-Pack)',
        'Giottos Rocket Air Blower Large',
      ],
    },
    {
      brand: 'Look Solutions / Atmosphere',
      models: [
        'Viper NT Water-Based Fog Fluid 5L Canister',
        'Tiny FX Battery-Operated Miniature Fogger Kit',
        'Atmosphere Aerosol Spray Can 8oz (Haze in a Can)',
        'Reel EFX Diffusion Hazer Fluid 1 Gallon',
      ],
    },
  ],
  other: [
    {
      brand: 'Generic Production',
      models: ['Production First Aid Kit', 'Fire Extinguisher 10lb ABC', 'Director’s Folding Canvas Chair'],
    },
  ],
};

export const getBrandsForCategory = (cat: EquipmentCategory): string[] => {
  const list = DEPARTMENT_BRANDS_CATALOG[cat] || [];
  return list.map((b) => b.brand);
};

export const getModelsForBrand = (cat: EquipmentCategory, brandName: string): string[] => {
  const list = DEPARTMENT_BRANDS_CATALOG[cat] || [];
  const found = list.find((b) => b.brand.toLowerCase() === brandName.toLowerCase());
  if (found) return found.models;

  // If brand is generic or not found, return all models under that category
  return list.flatMap((b) => b.models);
};

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

/** Formats camera rigs into dedicated equipment line items. */
export const formatCameraRigEquipment = (
  rigType: string,
  camLabel: string,
  camId: string
): EquipmentItem | null => {
  const norm = rigType.trim();
  switch (norm) {
    case 'TechnoCrane':
      return {
        id: `auto-rig-technocrane-${camLabel}`,
        elementId: `rig-technocrane-${camLabel}`,
        category: 'grip',
        name: 'TechnoCrane Telescoping Crane System',
        brand: 'SuperTechno / MovieBird',
        model: 'TechnoCrane 30’ Telescopic Crane w/ Remote Flight Head',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Crane Movement`,
        specs: '30ft Max Telescoping Reach · 3-Axis Stabilized Flight Head · Heavy-Duty Track Base',
        isCustom: false,
      };
    case 'Jib / Crane':
      return {
        id: `auto-rig-jib-${camLabel}`,
        elementId: `rig-jib-${camLabel}`,
        category: 'grip',
        name: 'Jib Arm / Crane Boom System',
        brand: 'Jimmy Jib / Stanton',
        model: 'Triangle Jib Arm (18ft–24ft) w/ Pan/Tilt Head',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Jib Movement`,
        specs: 'Remote Pan/Tilt Joystick Head · Heavy-Duty Base & Spreader · 150lb Counterweights',
        isCustom: false,
      };
    case 'Steadicam':
      return {
        id: `auto-rig-steadicam-${camLabel}`,
        elementId: `rig-steadicam-${camLabel}`,
        category: 'grip',
        name: 'Steadicam Camera Stabilizer System',
        brand: 'Tiffen Steadicam',
        model: 'Steadicam M-2 System w/ Fawcett Exovest',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Operator Stabilization`,
        specs: 'G-70x Iso-Elastic Arm · Volt Electronic Horizon Gimbal · High-Bright Monitor Sled',
        isCustom: false,
      };
    case 'Gimbal':
      return {
        id: `auto-rig-gimbal-${camLabel}`,
        elementId: `rig-gimbal-${camLabel}`,
        category: 'grip',
        name: 'Motorized 3-Axis Gimbal Stabilizer',
        brand: 'DJI / Freefly',
        model: 'Ronin 2 Professional 3-Axis Gimbal',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Motorized Stabilization`,
        specs: 'High-Torque Motors · Force Pro Wireless Joystick · Ready Rig GS + ProArm Support',
        isCustom: false,
      };
    case 'Dana Dolly':
      return {
        id: `auto-rig-danadolly-${camLabel}`,
        elementId: `rig-danadolly-${camLabel}`,
        category: 'grip',
        name: 'Dana Dolly Portable Rail System',
        brand: 'Dana Dolly',
        model: 'Universal Track Kit & 6ft Aluminum Rails',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Linear Tracking`,
        specs: '100mm & 75mm Bowl Adapters · Low Boy Junior Stands (Pair) · Track Ends',
        isCustom: false,
      };
    case 'Slider':
      return {
        id: `auto-rig-slider-${camLabel}`,
        elementId: `rig-slider-${camLabel}`,
        category: 'grip',
        name: 'Precision Cinema Camera Slider',
        brand: 'MYT Works / Kessler',
        model: 'Kessler Shuttle Dolly / MYT Works 5ft Slider',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Push / Slide Movement`,
        specs: 'Fluid Dampened High-Payload Rail · Mitchell / 100mm Mount · End Stop Bumpers',
        isCustom: false,
      };
    case 'Drone':
      return {
        id: `auto-rig-drone-${camLabel}`,
        elementId: `rig-drone-${camLabel}`,
        category: 'camera',
        name: 'Aerial Cinema Drone Quadcopter System',
        brand: 'DJI',
        model: 'Inspire 3 8K Full-Frame Cinema Drone',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Aerial Unit`,
        specs: 'Zenmuse X9-8K Air Gimbal · RTK Centimeter Positioning · Dual RC Plus Controls',
        isCustom: false,
      };
    case 'Car Mount':
      return {
        id: `auto-rig-carmount-${camLabel}`,
        elementId: `rig-carmount-${camLabel}`,
        category: 'grip',
        name: 'Car Mount Hostess Tray & Suction Rig',
        brand: 'Matthews Studio Equipment',
        model: 'Master Hostess Tray & Multi-Suction Rigging Kit',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Vehicle Mount`,
        specs: '6" Vacuum Suction Cups · Micro-Grip Rigging Rods · Heavy Duty Ratchet Safety Straps',
        isCustom: false,
      };
    case 'Cable Cam':
      return {
        id: `auto-rig-cablecam-${camLabel}`,
        elementId: `rig-cablecam-${camLabel}`,
        category: 'grip',
        name: 'Motorized Cable Cam Aerial Rig',
        brand: 'RigWheels / Defy',
        model: 'Point-to-Point Motorized Aerial Cable Cam',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Overhead Fly Line`,
        specs: '200m High-Tensile Kevlar Line · Dual Drive Electric Sled · Wireless Video Link',
        isCustom: false,
      };
    case 'Tripod':
      return {
        id: `auto-rig-tripod-${camLabel}`,
        elementId: `rig-tripod-${camLabel}`,
        category: 'grip',
        name: 'Professional Cinema Fluid Head & Tripod',
        brand: 'Sachtler / O’Connor',
        model: 'O’Connor 2575D / Sachtler Cine 30 Fluid Head',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Support Sticks`,
        specs: '150mm Bowl / Mitchell Mount · Carbon Fiber 2-Stage Legs · Ground Spreader',
        isCustom: false,
      };
    case 'Handheld':
      return {
        id: `auto-rig-handheld-${camLabel}`,
        elementId: `rig-handheld-${camLabel}`,
        category: 'grip',
        name: 'Ergonomic Handheld Shoulder Rig & Easyrig',
        brand: 'Easyrig / Wooden Camera',
        model: 'Easyrig Vario 5 w/ Flowcine Serene Arm',
        quantity: 1,
        roleOrFunction: `Camera ${camLabel} Handheld Body Support`,
        specs: 'Adjustable 11–38 lbs Tension · Dual Handgrips · Quick-Release Camera Hook',
        isCustom: false,
      };
    default:
      return null;
  }
};

/** Formats prop types into appropriate department items. */
const formatPropEquipment = (prop: PropElement): { category: EquipmentCategory; name: string; brand?: string; model?: string; specs?: string } => {
  switch (prop.propType) {
    case 'c_stand':
      return { category: 'grip', name: 'C-Stand with Grip Arm & Head', brand: 'Matthews Studio Equipment', model: '40" Century Stand w/ Turtle Base', specs: '10.5ft Max Height · 2.5" Grip Head · 40" Arm' };
    case 'tripod':
      return { category: 'grip', name: 'Heavy Duty Video Tripod & Head', brand: 'Sachtler / Manfrotto', model: 'Fluid Head System 100mm Bowl', specs: 'Carbon Fiber Legs · Floor Spreader' };
    case 'apple_box':
      return { category: 'grip', name: 'Nesting Apple Box Set', brand: 'Kupo / Matthews', model: 'Full, Half, Quarter, Pancake (4-Piece)', specs: '9-Ply Baltic Birch Staged Set' };
    case 'camera_cart':
      return { category: 'grip', name: 'Senior Camera Production Magliner Cart', brand: 'Inovativ / YaegerPro', model: 'Voyager 36/42 EVO Production Cart', specs: 'Locking Casters & Dual Mast Mounts' };
    case 'sound_boom':
      return { category: 'audio', name: 'Boom Pole with Shotgun Microphone', brand: 'Sennheiser / K-Tek', model: 'MKH 416 + Carbon Fiber Boom 12ft', specs: 'Supercardioid RF Condenser · Rycote Softie Shockmount' };
    case 'director_chair':
      return { category: 'props', name: "Director's Folding Stage Chair", brand: 'Filmtools', model: 'Tall Hardwood Director Chair 30"', specs: 'Heavy Duty Canvas Seat & Back' };
    case 'green_screen':
      return { category: 'grip', name: 'Chroma Green Screen Backdrop System', brand: 'Westcott / Matthews', model: '12x12 Chroma Key Green Seamless', specs: 'Wrinkle-Resistant · Butterfly Frame Mounting' };
    case 'car':
      return { category: 'props', name: `Picture Vehicle (${prop.label || '4-Door Sedan'})`, brand: 'Production Fleet', model: prop.label || 'Hero Sedan Car', specs: 'Staged Action Vehicle' };
    case 'vehicle_suv':
      return { category: 'props', name: `Picture Vehicle (${prop.label || 'SUV / 4x4'})`, brand: 'Production Fleet', model: prop.label || 'Hero SUV 4x4', specs: 'Staged Action Vehicle' };
    case 'vehicle_truck':
      return { category: 'grip', name: 'Production Grip / Lighting Truck', brand: 'Ford / Freightliner', model: prop.label || '5-Ton Production Package Truck', specs: 'Liftgate · Rolling Cart Bay Distro' };
    case 'vehicle_police':
      return { category: 'props', name: `Picture Vehicle (${prop.label || 'Police Cruiser'})`, brand: 'Production Fleet', model: prop.label || 'Emergency Police Cruiser', specs: 'Working Strobe Beacons · Siren Stunt Vehicle' };
    case 'gun':
      return { category: 'props', name: 'Hero Prop Handgun (Non-Firing Replica)', brand: 'Prop Armory', model: prop.label || 'Semi-Automatic 9mm Replica', specs: 'Armorer Cleared Prop Firearm' };
    case 'rifle':
      return { category: 'props', name: 'Tactical Prop Rifle / Shotgun (Replica)', brand: 'Prop Armory', model: prop.label || 'Tactical Assault Rifle Replica', specs: 'Armorer Cleared Prop Weapon' };
    case 'bomb':
      return { category: 'props', name: 'Hero Stunt Explosive Device Prop', brand: 'Special Effects / Art Dept', model: prop.label || 'Time Bomb / C4 Detonator Prop', specs: 'Illuminated LED Counter Display' };
    case 'letter':
      return { category: 'props', name: 'Hero Sealed Envelope / Document', brand: 'Art Department', model: prop.label || 'Sealed Official Letter Hand Prop', specs: 'Custom Staged Graphics' };
    case 'sofa':
    case 'sofa_sectional':
      return { category: 'props', name: prop.label || 'Living Room Staged Sofa', brand: 'Set Dressing', model: prop.label || '3-Seat Upholstered Sofa', specs: `${Math.round(prop.width)}×${Math.round(prop.height)}cm footprint` };
    case 'armchair':
      return { category: 'props', name: prop.label || 'Staged Armchair / Recliner', brand: 'Set Dressing', model: prop.label || 'Leather Accent Armchair', specs: `${Math.round(prop.width)}×${Math.round(prop.height)}cm` };
    case 'table_coffee':
    case 'table_rect':
    case 'table_round':
    case 'desk':
    case 'dining_set':
      return { category: 'props', name: prop.label || 'Staged Table / Desk Furnishing', brand: 'Set Dressing', model: prop.label || 'Production Table Furnishing', specs: `${Math.round(prop.width)}×${Math.round(prop.height)}cm` };
    default:
      return {
        category: 'props',
        name: prop.label || prop.propType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        brand: 'Set Dressing',
        model: prop.label || prop.propType.replace(/_/g, ' '),
        specs: `${Math.round(prop.width)}×${Math.round(prop.height)}cm footprint`,
      };
  }
};

export const getDefaultCameraPackageItems = (letter: string): EquipmentPackageItem[] => [
  {
    id: `pkg-${letter}-batt`,
    category: 'power_media',
    name: 'V-Mount Batteries (4-Pack) & Quad Fast Charger',
    brand: 'Anton Bauer / Core SWX',
    model: 'Titon 150 V-Mount (156Wh) & Quad Charger',
    quantity: 4,
    roleOrFunction: `Camera ${letter} Power`,
    specs: '14.4V High-Draw · D-Tap / USB Outputs · 4-Bay Simultaneous Charger',
  },
  {
    id: `pkg-${letter}-media`,
    category: 'power_media',
    name: 'Cinema Media Cards (4-Pack) & High-Speed Reader',
    brand: 'SanDisk Pro / Angelbird',
    model: 'CFexpress Type B 512GB (VPG400) / SD V90',
    quantity: 4,
    roleOrFunction: `Camera ${letter} Recording Media`,
    specs: '1700 MB/s Read · 1500 MB/s Write · USB-C 20Gbps Reader',
  },
  {
    id: `pkg-${letter}-mon`,
    category: 'camera',
    name: '7" On-Camera High-Bright Daylight Monitor',
    brand: 'SmallHD',
    model: 'Cine 7 / 702 Touch 7" Monitor',
    quantity: 1,
    roleOrFunction: `Camera ${letter} Focus / Operator Monitor`,
    specs: '1800 nits Daylight Viewable · 12G-SDI & HDMI · PageOS 5 Focus Peaking',
  },
  {
    id: `pkg-${letter}-tx`,
    category: 'camera',
    name: 'Zero-Delay Wireless Video Transmitter',
    brand: 'Teradek',
    model: 'Bolt 4K LT 750 Transmitter',
    quantity: 1,
    roleOrFunction: `Camera ${letter} Director / Video Village Feed`,
    specs: '750ft Range · Zero-Delay 4K HDR · 12G-SDI & HDMI Loopout',
  },
  {
    id: `pkg-${letter}-focus`,
    category: 'camera',
    name: 'Wireless Lens Follow Focus & Motor Kit',
    brand: 'Tilta / ARRI',
    model: 'Nucleus-M Wireless Follow Focus System',
    quantity: 1,
    roleOrFunction: `1st AC Focus Pulling`,
    specs: 'Hand Unit FIZ Controller · High-Torque Lens Motors · Dual Handgrips',
  },
  {
    id: `pkg-${letter}-mattebox`,
    category: 'camera',
    name: 'Lightweight Clamp-On Matte Box & VND Filter',
    brand: 'Tilta / ARRI',
    model: 'Mirage 4x5.65 Matte Box w/ VND Kit',
    quantity: 1,
    roleOrFunction: `Light Flare Control & Variable ND`,
    specs: '4x5.65" Filter Trays · 95mm Clamp Adapter · Carbon Fiber Top Flag',
  },
];

export const CAMERA_PACKAGE_PRESETS: {
  name: string;
  category: EquipmentCategory;
  brand: string;
  model: string;
  quantity: number;
  roleOrFunction: string;
  specs: string;
}[] = [
  {
    name: 'V-Mount Batteries (4-Pack) & Charger',
    category: 'power_media',
    brand: 'Anton Bauer',
    model: 'Titon 150 V-Mount (156Wh)',
    quantity: 4,
    roleOrFunction: 'Camera Power',
    specs: '14.4V High-Draw Lithium-Ion · Quad Simultaneous Fast Charger',
  },
  {
    name: 'Gold-Mount Batteries (4-Pack) & Charger',
    category: 'power_media',
    brand: 'Core SWX',
    model: 'Hypercore NEO 150 Mini Gold-Mount',
    quantity: 4,
    roleOrFunction: 'Camera Power',
    specs: '147Wh High-Current · LCD Runtime Display · Fleet Micro Quad Charger',
  },
  {
    name: 'CFexpress Type B Media Cards (4-Pack)',
    category: 'power_media',
    brand: 'SanDisk Professional',
    model: 'PRO-CINEMA CFexpress Type B 512GB (VPG400)',
    quantity: 4,
    roleOrFunction: 'Recording Media',
    specs: '1700MB/s Read · 1500MB/s Write · Includes USB-C 20Gbps Reader',
  },
  {
    name: 'CFexpress Type A Media Cards (4-Pack)',
    category: 'power_media',
    brand: 'Sony Media',
    model: 'TOUGH CFexpress Type A 320GB (800MB/s)',
    quantity: 4,
    roleOrFunction: 'Recording Media (Sony FX6/FX3)',
    specs: 'Rigid Dust/Waterproof Body · MRW-G2 Dual Card Reader',
  },
  {
    name: '7" On-Camera Daylight Focus Monitor',
    category: 'camera',
    brand: 'SmallHD',
    model: 'Cine 7 Touchscreen Monitor (1800 nits)',
    quantity: 1,
    roleOrFunction: 'Focus / Operator Monitoring',
    specs: '100% DCI-P3 · 12G-SDI / HDMI · PageOS 5 Peaking',
  },
  {
    name: 'Wireless Video Transmitter (Zero Delay)',
    category: 'camera',
    brand: 'Teradek',
    model: 'Bolt 4K LT 750 Transmitter',
    quantity: 1,
    roleOrFunction: 'Video Village Feed',
    specs: '750ft Line-of-Sight · 4K HDR Zero-Delay · 12G-SDI & HDMI',
  },
  {
    name: 'Wireless Follow Focus 3-Channel System',
    category: 'camera',
    brand: 'Tilta',
    model: 'Nucleus-M Wireless FIZ System',
    quantity: 1,
    roleOrFunction: '1st AC Focus / Iris / Zoom',
    specs: 'Hand Unit · 2x High-Torque Motors · 2x Handgrips · 1000ft Range',
  },
  {
    name: '4x5.65 Clamp-on Matte Box & VND',
    category: 'camera',
    brand: 'Tilta',
    model: 'Mirage 4x5.65 Matte Box w/ VND Kit',
    quantity: 1,
    roleOrFunction: 'Lens Filtering & Glare Protection',
    specs: '95mm Outer Diameter · 0.3-2.7 Variable ND · Carbon Fiber Top Flag',
  },
  {
    name: 'Camera Cage Rig & Shoulder Pad',
    category: 'camera',
    brand: 'Wooden Camera / Tilta',
    model: 'Full Camera Cage & 15mm Baseplate System',
    quantity: 1,
    roleOrFunction: 'Camera Rigging & Handheld Support',
    specs: 'ARRI Standard Dovetail · 15mm Rods 12" · Top Handle & NATO Rails',
  },
  {
    name: 'Wireless Timecode Sync Box (2-Pack)',
    category: 'audio',
    brand: 'Tentacle Sync',
    model: 'Sync E MKII Dual Set w/ Bluetooth',
    quantity: 2,
    roleOrFunction: 'Multi-Camera / Audio TC Sync',
    specs: 'Frame-Accurate SMPTE Timecode · Locking 3.5mm / BNC Adapters',
  },
];

/**
 * Derives all equipment for a single scene setup.
 * Auto-aggregates gear from cameras, lights, props, and tracks,
 * then merges with any user overrides/custom additions in `setup.customEquipment`.
 */
export const deriveSceneEquipment = (setup: SceneSetup): EquipmentItem[] => {
  const autoItems: EquipmentItem[] = [];
  const elements = setup.elements || [];

  // 1. Group cameras by unique camera letter (A, B, C...) so Camera A is only ONE package
  const cameras = elements.filter((e) => e.type === 'camera') as CameraElement[];
  const cameraByLetter = new Map<string, CameraElement[]>();

  cameras.forEach((cam) => {
    const letter = (cam.cameraLabel || 'A').toUpperCase().trim();
    const existing = cameraByLetter.get(letter) || [];
    existing.push(cam);
    cameraByLetter.set(letter, existing);
  });

  cameraByLetter.forEach((camsInLetter, letter) => {
    const primaryCam = camsInLetter[0];
    const cameraModel = camsInLetter.find((c) => !!c.cameraModel)?.cameraModel || primaryCam.cameraModel;
    
    // Collect all focal lengths used by this camera letter in the scene
    const focalLengths = Array.from(new Set(camsInLetter.map((c) => c.focalLength || 35))).sort((a, b) => a - b);
    const rigs = Array.from(new Set(camsInLetter.map((c) => (c.rigType || 'Tripod'))));
    const sensor = camsInLetter.find((c) => !!c.sensorFormat)?.sensorFormat || primaryCam.sensorFormat || 'FullFrame';

    const brand = cameraModel ? cameraModel.split(' ')[0] : 'Sony / ARRI';
    const model = cameraModel || `Cinema Camera (Cam ${letter})`;
    const lensStr = focalLengths.length === 1 ? `Prime Lens ${focalLengths[0]}mm` : `Lenses: ${focalLengths.map((f) => `${f}mm`).join(', ')}`;
    const rigStr = `Rig: ${rigs.map((r) => r.toUpperCase()).join(' / ')}`;

    // 1A. Primary Camera Package (Expandable Kit with Batteries, Media, Monitor, Wireless TX, Follow Focus)
    autoItems.push({
      id: `auto-cam-letter-${letter}`,
      elementId: `cam-letter-${letter}`,
      category: 'camera',
      name: `Camera ${letter} Package`,
      brand,
      model,
      quantity: 1, // Exactly 1 physical camera package per camera letter
      roleOrFunction: `Camera ${letter} Main`,
      specs: `${lensStr} · ${rigStr} · Sensor: ${sensor}`,
      isCustom: false,
      isPackage: true,
      packageItems: getDefaultCameraPackageItems(letter),
    });

    // 1B. Camera Rig Systems
    rigs.forEach((rigType) => {
      const rigItem = formatCameraRigEquipment(rigType, letter, primaryCam.id);
      if (rigItem) {
        autoItems.push(rigItem);
      }
    });
  });

  // 2. Process non-camera elements (lights, props, tracks)
  elements.forEach((elem: FloorPlanElement) => {
    if (elem.type === 'light') {
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
