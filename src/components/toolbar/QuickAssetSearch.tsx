import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toggleShortcutSheet } from '../common/ShortcutSheet';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { LIGHT_KEYWORDS, PROP_KEYWORDS } from './quickAssetKeywords';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';
import { getSymbolById, getSymbolsByCategory, searchSymbols } from '../../domain/assets';
import type { PlanSymbolDefinition } from '../../domain/assets';
import { CameraRigType, CableType, FloorPlanElement, PropType, ShapeType } from '../../types';
import { CABLE_TYPES, CAMERA_RIGS, LIGHT_FIXTURES, PROP_CATALOG } from '../../constants/presets';
import { FresnelLightIcon, MovieCameraIcon } from '../icons/ProductionIcons';
import {
  BrickWall,
  Cable,
  Circle,
  DoorClosed,
  Flag,
  MoveHorizontal,
  MoveUpRight,
  Ruler,
  Search,
  Armchair,
  TreePine,
  Truck,
  Type,
  User,
  X,
  Zap,
  Mic2,
  CalendarDays,
  Clapperboard,
  Command,
  FileOutput,
  FileInput,
  ListChecks,
  MapPinned,
  Users,
} from 'lucide-react';
import { useWorkspaceUI, type RightTab } from '../../context/WorkspaceUIContext';
import { useDialogs } from '../dialog/DialogProvider';
import { exportProjectMvr, importProjectMvr } from '../../domain/technical/mvrExport';
import { downloadBlob, safeFileName } from '../../utils/download';

const ArchitecturalWindowIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4 text-accent-ink' }) => (
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
  categoryTag:
    | 'all'
    | 'props'
    | 'staging'
    | 'grip'
    | 'vehicles'
    | 'lighting'
    | 'cameras'
    | 'shapes'
    | 'elements'
    | 'cables';
  keywords: string;
  group: string;
  dimensions?: string;
  icon: React.ReactNode;
  buildPartial: () => Partial<FloorPlanElement> & { type: FloorPlanElement['type'] };
}

