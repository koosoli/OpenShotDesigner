import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { getSymbolById, searchSymbols } from '../../domain/assets';
import type { PlanSymbolDefinition } from '../../domain/assets';
import { CameraRigType, CableType, FloorPlanElement, LightFixtureType, PropType, ShapeType } from '../../types';
import { CABLE_TYPES, CAMERA_RIGS, LIGHT_FIXTURES, PROP_CATALOG } from '../../constants/presets';
import { FresnelLightIcon, MovieCameraIcon } from '../icons/ProductionIcons';
import {
  BrickWall,
  Cable,
  Circle,
  Clapperboard,
  DoorClosed,
  Flag,
  Layers,
  MoveHorizontal,
  MoveUpRight,
  Ruler,
  Search,
  Armchair,
  Sparkles,
  TreePine,
  Truck,
  Type,
  User,
  Video,
  X,
  Zap,
  Mic2,
} from 'lucide-react';

const ArchitecturalWindowIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4 text-sky-500' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="3" x2="12" y2="21" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="2" y1="21" x2="22" y2="21" strokeWidth="2.5" />
  </svg>
);

const SHAPE_ASSETS: { value: ShapeType; label: string; keywords: string }[] = [
  { value: 'rectangle', label: 'Rectangle Zone', keywords: 'square box block rect zone area stage boundary' },
  { value: 'circle', label: 'Circle Zone', keywords: 'round dot pool zone area arena ring' },
  { value: 'ellipse', label: 'Ellipse Zone', keywords: 'oval round zone curved area pool' },
  { value: 'triangle', label: 'Triangle Marker', keywords: 'wedge cone marker danger point arrow' },
  { value: 'diamond', label: 'Diamond Marker', keywords: 'rhombus marker point target focus' },
  { value: 'pentagon', label: 'Pentagon Zone', keywords: 'polygon five sided geometric area' },
  { value: 'hexagon', label: 'Hexagon Zone', keywords: 'polygon six sided honeycomb area' },
  { value: 'star', label: 'Star Callout', keywords: 'marker highlight favorite hero callout focus' },
];

