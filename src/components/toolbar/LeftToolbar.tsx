import React, { useLayoutEffect, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { ActiveTool, ShapeType } from '../../types';
import { CAMERA_RIGS, LIGHT_FIXTURES, PROP_CATALOG } from '../../constants/presets';
import { loadBackgroundImageFile } from '../../utils/image';
import { useBreakpoint } from '../../utils/useMediaQuery';
import {
  Camera,
  DoorClosed,
  Flag,
  Hand,
  ImagePlus,
  Lightbulb,
  MousePointer,
  MoveHorizontal,
  MoveUpRight,
  Circle,
  Ruler,
  Search,
  BrickWall,
  PanelTop,
  Table,
  Type,
  User,
  MoreHorizontal,
} from 'lucide-react';

interface ToolItem {
  id: ActiveTool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  hasSubmenu?: boolean;
}

type Submenu = 'prop' | 'light' | 'camera' | 'shape' | 'overflow';

const SHAPE_OPTIONS: { value: ShapeType; label: string }[] = [
  { value: 'rectangle', label: 'Rectangle' },
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

export const LeftToolbar: React.FC = () => {
  const {
    activeTool,
    setTool,
    activePropSubtype,
    setPropSubtype,
    activeLightFixture,
    setLightFixture,
    activeCameraRig,
    setCameraRig,
    activeShapeType,
    setShapeType,
    setQuickSearchOpen,
    theme,
    addBackgroundImage,
  } = useFloorPlan();
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
      .catch(() => alert('Could not load the selected image file.'));
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
    if (tool.hasSubmenu) {
      setOpenSubmenu((prev) => (prev === tool.id ? null : (tool.id as Submenu)));
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
      icon: <Camera className="w-4 h-4 text-sky-500" />,
      hasSubmenu: true,
    },
    {
      id: 'light',
      label: 'Light Fixture',
      shortcut: 'L',
      icon: <Lightbulb className="w-4 h-4 text-amber-500" />,
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
      icon: <PanelTop className="w-4 h-4 text-sky-500" />,
    },
    {
      id: 'prop',
      label: 'Furniture & Props',
      shortcut: 'P',
      icon: <Table className="w-4 h-4 text-purple-500" />,
      hasSubmenu: true,
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
      id: 'text',
      label: 'Text Annotation',
      shortcut: 'X',
      icon: <Type className="w-4 h-4 text-slate-400" />,
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

  const flyoutBase = `absolute left-full top-0 ml-2 border rounded-xl shadow-2xl p-2.5 z-50 animate-in fade-in slide-in-from-left-1 max-h-[80vh] overflow-y-auto custom-scrollbar ${
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

  return (
    <aside
      id="left-toolbar"
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
          <div key={tool.id} className="relative group">
            <button
              id={`tool-btn-${tool.id}`}
              onClick={() => toggleSubmenu(tool)}
              title={`${tool.label} (${tool.shortcut})`}
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
            {tool.id === 'prop' && openSubmenu === 'prop' && (
              <div className={`${flyoutBase} w-56`}>
                <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1 mb-1">
                  Props & Set Dressing
                </div>
                <div className="space-y-1">
                  {PROP_CATALOG.map((prop) => (
                    <button
                      key={prop.type}
                      onClick={() => {
                        setPropSubtype(prop.type);
                        setTool('prop');
                        setOpenSubmenu(null);
                      }}
                      className={listButtonClass(
                        activePropSubtype === prop.type && activeTool === 'prop'
                      )}
                    >
                      <span>{prop.name}</span>
                      <span className="text-[10px] opacity-60 font-mono">{prop.category}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ---- LIGHT FIXTURE FLYOUT ---- */}
            {tool.id === 'light' && openSubmenu === 'light' && (
              <div className={`${flyoutBase} w-64`}>
                <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1 mb-1">
                  Light Fixtures
                </div>
                <div className="space-y-1">
                  {LIGHT_FIXTURES.map((f) => (
                    <button
                      key={f.type}
                      onClick={() => {
                        setLightFixture(f.type);
                        setTool('light');
                        setOpenSubmenu(null);
                      }}
                      className={listButtonClass(
                        activeLightFixture === f.type && activeTool === 'light'
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {f.isFlag ? (
                          <Flag className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        <span>{f.name}</span>
                      </span>
                      <span className="text-[10px] opacity-60 font-mono">
                        {f.isFlag ? 'Flag' : 'Light'}
                      </span>
                    </button>
                  ))}
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
                      <Camera className="w-3 h-3 opacity-40 flex-shrink-0" />
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
            title="More tools"
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
          accept="image/*"
          onChange={handleFloorplanUpload}
          className="hidden"
        />
        <button
          id="tool-btn-upload-floorplan"
          onClick={() => floorplanInputRef.current?.click()}
          title="Upload Floorplan / Screenshot"
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