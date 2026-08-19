import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { FloorPlanElement } from '../../types';
import { CAMERA_RIGS, LIGHT_FIXTURES, PROP_CATALOG } from '../../constants/presets';
import {
  BrickWall,
  Camera,
  DoorClosed,
  Flag,
  Lightbulb,
  MoveHorizontal,
  MoveUpRight,
  PanelTop,
  Ruler,
  Search,
  Table,
  Type,
  User,
  X,
} from 'lucide-react';

interface QuickAsset {
  id: string;
  label: string;
  keywords: string;
  group: string;
  icon: React.ReactNode;
  buildPartial: () => Partial<FloorPlanElement> & { type: FloorPlanElement['type'] };
}

const ACTOR_ICON = <User className="w-4 h-4 text-emerald-500" />;
const CAMERA_ICON = <Camera className="w-4 h-4 text-sky-500" />;
const LIGHT_ICON = <Lightbulb className="w-4 h-4 text-amber-500" />;
const FLAG_ICON = <Flag className="w-4 h-4 text-slate-400" />;

function buildAssetList(): QuickAsset[] {
  const assets: QuickAsset[] = [];

  // Props & set dressing
  PROP_CATALOG.forEach((p) => {
    assets.push({
      id: `prop-${p.type}`,
      label: p.name,
      keywords: `${p.name} ${p.category} prop furniture set`,
      group: 'Props & Set Dressing',
      icon: <Table className="w-4 h-4 text-purple-500" />,
      buildPartial: () => ({ type: 'prop', propType: p.type } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }),
    });
  });

  // Light fixtures (incl. C-stand flags)
  LIGHT_FIXTURES.forEach((f) => {
    assets.push({
      id: `light-${f.type}`,
      label: f.name,
      keywords: `${f.name} ${f.isFlag ? 'flag light control diffuser negative fill' : 'light lamp luminaire'}`,
      group: 'Light Fixtures',
      icon: f.isFlag ? FLAG_ICON : LIGHT_ICON,
      buildPartial: () => ({ type: 'light', fixtureType: f.type } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }),
    });
  });

  // Cameras & rigs
  CAMERA_RIGS.forEach((rig) => {
    assets.push({
      id: `camera-${rig.value}`,
      label: `Camera — ${rig.label}`,
      keywords: `camera shot ${rig.label} ${rig.value} rig`,
      group: 'Cameras & Rigs',
      icon: CAMERA_ICON,
      buildPartial: () => ({ type: 'camera', rigType: rig.value } as Partial<FloorPlanElement> & { type: FloorPlanElement['type'] }),
    });
  });

  // Generic elements
  const generic: QuickAsset[] = [
    {
      id: 'actor',
      label: 'Actor / Talent',
      keywords: 'actor talent character person performer',
      group: 'Elements',
      icon: ACTOR_ICON,
      buildPartial: () => ({ type: 'actor' }),
    },
    {
      id: 'wall',
      label: 'Wall / Room',
      keywords: 'wall room architecture set build',
      group: 'Elements',
      icon: <BrickWall className="w-4 h-4 text-amber-600" />,
      buildPartial: () => ({ type: 'wall' }),
    },
    {
      id: 'door',
      label: 'Door',
      keywords: 'door entrance doorway',
      group: 'Elements',
      icon: <DoorClosed className="w-4 h-4 text-amber-500" />,
      buildPartial: () => ({ type: 'door' }),
    },
    {
      id: 'window',
      label: 'Window',
      keywords: 'window glass opening',
      group: 'Elements',
      icon: <PanelTop className="w-4 h-4 text-sky-500" />,
      buildPartial: () => ({ type: 'window' }),
    },
    {
      id: 'track',
      label: 'Dolly Track',
      keywords: 'dolly track camera movement rail',
      group: 'Elements',
      icon: <MoveHorizontal className="w-4 h-4 text-blue-500" />,
      buildPartial: () => ({ type: 'track' }),
    },
    {
      id: 'measure',
      label: 'Tape Measure',
      keywords: 'measure distance tape measurement ruler',
      group: 'Elements',
      icon: <Ruler className="w-4 h-4 text-yellow-500" />,
      buildPartial: () => ({ type: 'measurement' }),
    },
    {
      id: 'text',
      label: 'Text Annotation',
      keywords: 'text note label annotation comment',
      group: 'Elements',
      icon: <Type className="w-4 h-4 text-slate-400" />,
      buildPartial: () => ({ type: 'text' }),
    },
    {
      id: 'arrow',
      label: 'Arrow / Direction',
      keywords: 'arrow direction movement blocking flow annotation',
      group: 'Elements',
      icon: <MoveUpRight className="w-4 h-4 text-orange-500" />,
      buildPartial: () => ({ type: 'arrow' }),
    },
  ];
  assets.push(...generic);

  return assets;
}

