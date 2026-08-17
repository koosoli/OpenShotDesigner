import React, { useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { ActiveTool } from '../../types';
import { PROP_CATALOG } from '../../constants/presets';
import { loadBackgroundImageFile } from '../../utils/image';
import {
  Camera,
  DoorClosed,
  Hand,
  ImagePlus,
  Lightbulb,
  MousePointer,
  MoveHorizontal,
  Ruler,
  BrickWall,
  PanelTop,
  Table,
  Type,
  User,
} from 'lucide-react';

interface ToolItem {
  id: ActiveTool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  hasSubmenu?: boolean;
}

export const LeftToolbar: React.FC = () => {
  const { activeTool, setTool, activePropSubtype, setPropSubtype, theme, addBackgroundImage } = useFloorPlan();
  const [isPropMenuOpen, setIsPropMenuOpen] = useState(false);
  const floorplanInputRef = useRef<HTMLInputElement>(null);

  const handleFloorplanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadBackgroundImageFile(file)
      .then((bg) => addBackgroundImage(bg))
      .catch(() => alert('Could not load the selected image file.'));
    if (floorplanInputRef.current) floorplanInputRef.current.value = '';
  };

  const isLight = theme === 'light';

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
    },
    {
      id: 'light',
      label: 'Light Fixture',
      shortcut: 'L',
      icon: <Lightbulb className="w-4 h-4 text-amber-500" />,
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
      id: 'text',
      label: 'Text Annotation',
      shortcut: 'X',
      icon: <Type className="w-4 h-4 text-slate-400" />,
    },
  ];

  return (
    <aside
      id="left-toolbar"
      className={`relative w-14 border-r flex flex-col items-center py-3 gap-1.5 select-none z-20 transition-colors ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}
    >
      {tools.map((tool) => {
        const isActive = activeTool === tool.id;

        return (
          <div key={tool.id} className="relative group">
            <button
              id={`tool-btn-${tool.id}`}
              onClick={() => {
                setTool(tool.id);
                if (tool.id === 'prop') {
                  setIsPropMenuOpen(!isPropMenuOpen);
                } else {
                  setIsPropMenuOpen(false);
                }
              }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
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
          </div>
        );
      })}

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
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border-t pt-2.5 mt-1 ${
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

      {/* Prop Catalog Flyout Submenu */}
      {isPropMenuOpen && (
        <div className={`absolute left-full top-12 ml-2 w-56 border rounded-xl shadow-2xl p-2.5 z-50 animate-in fade-in slide-in-from-left-1 max-h-[80vh] overflow-y-auto custom-scrollbar ${
          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
        }`}>
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
                  setIsPropMenuOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                  activePropSubtype === prop.type && activeTool === 'prop'
                    ? 'bg-sky-600 text-white font-semibold'
                    : isLight
                    ? 'text-slate-700 hover:bg-slate-100'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{prop.name}</span>
                <span className="text-[10px] opacity-60 font-mono">
                  {prop.category}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};
