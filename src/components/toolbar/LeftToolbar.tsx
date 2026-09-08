import React, { useLayoutEffect, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useDialogs } from '../dialog/DialogProvider';
import { ActiveTool, CableType, ShapeType } from '../../types';
import { CABLE_TYPES, CAMERA_RIGS, LIGHT_FIXTURES, PROP_CATALOG } from '../../constants/presets';
import { loadBackgroundImageFile } from '../../utils/image';
import { useBreakpoint } from '../../utils/useMediaQuery';
import { FresnelLightIcon, MovieCameraIcon } from '../icons/ProductionIcons';
import {
  Cable,
  DoorClosed,
  Flag,
  Hand,
  ImagePlus,
  MousePointer,
  MoveHorizontal,
  Route,
  MoveUpRight,
  Circle,
  Pencil,
  Ruler,
  Search,
  BrickWall,
  Armchair,
  Type,
  User,
  MoreHorizontal,
  Mic2,
  Clapperboard,
  DoorOpen,
} from 'lucide-react';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

interface ToolItem {
  id: ActiveTool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  hasSubmenu?: boolean;
  /**
   * Which panel this button opens, when that is not simply `id`.
   *
   * Props, staging, grip and architecture are four buttons that all place a
   * `prop` — they differ only in which slice of the catalogue they show. Giving
   * them one tool and four submenus keeps placement a single code path: adding
   * an `ActiveTool` per category would mean the canvas learning four names for
   * one behaviour.
   */
  submenuKey?: Submenu;
  /** Catalogue categories this button's submenu lists. */
  propCategories?: readonly string[];
}

type Submenu =
  | 'prop'
  | 'staging'
  | 'grip'
  | 'architecture'
  | 'light'
  | 'camera'
  | 'shape'
  | 'cable'
  | 'overflow';

/**
 * The catalogue's categories, split the way people reach for them.
 *
 * Staging was the change that mattered: it is a third of the catalogue and it
 * used to sit inside "Props", where nobody would look for a speaker array.
 * Grip stays separate from it because a C-stand and a PA stack belong to
 * different departments at different moments.
 */
const SET_DRESSING_CATEGORIES = [
  'Living',
  'Dining & Office',
  'Bedroom',
  'Weapons & Explosives',
  'Documents & Hand Props',
  'Vehicles',
  'Landscape',
  'Generic',
] as const;
const STAGING_CATEGORIES = ['Concert & Stage', 'Broadcast & Production'] as const;
const GRIP_CATEGORIES = ['Studio & Stage'] as const;
const ARCHITECTURE_CATEGORIES = ['Architecture'] as const;

const SHAPE_OPTIONS: { value: ShapeType; label: string }[] = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'line', label: 'Line Segment' },
  { value: 'circle', label: 'Circle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'star', label: 'Star' },
];

/** Tools that stay on the bar when there is no room for the full palette. */
const PRIMARY_TOOL_IDS: ActiveTool[] = ['select', 'pan', 'actor', 'camera', 'light', 'wall'];

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