const PROP_KEYWORDS: Record<PropType, string> = {
  sofa: 'sofa couch 3-seat living room seating lounge furniture settee divan sofa couch sitting',
  sofa_sectional: 'sectional couch l-sectional l-shape sofa corner sofa corner couch living seating large sofa',
  armchair: 'armchair recliner easy chair club chair single seat lounge chair armchair chair sitting',
  table_coffee: 'coffee table living room table low table cocktail table tea table wood table',
  tv: 'tv television media stand monitor screen flat screen entertainment center oled display video television',
  bookshelf: 'bookshelf bookcase shelving unit storage shelf library book rack shelf furniture',
  plant: 'plant potted plant houseplant indoor plant green foliage flowerpot shrub bush botany flora',
  dining_set: 'dining set dining table chairs dinner table dining room banquet table kitchen table eating set',
  table_rect: 'rectangular table dining table office table conference table boardroom table banquet table desk table rect',
  table_round: 'round table circular table round dining table four chairs 4 chairs dining set poker table discussion table circular table round desk',
  chair: 'chair dining chair side chair office chair seat seating stool desk chair dining chair',
  desk: 'desk office desk executive desk workstation computer desk writing desk table study work table',
  bar_counter: 'bar counter pub counter kitchen island reception desk high counter cash desk restaurant bar',
  bar_stool: 'bar stool high stool counter stool pub stool high chair bar chair',
  bed_king: 'king bed king size bed master bed mattress bedroom furniture double bed king size luxury bed',
  bed: 'bed queen bed double bed twin bed single bed bedroom mattress sleep bedstead bed frame',
  nightstand: 'nightstand bedside table end table night table small table bedroom night lamp table',
  wardrobe: 'wardrobe closet armoire cabinet cupboard clothes storage dressing locker wardrobe furniture',
  sound_boom: 'sound boom operator sound boom boom op boom pole boom mic sound recordist audio technician sound engineer sound guy audio operator microphone sound record boom microphone',
  c_stand: 'c-stand cstand c stand 40 grip arm gobo head turtle base grip stand lighting stand flag stand century stand rocky mountain leg baby pin grip equipment cstand c stand',
  tripod: 'tripod generic tripod heavy duty tripod camera tripod stand lighting tripod three legged stand baby pin spreader 5/8 pin stand tripod stand heavy tripod',
  director_chair: "director chair director's chair folding chair canvas chair set chair seating filmmaker chair cinema chair",
  apple_box: 'apple box applebox full apple half apple quarter apple pancake wooden box grip box studio box riser posing box wooden block',
  camera_cart: 'camera cart magliner cart magliner equipment cart grip cart sound cart production trolley rolling cart ditty bag cart cart magliner',
  green_screen: 'green screen greenscreen chroma key chroma green backdrop background seamless cyc wall studio backdrop blue screen roll background roll',
  car: 'car sedan passenger car automobile vehicle auto 4-door vehicle sedan motorcar cab taxi vehicle car auto',
  vehicle_suv: 'suv 4x4 offroad jeep truck vehicle sport utility vehicle crossover all-wheel drive 4wd suv car',
  vehicle_truck: 'truck grip truck production truck equipment van box truck cargo truck lorry transport vehicle cube truck vehicle truck',
  vehicle_police: 'police police car police cruiser cop car siren patrol car emergency vehicle law enforcement squad car pursuit vehicle cop car',
  gun: 'gun handgun pistol firearm glock revolver beretta weapon sidearm 9mm firearm semi-automatic shooting piece prop gun pistol weapon',
  rifle: 'rifle tactical rifle assault rifle shotgun ak47 ar15 sniper long gun firearm weapon carbine pump action automatic rifle weapon',
  bomb: 'bomb c4 explosive dynamite time bomb timer bomb device detonator ordnance explosive blast charge prop bomb explosive',
  letter: 'letter envelope mail document message note paper sealed letter dispatch brief paper folded paper secret letter',
  tree: 'tree scenic tree foliage plant outdoor nature landscape oak pine bush forest wood park canopy trunk branches leaves scenic landscape greenery landscape tree plant tree',
  stairs: 'stairs staircase steps flight of stairs spiral stairs steps architectural stairs floor transition staircase flight steps step staircase',
  box: 'box block cube generic box crate riser wooden box geometric box prop cube box',
  circle: 'circle pillar column round block generic cylinder marker pole round pillar circular base column pillar',
  stage: 'stage concert stage platform stage deck stage floor performance stage live stage concert stage main stage apron proscenium band stage gig stage tour stage festival stage',
  stage_riser: 'stage riser riser platform deck riser stage riser riser platform drum riser podium platform deck staging riser',
  stage_runway: 'runway catwalk stage runway extension catwalk extension thrust stage ramp walkway pier catwalk',
  stage_truss: 'truss truss tower lighting truss tower truss system rigging truss roof truss stage truss lighting rig truss tower',
  drum_kit: 'drum kit drums drum riser drum set drum riser drums drum riser kit percussion drum set drum kit drums',
  keyboard_rig: 'keyboard rig keyboard keyboard stand synth synth station keyboard stand keys rig keyboard keyboard rig',
  amp_stack: 'amp stack guitar amp amplifier stack amp wall marshall amplifier stack guitar amp stack amp cabinet',
  speaker_stack: 'speaker stack pa stack pa speaker speaker cabinet speaker stack pa cabinet sound system speaker stack pa',
  speaker_array: 'line array speaker array line array hang pa line array speaker system line array audio hang speaker line array',
  sub_stack: 'subwoofer sub stack subwoofer stack subwoofers bass bins sub subs subwoofer stack sub bass system',
  monitor_wedge: 'monitor wedge floor monitor wedge stage monitor foldback wedge monitor speaker floor wedge stage wedge',
  foh_console: 'foh front of house mixing console mixer desk sound mixer foh position mixing console soundboard foh mixing desk front of house mixing board audio mixing console',
  monitor_console: 'monitor console monitor mix position monitor desk stage monitor mixer monitor world monitor mixing position monitor console',
  mic_stand: 'mic stand microphone stand boom mic stand vocal mic stand microphone boom stand mic stand microphone',
  barricade: 'barricade crowd barrier barricade barrier fence security barrier crowd control barrier stage barricade metal barrier',
  video_wall: 'video wall led wall led screen video screen giant screen led video wall concert screen backdrop screen imax screen video wall',
  broadcast_truck: 'broadcast truck production truck ob van outside broadcast truck broadcast truck mobile unit production truck truck broadcast',
  broadcast_van: 'eng van news van broadcast van news truck eng vehicle news vehicle satellite van broadcast van eng unit',
  sat_truck: 'satellite truck satellite uplink truck uplink truck satellite uplink sat truck uplink vehicle broadcast truck satellite',
};