const ACTOR_ICON = <User className="w-4 h-4 text-ok" />;
const CAMERA_ICON = <MovieCameraIcon className="w-4 h-4 text-accent-ink" />;
const LIGHT_ICON = <FresnelLightIcon className="w-4 h-4 text-warn" />;
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
    // Staging and grip are separate on purpose. Nearly half the catalogue is
    // staging, and it used to sit under a chip called "Furniture & Props"
    // where nobody would look for a speaker array. But "Studio & Stage" is not
    // staging — it is C-stands, apple boxes and carts, which the camera
    // department reaches for at a different moment than anyone rigging a
    // stage, so putting a PA stack next to an apple box makes both harder to
    // find.
    let categoryTag: QuickAsset['categoryTag'] = 'props';
    if (p.category === 'Concert & Stage' || p.category === 'Broadcast & Production') {
      categoryTag = 'staging';
    } else if (p.category === 'Studio & Stage') categoryTag = 'grip';
    else if (p.category === 'Vehicles' || p.category === 'Weapons & Explosives') categoryTag = 'vehicles';
    else if (p.category === 'Architecture') categoryTag = 'elements';
    else if (p.category === 'Generic' || p.category === 'Landscape') categoryTag = 'shapes';

    let groupName = 'Props & Set Dressing';
    if (p.category === 'Studio & Stage') groupName = 'Studio & Grip Equipment';
    else if (p.category === 'Concert & Stage') groupName = 'Concert & Live Event';
    else if (p.category === 'Broadcast & Production') groupName = 'Broadcast & Production';
    else if (p.category === 'Vehicles') groupName = 'Vehicles & Transport';
    else if (p.category === 'Weapons & Explosives') groupName = 'Weapons & Explosives';
    else if (p.category === 'Documents & Hand Props') groupName = 'Documents & Hand Props';
    else if (p.category === 'Architecture') groupName = 'Architecture & Fixtures';
    else if (p.category === 'Landscape') groupName = 'Landscape & Scenic';
    else if (p.category === 'Generic') groupName = 'Generic Props';

    assets.push({
      id: `prop-${p.type}`,
      label: p.name,
      categoryTag,
      keywords: `${p.name} ${p.category} ${p.type} prop ${specificKw}`,
      group: groupName,
      dimensions: `${p.defaultWidth}×${p.defaultHeight}cm`,
      icon: sharedSymbol ? (
        <svg className="w-5 h-5 text-accent-ink" viewBox="0 0 100 100" aria-hidden="true">
          <g dangerouslySetInnerHTML={{ __html: sharedSymbol.svg }} />
        </svg>
      ) : p.type === 'tree' ? <TreePine className="w-4 h-4 text-ok" /> :
        p.category === 'Broadcast & Production' ? <Truck className="w-4 h-4 text-accent-ink" /> :
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
      icon: <DoorClosed className="w-4 h-4 text-warn" />,
      buildPartial: () => ({ type: 'door' }),
    },
    {
      id: 'window',
      label: 'Architectural Window (Glazed)',
      categoryTag: 'elements',
      keywords: 'window glass opening glazing natural light daylight mullion pane window frame',
      group: 'Core Scene Elements',
      icon: <ArchitecturalWindowIcon className="w-4 h-4 text-accent-ink" />,
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
  { id: 'props', label: 'Props', icon: '🛋️' },
  { id: 'staging', label: 'Staging & Live', icon: '🎤' },
  { id: 'grip', label: 'Studio & Grip', icon: '🎬' },
  { id: 'lighting', label: 'Lighting & Flags', icon: '💡' },
  { id: 'cameras', label: 'Cameras & Rigs', icon: '🎥' },
  { id: 'vehicles', label: 'Vehicles & Action', icon: '🚗' },
  { id: 'elements', label: 'Architecture & Fixtures', icon: '🚪' },
  { id: 'cables', label: 'Cables & Power', icon: '🔌' },
  { id: 'shapes', label: 'Zones & Shapes', icon: '📐' },
];

const SYMBOL_RESULT_LIMIT = 8;
const LIVE_SYMBOL_CATEGORIES = ['audio', 'staging', 'backline'];
const FEATURED_SYMBOL_IDS = [
  'lighting.moving-head-wash',
  'lighting.moving-head-spot',
  'lighting.led-par',
  'audio.dj-booth',
];

function symbolResults(query: string, category: 'all' | QuickAsset['categoryTag']): Extract<ResultItem, { kind: 'symbol' }>[] {
  const categories = category === 'lighting' ? ['lighting'] : category === 'staging' ? LIVE_SYMBOL_CATEGORIES : category === 'elements' ? ['architecture'] : [];
  const matches = query
    ? (category === 'all'
      ? searchSymbols(query, { limit: SYMBOL_RESULT_LIMIT })
      : categories.flatMap((symbolCategory) => searchSymbols(query, { category: symbolCategory, limit: SYMBOL_RESULT_LIMIT }))
        .sort((a, b) => b.score - a.score)
        .slice(0, SYMBOL_RESULT_LIMIT)).map(({ symbol }) => symbol)
    : category === 'all'
      ? FEATURED_SYMBOL_IDS.flatMap((id) => {
        const symbol = getSymbolById(id);
        return symbol ? [symbol] : [];
      })
      : categories.flatMap(getSymbolsByCategory);
  return matches.map((symbol) => ({ kind: 'symbol', key: `symbol-${symbol.id}`, symbol }));
}

type ResultItem =
  | { kind: 'asset'; key: string; asset: QuickAsset }
  | { kind: 'symbol'; key: string; symbol: PlanSymbolDefinition }
  | {
      kind: 'command';
      key: string;
      label: string;
      detail: string;
      keywords: string;
      icon: React.ReactNode;
      run: () => void;
    };

export const QuickAssetSearch: React.FC = () => {
  const { project, activeSetup, allShots, quickAddElement, setActiveSetupId, selectShot, commitProject } = useFloorPlan();
  const {
    quickSearchOpen,
    setQuickSearchOpen,
    theme,
    setActiveRightTab,
    setRightPanelOpen,
    openDashboard,
    openExportModal,
  } = useWorkspaceUI();
  const { notice } = useDialogs();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | QuickAsset['categoryTag']>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The palette floats over the whole app, so keyboard focus has to be confined
  // to it and handed back to the canvas when it closes.
  const dialogRef = useDialogFocusTrap(quickSearchOpen);

  const isLight = theme === 'light';

  const openModule = useCallback((tab: RightTab) => {
    setActiveRightTab(tab);
    setRightPanelOpen(true);
  }, [setActiveRightTab, setRightPanelOpen]);

  const commandItems = useMemo((): ResultItem[] => {
    const commands: ResultItem[] = [
      { kind: 'command', key: 'command-shortcuts', label: 'Keyboard shortcuts', detail: 'Command · ?', keywords: 'keyboard shortcuts keys hotkeys help cheat sheet', icon: <Command className="w-4 h-4" />, run: toggleShortcutSheet },
      { kind: 'command', key: 'command-projects', label: 'Open projects', detail: 'Command', keywords: 'project library dashboard open switch', icon: <Command className="w-4 h-4" />, run: openDashboard },
      { kind: 'command', key: 'command-export', label: 'Open print & export studio', detail: 'Command', keywords: 'print export pdf report download', icon: <FileOutput className="w-4 h-4" />, run: () => openExportModal() },
      { kind: 'command', key: 'command-mvr', label: 'Export current setup as MVR', detail: 'Command · Technical', keywords: 'export current setup mvr gdtf dmx lighting console previs truss', icon: <Zap className="w-4 h-4" />, run: async () => {
        const result = await exportProjectMvr(project, { setupIds: [activeSetup.id] });
        downloadBlob(result.blob, `${safeFileName(`${project.title}-${activeSetup.name}`, 'production').toLowerCase()}.mvr`);
        if (result.warnings.length) await notice({ title: 'MVR exported with warnings', message: `MVR exported with ${result.warnings.length} warning(s):\n\n${result.warnings.join('\n')}` });
      } },
      { kind: 'command', key: 'command-mvr-all', label: 'Export all setups as MVR layers', detail: 'Command · Technical · Advanced', keywords: 'export all setups layers mvr gdtf dmx lighting console previs truss', icon: <Zap className="w-4 h-4" />, run: async () => {
        const result = await exportProjectMvr(project);
        downloadBlob(result.blob, `${safeFileName(project.title, 'production').toLowerCase()}-all-setups.mvr`);
        if (result.warnings.length) await notice({ title: 'MVR exported with warnings', message: `MVR exported with ${result.warnings.length} warning(s):\n\n${result.warnings.join('\n')}` });
      } },
      { kind: 'command', key: 'command-import-mvr', label: 'Import MVR scene', detail: 'Command · Technical', keywords: 'import open mvr gdtf dmx lighting console previs truss', icon: <FileInput className="w-4 h-4" />, run: () => {
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.mvr,application/zip';
        picker.onchange = () => {
          const file = picker.files?.[0];
          if (!file) return;
          void importProjectMvr(file).then((result) => {
            commitProject((previous) => ({
              setups: [...previous.setups, ...result.setups],
              activeSetupId: result.setups[0]?.id ?? previous.activeSetupId,
              trussProfiles: [...(previous.trussProfiles ?? []), ...result.trussProfiles],
              trussElements: [...(previous.trussElements ?? []), ...result.trussElements],
            }), { label: `Import MVR (${file.name})`, domain: 'technical' });
            void notice({ title: 'MVR imported', message: `Imported ${result.fixtureCount} fixtures, ${result.trussCount} trusses and ${result.importedResourceCount} embedded resources.${result.warnings.length ? `\n\nWarnings:\n${result.warnings.join('\n')}` : ''}` });
          }).catch((error: unknown) => {
            void notice({ title: 'MVR import failed', message: error instanceof Error ? error.message : 'The MVR file could not be imported.' });
          });
        };
        picker.click();
      } },
      { kind: 'command', key: 'command-camera', label: 'Add camera', detail: 'Command · Floor plan', keywords: 'add create camera floor plan', icon: CAMERA_ICON, run: () => quickAddElement({ type: 'camera', rigType: 'Tripod' }) },
      { kind: 'command', key: 'command-schedule', label: 'Open schedule', detail: 'Command', keywords: 'shooting day stripboard schedule call sheet', icon: <CalendarDays className="w-4 h-4" />, run: () => openModule('schedule') },
      { kind: 'command', key: 'command-continuity', label: 'Open continuity & takes', detail: 'Command', keywords: 'log take good ng mos pickup coverage continuity', icon: <Clapperboard className="w-4 h-4" />, run: () => openModule('continuity') },
      { kind: 'command', key: 'command-tasks', label: 'Open production tasks', detail: 'Command', keywords: 'tasks permit todo blocker', icon: <ListChecks className="w-4 h-4" />, run: () => openModule('tasks') },
    ];
    const entities: ResultItem[] = [];
    allShots.forEach((shot) => entities.push({
      kind: 'command', key: `shot-${shot.id}`, label: `${shot.shotNumber} — ${shot.name || 'Untitled shot'}`, detail: 'Shot', keywords: `shot ${shot.shotNumber} ${shot.name ?? ''}`, icon: CAMERA_ICON,
      run: () => { selectShot(shot.id); openModule('shots'); },
    }));
    (project.setups ?? []).forEach((setup) => entities.push({
      kind: 'command', key: `setup-${setup.id}`, label: `${setup.sceneNumber || '—'} — ${setup.name}`, detail: 'Scene / setup', keywords: `scene setup ${setup.sceneNumber} ${setup.name} ${setup.location}`, icon: <Clapperboard className="w-4 h-4" />,
      run: () => setActiveSetupId(setup.id),
    }));
    (project.people ?? []).forEach((person) => entities.push({
      kind: 'command', key: `person-${person.id}`, label: person.displayName, detail: person.kind === 'crew' ? `Crew · ${person.role || person.department || ''}` : `Cast · ${person.role || ''}`, keywords: `${person.displayName} ${person.role ?? ''} ${person.department ?? ''} ${person.kind}`, icon: <Users className="w-4 h-4" />,
      run: () => openModule('contacts'),
    }));
    (project.locations ?? []).forEach((location) => entities.push({
      kind: 'command', key: `location-${location.id}`, label: location.name, detail: 'Location', keywords: `location ${location.name} ${location.address ?? ''}`, icon: <MapPinned className="w-4 h-4" />,
      run: () => openModule('locations'),
    }));
    (project.productionDays ?? []).forEach((day) => entities.push({
      kind: 'command', key: `day-${day.id}`, label: day.name, detail: `Shooting day${day.date ? ` · ${day.date}` : ''}`, keywords: `shooting day schedule ${day.name} ${day.date ?? ''}`, icon: <CalendarDays className="w-4 h-4" />,
      run: () => openModule('schedule'),
    }));
    (project.tasks ?? []).forEach((task) => entities.push({
      kind: 'command', key: `task-${task.id}`, label: task.title, detail: 'Task', keywords: `task ${task.title} ${task.description ?? ''}`, icon: <ListChecks className="w-4 h-4" />,
      run: () => openModule('tasks'),
    }));
    return [...commands, ...entities];
  }, [activeSetup, allShots, commitProject, notice, openDashboard, openExportModal, openModule, project, quickAddElement, selectShot, setActiveSetupId]);

  const filtered = useMemo((): ResultItem[] => {
    const q = query.trim();
    let list = ALL_ASSETS;

    if (activeCategory !== 'all') {
      list = list.filter((a) => a.categoryTag === activeCategory);
    }

    const symbols = symbolResults(q, activeCategory);
    if (!q) {
      const legacyAssets = list.map((asset) => ({ kind: 'asset' as const, key: asset.id, asset }));
      return [...symbols, ...legacyAssets];
    }

    const items: ResultItem[] = [];
    if (activeCategory === 'all') {
      const normalizedQuery = normalizeText(q);
      commandItems
        .filter((item): item is Extract<ResultItem, { kind: 'command' }> => item.kind === 'command')
        .filter((item) => normalizeText(`${item.label} ${item.detail} ${item.keywords}`).includes(normalizedQuery))
        .slice(0, 18)
        .forEach((item) => items.push(item));
    }
    const seenNames = new Set<string>();
    list
      .map((asset) => ({ asset, score: scoreAsset(asset, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .forEach(({ asset }) => {
        seenNames.add(normalizeText(asset.label));
        items.push({ kind: 'asset', key: asset.id, asset });
      });

    items.push(...symbols.filter((item) => !seenNames.has(normalizeText(item.symbol.name))));

    return items;
  }, [query, activeCategory, commandItems]);

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
    if (item.kind === 'command') {
      item.run();
    } else if (item.kind === 'asset') {
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

  // Global hotkeys: Cmd/Ctrl+K is the command center; Shift+Space remains the
  // fast floor-plan placement shortcut existing users already know.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setQuickSearchOpen(true);
        return;
      }
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Global command center"
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        className={`relative mt-16 sm:mt-20 w-[540px] max-w-[94vw] rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 outline-hidden ${
          'bg-surface border-line text-ink'
        }`}
      >
        {/* Header / Search input */}
        <div className={`flex items-center gap-2.5 px-4 py-3 border-b ${
          'border-line bg-slate-50/70 dark:bg-slate-950/60'
        }`}>
          <Search className={`w-4 h-4 flex-shrink-0 text-slate-400 dark:text-violet-400`} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shots, scenes, people, days, locations, tasks, commands and assets…"
            className={`flex-1 bg-transparent outline-none text-sm font-medium placeholder:opacity-45 ${
              'text-ink placeholder:text-ink-subtle'
            }`}
          />
          <kbd className={`px-1.5 py-0.5 text-[10px] font-mono rounded border flex-shrink-0 ${
            'border-line-strong text-ink-muted bg-raised'
          }`}>
            ⌘K / Ctrl K
          </kbd>
          <button
            onClick={() => {
              setQuickSearchOpen(false);
              setQuery('');
            }}
            title="Close quick search"
            aria-label="Close quick search"
            className={`p-1 rounded-md flex-shrink-0 transition-colors ${
              'text-ink-subtle hover:text-ink-soft hover:bg-surface-hover'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className={`flex items-center gap-1 overflow-x-auto px-3 py-1.5 border-b custom-scrollbar ${
          'bg-slate-100/60 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/80'
        }`}>
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id)}
              aria-pressed={activeCategory === tab.id}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
                activeCategory === tab.id
                  ? 'bg-accent text-white shadow-sm'
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
          className={`max-h-[52vh] overflow-y-auto custom-scrollbar bg-surface`}
        >
          {filtered.length === 0 ? (
            <div className={`px-4 py-12 text-center text-sm text-ink-muted`}>
              <p className="font-semibold text-slate-300">No assets match “{query}”</p>
              <p className="text-xs opacity-60 mt-1">Try searching for moving head, LED PAR, DJ booth, or wall.</p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const showCommandHeader =
                item.kind === 'command' && (idx === 0 || filtered[idx - 1].kind !== 'command');
              const showSymbolHeader =
                item.kind === 'symbol' && (idx === 0 || filtered[idx - 1].kind !== 'symbol');
              const showGroup =
                !showCommandHeader && !showSymbolHeader &&
                item.kind === 'asset' &&
                !query.trim() &&
                item.asset.group !== lastGroup;
              if (showGroup && item.kind === 'asset') lastGroup = item.asset.group;
              const active = idx === selectedIndex;
              return (
                <div key={item.key}>
                  {showCommandHeader && (
                    <div className={`sticky top-0 z-10 px-4 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      isLight ? 'bg-violet-50 text-violet-700 border-b border-violet-100' : 'bg-violet-950/50 text-violet-300 border-b border-violet-900'
                    }`}>
                      Commands &amp; project results
                    </div>
                  )}
                  {showSymbolHeader && (
                    <div className={`sticky top-0 z-10 px-4 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      'bg-surface-sunken text-ink-muted border-b border-line'
                    }`}>
                      Production Symbols
                    </div>
                  )}
                  {showGroup && item.kind === 'asset' && (
                    <div className={`sticky top-0 z-10 px-4 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      'bg-surface-sunken text-ink-muted border-b border-line'
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
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      active
                        ? isLight
                          ? 'bg-violet-100 text-violet-900 font-semibold'
                          : 'bg-violet-600/25 text-violet-200 font-semibold ring-1 ring-inset ring-violet-500/30'
                        : isLight
                        ? 'text-slate-700 hover:bg-slate-50'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    {item.kind === 'command' ? (
                      <span className="flex-shrink-0 p-1.5 rounded bg-violet-500/15 text-violet-500">{item.icon}</span>
                    ) : item.kind === 'asset' ? (
                      <span className="flex-shrink-0 p-1 rounded bg-slate-800/40">{item.asset.icon}</span>
                    ) : (
                      <span
                        className={`flex-shrink-0 p-1 rounded bg-slate-800/40 ${
                          active ? 'text-violet-300' : 'text-ink-muted'
                        }`}
                        aria-hidden="true"
                      >
                        {/* Registry SVG is our own static curated data, not user input. */}
                        <svg viewBox="0 0 100 100" className="w-7 h-7" dangerouslySetInnerHTML={{ __html: item.symbol.svg }} />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{item.kind === 'command' ? item.label : item.kind === 'asset' ? item.asset.label : item.symbol.name}</span>
                        {item.kind === 'asset' && item.asset.dimensions && (
                          <span className="text-[10px] font-mono opacity-50 flex-shrink-0">{item.asset.dimensions}</span>
                        )}
                      </div>
                      <div className="text-[10px] opacity-45 truncate font-normal">
                        {item.kind === 'command' ? item.detail : item.kind === 'asset' ? item.asset.group : (
                          <span className={`inline-block mt-0.5 px-1.5 py-px rounded-full border uppercase tracking-wide ${
                            'border-line bg-surface-muted text-ink-muted'
                          }`}>
                            {item.symbol.category}
                          </span>
                        )}
                      </div>
                    </div>
                    {active && <span className="text-[10px] font-mono opacity-70 px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 flex-shrink-0">{item.kind === 'command' ? 'Open ↵' : 'Place ↵'}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className={`px-4 py-2 border-t text-[10px] flex items-center justify-between ${
          'border-line bg-surface-sunken text-ink-muted'
        }`}>
          <span>Press <strong>↵ Enter</strong> to open a result or place an asset.</span>
          <span className="font-mono">{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
};