const ALL_ASSETS = buildAssetList();

export const QuickAssetSearch: React.FC = () => {
  const { quickSearchOpen, setQuickSearchOpen, quickAddElement, theme } = useFloorPlan();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isLight = theme === 'light';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_ASSETS;
    return ALL_ASSETS.filter((a) => (a.label + ' ' + a.keywords).toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, quickSearchOpen]);

  // Autofocus the search box whenever the palette opens.
  useEffect(() => {
    if (quickSearchOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [quickSearchOpen]);

  const place = (asset: QuickAsset) => {
    quickAddElement(asset.buildPartial());
    setQuickSearchOpen(false);
    setQuery('');
  };

  // Global hotkeys: Shift+Space opens the palette from anywhere; while open,
  // arrows / Enter / Escape drive it. Runs in the capture phase so it wins
  // over the canvas' own space/pan shortcut handling.
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

      // Don't let other app shortcuts fire while the palette is open.
      if (e.target === inputRef.current) {
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [quickSearchOpen, filtered, selectedIndex]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!quickSearchOpen) return null;

  let lastGroup: string | null = null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center" onPointerDown={() => setQuickSearchOpen(false)}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />

      <div
        onPointerDown={(e) => e.stopPropagation()}
        className={`relative mt-20 w-[440px] max-w-[92vw] rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 ${
          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
        }`}
      >
        {/* Header / Search input */}
        <div className={`flex items-center gap-2 px-3.5 py-2.5 border-b ${
          isLight ? 'border-slate-200' : 'border-slate-700/60'
        }`}>
          <Search className={`w-4 h-4 flex-shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets… (Arrow keys to navigate, Enter to place, Esc to close)"
            className={`flex-1 bg-transparent outline-none text-sm placeholder:opacity-50 ${
              isLight ? 'text-slate-900 placeholder:text-slate-400' : 'text-slate-100 placeholder:text-slate-500'
            }`}
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border opacity-60 flex-shrink-0 ${
            isLight ? 'border-slate-300 text-slate-500' : 'border-slate-600 text-slate-400'
          }">
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

        {/* Results */}
        <div
          ref={listRef}
          className={`max-h-[55vh] overflow-y-auto custom-scrollbar ${isLight ? 'bg-white' : 'bg-slate-900'}`}
        >
          {filtered.length === 0 ? (
            <div className={`px-4 py-10 text-center text-sm opacity-60 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              No assets match “{query}”
            </div>
          ) : (
            filtered.map((asset, idx) => {
              const showGroup = asset.group !== lastGroup;
              lastGroup = asset.group;
              const active = idx === selectedIndex;
              return (
                <div key={asset.id}>
                  {showGroup && (
                    <div className={`sticky top-0 z-10 px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-800/95 text-slate-400'
                    }`}>
                      {asset.group}
                    </div>
                  )}
                  <button
                    data-idx={idx}
                    onPointerEnter={() => setSelectedIndex(idx)}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      place(asset);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 text-left text-sm transition-colors ${
                      active
                        ? isLight
                          ? 'bg-sky-100 text-sky-900'
                          : 'bg-sky-600/20 text-sky-100'
                        : isLight
                        ? 'text-slate-700 hover:bg-slate-50'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex-shrink-0">{asset.icon}</span>
                    <span className="flex-1 truncate">{asset.label}</span>
                    {active && <span className="text-[10px] font-mono opacity-60 flex-shrink-0">↵</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className={`px-3.5 py-1.5 border-t text-[10px] opacity-60 ${
          isLight ? 'border-slate-200 text-slate-500' : 'border-slate-700/60 text-slate-400'
        }`}>
          Picks the tool & places the asset at the center of the visible canvas. Drag to reposition.
        </div>
      </div>
    </div>
  );
};