const LIGHT_KEYWORDS: Partial<Record<LightFixtureType, string>> = {
  softbox: 'softbox soft box dome octa rectangular softbox chimera aputure light dome diffuser soft light key light fill light soft lighting lantern softbox',
  tube_light: 'light tube tube light astera titan helios hyperion quasar science pixel tube pavotube led tube wand tube stick light linear rgb light tube tube',
  led_panel: 'led panel 1x1 2x1 skypanel arri aputure nova litepanels gemini astra mat flat panel flood light soft panel broad light panel light',
  fresnel: 'fresnel arri tungsten focusable lens spotlight hard light key light junior baby fresnel 650w 1k 2k 5k mole richardson fresnel light',
  spotlight: 'spotlight source four etc ellipsoidal profile spot framing shutters gobo projector follow spot sharp beam spotlight leko',
  par_can: 'par can sealed beam par64 par56 par38 rock and roll wash stage light high intensity narrow spot flood par can par',
  hmi: 'hmi daylight joker m18 m40 m90 5600k arc lamp continuous high power outdoor sun simulation hmi',
  china_ball: 'china ball paper lantern jem ball spring ball omnidirectional soft light ambient top light overhead hanging lantern china ball',
  practical: 'practical lamp table lamp floor lamp desk lamp desk light sconce chandelier bulb naked bulb domestic light fixture practical light',
  reflector: 'bounce beadboard foam core poly board reflector pop up reflector fill card white board silver bounce unbleached muslin ultra bounce reflector bounce',
  c_stand_flag: 'c-stand flag cstand flag solid flag 40 inch arm grip head flag stand blackout floppy cutter negative fill duvetyne c stand flag cstand flag',
  flag_solid: 'flag solid solid flag floppy blackout black flag negative fill duvetyne light block cutter 24x36 48x48 solid flag',
  flag_silk: 'flag silk silk diffusion white silk 1/4 silk full silk scrim butterfly overhead soft light diffusion silk flag',
  flag_net: 'flag net single net double net scrim black net light reduction 1 stop 1/2 stop dimming net net flag',
  flag_cutter: 'flag cutter cutter french flag fingers dots long narrow flag hard shadow edge control cutter cutter flag',
  flag_cucoloris: 'cucoloris cookie cuke kook dappled shadow breakup pattern plywood cookie celo cucalorus dapple break up light cucoloris cookie',
  flag_branchaloris: 'branchaloris branch branchalorus tree branch dappled foliage leaf pattern branch on c stand nature breakup branchaloris',
  flag_shutter: 'shutter barn doors barndoors framing shutter leaves blades cut spill flag off leko shutters barndoor shutter',
};

const RIG_KEYWORDS: Partial<Record<CameraRigType, string>> = {
  Tripod: 'tripod static camera stationary sticks head fluid head lock off tripod camera',
  Steadicam: 'steadicam stabilizer vest arm sled dynamic moving tracking shot vest rig trinity steadicam',
  'Dana Dolly': 'dolly dolly track dolly rail wheeled dolly fisher chapman doorway dolly track shot tracking dolly',
  'Jib / Crane': 'crane jib camera crane techno crane jib arm boom high angle swooping shot jib move crane jib',
  TechnoCrane: 'technocrane telescoping crane remote head crane technocrane',
  Handheld: 'handheld shoulder rig handheld camera shaky organic documentary style easyrig handheld',
  Gimbal: 'gimbal motorized gimbal ronin dji rs3 rs4 mōvi 3-axis stabilizer active tracking gimbal',
  Slider: 'slider camera slider linear slider motorized slider smooth slide push in reveal slider',
  Drone: 'drone aerial uav drone shot quadcopter fpv aerial camera top down bird eye drone aerial',
  'Car Mount': 'car mount vehicle camera suction mount hood rig car mount',
  'Cable Cam': 'cable cam wire rig skycam zip line camera cable cam',
  'Broadcast Pedestal': 'broadcast pedestal studio pedestal vinten pedestal studio camera pedestal ob pedestal studio base camera pedestal',
};

