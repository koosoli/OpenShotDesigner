import React, { useEffect, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useBreakpoint } from '../../utils/useMediaQuery';
import brandIcon from '../../assets/brand-icon.png';
import { BRANDING } from '../../config/branding';
import { subscribeSaveState, type LibrarySaveState } from '../../utils/projectLibrary';
import { OnSetModeOverlay } from '../onset/OnSetModeOverlay';
import type { ModuleId } from '../../domain/workspace';
import {
  ChevronDown,
  Clapperboard,
  Download,
  Eye,
  FolderOpen,
  History,
  Magnet,
  LayoutGrid,
  MoreHorizontal,
  Moon,
  Plus,
  Printer,
  Redo2,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
} from 'lucide-react';

const WORKSPACE_TAB_MODULES: Array<{ id: ModuleId; label: string }> = [
  { id: 'shots', label: 'Shot list' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'script', label: 'Script' },
  { id: 'moodboard', label: 'Moodboard' },
  { id: 'locations', label: 'Locations' },
  { id: 'schedule', label: 'Schedule & call sheets' },
  { id: 'contacts', label: 'Crew, cast & contacts' },
  { id: 'tasks', label: 'Task board' },
  { id: 'budget', label: 'Budget' },
  { id: 'run_of_show', label: 'Run of show' },
  { id: 'continuity', label: 'Continuity' },
  { id: 'equipment', label: 'Gear & DMX' },
  { id: 'logistics', label: 'Logistics' },
  { id: 'power', label: 'Power' },
  { id: 'rigging', label: 'Rigging' },
];