export const LeftToolbar: React.FC = () => {
  const { activeTool, setTool, activePropSubtype, setPropSubtype, activeLightFixture, setLightFixture, activeCameraRig, setCameraRig, activeShapeType, setShapeType, activeCableType, setCableType, addBackgroundImage } = useFloorPlan();
  const { notice } = useDialogs();
  const { setQuickSearchOpen, theme } = useWorkspaceUI();
  const [openSubmenu, setOpenSubmenu] = useState<Submenu | null>(null);
  const floorplanInputRef = useRef<HTMLInputElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const { isCompact, isTiny } = useBreakpoint();
  // How many tool buttons fit in the palette's height. The bar never scrolls:
  // whatever doesn't fit moves into the overflow flyout.
  const [fitCount, setFitCount] = useState(Infinity);

  // Buttons shrink on tablets; on phones the palette keeps only the primary
  // tools and moves the rest into an overflow flyout.
  const buttonSize = isTiny ? 'w-9 h-9' : isCompact ? 'w-9 h-9' : 'w-10 h-10';
  const iconScale = isCompact ? 'scale-95' : '';

  const handleFloorplanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadBackgroundImageFile(file)
      .then((bg) => addBackgroundImage(bg))
      .catch(() => { void notice({ title: 'Image unreadable', message: 'Could not load the selected image file.' }); });
    if (floorplanInputRef.current) floorplanInputRef.current.value = '';
  };

  const isLight = theme === 'light';

  useLayoutEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;

    const measure = () => {
      const buttonPx = isCompact ? 36 : 40;
      const gapPx = isCompact ? 4 : 6;
      // Quick search + divider + overflow button + upload button keep their slots.
      const reserved = (buttonPx + gapPx) * 3 + 24;
      const available = aside.clientHeight - reserved;
      setFitCount(Math.max(3, Math.floor(available / (buttonPx + gapPx))));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(aside);
    return () => observer.disconnect();
  }, [isCompact]);

  const toggleSubmenu = (tool: ToolItem) => {
    setTool(tool.id);
    const key = tool.submenuKey ?? (tool.id as Submenu);
    if (tool.hasSubmenu) {
      setOpenSubmenu((prev) => (prev === key ? null : key));
    } else {
      setOpenSubmenu(null);
    }
  };

  const tools: ToolItem[] = [
    {
      id: 'select',
      label: 'Select / Move',
      shortcut: 'V',
      icon: <MousePointer className="w-4 h-4" />,
    },
    {
      id: 'pan',
      label: 'Pan Canvas',
      shortcut: 'H',
      icon: <Hand className="w-4 h-4" />,
    },
    {
      id: 'actor',
      label: 'Actor / Talent',
      shortcut: 'A',
      icon: <User className="w-4 h-4 text-emerald-500" />,
    },
    {
      id: 'camera',
      label: 'Camera & Shot',
      shortcut: 'C',
      icon: <MovieCameraIcon className="w-4 h-4 text-sky-500" />,
      hasSubmenu: true,
    },
    {
      id: 'light',
      label: 'Light Fixture',
      shortcut: 'L',
      icon: <FresnelLightIcon className="w-4 h-4 text-amber-500" />,
      hasSubmenu: true,
    },
    {
      id: 'wall',
      label: 'Wall / Room',
      shortcut: 'W',
      icon: <BrickWall className="w-4 h-4 text-amber-600" />,
    },
    {
      id: 'door',
      label: 'Door (Wall Snap)',
      shortcut: 'D',
      icon: <DoorClosed className="w-4 h-4 text-amber-500" />,
    },
    {
      id: 'window',
      label: 'Window (Wall Snap)',
      shortcut: 'N',
      icon: <ArchitecturalWindowIcon className="w-4 h-4 text-sky-500" />,
    },
    {
      id: 'prop',
      label: 'Props',
      shortcut: 'P',
      icon: <Armchair className="w-4 h-4 text-purple-500" />,
      hasSubmenu: true,
      submenuKey: 'prop',
      propCategories: SET_DRESSING_CATEGORIES,
    },
    {
      id: 'prop',
      label: 'Staging & Live',
      shortcut: 'E',
      icon: <Mic2 className="w-4 h-4 text-fuchsia-500" />,
      hasSubmenu: true,
      submenuKey: 'staging',
      propCategories: STAGING_CATEGORIES,
    },
    {
      id: 'prop',
      label: 'Studio & Grip',
      shortcut: 'U',
      icon: <Clapperboard className="w-4 h-4 text-amber-500" />,
      hasSubmenu: true,
      submenuKey: 'grip',
      propCategories: GRIP_CATEGORIES,
    },
    {
      id: 'prop',
      label: 'Architecture & Fixtures',
      shortcut: 'F',
      icon: <DoorOpen className="w-4 h-4 text-emerald-500" />,
      hasSubmenu: true,
      submenuKey: 'architecture',
      propCategories: ARCHITECTURE_CATEGORIES,
    },
    {
      id: 'shape',
      label: 'Shape (zone / area)',
      shortcut: 'S',
      icon: <Circle className="w-4 h-4 text-cyan-500" />,
      hasSubmenu: true,
    },
    {
      id: 'track',
      label: 'Dolly Track',
      shortcut: 'T',
      icon: <MoveHorizontal className="w-4 h-4 text-blue-500" />,
    },
    {
      id: 'road',
      label: 'Street / Road',
      shortcut: 'R',
      icon: <Route className="w-4 h-4 text-zinc-400" />,
    },
    {
      id: 'measure',
      label: 'Tape Measure',
      shortcut: 'M',
      icon: <Ruler className="w-4 h-4 text-yellow-500" />,
    },
    {
      id: 'arrow',
      label: 'Arrow / Direction',
      shortcut: 'G',
      icon: <MoveUpRight className="w-4 h-4 text-orange-500" />,
    },
    {
      id: 'cable',
      label: 'Cable / Patch Run',
      shortcut: 'K',
      icon: <Cable className="w-4 h-4 text-cyan-500" />,
      hasSubmenu: true,
    },
    {
      id: 'text',
      label: 'Text Annotation',
      shortcut: 'X',
      icon: <Type className="w-4 h-4 text-slate-400" />,
    },
    {
      id: 'stroke',
      label: 'Pen / Annotate',
      shortcut: 'B',
      icon: <Pencil className="w-4 h-4 text-amber-400" />,
    },
  ];

  // On a phone the palette keeps the primary tools, and on any short screen it
  // keeps as many as fit; the rest move into the overflow flyout.
  const capacity = Math.max(3, Math.min(fitCount, isTiny ? PRIMARY_TOOL_IDS.length : tools.length));
  const ordered = isTiny
    ? [...tools].sort((a, b) => {
        const rank = (id: ActiveTool) => (PRIMARY_TOOL_IDS.includes(id) ? 0 : 1);
        return rank(a.id) - rank(b.id);
      })
    : tools;
  let visibleTools = ordered.slice(0, capacity);
  const overflowTools = ordered.slice(capacity);
  // The active tool is always on the bar, even if it normally lives in overflow.
  if (overflowTools.some((tool) => tool.id === activeTool)) {
    const active = overflowTools.find((tool) => tool.id === activeTool)!;
    const displaced = visibleTools[visibleTools.length - 1];
    visibleTools = [...visibleTools.slice(0, -1), active];
    overflowTools.splice(overflowTools.indexOf(active), 1, displaced);
  }

  const [propSearch, setPropSearch] = useState('');
  const [lightSearch, setLightSearch] = useState('');

  const leftOffset = isCompact ? 'left-12' : 'left-14';
  const flyoutBase = `fixed ${leftOffset} top-14 ml-2 border rounded-xl shadow-2xl p-2.5 z-50 animate-in fade-in slide-in-from-left-1 max-h-[calc(100vh-80px)] overflow-y-auto custom-scrollbar overscroll-contain ${
    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
  }`;

  const listButtonClass = (active: boolean) =>
    `w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
      active
        ? 'bg-sky-600 text-white font-semibold'
        : isLight
        ? 'text-slate-700 hover:bg-slate-100'
        : 'text-slate-300 hover:bg-slate-800'
    }`;

  const normalizeQuery = (text: string) => text.toLowerCase().replace(/[-_/\\+()#.,"'`]/g, ' ').trim();

  const filteredProps = PROP_CATALOG.filter((p) => {
    if (!propSearch) return true;
    const qTokens = normalizeQuery(propSearch).split(' ').filter(Boolean);
    const textToMatch = normalizeQuery(`${p.name} ${p.category} ${p.type}`);
    return qTokens.every((tok) => textToMatch.includes(tok));
  });

  /** The search-filtered catalogue, narrowed to one toolbar button's slice. */
  const propsForTool = (tool: ToolItem) =>
    tool.propCategories
      ? filteredProps.filter((prop) => tool.propCategories!.includes(prop.category))
      : filteredProps;

  const filteredLights = LIGHT_FIXTURES.filter((f) => {
    if (!lightSearch) return true;
    const qTokens = normalizeQuery(lightSearch).split(' ').filter(Boolean);
    const textToMatch = normalizeQuery(`${f.name} ${f.type} ${f.isFlag ? 'flag cstand grip' : 'light lamp'}`);
    return qTokens.every((tok) => textToMatch.includes(tok));
  });

  return (
    <aside
      id="left-toolbar"
      aria-label="Drawing tools"
      ref={asideRef}
      className={`relative ${isCompact ? 'w-12 py-1.5 gap-1' : 'w-14 py-3 gap-1.5'} border-r flex flex-col items-center select-none z-20 transition-colors ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}
    >
      {/* Quick Asset Search (Shift+Space) */}
      <div className="relative group mb-1">
        <button
          id="tool-btn-quick-search"
          onClick={() => setQuickSearchOpen(true)}
          title="Quick Search Assets (Shift+Space)"
          aria-label="Quick Search Assets (Shift+Space)"
          className={`${buttonSize} rounded-xl flex items-center justify-center transition-all ring-1 ring-inset ${
            isLight
              ? 'text-slate-500 hover:text-sky-600 hover:bg-sky-50 ring-slate-200'
              : 'text-slate-400 hover:text-sky-300 hover:bg-slate-800 ring-slate-700/70'
          }`}
        >
          <Search className="w-4 h-4" />
        </button>
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 flex items-center gap-1.5">
          <span className="font-medium">Quick Search Assets</span>
          <kbd className="px-1.5 py-0.2 text-[10px] font-mono bg-slate-800 text-slate-400 rounded border border-slate-700">
            Shift Space
          </kbd>
        </div>
      </div>

      <div className={`w-8 border-t my-0.5 ${isLight ? 'border-slate-200' : 'border-slate-800'}`} />

      {visibleTools.map((tool) => {
        const isActive = activeTool === tool.id;

        return (
          <div key={tool.submenuKey ?? tool.id} className="relative group">
            <button
              id={`tool-btn-${tool.submenuKey ?? tool.id}`}
              onClick={() => toggleSubmenu(tool)}
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={`${tool.label} (${tool.shortcut})`}
              aria-pressed={isActive}
              className={`${buttonSize} ${iconScale} rounded-xl flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30 scale-105'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              {tool.icon}
            </button>

            {/* Hover Tooltip */}
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 flex items-center gap-1.5">
              <span className="font-medium">{tool.label}</span>
              <kbd className="px-1.5 py-0.2 text-[10px] font-mono bg-slate-800 text-slate-400 rounded border border-slate-700">
                {tool.shortcut}
              </kbd>
            </div>

            {/* ---- PROPS FLYOUT ---- */}
            {tool.id === 'prop' && openSubmenu === (tool.submenuKey ?? 'prop') && (
              <div className={`${flyoutBase} w-68 pb-6`}>
                <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1 mb-1 tracking-wider border-b border-slate-700/50 pb-1.5 flex items-center justify-between">
                  <span>{tool.label}</span>
                  <span className="font-mono text-[9px] text-sky-400">
                    {propsForTool(tool).length} items
                  </span>
                </div>

                {/* Filter input */}
                <div className="px-1 py-1 mb-1">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={propSearch}
                      onChange={(e) => setPropSearch(e.target.value)}
                      placeholder="Filter props (e.g. car, gun)..."
                      className={`w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border placeholder:text-slate-500 focus:outline-none focus:border-sky-500 ${
                        isLight ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-slate-800/80 border-slate-700 text-slate-200'
                      }`}
                    />
                  </div>
                </div>

                <div className="space-y-3 py-1">
                  {Object.entries(
                    propsForTool(tool).reduce<Record<string, typeof filteredProps>>((acc, prop) => {
                      (acc[prop.category] = acc[prop.category] || []).push(prop);
                      return acc;
                    }, {})
                  ).map(([category, items]) => (
                    <div key={category} className="space-y-1">
                      <div className="text-[10px] font-semibold text-slate-400 px-2 py-0.5 flex items-center gap-1.5 uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500/70" />
                        <span>{category}</span>
                      </div>
                      <div className="space-y-0.5">
                        {items.map((prop) => (
                          <button
                            key={prop.type}
                            onClick={() => {
                              setPropSubtype(prop.type);
                              setTool('prop');
                              setOpenSubmenu(null);
                              setPropSearch('');
                            }}
                            className={listButtonClass(
                              activePropSubtype === prop.type && activeTool === 'prop'
                            )}
                          >
                            <span className="truncate">{prop.name}</span>
                            {prop.category === 'Weapons & Explosives' ? (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-950/60 text-rose-400 border border-rose-800/40 font-mono">
                                {prop.type === 'bomb' ? 'Explosive' : 'Weapon'}
                              </span>
                            ) : prop.category === 'Documents & Hand Props' ? (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-400 border border-amber-800/40 font-mono">
                                Document
                              </span>
                            ) : (
                              <span className="text-[9px] opacity-50 font-mono">{prop.category.split(' ')[0]}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {filteredProps.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-500">
                      No props match "{propSearch}"
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---- LIGHT FIXTURE FLYOUT ---- */}
            {tool.id === 'light' && openSubmenu === 'light' && (
              <div className={`${flyoutBase} w-72 pb-6`}>
                <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1 mb-1 tracking-wider border-b border-slate-700/50 pb-1.5 flex items-center justify-between">
                  <span>Lighting & Grip Fixtures</span>
                  <span className="font-mono text-[9px] text-amber-400">{filteredLights.length} items</span>
                </div>

                {/* Filter input */}
                <div className="px-1 py-1 mb-1">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={lightSearch}
                      onChange={(e) => setLightSearch(e.target.value)}
                      placeholder="Filter lights (e.g. softbox, tube)..."
                      className={`w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border placeholder:text-slate-500 focus:outline-none focus:border-amber-500 ${
                        isLight ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-slate-800/80 border-slate-700 text-slate-200'
                      }`}
                    />
                  </div>
                </div>

                <div className="space-y-1 py-1">
                  {filteredLights.map((f) => (
                    <button
                      key={f.type}
                      onClick={() => {
                        setLightFixture(f.type);
                        setTool('light');
                        setOpenSubmenu(null);
                        setLightSearch('');
                      }}
                      className={listButtonClass(
                        activeLightFixture === f.type && activeTool === 'light'
                      )}
                    >
                      <span className="flex items-center gap-2 truncate">
                        {f.isFlag ? (
                          <Flag className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        ) : (
                          <FresnelLightIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        )}
                        <span className="truncate">{f.name}</span>
                      </span>
                      <span className="text-[9px] font-mono flex-shrink-0 ml-1.5">
                        {f.type === 'softbox' ? (
                          <span className="px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
                            Softbox
                          </span>
                        ) : f.type === 'tube_light' ? (
                          <span className="px-1.5 py-0.2 rounded bg-sky-950/60 text-sky-300 border border-sky-800/40">
                            Tube
                          </span>
                        ) : f.isFlag ? (
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            Flag
                          </span>
                        ) : (
                          <span className="opacity-50">Light</span>
                        )}
                      </span>
                    </button>
                  ))}
                  {filteredLights.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-500">
                      No fixtures match "{lightSearch}"
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---- SHAPE FLYOUT ---- */}
            {tool.id === 'shape' && openSubmenu === 'shape' && (
              <div className={`${flyoutBase} w-52`}>
                <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1 mb-1">Shapes</div>
                <div className="space-y-1">
                  {SHAPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setShapeType(option.value);
                        setTool('shape');
                        setOpenSubmenu(null);
                      }}
                      className={listButtonClass(activeShapeType === option.value && activeTool === 'shape')}
                    >
                      <span>{option.label}</span>
                      <Circle className="w-3 h-3 opacity-40 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ---- CAMERA RIG FLYOUT ---- */}
            {tool.id === 'camera' && openSubmenu === 'camera' && (
              <div className={`${flyoutBase} w-64`}>
                <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1 mb-1">
                  Camera Rig / Mount
                </div>
                <div className="space-y-1">
                  {CAMERA_RIGS.map((rig) => (
                    <button
                      key={rig.value}
                      onClick={() => {
                        setCameraRig(rig.value);
                        setTool('camera');
                        setOpenSubmenu(null);
                      }}
                      className={listButtonClass(
                        activeCameraRig === rig.value && activeTool === 'camera'
                      )}
                    >
                      <span>{rig.label}</span>
                      <MovieCameraIcon className="w-3 h-3 opacity-40 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ---- CABLE TYPE FLYOUT ---- */}
            {tool.id === 'cable' && openSubmenu === 'cable' && (
              <div className={`${flyoutBase} w-72`}>
                <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1 mb-1 flex items-center justify-between">
                  <span>Signal / Power Cables</span>
                  <span className="font-mono text-[9px] text-cyan-400">
                    {activeCableType}
                  </span>
                </div>
                <div className="space-y-1">
                  {CABLE_TYPES.map((ct) => (
                    <button
                      key={ct.type}
                      onClick={() => {
                        setCableType(ct.type as CableType);
                        setTool('cable');
                        setOpenSubmenu(null);
                      }}
                      className={listButtonClass(
                        activeCableType === ct.type && activeTool === 'cable'
                      )}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className="w-3 h-3 rounded-sm flex-shrink-0 border border-slate-700/50"
                          style={{ backgroundColor: ct.color }}
                        />
                        <span className="truncate">{ct.name}</span>
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono flex-shrink-0 ml-1.5 ${
                          ct.isPower
                            ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {ct.shortLabel}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Overflow: the tools that don't fit on a phone-sized palette */}
      {overflowTools.length > 0 && (
        <div className="relative group">
          <button
            id="tool-btn-more"
            onClick={() => setOpenSubmenu((prev) => (prev === 'overflow' ? null : 'overflow'))}
            aria-expanded={openSubmenu === 'overflow'}
            title="More tools"
            aria-label="More tools"
            className={`${buttonSize} rounded-xl flex items-center justify-center transition-all ${
              overflowTools.some((tool) => tool.id === activeTool)
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                : isLight
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {openSubmenu === 'overflow' && (
            <div className={`${flyoutBase} w-52`}>
              <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1 mb-1">More tools</div>
              <div className="space-y-1">
                {overflowTools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => {
                      setTool(tool.id);
                      // Tools with their own palette open it straight away.
                      setOpenSubmenu(tool.hasSubmenu ? (tool.id as Submenu) : null);
                    }}
                    className={listButtonClass(activeTool === tool.id)}
                  >
                    <span className="flex items-center gap-2">
                      {tool.icon}
                      <span>{tool.label}</span>
                    </span>
                    <span className="text-[10px] opacity-60 font-mono">{tool.shortcut}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Floorplan / Reference Screenshot */}
      <div className="relative group">
        <input
          ref={floorplanInputRef}
          type="file"
          aria-label="Choose floor plan image"
          accept="image/*"
          onChange={handleFloorplanUpload}
          className="hidden"
        />
        <button
          id="tool-btn-upload-floorplan"
          onClick={() => floorplanInputRef.current?.click()}
          title="Upload Floorplan / Screenshot"
          aria-label="Upload Floorplan / Screenshot"
          className={`${buttonSize} rounded-xl flex items-center justify-center transition-all border-t pt-2.5 mt-1 ${
            isLight
              ? 'text-teal-600 hover:text-teal-700 hover:bg-teal-50 border-slate-200'
              : 'text-teal-400 hover:text-teal-300 hover:bg-slate-800 border-slate-800'
          }`}
        >
          <ImagePlus className="w-4 h-4" />
        </button>

        {/* Hover Tooltip */}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 flex items-center gap-1.5">
          <span className="font-medium">Upload Floorplan / Screenshot</span>
        </div>
      </div>
    </aside>
  );
};