interface QuickAsset {
  id: string;
  label: string;
  categoryTag: 'all' | 'props' | 'grip' | 'vehicles' | 'lighting' | 'cameras' | 'shapes' | 'elements' | 'cables';
  keywords: string;
  group: string;
  dimensions?: string;
  icon: React.ReactNode;
  buildPartial: () => Partial<FloorPlanElement> & { type: FloorPlanElement['type'] };
}

const ACTOR_ICON = <User className="w-4 h-4 text-emerald-500" />;
const CAMERA_ICON = <MovieCameraIcon className="w-4 h-4 text-sky-500" />;
const LIGHT_ICON = <FresnelLightIcon className="w-4 h-4 text-amber-500" />;
const FLAG_ICON = <Flag className="w-4 h-4 text-slate-400" />;

const SHARED_SYMBOL_BY_PROP_TYPE: Partial<Record<PropType, string>> = {
  stage: 'staging.main-stage',
  stage_riser: 'staging.stage-deck',
  stage_runway: 'staging.runway',
  stage_truss: 'staging.truss-tower',
  broadcast_truck: 'broadcast.ob-van',
  broadcast_van: 'broadcast.eng-van',
  sat_truck: 'broadcast.satellite-truck',
};

const SYMBOL_SHAPE_COLOR = '#94a3b8';
const SYMBOL_SHAPE_STROKE = '#64748b';

