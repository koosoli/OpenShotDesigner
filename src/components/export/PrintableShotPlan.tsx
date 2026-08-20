import React, { useEffect, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  ActorElement,
  ArrowElement,
  BackgroundImage,
  CameraElement,
  DoorElement,
  FloorPlanElement,
  LightElement,
  MeasurementElement,
  PropElement,
  ShapeElement,
  TextElement,
  TrackElement,
  WallElement,
  WindowElement,
} from '../../types';
import { getCameraFovPolygon, getLightBeamPolygon, getSmoothSplinePath, kelvinToRgb } from '../../utils/geometry';
import { ASPECT_RATIOS, LIGHT_FIXTURES, LIGHT_ROLES } from '../../constants/presets';
import { exportProjectToCsv, exportShotListToCsv } from '../../utils/exportShotList';
import { exportSvgAsPng } from '../../utils/exportFloorPlanPng';
import { FlagFixtureIcon, flagLabel, isFlagFixture } from '../canvas/FlagFixtureIcon';
import { FixtureGlyph } from '../canvas/FixtureGlyph';
import { ArrowGlyph } from '../canvas/ArrowGlyph';
import { ShapesLayer } from '../canvas/ShapesLayer';
import { LinedScriptPage, linedExcerpt } from '../script/LinedScriptPage';
import { orderedStoryboardShots } from '../../utils/storyboardOrder';
import { slotsOf } from '../../utils/storyboardFrames';
import {
  AppWindow,
  ArrowRight,
  Camera,
  DoorClosed,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  MapPin,
  Maximize2,
  Printer,
  Sparkles,
  Sun,
  User,
  Video,
  X,
} from 'lucide-react';
import type { DisplaySettings } from '../../context/FloorPlanContext';