export const TopNavbar: React.FC = () => {
  const {
    project,
    activeSetup,
    historyIndex,
    historyLength,
    theme,
    toggleTheme,
    undo,
    redo,
    setActiveSetupId,
    addSetup,
    duplicateCurrentSetup,
    deleteSetup,
    updateProjectMeta,
    saveRevision,
    loadTemplateScene,
    loadExampleProductionData,
    loadProjectFromJson,
    setGridSettings,
    openViewfinder,
    openExportModal,
    openDashboard,
    displaySettings,
    updateDisplaySettings,
    isModuleVisible,
    setModuleVisible,
  } = useFloorPlan();

  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  /** Transient confirmation after filling empty modules with examples. */
  const [exampleFillMessage, setExampleFillMessage] = useState<string | null>(null);
  const [isSetupsOpen, setIsSetupsOpen] = useState(false);
  const [isViewingOptionsOpen, setIsViewingOptionsOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  /** On-set / show-day mode overlay (plan §35) — local UI state, not persisted. */
  const [isOnSetMode, setIsOnSetMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isCompact } = useBreakpoint();

  const gridSettings = activeSetup?.gridSettings || { size: 30, snap: true, showGrid: false, unit: 'm', pixelsPerUnit: 30 };

  // Handle Export JSON Project file.
  // Uses a Blob download so projects with many embedded (base64 data-URL)
  // storyboard images export reliably regardless of size.
  const handleExportJson = () => {
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    downloadAnchor.setAttribute('download', `${project.title.toLowerCase().replace(/\s+/g, '_')}_openshotdesigner.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  // Handle Import JSON Project file
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && parsed.setups) {
          loadProjectFromJson(parsed);
        }
      } catch (err) {
        alert(`Invalid ${BRANDING.productName} project file.`);
      }
    };
    reader.readAsText(file);
  };

  const isLight = theme === 'light';

  // Local-first autosave status (plan §5.5): reflects the project library's
  // persistence queue — distinct from shared/collaborative sync state.
  const [saveState, setSaveState] = useState<LibrarySaveState>('idle');
  useEffect(() => subscribeSaveState(setSaveState), []);
  const overflowItemClass = `w-full px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
    isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
  }`;

  return (
    <header
      id="top-navbar"
      className={`${isCompact ? 'h-12 px-2 gap-1.5' : 'h-14 px-4 gap-3'} border-b flex items-center justify-between select-none z-30 transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}
    >
      {/* 1. App Logo & Project Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={openDashboard}
          title="All projects (dashboard)"
          aria-label="All projects (dashboard)"
          className={`p-2 rounded-lg border transition-colors flex-shrink-0 ${
            isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300' : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
<div className="flex items-center gap-2">
            <img
              src={brandIcon}
              alt={BRANDING.productName}
              className="w-8 h-8 rounded-xl object-cover shadow-md shadow-sky-500/20 ring-1 ring-sky-500/30"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-black tracking-widest uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {BRANDING.productName}
                </span>
              </div>
            </div>
          </div>

        <div className={`h-5 w-[1px] hidden sm:block ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />

        {/* Project Title Input */}
        <input
          type="text"
          value={project.title}
          onChange={(e) => updateProjectMeta({ title: e.target.value })}
          className={`text-xs font-semibold px-2 py-1 rounded-lg border border-transparent focus:border-sky-500 focus:outline-none transition-colors max-w-[180px] sm:max-w-xs truncate ${
            isLight ? 'text-slate-800 hover:bg-slate-100 focus:bg-white' : 'text-slate-200 hover:bg-slate-800/60 focus:bg-slate-950'
          }`}
          title="Click to rename project"
        />

        {saveState === 'saving' && (
          <span className={`hidden md:inline text-[10px] font-medium px-1.5 py-0.5 rounded ${isLight ? 'text-amber-600 bg-amber-50' : 'text-amber-300 bg-amber-900/30'}`}>
            Saving…
          </span>
        )}
        {saveState === 'saved' && (
          <span className={`hidden md:inline text-[10px] font-medium px-1.5 py-0.5 rounded ${isLight ? 'text-emerald-600 bg-emerald-50' : 'text-emerald-300 bg-emerald-900/30'}`}>
            Saved locally
          </span>
        )}
        {saveState === 'error' && (
          <span className={`hidden md:inline text-[10px] font-medium px-1.5 py-0.5 rounded ${isLight ? 'text-red-600 bg-red-50' : 'text-red-300 bg-red-900/30'}`}>
            Save failed
          </span>
        )}
      </div>

      {/* 2. Scene / Setup Switcher Dropdown */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setIsSetupsOpen(!isSetupsOpen)}
            aria-expanded={isSetupsOpen}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              isLight ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700/80 border-slate-700 text-slate-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-mono text-sky-500 font-semibold">Scene {activeSetup.sceneNumber}:</span>
            <span className="max-w-[140px] truncate">{activeSetup.name}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>

          {/* Setup Menu Dropdown */}
          {isSetupsOpen && (
            <div className={`absolute top-full left-0 mt-1.5 w-64 border rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-1 ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}>
              <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1">
                Scene Setups ({project.setups.length})
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {project.setups.map((setup) => (
                  <div
                    key={setup.id}
                    className={`w-full px-2 py-1.5 rounded-lg text-xs flex items-center justify-between group transition-colors ${
                      setup.id === activeSetup.id
                        ? 'bg-sky-600 text-white font-semibold'
                        : isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setActiveSetupId(setup.id);
                        setIsSetupsOpen(false);
                      }}
                      className="flex-1 text-left truncate flex items-center gap-1.5"
                    >
                      <span
                        className={`font-mono text-[10px] flex-shrink-0 ${
                          setup.id === activeSetup.id ? 'text-white/80' : 'text-sky-500'
                        }`}
                      >
                        S{setup.sceneNumber || project.setups.indexOf(setup) + 1}
                      </span>
                      <span className="truncate">{setup.name}</span>
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] opacity-75 font-mono">
                        {setup.shots.length} shots
                      </span>
                      {project.setups.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete scene "${setup.name}"? Undo (Ctrl+Z) brings it back.`)) {
                              deleteSetup(setup.id);
                            }
                          }}
                          title="Delete this scene setup"
                          aria-label="Delete this scene setup"
                          className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className={`pt-2 mt-2 border-t flex flex-col gap-1 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                <button
                  onClick={() => {
                    addSetup();
                    setIsSetupsOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1 text-xs text-sky-500 hover:bg-sky-50 dark:hover:bg-slate-800 rounded flex items-center gap-1.5 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ New Scene Setup</span>
                </button>
                <button
                  onClick={() => {
                    duplicateCurrentSetup();
                    setIsSetupsOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1 text-xs rounded ${isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  Duplicate Current Setup
                </button>
                {project.setups.length > 1 && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete current scene "${activeSetup.name}"?`)) {
                        deleteSetup(activeSetup.id);
                        setIsSetupsOpen(false);
                      }
                    }}
                    className="w-full text-left px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/10 rounded flex items-center gap-1.5 font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Current Scene</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Templates Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
            aria-expanded={isTemplatesOpen}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
              isLight ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-300 text-slate-800' : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden md:inline">Templates</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {isTemplatesOpen && (
            <div className={`absolute top-full left-0 mt-1.5 w-72 border rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-1 ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}>
              <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1">
                Educational Presets
              </div>
              <button
                onClick={() => {
                  loadTemplateScene(0);
                  setIsTemplatesOpen(false);
                }}
                className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                  isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                }`}
              >
                <div className="font-semibold text-sky-500">Classic 2-Person Dialogue</div>
                <div className="text-[11px] opacity-70">
                  Shot-Reverse-Shot with Master wide, key/fill lighting, and sofa blocking.
                </div>
              </button>
              <button
                onClick={() => {
                  loadTemplateScene(1);
                  setIsTemplatesOpen(false);
                }}
                className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                  isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                }`}
              >
                <div className="font-semibold text-amber-500">Film Noir Interrogation</div>
                <div className="text-[11px] opacity-70">
                  Dramatic single top light, hard rim light, low angle & Dutch angle coverage.
                </div>
              </button>

              <div className={`mt-1 pt-1 border-t ${isLight ? 'border-slate-200' : 'border-slate-700'}`}>
                <div className="text-[10px] font-bold opacity-60 uppercase px-2 py-1">
                  Example production data
                </div>
                <button
                  onClick={() => {
                    const filled = loadExampleProductionData();
                    setExampleFillMessage(
                      filled.length === 0
                        ? 'Every module already has data — nothing was changed.'
                        : `Added example ${filled.join(', ')}.`,
                    );
                    setIsTemplatesOpen(false);
                  }}
                  className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                    isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold text-emerald-500">Fill empty modules with examples</div>
                  <div className="text-[11px] opacity-70">
                    Crew, shooting days &amp; call sheets, locations, task board, mood board, run of
                    show, logistics, rigging and power — only where this project is still empty.
                    Nothing you already have is touched.
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Confirmation of what the fill actually added; dismissed by click. */}
          {exampleFillMessage && (
            <button
              onClick={() => setExampleFillMessage(null)}
              className={`absolute top-full left-0 mt-1.5 w-72 text-left border rounded-xl shadow-2xl p-2.5 z-50 text-[11px] ${
                isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-emerald-950 border-emerald-800 text-emerald-100'
              }`}
            >
              {exampleFillMessage}
              <span className="block mt-1 opacity-60">Click to dismiss · Ctrl+Z undoes it.</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Undo / Redo & Viewport & Theme Controls */}
      <div className={`flex items-center ${isCompact ? 'gap-1' : 'gap-2'}`}>
        {/* Undo / Redo */}
        <div className={`flex items-center rounded-lg border p-0.5 ${isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-800/80 border-slate-700'}`}>
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl+Z)"
            aria-label="Undo (Ctrl+Z)"
            className="p-1.5 opacity-80 hover:opacity-100 disabled:opacity-30 rounded hover:bg-black/10 dark:hover:bg-slate-700 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= historyLength - 1}
            title="Redo (Ctrl+Y)"
            aria-label="Redo (Ctrl+Y)"
            className="p-1.5 opacity-80 hover:opacity-100 disabled:opacity-30 rounded hover:bg-black/10 dark:hover:bg-slate-700 transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Secondary controls: inline on wide screens, in the overflow menu when narrow */}
        {!isCompact && (
          <>
            {/* Snap to Grid Toggle */}
            <button
              onClick={() => setGridSettings({ snap: !gridSettings.snap })}
              aria-pressed={gridSettings.snap}
              title={gridSettings.snap ? 'Snap to Grid: ON' : 'Snap to Grid: OFF'}
              aria-label="Snap to grid"
              className={`p-2 rounded-lg border transition-colors ${
                gridSettings.snap
                  ? 'bg-sky-500/15 text-sky-500 border-sky-500/40 font-bold'
                  : isLight ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-slate-800/80 text-slate-400 border-slate-700'
              }`}
            >
              <Magnet className="w-3.5 h-3.5" />
            </button>

            {/* Light / Dark Mode Toggle */}
            <button
              id="btn-toggle-theme"
              onClick={toggleTheme}
              title={`Switch to ${isLight ? 'Dark' : 'Light'} Mode`}
              aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
              className={`p-2 rounded-lg border transition-colors ${
                isLight ? 'bg-slate-100 text-amber-600 border-slate-300 hover:bg-slate-200' : 'bg-slate-800/80 text-sky-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {isLight ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            {/* Viewing Options Popover */}
            <div className="relative">
              <button
                onClick={() => setIsViewingOptionsOpen(!isViewingOptionsOpen)}
                aria-expanded={isViewingOptionsOpen}
                title="Viewing options & category opacity"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-sky-400" />
                <span>Viewing Options</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {isViewingOptionsOpen && (
                <div
                  className={`absolute right-0 top-full mt-1.5 w-80 max-h-[calc(100vh-76px)] overflow-y-auto custom-scrollbar border rounded-xl shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-1 space-y-3.5 ${
                    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-500">
                      Viewing & Opacity Controls
                    </span>
                    <button
                      onClick={() => setIsViewingOptionsOpen(false)}
                      title="Close viewing & opacity controls"
                      aria-label="Close viewing & opacity controls"
                      className="text-slate-400 hover:text-slate-200"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Toggles */}
                  <div className="space-y-2 text-xs">
                    {/* Grid toggle */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="font-semibold">Show Canvas Grid</span>
                      <input
                        type="checkbox"
                        checked={displaySettings.showGrid}
                        onChange={(e) => {
                          const val = e.target.checked;
                          updateDisplaySettings({ showGrid: val });
                          setGridSettings({ showGrid: val });
                        }}
                        className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
                      />
                    </label>

                    {/* Snap to grid */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="font-semibold">Snap Objects to Grid</span>
                      <input
                        type="checkbox"
                        checked={gridSettings.snap}
                        onChange={(e) => setGridSettings({ snap: e.target.checked })}
                        className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
                      />
                    </label>

                    {/* Waypoint dialogue/action cues */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="font-semibold">Show Waypoint Cues / Dialogue</span>
                      <input
                        type="checkbox"
                        checked={displaySettings.showWaypointCues === true}
                        onChange={(e) => updateDisplaySettings({ showWaypointCues: e.target.checked })}
                        className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="font-semibold">Show Actor Speech Bubbles</span>
                      <input
                        type="checkbox"
                        checked={displaySettings.showSpeechBubbles === true}
                        onChange={(e) => updateDisplaySettings({ showSpeechBubbles: e.target.checked })}
                        className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
                      />
                    </label>

                    {/* Lined script shot types (WS, CU...) */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="font-semibold">Show Shot Types (WS, CU...) in Script</span>
                      <input
                        type="checkbox"
                        checked={displaySettings.showShotSizeInScript !== false}
                        onChange={(e) => updateDisplaySettings({ showShotSizeInScript: e.target.checked })}
                        className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
                      />
                    </label>

                    {/* Light Label Details Section */}
                    <div className="border-t pt-2 space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Light Label Elements
                      </div>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span>Light Function / Role (Key, Fill...)</span>
                        <input
                          type="checkbox"
                          checked={displaySettings.showLightRoleLabels !== false}
                          onChange={(e) => updateDisplaySettings({ showLightRoleLabels: e.target.checked })}
                          className="rounded accent-sky-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span>Fixture Name / Model</span>
                        <input
                          type="checkbox"
                          checked={displaySettings.showLightNameLabels !== false}
                          onChange={(e) => updateDisplaySettings({ showLightNameLabels: e.target.checked })}
                          className="rounded accent-sky-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span>Color Temp (Kelvin)</span>
                        <input
                          type="checkbox"
                          checked={displaySettings.showLightKelvinLabels === true}
                          onChange={(e) => updateDisplaySettings({ showLightKelvinLabels: e.target.checked })}
                          className="rounded accent-sky-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span>Dim Level (%)</span>
                        <input
                          type="checkbox"
                          checked={displaySettings.showLightIntensityLabels === true}
                          onChange={(e) => updateDisplaySettings({ showLightIntensityLabels: e.target.checked })}
                          className="rounded accent-sky-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="border-t pt-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Workspace tabs
                        </div>
                        <p className="text-[10px] opacity-60 mt-0.5">Project presets are defaults—you can expose any module.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => WORKSPACE_TAB_MODULES.forEach((module) => setModuleVisible(module.id, true))}
                        className="px-2 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold whitespace-nowrap"
                      >
                        Show all
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {WORKSPACE_TAB_MODULES.map((module) => (
                        <label key={module.id} className="flex items-center gap-2 cursor-pointer text-[11px] min-w-0">
                          <input
                            type="checkbox"
                            checked={isModuleVisible(module.id)}
                            onChange={(event) => setModuleVisible(module.id, event.target.checked)}
                            className="rounded accent-sky-500 w-3.5 h-3.5 cursor-pointer flex-shrink-0"
                          />
                          <span className="truncate">{module.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Category Opacity Sliders */}
                  <div className="border-t pt-2.5 space-y-2.5">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Category Opacity Sliders
                    </div>

                    {[
                      { key: 'actors', label: 'Actors & Talent' },
                      { key: 'cameras', label: 'Cameras & Cones' },
                      { key: 'lights', label: 'Lights & Beams' },
                      { key: 'props', label: 'Props & Furniture' },
                      { key: 'architecture', label: 'Walls & Doors' },
                      { key: 'shapes', label: 'Basic Shapes' },
                    ].map(({ key, label }) => {
                      const currentVal = Math.round(
                        ((displaySettings.categoryOpacity as any)?.[key] ?? 1.0) * 100
                      );
                      return (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-[11px] font-medium">
                            <span>{label}</span>
                            <span className="font-mono text-sky-400">{currentVal}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={currentVal}
                            onChange={(e) => {
                              const val = Number(e.target.value) / 100;
                              updateDisplaySettings({
                                categoryOpacity: {
                                  ...displaySettings.categoryOpacity,
                                  [key]: val,
                                },
                              });
                            }}
                            className="w-full accent-sky-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Viewfinder Button */}
            <button
              onClick={() => openViewfinder()}
              title="Simulate Camera Viewfinder"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-sky-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-sky-300'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-sky-500" />
              <span className="hidden lg:inline">Viewfinder</span>
            </button>
          </>
        )}

        {/* Export / Call Sheet Print Button - always reachable */}
        <button
          id="btn-open-export"
          onClick={() => openExportModal()}
          title="Export & Print Studio"
          aria-label="Open the export and print studio"
          className={`flex items-center gap-1.5 ${isCompact ? 'px-2 py-1.5' : 'px-3 py-1.5'} bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm`}
        >
          <Printer className="w-3.5 h-3.5" />
          {!isCompact && <span>Export Plan</span>}
        </button>

        {!isCompact && (
          <>
            {/* Save JSON Backup Button */}
            <button
              onClick={handleExportJson}
              title="Save & Download Project JSON"
              aria-label="Save & Download Project JSON"
              className={`p-2 rounded-lg border transition-colors ${
                isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300' : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              title="Open / Import Project JSON"
              aria-label="Open / Import Project JSON"
              className={`p-2 rounded-lg border transition-colors ${
                isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300' : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {/* Hidden Import File Input (shared by both layouts) */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportJson}
          className="hidden"
        />

        {/* Overflow menu for narrow screens */}
        {isCompact && (
          <div className="relative">
            <button
              onClick={() => setIsOverflowOpen((open) => !open)}
              title="More controls"
              aria-expanded={isOverflowOpen}
              aria-label="More controls"
              className={`p-2 rounded-lg border transition-colors ${
                isLight ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-800/80 text-slate-300 border-slate-700'
              }`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isOverflowOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsOverflowOpen(false)} />
                <div className={`absolute right-0 top-full mt-1.5 w-52 border rounded-xl shadow-2xl p-1.5 z-50 space-y-0.5 ${
                  isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}>
                  <button
                    onClick={() => {
                      openDashboard();
                      setIsOverflowOpen(false);
                    }}
                    className={overflowItemClass}
                  >
                    <span className="flex items-center gap-2"><LayoutGrid className="w-3.5 h-3.5" /> All projects</span>
                  </button>
                  <button
                    onClick={() => {
                      const name = window.prompt(
                        'Name this revision',
                        `Revision ${(project.revisions?.length || 0) + 1}`
                      );
                      if (name === null) return;
                      const note = window.prompt('Optional note (cancel to skip)');
                      saveRevision(name, note ?? undefined);
                      setIsOverflowOpen(false);
                    }}
                    className={overflowItemClass}
                  >
                    <span className="flex items-center gap-2"><History className="w-3.5 h-3.5" /> Save revision…</span>
                  </button>
                  <button
                    onClick={() => {
                      setGridSettings({ snap: !gridSettings.snap });
                      setIsOverflowOpen(false);
                    }}
                    className={overflowItemClass}
                  >
                    <span className="flex items-center gap-2"><Magnet className="w-3.5 h-3.5" /> Snap to grid</span>
                    <span className="text-[10px] font-mono opacity-70">{gridSettings.snap ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setGridSettings({
                        unit: gridSettings.unit === 'm' ? 'ft' : 'm',
                        pixelsPerUnit: gridSettings.unit === 'm' ? 25 : 30,
                      });
                      setIsOverflowOpen(false);
                    }}
                    className={overflowItemClass}
                  >
                    <span>Grid units</span>
                    <span className="text-[10px] font-mono opacity-70">{gridSettings.unit.toUpperCase()}</span>
                  </button>
                  <button
                    onClick={() => {
                      toggleTheme();
                      setIsOverflowOpen(false);
                    }}
                    className={overflowItemClass}
                  >
                    <span className="flex items-center gap-2">
                      {isLight ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />} Theme
                    </span>
                    <span className="text-[10px] opacity-70">{isLight ? 'Light' : 'Dark'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsOnSetMode(true);
                      setIsOverflowOpen(false);
                    }}
                    className={overflowItemClass}
                  >
                    <span className="flex items-center gap-2"><Clapperboard className="w-3.5 h-3.5 text-emerald-500" /> Live shot tracker</span>
                  </button>
                  <button
                    onClick={() => {
                      openViewfinder();
                      setIsOverflowOpen(false);
                    }}
                    className={overflowItemClass}
                  >
                    <span className="flex items-center gap-2"><Eye className="w-3.5 h-3.5 text-sky-500" /> Viewfinder</span>
                  </button>
                  <button
                    onClick={() => {
                      handleExportJson();
                      setIsOverflowOpen(false);
                    }}
                    className={overflowItemClass}
                  >
                    <span className="flex items-center gap-2"><Download className="w-3.5 h-3.5" /> Save project file</span>
                  </button>
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setIsOverflowOpen(false);
                    }}
                    className={overflowItemClass}
                  >
                    <span className="flex items-center gap-2"><FolderOpen className="w-3.5 h-3.5" /> Open project file</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {isOnSetMode && <OnSetModeOverlay onClose={() => setIsOnSetMode(false)} />}
    </header>
  );
};