function buildAssetList(): QuickAsset[] {
  const assets: QuickAsset[] = [];

  // 1. Props & Furniture Catalog
  PROP_CATALOG.forEach((p) => {
    const sharedSymbolId = SHARED_SYMBOL_BY_PROP_TYPE[p.type];
    const sharedSymbol = sharedSymbolId ? getSymbolById(sharedSymbolId) : undefined;
    const specificKw = PROP_KEYWORDS[p.type] || '';
    let categoryTag: QuickAsset['categoryTag'] = 'props';
    if (p.category === 'Studio & Stage' || p.category === 'Concert & Stage') categoryTag = 'grip';
    else if (p.category === 'Vehicles' || p.category === 'Weapons & Explosives' || p.category === 'Broadcast & Production') categoryTag = 'vehicles';
    else if (p.category === 'Architecture' || p.category === 'Generic') categoryTag = 'shapes';

    let groupName = 'Furniture & Props';
    if (p.category === 'Studio & Stage') groupName = 'Studio & Grip Equipment';
    else if (p.category === 'Concert & Stage') groupName = 'Concert & Live Event';
    else if (p.category === 'Broadcast & Production') groupName = 'Broadcast & Production';
    else if (p.category === 'Vehicles') groupName = 'Vehicles & Transport';
    else if (p.category === 'Weapons & Explosives') groupName = 'Weapons & Explosives';
    else if (p.category === 'Documents & Hand Props') groupName = 'Documents & Hand Props';
    else if (p.category === 'Architecture') groupName = 'Architecture & Landscape';
    else if (p.category === 'Generic') groupName = 'Generic Props';

    assets.push({
      id: `prop-${p.type}`,
      label: p.name,
      categoryTag,
      keywords: `${p.name} ${p.category} ${p.type} prop ${specificKw}`,
      group: groupName,
      dimensions: `${p.defaultWidth}×${p.defaultHeight}cm`,
      icon: sharedSymbol ? (
        <svg className="w-5 h-5 text-sky-500" viewBox="0 0 100 100" aria-hidden="true">
          <g dangerouslySetInnerHTML={{ __html: sharedSymbol.svg }} />
        </svg>
      ) : p.type === 'tree' ? <TreePine className="w-4 h-4 text-emerald-500" /> :
        p.category === 'Broadcast & Production' ? <Truck className="w-4 h-4 text-sky-500" /> :
        p.category === 'Concert & Stage' ? <Mic2 className="w-4 h-4 text-purple-500" /> :
        <Armchair className="w-4 h-4 text-purple-500" />,
      buildPartial: sharedSymbol
        ? () => ({
            type: 'shape',
            shapeType: 'rectangle',
            symbolId: sharedSymbol.id,
            name: sharedSymbol.name,
            width: sharedSymbol.defaultWidth,
            height: sharedSymbol.defaultHeight,
            label: sharedSymbol.name,
            color: SYMBOL_SHAPE_COLOR,
            filled: false,
            strokeColor: SYMBOL_SHAPE_STROKE,
            strokeWidth: 2,
          } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] })
        : () => ({ type: 'prop', propType: p.type } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }),
    });
  });

  // 2. Light Fixtures & Light Control Flags
  LIGHT_FIXTURES.forEach((f) => {
    const specificKw = LIGHT_KEYWORDS[f.type] || '';
    assets.push({
      id: `light-${f.type}`,
      label: f.name,
      categoryTag: 'lighting',
      keywords: `${f.name} ${f.type} light lighting lamp fixture ${specificKw}`,
      group: f.isFlag ? 'Light Control & Flags' : 'Light Fixtures',
      dimensions: f.defaultBeam ? `${f.defaultBeam}° beam` : undefined,
      icon: f.isFlag ? FLAG_ICON : LIGHT_ICON,
      buildPartial: () => ({ type: 'light', fixtureType: f.type } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }),
    });
  });

  // 3. Cameras & Rigs
  CAMERA_RIGS.forEach((rig) => {
    const specificKw = RIG_KEYWORDS[rig.value] || '';
    assets.push({
      id: `camera-${rig.value}`,
      label: `Camera — ${rig.label}`,
      categoryTag: 'cameras',
      keywords: `camera cam shot angle ${rig.label} ${rig.value} rig ${specificKw}`,
      group: 'Cameras & Rigs',
      icon: CAMERA_ICON,
      buildPartial: () => ({ type: 'camera', rigType: rig.value } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }),
    });
  });

  // 4. Basic Shapes & Zones
  SHAPE_ASSETS.forEach((shape) => {
    assets.push({
      id: `shape-${shape.value}`,
      label: `${shape.label}`,
      categoryTag: 'shapes',
      keywords: `${shape.label} shape zone area geometry ${shape.keywords} outline fill`,
      group: 'Shapes & Zones',
      icon: <Circle className="w-4 h-4 text-cyan-500" />,
      buildPartial: () =>
        ({ type: 'shape', shapeType: shape.value } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }),
    });
  });

  // 4b. Signal & Power Cables
  CABLE_TYPES.forEach((ct) => {
    assets.push({
      id: `cable-${ct.type}`,
      label: `${ct.name} Run`,
      categoryTag: 'cables',
      keywords: `cable patch wiring signal power ${ct.name} ${ct.shortLabel} ${ct.connector} ${ct.rating || ''} run`,
      group: ct.isPower ? 'Power Cables' : 'Signal & Patch Cables',
      dimensions: ct.rating || ct.connector,
      icon: ct.isPower ? <Zap className="w-4 h-4 text-rose-500" /> : <Cable className="w-4 h-4 text-cyan-500" />,
      buildPartial: () =>
        ({ type: 'cable', cableType: ct.type as CableType } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }),
    });
  });

  // 5. Core Architectural & Annotation Elements
  const generic: QuickAsset[] = [
    {
      id: 'actor',
      label: 'Actor / Talent',
      categoryTag: 'elements',
      keywords: 'actor talent character person performer subject cast extra blocking',
      group: 'Core Scene Elements',
      icon: ACTOR_ICON,
      buildPartial: () => ({ type: 'actor' }),
    },
    {
      id: 'wall',
      label: 'Wall / Room Partition',
      categoryTag: 'elements',
      keywords: 'wall room partition architecture set build boundary dry wall brick',
      group: 'Core Scene Elements',
      icon: <BrickWall className="w-4 h-4 text-amber-600" />,
      buildPartial: () => ({ type: 'wall' }),
    },
    {
      id: 'door',
      label: 'Door (Single / Swing)',
      categoryTag: 'elements',
      keywords: 'door entrance doorway entry exit threshold swing door',
      group: 'Core Scene Elements',
      icon: <DoorClosed className="w-4 h-4 text-amber-500" />,
      buildPartial: () => ({ type: 'door' }),
    },
    {
      id: 'window',
      label: 'Architectural Window (Glazed)',
      categoryTag: 'elements',
      keywords: 'window glass opening glazing natural light daylight mullion pane window frame',
      group: 'Core Scene Elements',
      icon: <ArchitecturalWindowIcon className="w-4 h-4 text-sky-500" />,
      buildPartial: () => ({ type: 'window' }),
    },
    {
      id: 'track',
      label: 'Dolly Track / Rails',
      categoryTag: 'elements',
      keywords: 'dolly track camera movement rail sliding rail track path move',
      group: 'Core Scene Elements',
      icon: <MoveHorizontal className="w-4 h-4 text-blue-500" />,
      buildPartial: () => ({ type: 'track' }),
    },
    {
      id: 'road',
      label: 'Street / Road / Path',
      categoryTag: 'elements',
      keywords: 'street road highway lane avenue boulevard driveway path pavement sidewalk kerb curb asphalt cobblestone gravel dirt track rail tram crossing crosswalk zebra exterior location carriageway road street',
      group: 'Core Scene Elements',
      icon: <MoveHorizontal className="w-4 h-4 text-zinc-400" />,
      buildPartial: () => ({ type: 'road' }),
    },
    {
      id: 'measure',
      label: 'Tape Measure / Dimension',
      categoryTag: 'elements',
      keywords: 'measure distance tape measurement ruler dimension scale meter foot',
      group: 'Core Scene Elements',
      icon: <Ruler className="w-4 h-4 text-yellow-500" />,
      buildPartial: () => ({ type: 'measurement' }),
    },
    {
      id: 'text',
      label: 'Text Annotation',
      categoryTag: 'elements',
      keywords: 'text note label annotation comment text box title callout note',
      group: 'Core Scene Elements',
      icon: <Type className="w-4 h-4 text-slate-400" />,
      buildPartial: () => ({ type: 'text' }),
    },
    {
      id: 'arrow',
      label: 'Arrow / Flow Direction',
      categoryTag: 'elements',
      keywords: 'arrow direction movement blocking flow annotation vector pointer',
      group: 'Core Scene Elements',
      icon: <MoveUpRight className="w-4 h-4 text-orange-500" />,
      buildPartial: () => ({ type: 'arrow' }),
    },
  ];
  assets.push(...generic);

  return assets;
}