export const PrintableShotPlan: React.FC = () => {
  const {
    project,
    activeSetup,
    isExportModalOpen,
    closeExportModal,
    exportSection,
    setExportSection,
    scriptLines,
    allScriptMarks,
    allShots,
    avScriptRows,
    scriptFormatMode,
    displaySettings,
  } = useFloorPlan();
  const [pngScale, setPngScale] = useState<2 | 3>(2);
  const [showStoryboards, setShowStoryboards] = useState(false);
  const [exportViewMode, setExportViewMode] = useState<'full' | 'canvas'>('full');
  const [customOverrides, setCustomOverrides] = useState<Partial<DisplaySettings>>({});

  // When the export opens, default the storyboard toggle ON if any shot has a
  // storyboard attached (still fully toggleable off/on by the user).
  useEffect(() => {
    if (isExportModalOpen) {
      setShowStoryboards(activeSetup.shots.some((s) => !!s.storyboardImage));
    }
  }, [isExportModalOpen, activeSetup]);

  // Derived effective display settings for the blueprint export
  const eff = React.useMemo(() => {
    if (exportViewMode === 'full') {
      return {
        showFovCones: true,
        showLightBeams: true,
        showLabels: true,
        showActorLabels: true,
        showCameraLabels: true,
        showPropLabels: true,
        showTrackLabels: true,
        showLightLabels: true,
        showLightNameLabels: true,
        showLightRoleLabels: true,
        showLightKelvinLabels: true,
        showLightIntensityLabels: true,
        showMeasurementLabels: true,
        showDoorWindowLabels: true,
        showShotSizeInScript: true,
        showShotSizeOnCamera: true,
        showShotLensOnCamera: true,
        showShotAngleOnCamera: true,
        showShotNumberOnCamera: true,
        showLensFovLabel: true,
        showWaypoints: true,
        showWaypointCues: true,
        showStoryboardThumbs: showStoryboards,
        showGrid: true,
        labelOpacity: 1,
        labelCategoryOpacity: {
          cameras: 1,
          actors: 1,
          lights: 1,
          props: 1,
          tracks: 1,
          doorWindows: 1,
          measurements: 1,
        },
        categoryOpacity: {
          cameras: 1,
          actors: 1,
          lights: 1,
          props: 1,
          walls: 1,
          tracks: 1,
          storyboards: 1,
          measurements: 1,
        },
        ...customOverrides,
      };
    } else {
      // 'canvas' mode: mirrors current active workspace canvas toggles
      return {
        showFovCones: displaySettings.showFovCones !== false,
        showLightBeams: displaySettings.showLightBeams !== false,
        showLabels: displaySettings.showLabels !== false,
        showActorLabels: displaySettings.showActorLabels !== false,
        showCameraLabels: displaySettings.showCameraLabels !== false,
        showPropLabels: displaySettings.showPropLabels !== false,
        showTrackLabels: displaySettings.showTrackLabels !== false,
        showLightLabels: displaySettings.showLightLabels !== false,
        showLightNameLabels: displaySettings.showLightNameLabels !== false,
        showLightRoleLabels: displaySettings.showLightRoleLabels !== false,
        showLightKelvinLabels: displaySettings.showLightKelvinLabels === true,
        showLightIntensityLabels: displaySettings.showLightIntensityLabels === true,
        showMeasurementLabels: displaySettings.showMeasurementLabels !== false,
        showDoorWindowLabels: displaySettings.showDoorWindowLabels !== false,
        showShotSizeInScript: displaySettings.showShotSizeInScript !== false,
        showShotSizeOnCamera: displaySettings.showShotSizeOnCamera === true,
        showShotLensOnCamera: displaySettings.showShotLensOnCamera === true,
        showShotAngleOnCamera: displaySettings.showShotAngleOnCamera === true,
        showShotNumberOnCamera: displaySettings.showShotNumberOnCamera !== false,
        showLensFovLabel: displaySettings.showLensFovLabel === true,
        showWaypoints: displaySettings.showWaypoints !== false,
        showWaypointCues: displaySettings.showWaypointCues === true,
        showStoryboardThumbs: showStoryboards && (displaySettings.showStoryboardThumbs !== false),
        showGrid: displaySettings.showGrid === true,
        labelOpacity: displaySettings.labelOpacity ?? 1,
        labelCategoryOpacity: displaySettings.labelCategoryOpacity || {
          cameras: 1,
          actors: 1,
          lights: 1,
          props: 1,
          tracks: 1,
          doorWindows: 1,
          measurements: 1,
        },
        categoryOpacity: displaySettings.categoryOpacity || {
          cameras: 1,
          actors: 1,
          lights: 1,
          props: 1,
          walls: 1,
          tracks: 1,
          storyboards: 1,
          measurements: 1,
        },
        ...customOverrides,
      };
    }
  }, [exportViewMode, displaySettings, showStoryboards, customOverrides]);

  const toggleOverride = (key: keyof DisplaySettings, defaultVal: boolean) => {
    setCustomOverrides((prev) => {
      const current = key in prev ? !!prev[key] : (eff as any)[key] ?? defaultVal;
      return { ...prev, [key]: !current };
    });
  };

  // A lined script prints the covered material by default; the full screenplay
  // is one click away.
  const [scriptScope, setScriptScope] = useState<'lined' | 'full'>('lined');
  const floorPlanSvgRef = useRef<SVGSVGElement>(null);

  if (!isExportModalOpen) return null;

  const cameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
  const lights = activeSetup.elements.filter((e) => e.type === 'light') as LightElement[];
  const actors = activeSetup.elements.filter((e) => e.type === 'actor') as ActorElement[];
  const walls = activeSetup.elements.filter((e) => e.type === 'wall') as WallElement[];
  const doors = activeSetup.elements.filter((e) => e.type === 'door') as DoorElement[];
  const windows = activeSetup.elements.filter((e) => e.type === 'window') as WindowElement[];
  const props = activeSetup.elements.filter((e) => e.type === 'prop') as PropElement[];
  const tracks = activeSetup.elements.filter((e) => e.type === 'track') as TrackElement[];
  const measurements = activeSetup.elements.filter((e) => e.type === 'measurement') as MeasurementElement[];
  const texts = activeSetup.elements.filter((e) => e.type === 'text') as TextElement[];
  const arrows = activeSetup.elements.filter((e) => e.type === 'arrow') as ArrowElement[];
  const shapes = activeSetup.elements.filter((e) => e.type === 'shape') as ShapeElement[];
  const backgroundImages = (activeSetup.backgroundImages || []).filter((i) => i.visible) as BackgroundImage[];
  const sceneAspectRatio =
    ASPECT_RATIOS.find((a) => a.value === (activeSetup.aspectRatio || '16:9'))?.ratio || 16 / 9;

  // Default export scope: only the screenplay the user actually lined.
  const printedScriptLines =
    scriptScope === 'full' ? scriptLines : linedExcerpt(scriptLines, allScriptMarks);

  const handlePrint = () => {
    window.print();
  };

  // Calculate bounding box of all elements to auto-fit printable blueprint
  let minX = 100, minY = 100, maxX = 900, maxY = 600;
  if (activeSetup.elements.length > 0) {
    minX = Math.min(...activeSetup.elements.map((e) => e.x)) - 60;
    minY = Math.min(...activeSetup.elements.map((e) => e.y)) - 60;
    maxX = Math.max(...activeSetup.elements.map((e) => (e as any).x2 || e.x + ((e as any).width || 80))) + 60;
    maxY = Math.max(...activeSetup.elements.map((e) => (e as any).y2 || e.y + ((e as any).height || 80))) + 60;

    // Blocking beats live away from the element itself — keep them in frame
    activeSetup.elements.forEach((element) => {
      ((element as any).path || []).forEach((wp: { x: number; y: number }) => {
        minX = Math.min(minX, wp.x - 60);
        minY = Math.min(minY, wp.y - 60);
        maxX = Math.max(maxX, wp.x + 60);
        maxY = Math.max(maxY, wp.y + 60);
      });
    });
  }
  for (const img of backgroundImages) {
    minX = Math.min(minX, img.x - 20);
    minY = Math.min(minY, img.y - 20);
    maxX = Math.max(maxX, img.x + img.width + 20);
    maxY = Math.max(maxY, img.y + img.height + 20);
  }
  if (showStoryboards) {
    for (const shot of activeSetup.shots) {
      const cam = cameras.find((c) => c.id === shot.cameraId);
      if (!cam) continue;
      slotsOf(shot, cam).forEach((slot, index) => {
        if (!slot.frame?.image) return;
        const pos =
          slot.frame.canvasPosition || { x: slot.anchor.x + 110, y: slot.anchor.y - 60 + index * 20 };
        minX = Math.min(minX, pos.x - 60);
        minY = Math.min(minY, pos.y - 60);
        maxX = Math.max(maxX, pos.x + 60);
        maxY = Math.max(maxY, pos.y + 60);
      });
    }
  }
  const viewBoxWidth = Math.max(800, maxX - minX);
  const viewBoxHeight = Math.max(500, maxY - minY);

  return (
    <div
      id="export-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 select-none animate-in fade-in"
    >
      <div className="relative w-full max-w-5xl bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        {/* Top Control Bar (Hidden when printing) */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3.5 bg-slate-900 text-white border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                Export & Print Studio
              </h3>
              <p className="text-xs text-slate-400">
                Ink-saving high-contrast white layout for production printing and call sheets.
              </p>
            </div>
          </div>

          {/* Section Mode Toggle: Floor Plan Only, Shot List Only, Combined */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
              <button
                onClick={() => setExportSection('floorplan')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exportSection === 'floorplan'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Floor Plan Blueprint
              </button>
              <button
                onClick={() => setExportSection('shotlist')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exportSection === 'shotlist'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Shot List Only
              </button>
              <button
                onClick={() => setExportSection('storyboard')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exportSection === 'storyboard'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Storyboard
              </button>
              <button
                onClick={() => setExportSection('linedscript')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exportSection === 'linedscript'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Lined Script
              </button>
              <button
                onClick={() => setExportSection('combined')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exportSection === 'combined'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Complete Package
              </button>
            </div>

            {/* Quick Actions: PNG, Print, CSV, Close */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>

            {(exportSection === 'floorplan' || exportSection === 'combined') && (
              <div className="flex items-center gap-1">
                <select
                  value={pngScale}
                  onChange={(e) => setPngScale(Number(e.target.value) as 2 | 3)}
                  title="PNG resolution"
                  className="px-1.5 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                </select>
                <button
                  onClick={() => {
                    if (floorPlanSvgRef.current) {
                      exportSvgAsPng(floorPlanSvgRef.current, {
                        scale: pngScale,
                        logo: project.logo,
                        fileName: `FloorPlan_Scene_${activeSetup.sceneNumber || '1'}_${activeSetup.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
                        title: project.title,
                        subtitle: `SCENE ${activeSetup.sceneNumber}: ${activeSetup.name}`,
                        meta: [
                          `DATE: ${project.date || new Date().toISOString().split('T')[0]}`,
                          `DIR: ${project.director || '—'}`,
                          `DP: ${project.cinematographer || '—'}`,
                          `${activeSetup.location} (${activeSetup.timeOfDay})`,
                        ],
                      });
                    }
                  }}
                  title="Download Floor Plan as PNG image"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>PNG</span>
                </button>
              </div>
            )}

            {(exportSection === 'shotlist' || exportSection === 'combined') && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => exportShotListToCsv(activeSetup, project.title)}
                  title="Download this scene's shot list as Excel / CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>CSV</span>
                </button>
                <button
                  onClick={() => exportProjectToCsv(project)}
                  title="Download the whole project (all scenes) as Excel / CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>All Scenes</span>
                </button>
              </div>
            )}

            {/* Storyboards toggle: controls thumbnails on the blueprint AND in the shot list */}
            <button
              onClick={() => setShowStoryboards((prev) => !prev)}
              title={showStoryboards ? 'Hide storyboard thumbnails' : 'Show storyboard thumbnails on the floor plan and in the shot list'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                showStoryboards
                  ? 'bg-violet-600 text-white border-violet-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${
                  showStoryboards ? 'bg-white text-violet-700 border-white' : 'border-slate-500'
                }`}
              >
                {showStoryboards ? '✓' : ''}
              </span>
              Storyboards
            </button>

            <button
              onClick={closeExportModal}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Floor Plan Layer Customization Bar (Hidden when printing) */}
        {(exportSection === 'floorplan' || exportSection === 'combined') && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2 bg-slate-950 text-white border-b border-slate-800 text-xs print:hidden">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Blueprint Mode:
              </span>
              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => {
                    setExportViewMode('full');
                    setCustomOverrides({});
                  }}
                  title="Everything Turned ON: all camera cones, light beams, labels, Kelvin, dim %, blocking waypoints and cues"
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    exportViewMode === 'full' && Object.keys(customOverrides).length === 0
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Full Blueprint (All ON)</span>
                </button>
                <button
                  onClick={() => {
                    setExportViewMode('canvas');
                    setCustomOverrides({});
                  }}
                  title="As Shown on Canvas: exactly matches your active floor plan workspace display toggles"
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    exportViewMode === 'canvas' && Object.keys(customOverrides).length === 0
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>As Shown on Canvas</span>
                </button>
              </div>
            </div>

            {/* Quick Layer Toggles */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Layer Overrides:</span>
              <button
                type="button"
                onClick={() => toggleOverride('showFovCones', true)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showFovCones
                    ? 'bg-sky-950 text-sky-300 border-sky-600/60'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                FOV Cones
              </button>
              <button
                type="button"
                onClick={() => toggleOverride('showLightBeams', true)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showLightBeams
                    ? 'bg-amber-950 text-amber-300 border-amber-600/60'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                Light Beams
              </button>
              <button
                type="button"
                onClick={() => toggleOverride('showLabels', true)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showLabels
                    ? 'bg-slate-800 text-slate-200 border-slate-600'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                Labels
              </button>
              <button
                type="button"
                onClick={() => {
                  const curr = eff.showLightKelvinLabels && eff.showLightIntensityLabels;
                  setCustomOverrides((prev) => ({
                    ...prev,
                    showLightKelvinLabels: !curr,
                    showLightIntensityLabels: !curr,
                  }));
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showLightKelvinLabels || eff.showLightIntensityLabels
                    ? 'bg-amber-950 text-amber-300 border-amber-600/60'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                Kelvin & Dim %
              </button>
              <button
                type="button"
                onClick={() => toggleOverride('showWaypoints', true)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showWaypoints
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-600/60'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                Waypoints
              </button>
              <button
                type="button"
                onClick={() => toggleOverride('showGrid', false)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showGrid
                    ? 'bg-slate-800 text-slate-200 border-slate-600'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                Grid
              </button>
            </div>
          </div>
        )}

        {/* Printable Document Paper View (Strictly Pure White for Ink Saving) */}
        <div
          id="printable-content"
          className="flex-1 overflow-y-auto p-8 bg-white text-slate-900 print:p-2 print:overflow-visible"
        >
          {/* 1. Header Block (Standard Film Production Slate) */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex justify-between items-start gap-4">
              <div className="flex items-start gap-3 min-w-0">
                {project.logo && (
                  <img
                    src={project.logo}
                    alt=""
                    className="h-14 w-auto max-w-[9rem] object-contain flex-shrink-0"
                  />
                )}
                <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs font-mono font-bold uppercase bg-slate-900 text-white rounded">
                    CINEMATOGRAPHY PLAN
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    {exportSection === 'floorplan'
                      ? '• 2D FLOOR PLAN BLUEPRINT'
                      : exportSection === 'shotlist'
                      ? '• COVERAGE SHOT LIST'
                      : exportSection === 'storyboard'
                      ? '• STORYBOARD'
                      : exportSection === 'linedscript'
                      ? '• LINED SHOOTING SCRIPT'
                      : '• COMPLETE PRODUCTION CALL SHEET'}
                  </span>
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase mt-1">
                  {project.title}
                </h1>
                <h2 className="text-sm font-bold text-slate-700">
                  SCENE {activeSetup.sceneNumber}: {activeSetup.name}
                </h2>
                </div>
              </div>
              <div className="text-right text-xs text-slate-700 font-mono space-y-0.5">
                <p><strong>DATE:</strong> {project.date || new Date().toISOString().split('T')[0]}</p>
                <p><strong>DIRECTOR:</strong> {project.director || '—'}</p>
                <p><strong>CINEMATOGRAPHER:</strong> {project.cinematographer || '—'}</p>
                <p><strong>LOCATION:</strong> {activeSetup.location} ({activeSetup.timeOfDay})</p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION A: 2D FLOOR PLAN BLUEPRINT GRAPHIC                                */}
          {/* ========================================================================= */}
          {(exportSection === 'floorplan' || exportSection === 'combined') && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span>Scene Floor Plan Blueprint</span>
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  Scale: 1 Grid Unit = {activeSetup.gridSettings?.unit === 'm' ? '1.0m' : '3.0ft'}
                </span>
              </div>

              {/* Architectural SVG Blueprint Diagram */}
              <div className="border-2 border-slate-900 rounded-xl p-4 bg-white shadow-xs overflow-hidden">
                <svg
                  ref={floorPlanSvgRef}
                  id="print-floorplan-svg"
                  viewBox={`${minX} ${minY} ${viewBoxWidth} ${viewBoxHeight}`}
                  className="w-full h-auto max-h-[500px]"
                  style={{ backgroundColor: '#ffffff' }}
                >
                  {/* Subtle Grid pattern for architectural context */}
                  <defs>
                    <pattern id="print-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                    </pattern>
                  </defs>
                  {eff.showGrid && (
                    <rect x={minX} y={minY} width={viewBoxWidth} height={viewBoxHeight} fill="url(#print-grid)" />
                  )}

                  {/* 0. Reference / Background Images (scout photo, blueprint, screenshot) */}
                  {backgroundImages.map((img) => (
                    <g
                      key={img.id || img.url}
                      transform={`translate(${img.x}, ${img.y}) rotate(${img.rotation || 0})`}
                    >
                      <rect
                        x={0}
                        y={0}
                        width={img.width}
                        height={img.height}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                      />
                      <image
                        href={img.url}
                        x={0}
                        y={0}
                        width={img.width}
                        height={img.height}
                        opacity={Math.max(0.12, Math.min(1, img.opacity || 0.5))}
                        preserveAspectRatio="none"
                      />
                      {eff.showLabels && img.name && (
                        <text
                          x={4}
                          y={-6}
                          fontSize="9"
                          fontStyle="italic"
                          fill="#64748b"
                          fontFamily="sans-serif"
                        >
                          {img.name}
                        </text>
                      )}
                    </g>
                  ))}

                  {/* 1. Draw Walls, Doors & Windows */}
                  <g opacity={eff.categoryOpacity?.walls ?? eff.categoryOpacity?.architecture ?? 1}>
                    {/* 1. Walls */}
                    {walls.map((wall) => {
                      const x1 = wall.x;
                      const y1 = wall.y;
                      const x2 = wall.x2 ?? wall.x + 200;
                      const y2 = wall.y2 ?? wall.y;
                      const thickness = wall.thickness || 12;

                      return (
                        <g key={wall.id}>
                          {/* Wall Body */}
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={wall.wallColor || '#64748b'}
                            strokeWidth={thickness}
                            strokeLinecap="round"
                          />
                          {/* Wall center architectural hatch line */}
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="#334155"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                          />
                        </g>
                      );
                    })}

                    {/* 2. Draw Doors (Exact 1:1 match with WallLayer) */}
                    {doors.map((door) => {
                      const w = door.width || 60;
                      const swing = Math.min(180, door.swingAngle || 90);
                      const open = door.isOpen !== false;
                      const rad = (swing * Math.PI) / 180;
                      const leftHinge = door.swingDirection !== 'right'; // hinge at the left end
                      const hingeX = leftHinge ? 0 : w;
                      const otherX = w - hingeX; // far end of the leaf when closed

                      // Open leaf endpoint (rotated about the hinge).
                      const openX = hingeX + (otherX - hingeX) * Math.cos(rad);
                      const openY = leftHinge ? (otherX - hingeX) * Math.sin(rad) : -(otherX - hingeX) * Math.sin(rad);

                      return (
                        <g
                          key={door.id}
                          transform={`translate(${door.x}, ${door.y}) rotate(${door.rotation || 0})`}
                        >
                          {/* Door opening threshold gap line */}
                          <line
                            x1={0}
                            y1={0}
                            x2={w}
                            y2={0}
                            stroke="#0f172a"
                            strokeWidth={14}
                            strokeLinecap="butt"
                          />
                          {/* Door frame jambs (left & right posts) */}
                          <rect x={-5} y={-8} width={7} height={16} rx={1.5} fill="#d97706" stroke="#0f172a" strokeWidth={1.5} />
                          <rect x={w - 2} y={-8} width={7} height={16} rx={1.5} fill="#d97706" stroke="#0f172a" strokeWidth={1.5} />

                          <line
                            x1={0}
                            y1={0}
                            x2={w}
                            y2={0}
                            stroke="#d97706"
                            strokeWidth={2}
                            strokeOpacity={open ? 0.7 : 0}
                          />
                          {open && swing > 2 && (
                            /* Pronounced Swing Arc */
                            <path
                              d={`M ${otherX} 0 A ${w} ${w} 0 0 ${leftHinge ? 1 : 0} ${openX} ${openY}`}
                              fill="none"
                              stroke="#f59e0b"
                              strokeWidth={2}
                              strokeDasharray="4 3"
                              strokeOpacity={0.85}
                            />
                          )}
                          {/* Bold Door Leaf */}
                          <line
                            x1={hingeX}
                            y1={0}
                            x2={open ? openX : otherX}
                            y2={open ? openY : 0}
                            stroke="#fbbf24"
                            strokeWidth={5}
                            strokeLinecap="round"
                          />
                          {/* Hinge Point */}
                          <circle cx={hingeX} cy={0} r={4.5} fill="#d97706" stroke="#0f172a" strokeWidth={1.5} />
                          {/* Handle / Knob indicator near door edge */}
                          {open && (
                            <circle
                              cx={hingeX + (openX - hingeX) * 0.85}
                              cy={openY * 0.85}
                              r={3}
                              fill="#0f172a"
                              stroke="#ffffff"
                              strokeWidth={1}
                            />
                          )}
                          {eff.showLabels && eff.showDoorWindowLabels && (
                            <text
                              x={w / 2}
                              y={-10}
                              fill={displaySettings.doorWindowLabelColor || '#f59e0b'}
                              fontSize="10"
                              fontWeight="bold"
                              textAnchor="middle"
                              opacity={(eff.labelOpacity ?? 1) * (eff.labelCategoryOpacity?.doorWindows ?? 1)}
                              className="select-none font-mono drop-shadow-sm"
                            >
                              {door.name && door.name.trim() ? door.name : 'DOOR'}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* 3. Draw Windows (Exact 1:1 match with WallLayer) */}
                    {windows.map((win) => {
                      const w = win.width || 100;
                      const d = win.depth || 12;

                      return (
                        <g
                          key={win.id}
                          transform={`translate(${win.x}, ${win.y}) rotate(${win.rotation || 0})`}
                        >
                          {/* Sunlight throw indicator */}
                          {eff.showLightBeams && win.beamVisible !== false && (
                            <path
                              d={`M ${-w / 2} 0 L ${-w / 2 - 40} 80 L ${w / 2 + 40} 80 L ${w / 2} 0 Z`}
                              fill="rgba(253, 224, 71, 0.12)"
                              stroke="rgba(253, 224, 71, 0.35)"
                              strokeWidth={1}
                              strokeDasharray="3 3"
                            />
                          )}
                          {/* Window frame */}
                          <rect
                            x={-w / 2}
                            y={-d / 2}
                            width={w}
                            height={d}
                            fill="#0f172a"
                            stroke="#94a3b8"
                            strokeWidth={2}
                            rx={2}
                          />
                          {/* Glass pane lines */}
                          <line
                            x1={-w / 2 + 4}
                            y1={0}
                            x2={w / 2 - 4}
                            y2={0}
                            stroke="#38bdf8"
                            strokeWidth={2}
                          />
                          <line
                            x1={0}
                            y1={-d / 2}
                            x2={0}
                            y2={d / 2}
                            stroke="#94a3b8"
                            strokeWidth={1.5}
                          />
                          {/* Label */}
                          {eff.showLabels && eff.showDoorWindowLabels && (
                            <text
                              x={0}
                              y={-d / 2 - 6}
                              fill={displaySettings.doorWindowLabelColor || '#94a3b8'}
                              fontSize="10"
                              textAnchor="middle"
                              opacity={(eff.labelOpacity ?? 1) * (eff.labelCategoryOpacity?.doorWindows ?? 1)}
                              className="select-none font-mono"
                            >
                              {win.name && win.name.trim() ? win.name : 'WINDOW'}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* 3.5 Draw Dolly Tracks */}
                  <g opacity={eff.categoryOpacity?.tracks ?? 1}>
                    {tracks.map((track) => {
                      const x1 = track.x;
                      const y1 = track.y;
                      const x2 = track.x2 ?? track.x + 240;
                      const y2 = track.y2 ?? track.y;
                      const dist = Math.max(20, Math.hypot(x2 - x1, y2 - y1));
                      const angle = Math.atan2(y2 - y1, x2 - x1);
                      const isCurved = !!track.isCurved;
                      const curveOffset = track.curveOffset || 60;

                      if (isCurved) {
                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;
                        const normalX = -(y2 - y1) / dist;
                        const normalY = (x2 - x1) / dist;
                        const ctrlX = midX + normalX * curveOffset;
                        const ctrlY = midY + normalY * curveOffset;
                        const steps = Math.max(4, Math.floor(dist / 30));
                        const pts: { x: number; y: number; nx: number; ny: number }[] = [];
                        for (let i = 0; i <= steps; i++) {
                          const t = i / steps;
                          const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * ctrlX + t * t * x2;
                          const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ctrlY + t * t * y2;
                          const tx = 2 * (1 - t) * (ctrlX - x1) + 2 * t * (x2 - ctrlX);
                          const ty = 2 * (1 - t) * (ctrlY - y1) + 2 * t * (y2 - ctrlY);
                          const tLen = Math.hypot(tx, ty) || 1;
                          pts.push({ x: px, y: py, nx: -ty / tLen, ny: tx / tLen });
                        }
                        const inner = pts
                          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x - p.nx * 12).toFixed(1)} ${(p.y - p.ny * 12).toFixed(1)}`)
                          .join(' ');
                        const outer = pts
                          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x + p.nx * 12).toFixed(1)} ${(p.y + p.ny * 12).toFixed(1)}`)
                          .join(' ');
                        return (
                          <g key={track.id}>
                            <path d={inner} fill="none" stroke="#475569" strokeWidth={3} strokeLinecap="round" />
                            <path d={outer} fill="none" stroke="#475569" strokeWidth={3} strokeLinecap="round" />
                            {pts.map((p, i) => (
                              <line
                                key={i}
                                x1={p.x - p.nx * 16}
                                y1={p.y - p.ny * 16}
                                x2={p.x + p.nx * 16}
                                y2={p.y + p.ny * 16}
                                stroke="#334155"
                                strokeWidth={2}
                              />
                            ))}
                          </g>
                        );
                      }

                      const sleeperCount = Math.max(2, Math.floor(dist / 25));
                      const cos = Math.cos(angle);
                      const sin = Math.sin(angle);
                      const px = -sin * 14;
                      const py = cos * 14;
                      return (
                        <g key={track.id}>
                          <line x1={x1 + px} y1={y1 + py} x2={x2 + px} y2={y2 + py} stroke="#475569" strokeWidth={3} strokeLinecap="round" />
                          <line x1={x1 - px} y1={y1 - py} x2={x2 - px} y2={y2 - py} stroke="#475569" strokeWidth={3} strokeLinecap="round" />
                          {Array.from({ length: sleeperCount + 1 }).map((_, i) => {
                            const t = i / sleeperCount;
                            const sx = x1 + (x2 - x1) * t;
                            const sy = y1 + (y2 - y1) * t;
                            return (
                              <line key={i} x1={sx + px} y1={sy + py} x2={sx - px} y2={sy - py} stroke="#334155" strokeWidth={2} />
                            );
                          })}
                          {eff.showLabels && eff.showTrackLabels && (
                            <text
                              x={(x1 + x2) / 2}
                              y={(y1 + y2) / 2 - 20}
                              fill={displaySettings.trackLabelColor || '#475569'}
                              fontSize={10}
                              textAnchor="middle"
                              opacity={(eff.labelOpacity ?? 1) * (eff.labelCategoryOpacity?.tracks ?? 1)}
                              className="select-none font-mono"
                            >
                              DOLLY TRACK ({Math.round(dist / 25)}ft)
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* 3.6 Draw Measurements */}
                  <g opacity={eff.categoryOpacity?.measurements ?? eff.categoryOpacity?.shapes ?? 1}>
                    {measurements.map((m) => {
                      const x1 = m.x;
                      const y1 = m.y;
                      const x2 = m.x2 ?? m.x + 150;
                      const y2 = m.y2 ?? m.y;
                      const midX = (x1 + x2) / 2;
                      const midY = (y1 + y2) / 2;
                      const pixelsPerUnit = activeSetup.gridSettings?.pixelsPerUnit || 50;
                      const dist = Math.hypot(x2 - x1, y2 - y1);
                      const label = `${Math.round((dist / pixelsPerUnit) * 10) / 10} ${m.unit}`;
                      return (
                        <g key={m.id}>
                          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d97706" strokeWidth={2} strokeDasharray="6 3" />
                          <circle cx={x1} cy={y1} r={4} fill="#d97706" />
                          <circle cx={x2} cy={y2} r={4} fill="#d97706" />
                          {eff.showLabels && eff.showMeasurementLabels && (
                            <g
                              transform={`translate(${midX}, ${midY - 12})`}
                              opacity={(eff.labelOpacity ?? 1) * (eff.labelCategoryOpacity?.measurements ?? 1)}
                            >
                              <rect x={-34} y={-9} width={68} height={18} rx={3} fill="#0f172a" stroke={displaySettings.measurementLabelColor || '#d97706'} strokeWidth={1} />
                              <text x={0} y={4} textAnchor="middle" fontSize="9" fontWeight="bold" fill={displaySettings.measurementLabelColor || '#f59e0b'} fontFamily="monospace">
                                {label}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* 3.6b Draw free-form shapes (zones, areas) */}
                  <ShapesLayer shapes={shapes} selectedIds={[]} onSelect={() => {}} canvasScale={1} />

                  {/* 3.7 Draw Arrows */}
                  {arrows.map((a) => (
                    <g key={a.id}>
                      <ArrowGlyph
                        x1={a.x}
                        y1={a.y}
                        x2={a.x2 ?? a.x + 150}
                        y2={a.y2 ?? a.y}
                        color={a.color || '#f97316'}
                        strokeWidth={a.strokeWidth || 2.5}
                        headStyle={a.headStyle}
                        dashStyle={a.dashStyle}
                      />
                      {eff.showLabels && a.label && (
                        <g transform={`translate(${(a.x + (a.x2 ?? a.x + 150)) / 2}, ${(a.y + (a.y2 ?? a.y)) / 2 - 12})`}>
                          <rect x={-38} y={-9} width={76} height={18} rx={3} fill="#0f172a" stroke="#f97316" strokeWidth={1} />
                          <text x={0} y={4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#fb923c" fontFamily="monospace">
                            {a.label}
                          </text>
                        </g>
                      )}
                    </g>
                  ))}

                  {/* 3.8 Draw Text Annotations */}
                  {texts.map((txt) => (
                    <g key={txt.id} transform={`translate(${txt.x}, ${txt.y})`}>
                      <text
                        x={0}
                        y={0}
                        textAnchor={txt.textAlign === 'left' ? 'start' : txt.textAlign === 'right' ? 'end' : 'middle'}
                        fontSize={txt.fontSize || 16}
                        fill={txt.color || '#94a3b8'}
                        fontFamily={txt.fontFamily || 'sans-serif'}
                        fontWeight={txt.fontWeight || 'normal'}
                        fontStyle={txt.fontStyle || 'normal'}
                        textDecoration={[txt.underline ? 'underline' : null, txt.strikethrough ? 'line-through' : null]
                          .filter(Boolean)
                          .join(' ') || undefined}
                      >
                        {txt.text}
                      </text>
                    </g>
                  ))}

                  {/* 4. Draw Props & Furniture */}
                  <g opacity={eff.categoryOpacity?.props ?? 1}>
                    {props.map((prop) => {
                      const w = prop.width || 80;
                      const h = prop.height || 50;
                      const type = (prop.propType || '').toLowerCase();
                      const propOpacity = prop.opacity ?? 1.0;

                      return (
                        <g
                          key={prop.id}
                          transform={`translate(${prop.x}, ${prop.y}) rotate(${prop.rotation || 0})`}
                          opacity={propOpacity}
                        >
                          {/* Architectural Top-Down Blueprint Furniture rendering */}
                          {type.includes('sofa') || type.includes('couch') ? (
                            <g>
                              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill="#f8fafc" stroke="#1e293b" strokeWidth="1.5" />
                              <rect x={-w / 2 + 2} y={-h / 2 + 2} width={w - 4} height={h * 0.3} rx="3" fill="#e2e8f0" stroke="#334155" strokeWidth="1" />
                              <rect x={-w / 2 + 2} y={-h / 2 + 2} width={w * 0.15} height={h - 4} rx="2" fill="#cbd5e1" stroke="#334155" strokeWidth="1" />
                              <rect x={w / 2 - w * 0.15 - 2} y={-h / 2 + 2} width={w * 0.15} height={h - 4} rx="2" fill="#cbd5e1" stroke="#334155" strokeWidth="1" />
                              <line x1={0} y1={-h / 2 + h * 0.3} x2={0} y2={h / 2 - 2} stroke="#475569" strokeWidth="1" />
                            </g>
                          ) : type === 'chair' ? (
                            <g>
                              <circle cx={-w * 0.36} cy={-h * 0.36} r="2" fill="#0f172a" />
                              <circle cx={w * 0.36} cy={-h * 0.36} r="2" fill="#0f172a" />
                              <circle cx={-w * 0.36} cy={h * 0.36} r="2" fill="#0f172a" />
                              <circle cx={w * 0.36} cy={h * 0.36} r="2" fill="#0f172a" />
                              <rect x={-w * 0.42} y={-h * 0.42} width={w * 0.84} height={h * 0.84} rx="4" fill="#f8fafc" stroke="#1e293b" strokeWidth="1.2" />
                              <path d={`M ${-w * 0.4} ${-h * 0.32} C ${-w * 0.2} ${-h * 0.46}, ${w * 0.2} ${-h * 0.46}, ${w * 0.4} ${-h * 0.32}`} fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                            </g>
                          ) : type === 'bar_stool' ? (
                            <g>
                              <circle cx={0} cy={0} r={w * 0.46} fill="none" stroke="#94a3b8" strokeWidth="1.5" />
                              <line x1={-w * 0.46} y1={0} x2={w * 0.46} y2={0} stroke="#64748b" strokeWidth="1" />
                              <line x1={0} y1={-w * 0.46} x2={0} y2={w * 0.46} stroke="#64748b" strokeWidth="1" />
                              <circle cx={0} cy={0} r={w * 0.36} fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
                              <circle cx={0} cy={0} r="2" fill="#0f172a" />
                            </g>
                          ) : type === 'bar_counter' ? (
                            <g>
                              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="3" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
                              <rect x={-w / 2 + 2} y={-h / 2 + 2} width={w - 4} height={h * 0.32} rx="2" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1" />
                              <line x1={-w / 2 + 6} y1={-h / 2 - 2} x2={w / 2 - 6} y2={-h / 2 - 2} stroke="#eab308" strokeWidth="1.5" />
                            </g>
                          ) : type.includes('armchair') ? (
                            <g>
                              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="8" fill="#f8fafc" stroke="#1e293b" strokeWidth="1.5" />
                              <rect x={-w / 2 + 3} y={-h / 2 + 3} width={w - 6} height={h * 0.35} rx="4" fill="#cbd5e1" stroke="#334155" strokeWidth="1" />
                              <rect x={-w / 2 + 3} y={-h / 2 + 3} width={10} height={h - 6} rx="3" fill="#e2e8f0" stroke="#334155" strokeWidth="1" />
                              <rect x={w / 2 - 13} y={-h / 2 + 3} width={10} height={h - 6} rx="3" fill="#e2e8f0" stroke="#334155" strokeWidth="1" />
                            </g>
                          ) : type.includes('table_round') || type.includes('table_dining_round') ? (
                            <g>
                              <circle cx={0} cy={0} r={Math.min(w, h) / 2} fill="#f8fafc" stroke="#1e293b" strokeWidth="1.5" />
                              <circle cx={0} cy={0} r={Math.min(w, h) / 2 * 0.85} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
                            </g>
                          ) : type === 'vehicle_truck' ? (
                            <g>
                              {/* Front Cab */}
                              <rect x={-w / 2 - 3} y={-h / 2 + 45} width={6} height={40} rx="2" fill="#334155" />
                              <rect x={w / 2 - 3} y={-h / 2 + 45} width={6} height={40} rx="2" fill="#334155" />
                              <rect x={-w / 2 - 6} y={h * 0.16} width={10} height={50} rx="2" fill="#334155" />
                              <rect x={w / 2 - 4} y={h * 0.16} width={10} height={50} rx="2" fill="#334155" />
                              <path d={`M ${-w / 2 + 8} ${-h / 2 + 10} L ${w / 2 - 8} ${-h / 2 + 10} L ${w / 2 - 4} ${-h / 2 + 115} L ${-w / 2 + 4} ${-h / 2 + 115} Z`} fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
                              <rect x={-w / 2 + 16} y={-h / 2 + 40} width={w - 32} height={25} rx="3" fill="#e2e8f0" stroke="#334155" strokeWidth="1" />
                              {/* Cargo Box */}
                              <rect x={-w / 2 - 2} y={-h / 2 + 115} width={w + 4} height={h * 0.66} rx="4" fill="#f1f5f9" stroke="#0f172a" strokeWidth="2" />
                              <line x1={-w / 2} y1={h / 2 - 8} x2={w / 2} y2={h / 2 - 8} stroke="#f59e0b" strokeWidth="1.5" />
                            </g>
                          ) : type.includes('car') || type.includes('vehicle') ? (
                            <g>
                              {/* Chassis */}
                              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="18" fill="#f8fafc" stroke="#1e293b" strokeWidth="2" />
                              {/* Wheels */}
                              <rect x={-w / 2 - 3} y={-h / 2 + 35} width={6} height={36} rx={2} fill="#334155" />
                              <rect x={w / 2 - 3} y={-h / 2 + 35} width={6} height={36} rx={2} fill="#334155" />
                              <rect x={-w / 2 - 3} y={h / 2 - 70} width={6} height={36} rx={2} fill="#334155" />
                              <rect x={w / 2 - 3} y={h / 2 - 70} width={6} height={36} rx={2} fill="#334155" />
                              {/* Windshield */}
                              <rect x={-w / 2 + 18} y={-h / 2 + 80} width={w - 36} height={20} rx="4" fill="#e2e8f0" stroke="#334155" strokeWidth="1.2" />
                              {/* 4 Dedicated Passenger Seats */}
                              <rect x={-w * 0.4} y={-h / 2 + 115} width={w * 0.35} height={34} rx="4" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
                              <rect x={w * 0.05} y={-h / 2 + 115} width={w * 0.35} height={34} rx="4" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
                              <rect x={-w * 0.4} y={-h / 2 + 205} width={w * 0.35} height={34} rx="4" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
                              <rect x={w * 0.05} y={-h / 2 + 205} width={w * 0.35} height={34} rx="4" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
                              {/* Rear Glass */}
                              <rect x={-w / 2 + 20} y={h / 2 - 60} width={w - 40} height={16} rx="3" fill="#e2e8f0" stroke="#334155" strokeWidth="1.2" />
                              <circle cx={-w / 2 + 14} cy={-h / 2 + 5} r="3" fill="#fef08a" stroke="#eab308" strokeWidth="1" />
                              <circle cx={w / 2 - 14} cy={-h / 2 + 5} r="3" fill="#fef08a" stroke="#eab308" strokeWidth="1" />
                            </g>
                          ) : type === 'gun' ? (
                            <g>
                              <rect x={-w / 2} y={-h * 0.35} width={w * 0.8} height={h * 0.3} rx="2" fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
                              <path d={`M ${w * 0.06} ${-h * 0.05} L ${w * 0.34} ${h * 0.44} L ${w * 0.08} ${h * 0.48} L ${-w * 0.08} 0 Z`} fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
                              <path d={`M ${-w * 0.14} 0 C ${-w * 0.14} ${h * 0.24}, ${w * 0.06} ${h * 0.24}, ${w * 0.06} 0`} fill="none" stroke="#0f172a" strokeWidth="1.2" />
                            </g>
                          ) : type === 'rifle' ? (
                            <g>
                              <line x1={-w / 2} y1={0} x2={w * 0.45} y2={0} stroke="#1e293b" strokeWidth="3.5" strokeLinecap="round" />
                              <rect x={-w * 0.1} y={-6} width={w * 0.3} height={12} rx="2" fill="#334155" stroke="#0f172a" strokeWidth="1" />
                              <path d={`M ${w * 0.1} 6 L ${w * 0.18} 16 L ${w * 0.12} 16 L ${w * 0.06} 6 Z`} fill="#1e293b" />
                            </g>
                          ) : type === 'bomb' ? (
                            <g>
                              <rect x={-w / 2} y={-h / 2 + 2} width={w * 0.65} height={h * 0.26} rx="2" fill="#ef4444" stroke="#991b1b" strokeWidth="1" />
                              <rect x={-w / 2} y={-h * 0.13} width={w * 0.65} height={h * 0.26} rx="2" fill="#dc2626" stroke="#991b1b" strokeWidth="1" />
                              <rect x={-w / 2} y={h * 0.18} width={w * 0.65} height={h * 0.26} rx="2" fill="#b91c1c" stroke="#7f1d1d" strokeWidth="1" />
                              <rect x={w * 0.04} y={-h * 0.3} width={w * 0.44} height={h * 0.6} rx="2" fill="#0f172a" stroke="#475569" strokeWidth="1" />
                              <rect x={w * 0.08} y={-h * 0.2} width={w * 0.36} height={h * 0.25} rx="1" fill="#450a0a" />
                            </g>
                          ) : type === 'letter' ? (
                            <g>
                              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="2" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" />
                              <path d={`M ${-w / 2} ${-h / 2} L 0 ${h * 0.15} L ${w / 2} ${-h / 2}`} fill="#f1f5f9" stroke="#64748b" strokeWidth="1" />
                              <circle cx={0} cy={h * 0.15} r="3" fill="#dc2626" />
                            </g>
                          ) : type === 'sound_boom' ? (
                            <g>
                              <line x1={-6} y1={-8} x2={56} y2={0} stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
                              <rect x={46} y={-7} width={24} height={14} rx="7" fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
                              <ellipse cx={-12} cy={0} rx="14" ry="18" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
                              <rect x={-2} y={-10} width={8} height={20} rx="2" fill="#334155" stroke="#0f172a" strokeWidth="1" />
                              <circle cx={-12} cy={0} r="8" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.2" />
                              <rect x={-15} y={-11} width={5} height={4} rx="1" fill="#0284c7" />
                              <rect x={-15} y={7} width={5} height={4} rx="1" fill="#0284c7" />
                            </g>
                          ) : type === 'c_stand' ? (
                            <g>
                              <path d="M 0 0 C -10 -16, -22 -20, -32 -16" fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
                              <path d="M 0 0 C -12 14, -24 18, -32 12" fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
                              <path d="M 0 0 C 14 -8, 22 -6, 28 -1" fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
                              <circle cx={0} cy={0} r="6" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
                              <line x1={0} y1={0} x2={48} y2={0} stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
                              <rect x={44} y={-4} width={7} height={8} rx="1.5" fill="#334155" stroke="#0f172a" strokeWidth="1" />
                            </g>
                          ) : type === 'tripod' ? (
                            <g>
                              <line x1={0} y1={0} x2={-24} y2={-16} stroke="#475569" strokeWidth="3" strokeLinecap="round" />
                              <line x1={0} y1={0} x2={-24} y2={16} stroke="#475569" strokeWidth="3" strokeLinecap="round" />
                              <line x1={0} y1={0} x2={28} y2={0} stroke="#475569" strokeWidth="3" strokeLinecap="round" />
                              <polygon points="-12,-8 -12,8 14,0" fill="none" stroke="#94a3b8" strokeWidth="1" />
                              <circle cx={0} cy={0} r="6" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
                            </g>
                          ) : type.includes('bed') ? (
                            <g>
                              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="4" fill="#f8fafc" stroke="#1e293b" strokeWidth="1.5" />
                              <rect x={-w / 2} y={-h / 2} width={w} height="8" fill="#cbd5e1" stroke="#334155" strokeWidth="1" />
                              <rect x={-w / 2 + 4} y={-h / 2 + 10} width={w / 2 - 6} height={h * 0.25} rx="3" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
                              <rect x={2} y={-h / 2 + 10} width={w / 2 - 6} height={h * 0.25} rx="3" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
                              <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#94a3b8" strokeWidth="1" />
                            </g>
                          ) : type.includes('plant') ? (
                            <g>
                              <circle cx={0} cy={0} r={Math.min(w, h) / 2} fill="#ecfdf5" stroke="#059669" strokeWidth="1.5" />
                              <path d="M 0 0 Q -10 -15 -20 -10 Q -5 -5 0 0" fill="#10b981" />
                              <path d="M 0 0 Q 10 -15 20 -10 Q 5 -5 0 0" fill="#10b981" />
                              <path d="M 0 0 Q 15 5 18 15 Q 5 5 0 0" fill="#10b981" />
                              <path d="M 0 0 Q -15 5 -18 15 Q -5 5 0 0" fill="#10b981" />
                            </g>
                          ) : type === 'tree' ? (
                            <g>
                              <circle cx={0} cy={0} r={w * 0.48} fill="#f0fdf4" stroke="#16a34a" strokeWidth="1" strokeDasharray="3 2" />
                              <circle cx={-w * 0.2} cy={-h * 0.2} r={w * 0.22} fill="#dcfce7" stroke="#15803d" strokeWidth="1" />
                              <circle cx={w * 0.2} cy={-h * 0.2} r={w * 0.22} fill="#dcfce7" stroke="#15803d" strokeWidth="1" />
                              <circle cx={-w * 0.2} cy={h * 0.2} r={w * 0.22} fill="#dcfce7" stroke="#15803d" strokeWidth="1" />
                              <circle cx={w * 0.2} cy={h * 0.2} r={w * 0.22} fill="#dcfce7" stroke="#15803d" strokeWidth="1" />
                              <circle cx={0} cy={0} r={w * 0.28} fill="#bbf7d0" stroke="#15803d" strokeWidth="1.5" />
                              <path d="M 0 0 L -14 -14 M 0 0 L 14 -14 M 0 0 L -14 14 M 0 0 L 14 14" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
                              <circle cx={0} cy={0} r={w * 0.08} fill="#78350f" />
                            </g>
                          ) : (
                            <rect
                              x={-w / 2}
                              y={-h / 2}
                              width={w}
                              height={h}
                              rx="4"
                              fill="#f8fafc"
                              stroke="#1e293b"
                              strokeWidth="1.5"
                            />
                          )}

                          {eff.showLabels && eff.showPropLabels && (
                            <text
                              x="0"
                              y={Math.max(h / 2 + 12, 22)}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight="bold"
                              fill={displaySettings.propLabelColor || '#1e293b'}
                              fontFamily="sans-serif"
                              opacity={(eff.labelOpacity ?? 1) * (eff.labelCategoryOpacity?.props ?? 1)}
                            >
                              {prop.name || prop.propType}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* 5. Draw Light Beams & Fixtures */}
                  <g opacity={eff.categoryOpacity?.lights ?? 1}>
                    {lights.map((l) => {
                      const isFlag = isFlagFixture(l.fixtureType);
                      const lightColor = isFlag ? '#94a3b8' : (l.rgbColor || (l.colorTemp ? kelvinToRgb(l.colorTemp) : '#f59e0b'));
                      const beamAngle = l.beamAngle || 60;
                      const throwDist = l.throwDistance || 220;
                      const isOmni = l.fixtureType === 'practical' || beamAngle >= 350;
                      const showBeam = eff.showLightBeams && !isFlag && (exportViewMode === 'full' || l.beamVisible !== false) && beamAngle > 0 && !isOmni;
                      const beamPath = showBeam
                        ? getLightBeamPolygon({ x: l.x, y: l.y }, l.rotation || 0, beamAngle, throwDist)
                        : '';
                      return (
                        <g key={l.id}>
                          {showBeam && (
                            <path d={beamPath} fill="#fef3c7" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                          )}
                          <g transform={`translate(${l.x}, ${l.y}) rotate(${l.rotation || 0})`}>
                            {isFlag ? (
                              <FlagFixtureIcon light={l} />
                            ) : (
                              <FixtureGlyph fixtureType={l.fixtureType} color={lightColor} />
                            )}
                            {eff.showLabels && eff.showLightLabels && (
                              <g
                                transform={`rotate(${-(l.rotation || 0)})`}
                                opacity={(eff.labelOpacity ?? 1) * (eff.labelCategoryOpacity?.lights ?? 1)}
                              >
                                {(() => {
                                  const roleObj = LIGHT_ROLES.find((r) => r.value === l.lightRole);
                                  const hasRole = !!roleObj && roleObj.value !== 'unassigned';
                                  const fixObj = LIGHT_FIXTURES.find((f) => f.type === l.fixtureType);
                                  const fixName = fixObj?.name || 'Light';
                                  const fullTitle = isFlag
                                    ? flagLabel(l)
                                    : (l.name || (l.brand ? `${l.brand} ${l.fixtureModel || fixName}` : (l.fixtureModel || fixName)));
                                  const showRole = eff.showLightRoleLabels && hasRole;
                                  const showName = eff.showLightNameLabels;
                                  const showKelvin = eff.showLightKelvinLabels === true;
                                  const showIntensity = eff.showLightIntensityLabels === true;
                                  const specsParts: string[] = [];
                                  if (isFlag) {
                                    if (!hasRole && roleObj) specsParts.push(roleObj.label);
                                  } else {
                                    if (showKelvin) specsParts.push(l.colorTemp > 0 ? `${l.colorTemp}K` : 'RGB');
                                    if (showIntensity) specsParts.push(`${l.intensity}%`);
                                  }
                                  const specs = specsParts.join(' · ');

                                  if (!showRole && !showName && specs.length === 0) return null;

                                  return (
                                    <g transform={`translate(0, ${isOmni ? 34 : (hasRole ? 32 : 24)})`}>
                                      {showRole && (
                                        <text
                                          x="0"
                                          y="-13"
                                          textAnchor="middle"
                                          fontSize="7.5"
                                          fontWeight="bold"
                                          fill={l.roleColor || (isFlag ? (roleObj!.color || '#0f172a') : lightColor)}
                                          fontFamily="sans-serif"
                                        >
                                          [{roleObj!.label.toUpperCase()}]
                                        </text>
                                      )}
                                      {showName && (
                                        <text
                                          x="0"
                                          y="1"
                                          textAnchor="middle"
                                          fontSize="8.5"
                                          fontWeight="bold"
                                          fill={displaySettings.lightLabelColor || l.labelColor || '#0f172a'}
                                          fontFamily="sans-serif"
                                        >
                                          {fullTitle}
                                        </text>
                                      )}
                                      {specs.length > 0 && (
                                        <text
                                          x="0"
                                          y="12"
                                          textAnchor="middle"
                                          fontSize="7"
                                          fill="#64748b"
                                          fontFamily="monospace"
                                        >
                                          {specs}
                                        </text>
                                      )}
                                    </g>
                                  );
                                })()}
                              </g>
                            )}
                          </g>
                        </g>
                      );
                    })}
                  </g>

                  {/* 5.5 Draw Waypoint Trajectories (camera moves & actor blocking) */}
                  {eff.showWaypoints && (
                    <>
                      {cameras.map((c) => {
                        const cWps = (c.path || []).filter((wp) => wp.x !== undefined && wp.y !== undefined);
                        if (cWps.length === 0) return null;
                        const pts = [{ x: c.x, y: c.y }, ...cWps.map((wp) => ({ x: wp.x, y: wp.y }))];
                        return (
                          <g key={`${c.id}-traj`}>
                            <path
                              d={getSmoothSplinePath(pts)}
                              fill="none"
                              stroke="#0284c7"
                              strokeWidth="2"
                              strokeDasharray="6 4"
                              strokeOpacity="0.6"
                            />
                            {pts.map((p, i) => {
                              const wp = i === 0 ? null : cWps[i - 1];
                              // Each beat prints the camera's facing at that position
                              const facing = wp?.rotation ?? c.rotation ?? 0;
                              const cue = wp?.dialogueCue;
                              // Ghost camera: the body and its coverage at this beat
                              const ghostFov = wp && eff.showFovCones
                                ? getCameraFovPolygon(
                                    { x: 0, y: 0 },
                                    0,
                                    c.fovAngle || 45,
                                    (c.coneDistance || 280) * 0.7
                                  )
                                : null;
                              return (
                                <g key={i} transform={`translate(${p.x}, ${p.y})`}>
                                  {ghostFov && (
                                    <g transform={`rotate(${facing})`} opacity={0.45}>
                                      <path
                                        d={ghostFov.pathString}
                                        fill="#bae6fd"
                                        fillOpacity={0.5}
                                        stroke="#0284c7"
                                        strokeWidth={1}
                                        strokeDasharray="3 3"
                                      />
                                      <rect x={-10} y={-8} width={16} height={16} rx={2} fill="#ffffff" stroke="#0284c7" strokeWidth={1.5} />
                                      <polygon points="6,-6 14,-9 14,9 6,6" fill="#0284c7" opacity={0.7} />
                                    </g>
                                  )}
                                  <g transform={`rotate(${facing})`}>
                                    <polygon points="16,0 4,-6 4,6" fill="#0284c7" opacity={i === 0 ? 0.9 : 0.7} />
                                  </g>
                                  <circle
                                    cx={0}
                                    cy={0}
                                    r={i === 0 ? 6 : 5}
                                    fill={i === 0 ? '#0f172a' : '#ffffff'}
                                    stroke="#0284c7"
                                    strokeWidth={1.5}
                                  />
                                  <text
                                    x={0}
                                    y={3}
                                    textAnchor="middle"
                                    fontSize="7"
                                    fontWeight="bold"
                                    fill={i === 0 ? '#ffffff' : '#0284c7'}
                                    fontFamily="sans-serif"
                                  >
                                    {i === 0 ? c.cameraLabel : `${wp?.beat ?? i + 1}`}
                                  </text>
                                  {eff.showLabels && (
                                    <text
                                      x={0}
                                      y={i === 0 ? -10 : 16}
                                      textAnchor="middle"
                                      fontSize="8"
                                      fontWeight="bold"
                                      fill="#0284c7"
                                      fontFamily="sans-serif"
                                      opacity={eff.labelOpacity ?? 1}
                                    >
                                      {i === 0 ? `CAM ${c.cameraLabel} START` : `B${wp?.beat ?? i + 1} · ${facing}°`}
                                    </text>
                                  )}
                                  {cue && !wp?.hideCue && eff.showWaypointCues && eff.showLabels && (
                                    <text
                                      x={0}
                                      y={25}
                                      textAnchor="middle"
                                      fontSize="7"
                                      fill="#475569"
                                      fontFamily="sans-serif"
                                      opacity={eff.labelOpacity ?? 1}
                                    >
                                      {cue.length > 26 ? `${cue.slice(0, 26)}…` : cue}
                                    </text>
                                  )}
                                </g>
                              );
                            })}
                          </g>
                        );
                      })}
                      {actors.map((a) => {
                        const aWps = (a.path || []).filter((wp) => wp.x !== undefined && wp.y !== undefined);
                        if (aWps.length === 0) return null;
                        const pts = [{ x: a.x, y: a.y }, ...aWps.map((wp) => ({ x: wp.x, y: wp.y }))];
                        return (
                          <g key={`${a.id}-traj`}>
                            <path
                              d={getSmoothSplinePath(pts)}
                              fill="none"
                              stroke="#059669"
                              strokeWidth="2"
                              strokeDasharray="6 4"
                              strokeOpacity="0.6"
                            />
                            {pts.map((p, i) => {
                              const wp = i === 0 ? null : aWps[i - 1];
                              const cue = wp?.dialogueCue;
                              const facing = wp?.rotation ?? a.rotation ?? 0;
                              return (
                                <g key={i} transform={`translate(${p.x}, ${p.y})`}>
                                  {/* Ghost actor: where the performer stands on this beat */}
                                  {wp && (
                                    <g transform={`rotate(${facing})`} opacity={0.45}>
                                      <path
                                        d="M -6 -18 C 0 -19, 10 -16, 12 -12 C 14 -7, 14 7, 12 12 C 10 16, 0 19, -6 18 C -14 14, -14 -14, -6 -18 Z"
                                        fill="#ffffff"
                                        stroke="#059669"
                                        strokeWidth={1.5}
                                      />
                                      <circle cx={0} cy={0} r={10} fill="#a7f3d0" stroke="#059669" strokeWidth={1.5} />
                                      <polygon points="11,-3 16,0 11,3" fill="#059669" />
                                    </g>
                                  )}
                                  <circle
                                    cx={0}
                                    cy={0}
                                    r={i === 0 ? 6 : 5}
                                    fill={i === 0 ? '#0f172a' : '#ffffff'}
                                    stroke="#059669"
                                    strokeWidth={1.5}
                                  />
                                  <text
                                    x={0}
                                    y={3}
                                    textAnchor="middle"
                                    fontSize="7"
                                    fontWeight="bold"
                                    fill={i === 0 ? '#ffffff' : '#059669'}
                                    fontFamily="sans-serif"
                                  >
                                    {i === 0 ? a.characterLetter : `${wp?.beat ?? i + 1}`}
                                  </text>
                                  {eff.showLabels && (
                                    <text
                                      x={0}
                                      y={i === 0 ? -10 : 16}
                                      textAnchor="middle"
                                      fontSize="8"
                                      fontWeight="bold"
                                      fill="#059669"
                                      fontFamily="sans-serif"
                                      opacity={eff.labelOpacity ?? 1}
                                    >
                                      {i === 0 ? `${a.name || a.characterLetter} START` : `B${wp?.beat ?? i + 1}`}
                                    </text>
                                  )}
                                  {cue && !wp?.hideCue && eff.showWaypointCues && eff.showLabels && (
                                    <text
                                      x={0}
                                      y={25}
                                      textAnchor="middle"
                                      fontSize="7"
                                      fill="#475569"
                                      fontFamily="sans-serif"
                                      opacity={eff.labelOpacity ?? 1}
                                    >
                                      {cue.length > 26 ? `${cue.slice(0, 26)}…` : cue}
                                    </text>
                                  )}
                                </g>
                              );
                            })}
                          </g>
                        );
                      })}
                    </>
                  )}

                  {/* 6. Draw Camera FOV Cones & Camera Icons */}
                  <g opacity={eff.categoryOpacity?.cameras ?? 1}>
                    {cameras.map((c) => {
                      const fov = getCameraFovPolygon(
                        { x: c.x, y: c.y },
                        c.rotation || 0,
                        c.fovAngle || 45,
                        c.coneDistance || 280
                      );

                      const shot = activeSetup.shots.find((s) => s.cameraId === c.id);
                      const camDisplayName = c.name && c.name.trim() ? c.name : `CAM ${c.cameraLabel || 'A'}`;
                      const shotNumberText = shot
                        ? (shot.shotNumber && shot.shotNumber.trim()) || `${shot.sceneNumber || '1'}/${shot.order}`
                        : '';
                      const showShotNumber = eff.showShotNumberOnCamera && shotNumberText.length > 0;
                      const cameraBadgeText = showShotNumber ? shotNumberText : camDisplayName;

                      const shotInfoParts: string[] = [];
                      if (shot) {
                        if (eff.showShotSizeOnCamera && shot.shotSize) shotInfoParts.push(shot.shotSize);
                        if (eff.showShotLensOnCamera && shot.lensMm) shotInfoParts.push(`${shot.lensMm}mm`);
                        if (eff.showShotAngleOnCamera && shot.cameraAngle) shotInfoParts.push(shot.cameraAngle);
                      }
                      if (!shot && eff.showShotLensOnCamera && c.focalLength) {
                        shotInfoParts.push(`${c.focalLength}mm`);
                      }
                      const shotInfoText = shotInfoParts.join(' · ');

                      return (
                        <g key={c.id}>
                          {/* FOV Cone */}
                          {eff.showFovCones && (
                            <>
                              <path
                                d={fov.pathString}
                                fill="#e0f2fe"
                                stroke="#0284c7"
                                strokeWidth="1.5"
                                strokeDasharray="4 3"
                                opacity="0.75"
                              />
                              <line x1={c.x} y1={c.y} x2={fov.centerPt.x} y2={fov.centerPt.y} stroke="#0284c7" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
                            </>
                          )}

                          {/* Camera Body Icon */}
                          <g transform={`translate(${c.x}, ${c.y}) rotate(${c.rotation || 0})`}>
                            <polygon points="14,0 -8,-10 -4,0 -8,10" fill="#0284c7" />
                            <rect x="-12" y="-10" width="24" height="20" rx="3" fill="#0369a1" stroke="#ffffff" strokeWidth="2" />
                            <g transform={`rotate(${-(c.rotation || 0)})`}>
                              <text x="0" y="3.5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ffffff">
                                {c.cameraLabel}
                              </text>
                              {eff.showLabels && eff.showCameraLabels && (
                                <g opacity={(eff.labelOpacity ?? 1) * (eff.labelCategoryOpacity?.cameras ?? 1)}>
                                  <text
                                    x="0"
                                    y="-16"
                                    textAnchor="middle"
                                    fontSize="10"
                                    fontWeight="black"
                                    fill={displaySettings.cameraLabelColor || '#0f172a'}
                                  >
                                    {cameraBadgeText}
                                  </text>
                                  {shotInfoText.length > 0 && (
                                    <text
                                      x="0"
                                      y="-27"
                                      textAnchor="middle"
                                      fontSize="8"
                                      fontWeight="bold"
                                      fill="#0284c7"
                                      fontFamily="sans-serif"
                                    >
                                      {shotInfoText}
                                    </text>
                                  )}
                                </g>
                              )}
                            </g>
                          </g>
                        </g>
                      );
                    })}
                  </g>

                  {/* 7. Draw Actors */}
                  <g opacity={eff.categoryOpacity?.actors ?? 1}>
                    {actors.map((actor) => (
                      <g
                        key={actor.id}
                        transform={`translate(${actor.x}, ${actor.y}) rotate(${actor.rotation || 0})`}
                      >
                        {/* Direction Pointer */}
                        <polygon points="14,0 0,-7 3,0 0,7" fill="#059669" />
                        {/* Head */}
                        <circle cx="0" cy="0" r="12" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                        <g transform={`rotate(${-(actor.rotation || 0)})`}>
                          <text x="0" y="4" textAnchor="middle" fontSize="11" fontWeight="black" fill="#ffffff">
                            {actor.characterLetter}
                          </text>
                          {eff.showLabels && eff.showActorLabels && (
                            <text
                              x="0"
                              y="-16"
                              textAnchor="middle"
                              fontSize="10"
                              fontWeight="bold"
                              fill={displaySettings.actorLabelColor || '#0f172a'}
                              opacity={(eff.labelOpacity ?? 1) * (eff.labelCategoryOpacity?.actors ?? 1)}
                            >
                              {actor.name}
                            </text>
                          )}
                        </g>
                      </g>
                    ))}
                  </g>

                  {/* 8. Storyboard Thumbnails on the Blueprint (near their camera) */}
                  {showStoryboards && eff.showStoryboardThumbs && (
                    <g opacity={eff.categoryOpacity?.cameras ?? 1}>
                      {activeSetup.shots
                        .flatMap((shot) => {
                          const cam = cameras.find((c) => c.id === shot.cameraId);
                          // One thumbnail per boarded keyframe, at its own position
                          return slotsOf(shot, cam)
                            .filter((slot) => !!slot.frame?.image)
                            .map((slot, index) => ({ shot, cam, slot, index }));
                        })
                        .map(({ shot, cam, slot, index }) => {
                          if (!cam) return null;
                          const pos =
                            slot.frame?.canvasPosition || {
                              x: slot.anchor.x + 110,
                              y: slot.anchor.y - 60 + index * 20,
                            };
                          const sbW = 56;
                          const sbH = sbW / sceneAspectRatio;
                          const sbClip = `print-sb-${shot.id}-${slot.key}`;
                          const isCover = slot.frame?.fit !== 'contain';
                          return (
                            <g key={`${shot.id}-${slot.key}-sb`}>
                              {/* Leader line from the camera position it belongs to */}
                              <line
                                x1={slot.anchor.x}
                                y1={slot.anchor.y}
                                x2={pos.x}
                                y2={pos.y}
                                stroke="#a78bfa"
                                strokeWidth="1"
                                strokeDasharray="4 3"
                                opacity="0.7"
                              />
                              <defs>
                                <clipPath id={sbClip}>
                                  <rect x={-sbW / 2} y={-sbH / 2} width={sbW} height={sbH} rx="3" />
                                </clipPath>
                              </defs>
                              <g transform={`translate(${pos.x}, ${pos.y})`}>
                                <rect
                                  x={-sbW / 2}
                                  y={-sbH / 2}
                                  width={sbW}
                                  height={sbH}
                                  rx="3"
                                  fill="#ffffff"
                                  stroke="#7c3aed"
                                  strokeWidth="1.5"
                                />
                                <image
                                  href={slot.frame!.image}
                                  x={-sbW / 2}
                                  y={-sbH / 2}
                                  width={sbW}
                                  height={sbH}
                                  preserveAspectRatio={isCover ? 'xMidYMid slice' : 'xMidYMid meet'}
                                  clipPath={`url(#${sbClip})`}
                                />
                                <text
                                  x={0}
                                  y={sbH / 2 + 11}
                                  textAnchor="middle"
                                  fontSize="9"
                                  fontWeight="bold"
                                  fill="#6d28d9"
                                  fontFamily="sans-serif"
                                >
                                  SB {shot.shotNumber}
                                  {slot.short ? ` ${slot.short}` : ''}
                                </text>
                              </g>
                            </g>
                          );
                        })}
                    </g>
                  )}
                </svg>
              </div>

              <p className="text-[10px] text-slate-500 mt-2">
                Blocking beats: <span className="font-bold text-sky-700">blue</span> = camera moves — the ghost body
                and its coverage cone show where the camera sits and looks on each beat —{' '}
                <span className="font-bold text-emerald-700">green</span> = actor blocking, with a ghost figure at every
                beat. Beat numbers match the timeline.
              </p>

              {/* Blueprint Legend Bar */}
              <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-500 block mb-1">
                    Cameras In Scene ({cameras.length})
                  </span>
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {cameras.map((c) => (
                      <div key={c.id} className="flex justify-between">
                        <strong>Cam {c.cameraLabel}: {c.name}</strong>
                        <span>{c.focalLength}mm ({c.aspectRatio})</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-500 block mb-1">
                    Actors & Blocking ({actors.length})
                  </span>
                  <div className="space-y-0.5 text-[11px]">
                    {actors.map((a) => (
                      <div key={a.id} className="flex justify-between">
                        <strong>[{a.characterLetter}] {a.name}</strong>
                        <span className="text-slate-500">{a.isStanding ? 'Standing' : 'Seated'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="col-span-1 md:col-span-3 p-3 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-600 block mb-2 tracking-wider">
                    Equipment List & Lighting Inventory ({lights.length} Total Units)
                  </span>
                  {lights.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No lighting fixtures or grip equipment in this setup.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-300 text-slate-500 font-bold uppercase text-[9px]">
                            <th className="py-1 px-1.5">Qty</th>
                            <th className="py-1 px-1.5">Brand</th>
                            <th className="py-1 px-1.5">Unit Name / Model</th>
                            <th className="py-1 px-1.5">Role / Function</th>
                            <th className="py-1 px-1.5">Fixture Type</th>
                            <th className="py-1 px-1.5 text-right">Specs / Output</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {(() => {
                            const map = new Map<
                              string,
                              { brand: string; model: string; role: string; type: string; qty: number; specs: string }
                            >();
                            lights.forEach((l) => {
                              const typeObj = LIGHT_FIXTURES.find((f) => f.type === l.fixtureType);
                              const typeName = typeObj ? typeObj.name : l.fixtureType;
                              const brand = l.brand || 'Generic / Unspecified';
                              const unitName = isFlagFixture(l.fixtureType) ? flagLabel(l) : (l.name || l.fixtureModel || typeName);
                              const roleObj = LIGHT_ROLES.find((r) => r.value === l.lightRole);
                              const roleLabel = roleObj ? roleObj.label : 'Unassigned';
                              const specs = isFlagFixture(l.fixtureType)
                                ? (l.lightRole && l.lightRole !== 'unassigned' ? roleLabel : 'Grip / Flag')
                                : `${l.colorTemp > 0 ? `${l.colorTemp}K` : 'RGB'} @ ${l.intensity}%`;

                              const key = `${brand}|${unitName}|${roleLabel}|${specs}`;
                              const existing = map.get(key);
                              if (existing) {
                                existing.qty += 1;
                              } else {
                                map.set(key, { brand, model: unitName, role: roleLabel, type: typeName, qty: 1, specs });
                              }
                            });

                            return Array.from(map.values()).map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-100/60 font-mono">
                                <td className="py-1 px-1.5 font-bold text-sky-600">x{item.qty}</td>
                                <td className="py-1 px-1.5 font-semibold text-slate-800">{item.brand}</td>
                                <td className="py-1 px-1.5 font-bold text-slate-900">{item.model}</td>
                                <td className="py-1 px-1.5 text-slate-700">
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-sans font-semibold">
                                    {item.role}
                                  </span>
                                </td>
                                <td className="py-1 px-1.5 text-slate-600 font-sans">{item.type}</td>
                                <td className="py-1 px-1.5 text-right font-semibold text-slate-700">{item.specs}</td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION S: STORYBOARD CONTACT SHEET                                        */}
          {/* ========================================================================= */}
          {(exportSection === 'storyboard' || (exportSection === 'combined' && showStoryboards)) && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-violet-600" />
                  <span>Storyboard</span>
                </h3>
                <span className="font-mono text-xs font-bold text-slate-700">
                  {activeSetup.shots.length} FRAME{activeSetup.shots.length === 1 ? '' : 'S'} ·{' '}
                  {activeSetup.aspectRatio || '16:9'}
                </span>
              </div>

              {activeSetup.shots.length === 0 ? (
                <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
                  No shots in this scene yet.
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {orderedStoryboardShots(activeSetup).map((shot) => {
                    const cam = cameras.find((camera) => camera.id === shot.cameraId);
                    // One printed frame per camera keyframe
                    const frameSlots = slotsOf(shot, cam);
                    const hasMove = frameSlots.length > 1;
                    return (
                      <div
                        key={shot.id}
                        className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid"
                      >
                        <div className="relative border-b border-slate-300">
                          {/* A move prints both frames stacked over each other */}
                          <div className={hasMove ? 'flex flex-col gap-1 bg-slate-200 p-0.5' : ''}>
                            {frameSlots.map((slot) => {
                              const image = slot.frame?.image;
                              const fit = slot.frame?.fit || 'cover';
                              return (
                                <div
                                  key={slot.key}
                                  className="relative w-full bg-slate-100"
                                  style={{ aspectRatio: String(sceneAspectRatio) }}
                                >
                                  {image ? (
                                    <img
                                      src={image}
                                      alt=""
                                      className="absolute inset-0 w-full h-full"
                                      style={{ objectFit: fit }}
                                    />
                                  ) : (
                                    // Shots without artwork still print their frame,
                                    // so the board can be drawn in by hand on set.
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-400">
                                      (no storyboard)
                                    </span>
                                  )}
                                  {hasMove && slot.short && (
                                    <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-slate-900 text-white text-[8px] font-mono font-bold">
                                      {slot.short}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono font-bold">
                            {shot.shotNumber}
                          </span>
                          {shot.movement && (
                            <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-amber-500 text-black text-[9px] font-bold">
                              {shot.movement}
                            </span>
                          )}
                        </div>
                        <div className="p-1.5">
                          <p className="text-[11px] font-bold text-slate-900 leading-snug">{shot.name}</p>
                          {shot.framingDescription && (
                            <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                              {shot.framingDescription}
                            </p>
                          )}
                          <p className="text-[9px] font-mono text-slate-500 mt-1">
                            {shot.shotSize} · {shot.lensMm}mm · {shot.movement}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION L: SCRIPT / AV 2-COLUMN SCRIPT / LINED SHOOTING SCRIPT              */}
          {/* ========================================================================= */}
          {(exportSection === 'linedscript' || exportSection === 'combined') && (
            <div className="mb-8">
              {scriptFormatMode === 'av_script' ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <Film className="w-4 h-4 text-violet-600" />
                      <span>Audio-Visual (AV) 2-Column Script Sheet</span>
                    </h3>
                    <span className="font-mono text-xs font-bold text-slate-700">
                      {(avScriptRows || []).length} SHOTS
                    </span>
                  </div>

                  <div className="border border-slate-900 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 font-bold">
                          <th className="p-2.5 font-mono w-16 text-center">SHOT #</th>
                          <th className="p-2.5 w-44">NAME & SIZE</th>
                          <th className="p-2.5 w-1/2">VIDEO (VISUALS & CAMERA)</th>
                          <th className="p-2.5 w-1/2">AUDIO (VO, DIALOGUE, SFX, MUSIC)</th>
                          <th className="p-2.5 font-mono w-16 text-center">TIME</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300">
                        {(avScriptRows || []).map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-black text-slate-900 text-center">
                              {row.shotNumber}
                            </td>
                            <td className="p-2.5">
                              <div className="font-bold text-slate-900">{row.shotName || `Shot ${row.shotNumber}`}</div>
                              {row.shotSize && (
                                <span className="inline-block px-1.5 py-0.5 mt-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-bold">
                                  {row.shotSize}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {row.video}
                            </td>
                            <td className="p-2.5 text-slate-800 whitespace-pre-wrap leading-relaxed font-mono text-[11px]">
                              {row.audio}
                            </td>
                            <td className="p-2.5 font-mono text-center text-slate-600">
                              {row.durationSec ? `${row.durationSec}s` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-violet-600" />
                      <span>Lined Shooting Script</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-lg border border-slate-300 p-0.5 print:hidden">
                        <button
                          onClick={() => setScriptScope('lined')}
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                            scriptScope === 'lined' ? 'bg-sky-600 text-white' : 'text-slate-600'
                          }`}
                        >
                          Lined portions
                        </button>
                        <button
                          onClick={() => setScriptScope('full')}
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                            scriptScope === 'full' ? 'bg-sky-600 text-white' : 'text-slate-600'
                          }`}
                        >
                          Full screenplay
                        </button>
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-700">
                        {allScriptMarks.length} LINED SHOT{allScriptMarks.length === 1 ? '' : 'S'}
                      </span>
                    </div>
                  </div>
                  {scriptLines.length === 0 ? (
                    <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
                      No screenplay imported for this scene — load one in the Script panel to print a lined script.
                    </p>
                  ) : (
                    <div className="border border-slate-300 rounded-lg p-3 bg-white">
                      {printedScriptLines.length === 0 ? (
                        <p className="text-xs text-slate-500 p-3">
                          Nothing is lined yet — line a shot in the Script panel, or switch to “Full screenplay”.
                        </p>
                      ) : (
                        <LinedScriptPage
                          lines={printedScriptLines}
                          marks={allScriptMarks}
                          shots={allShots}
                          fontSize={11}
                          showShotSize={eff.showShotSizeInScript !== false}
                          isLight
                          print
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION B: COVERAGE SHOT LIST BREAKDOWN TABLE                              */}
          {/* ========================================================================= */}
          {(exportSection === 'shotlist' || exportSection === 'combined') && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-sky-600" />
                  <span>Coverage & Shot Breakdown Sheet</span>
                </h3>
                <span className="font-mono text-xs font-bold text-slate-700">
                  {activeSetup.shots.length} Planned Shots
                </span>
              </div>

              <div className="border border-slate-900 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 font-bold">
                      {showStoryboards && (
                        <th className="p-2.5 w-16">STORY</th>
                      )}
                      <th className="p-2.5 font-mono w-16">SHOT #</th>
                      <th className="p-2.5 w-14">CAM</th>
                      <th className="p-2.5 w-14">SIZE</th>
                      <th className="p-2.5 w-14 font-mono">LENS</th>
                      <th className="p-2.5 w-24">ANGLE</th>
                      <th className="p-2.5 w-24">MOVEMENT</th>
                      <th className="p-2.5">FRAMING & ACTION DESCRIPTION</th>
                      <th className="p-2.5 font-mono w-20 text-center">TAKES</th>
                      <th className="p-2.5 font-mono w-16 text-center">DONE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {activeSetup.shots.map((shot) => {
                      const linkedCam = cameras.find((c) => c.id === shot.cameraId);
                      return (
                        <tr key={shot.id} className="hover:bg-slate-50">
                          {showStoryboards && (
                            <td className="p-2.5 align-middle">
                              {shot.storyboardImage ? (
                                <div
                                  className="overflow-hidden rounded border border-slate-300 bg-slate-100"
                                  style={{ width: 64, aspectRatio: `${sceneAspectRatio} / 1` }}
                                >
                                  <img
                                    src={shot.storyboardImage}
                                    alt={`Storyboard ${shot.shotNumber}`}
                                    className="w-full h-full"
                                    style={{
                                      objectFit: shot.storyboardFit === 'contain' ? 'contain' : 'cover',
                                      objectPosition: `${shot.storyboardPosition?.x ?? 50}% ${shot.storyboardPosition?.y ?? 50}%`,
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="w-16 h-10 rounded border border-dashed border-slate-300 flex items-center justify-center text-[9px] text-slate-400">
                                  No story
                                </div>
                              )}
                            </td>
                          )}
                          <td className="p-2.5 font-mono font-black text-slate-900 text-sm">
                            {shot.shotNumber}
                          </td>
                          <td className="p-2.5 font-bold">
                            {linkedCam ? linkedCam.cameraLabel : '—'}
                          </td>
                          <td className="p-2.5 font-bold uppercase">
                            {shot.shotSize}
                          </td>
                          <td className="p-2.5 font-mono">
                            {shot.lensMm}mm
                          </td>
                          <td className="p-2.5 text-slate-800">
                            {shot.cameraAngle}
                          </td>
                          <td className="p-2.5 text-slate-800">
                            {shot.movement}
                          </td>
                          <td className="p-2.5 text-slate-800">
                            <div className="font-bold text-slate-900">{shot.name}</div>
                            {shot.framingDescription && (
                              <div className="text-[11px] text-slate-600 mt-0.5">
                                {shot.framingDescription}
                              </div>
                            )}
                            {shot.equipmentNotes && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Equipment: {shot.equipmentNotes}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-center font-bold">
                            {shot.takesCount || 0}
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="w-4 h-4 border border-slate-900 rounded mx-auto" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