const ALL_ASSETS = buildAssetList();

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[-_/\\+()#.,"'`]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreAsset(asset: QuickAsset, rawQuery: string): number {
  const q = normalizeText(rawQuery);
  if (!q) return 1;

  const labelNorm = normalizeText(asset.label);
  const keywordsNorm = normalizeText(asset.keywords);
  const groupNorm = normalizeText(asset.group);
  const idNorm = normalizeText(asset.id);
  const combined = `${labelNorm} ${keywordsNorm} ${groupNorm} ${idNorm}`;

  const tokens = q.split(' ').filter(Boolean);
  const allTokensMatch = tokens.every((token) => combined.includes(token));
  if (!allTokensMatch) return 0;

  let score = 100;
  if (labelNorm === q) score += 1000;
  else if (labelNorm.startsWith(q)) score += 600;
  else if (labelNorm.includes(q)) score += 300;

  if (tokens.length > 0 && labelNorm.includes(tokens[0])) score += 150;
  return score;
}

const CATEGORY_TABS: { id: 'all' | QuickAsset['categoryTag']; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '✨' },
  { id: 'props', label: 'Furniture & Props', icon: '🛋️' },
  { id: 'grip', label: 'Studio & Grip', icon: '🎬' },
  { id: 'lighting', label: 'Lighting & Flags', icon: '💡' },
  { id: 'cameras', label: 'Cameras & Rigs', icon: '🎥' },
  { id: 'vehicles', label: 'Vehicles & Action', icon: '🚗' },
  { id: 'elements', label: 'Architecture', icon: '🚪' },
  { id: 'cables', label: 'Cables & Power', icon: '🔌' },
  { id: 'shapes', label: 'Zones & Shapes', icon: '📐' },
];

const SYMBOL_RESULT_LIMIT = 8;

type ResultItem =
  | { kind: 'asset'; key: string; asset: QuickAsset }
  | { kind: 'symbol'; key: string; symbol: PlanSymbolDefinition };

export const QuickAssetSearch: React.FC = () => {
  const { quickSearchOpen, setQuickSearchOpen, quickAddElement, theme } = useFloorPlan();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | QuickAsset['categoryTag']>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isLight = theme === 'light';

  const filtered = useMemo((): ResultItem[] => {
    const q = query.trim();
    let list = ALL_ASSETS;

    if (activeCategory !== 'all') {
      list = list.filter((a) => a.categoryTag === activeCategory);
    }

    if (!q) {
      return list.map((asset) => ({ kind: 'asset' as const, key: asset.id, asset }));
    }

    const items: ResultItem[] = [];
    const seenNames = new Set<string>();
    list
      .map((asset) => ({ asset, score: scoreAsset(asset, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .forEach(({ asset }) => {
        seenNames.add(normalizeText(asset.label));
        items.push({ kind: 'asset', key: asset.id, asset });
      });

    // Merge curated production-symbol registry hits (deduped by name).
    if (activeCategory === 'all') {
      searchSymbols(q, { limit: SYMBOL_RESULT_LIMIT }).forEach(({ symbol }) => {
        if (seenNames.has(normalizeText(symbol.name))) return;
        items.push({ kind: 'symbol', key: `symbol-${symbol.id}`, symbol });
      });
    }

    return items;
  }, [query, activeCategory]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory, quickSearchOpen]);

  // Autofocus the search box whenever the palette opens.
  useEffect(() => {
    if (quickSearchOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [quickSearchOpen]);

  const place = useCallback((item: ResultItem) => {
    if (item.kind === 'asset') {
      quickAddElement(item.asset.buildPartial());
    } else {
      const symbol = item.symbol;
      quickAddElement({
        type: 'shape',
        shapeType: 'rectangle',
        symbolId: symbol.id,
        name: symbol.name,
        width: symbol.defaultWidth,
        height: symbol.defaultHeight,
        label: symbol.name,
        color: SYMBOL_SHAPE_COLOR,
        filled: false,
        strokeColor: SYMBOL_SHAPE_STROKE,
        strokeWidth: 2,
      } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] });
    }
    setQuickSearchOpen(false);
    setQuery('');
  }, [quickAddElement, setQuickSearchOpen]);

  // Global hotkeys: Shift+Space opens the palette from anywhere
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        setQuickSearchOpen(true);
        return;
      }

      if (!quickSearchOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setQuickSearchOpen(false);
        setQuery('');
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const target = filtered[Math.min(selectedIndex, filtered.length - 1)];
        if (target) place(target);
        return;
      }

      if (e.target === inputRef.current) {
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
    // `place` and `setQuickSearchOpen` are listed because the handler calls
    // them: without them the listener keeps whichever copy existed when the
    // effect last ran, so Enter could place into a stale setup.
  }, [quickSearchOpen, filtered, selectedIndex, place, setQuickSearchOpen]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!quickSearchOpen) return null;

  let lastGroup: string | null = null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center" onPointerDown={() => setQuickSearchOpen(false)}>
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[3px]" />

      <div
        onPointerDown={(e) => e.stopPropagation()}
        className={`relative mt-16 sm:mt-20 w-[540px] max-w-[94vw] rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 ${
          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
        }`}
      >
        {/* Header / Search input */}
        <div className={`flex items-center gap-2.5 px-4 py-3 border-b ${
          isLight ? 'border-slate-200 bg-slate-50/70' : 'border-slate-800 bg-slate-950/60'
        }`}>
          <Search className={`w-4 h-4 flex-shrink-0 ${isLight ? 'text-slate-400' : 'text-violet-400'}`} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all props, c-stands, lights, furniture, vehicles, actors… (↵ to place)"
            className={`flex-1 bg-transparent outline-none text-sm font-medium placeholder:opacity-45 ${
              isLight ? 'text-slate-900 placeholder:text-slate-400' : 'text-slate-100 placeholder:text-slate-500'
            }`}
          />
          <kbd className={`px-1.5 py-0.5 text-[10px] font-mono rounded border flex-shrink-0 ${
            isLight ? 'border-slate-300 text-slate-500 bg-white' : 'border-slate-700 text-slate-400 bg-slate-800'
          }`}>
            Shift Space
          </kbd>
          <button
            onClick={() => {
              setQuickSearchOpen(false);
              setQuery('');
            }}
            className={`p-1 rounded-md flex-shrink-0 transition-colors ${
              isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className={`flex items-center gap-1 overflow-x-auto px-3 py-1.5 border-b custom-scrollbar ${
          isLight ? 'bg-slate-100/60 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
        }`}>
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
                activeCategory === tab.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-600 hover:bg-slate-200/70'
                  : 'text-slate-400 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span className="text-[10px]">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className={`max-h-[52vh] overflow-y-auto custom-scrollbar ${isLight ? 'bg-white' : 'bg-slate-900'}`}
        >
          {filtered.length === 0 ? (
            <div className={`px-4 py-12 text-center text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              <p className="font-semibold text-slate-300">No assets match “{query}”</p>
              <p className="text-xs opacity-60 mt-1">Try searching for couch, c-stand, boom, desk, plant, car, gun, tree, softbox...</p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const showSymbolHeader =
                item.kind === 'symbol' && (idx === 0 || filtered[idx - 1].kind !== 'symbol');
              const showGroup =
                !showSymbolHeader &&
                item.kind === 'asset' &&
                !query.trim() &&
                item.asset.group !== lastGroup;
              if (showGroup && item.kind === 'asset') lastGroup = item.asset.group;
              const active = idx === selectedIndex;
              return (
                <div key={item.key}>
                  {showSymbolHeader && (
                    <div className={`sticky top-0 z-10 px-4 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      isLight ? 'bg-slate-100 text-slate-500 border-b border-slate-200' : 'bg-slate-950 text-slate-400 border-b border-slate-800'
                    }`}>
                      Production Symbols
                    </div>
                  )}
                  {showGroup && item.kind === 'asset' && (
                    <div className={`sticky top-0 z-10 px-4 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      isLight ? 'bg-slate-100 text-slate-500 border-b border-slate-200' : 'bg-slate-950 text-slate-400 border-b border-slate-800'
                    }`}>
                      {item.asset.group}
                    </div>
                  )}
                  <button
                    data-idx={idx}
                    onPointerEnter={() => setSelectedIndex(idx)}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      place(item);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left text-xs transition-colors ${
                      active
                        ? isLight
                          ? 'bg-violet-100 text-violet-900 font-semibold'
                          : 'bg-violet-600/25 text-violet-200 font-semibold ring-1 ring-inset ring-violet-500/30'
                        : isLight
                        ? 'text-slate-700 hover:bg-slate-50'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    {item.kind === 'asset' ? (
                      <span className="flex-shrink-0 p-1 rounded bg-slate-800/40">{item.asset.icon}</span>
                    ) : (
                      <span
                        className={`flex-shrink-0 p-1 rounded bg-slate-800/40 ${
                          active ? 'text-violet-300' : isLight ? 'text-slate-600' : 'text-slate-400'
                        }`}
                        aria-hidden="true"
                      >
                        {/* Registry SVG is our own static curated data, not user input. */}
                        <svg viewBox="0 0 100 100" className="w-7 h-7" dangerouslySetInnerHTML={{ __html: item.symbol.svg }} />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{item.kind === 'asset' ? item.asset.label : item.symbol.name}</span>
                        {item.kind === 'asset' && item.asset.dimensions && (
                          <span className="text-[10px] font-mono opacity-50 flex-shrink-0">{item.asset.dimensions}</span>
                        )}
                      </div>
                      <div className="text-[10px] opacity-45 truncate font-normal">
                        {item.kind === 'asset' ? item.asset.group : (
                          <span className={`inline-block mt-0.5 px-1.5 py-px rounded-full border uppercase tracking-wide ${
                            isLight ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-700 bg-slate-800/60 text-slate-400'
                          }`}>
                            {item.symbol.category}
                          </span>
                        )}
                      </div>
                    </div>
                    {active && <span className="text-[10px] font-mono opacity-70 px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 flex-shrink-0">Place ↵</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className={`px-4 py-2 border-t text-[10px] flex items-center justify-between ${
          isLight ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-800 bg-slate-950/70 text-slate-400'
        }`}>
          <span>Press <strong>↵ Enter</strong> to spawn at canvas center. Drag to reposition.</span>
          <span className="font-mono">{filtered.length} assets</span>
        </div>
      </div>
    </div>
  );
};
