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
import { ActorElementView } from '../canvas/ActorElementView';
import { CameraElementView } from '../canvas/CameraElementView';
import { LightingLayer } from '../canvas/LightingLayer';
import { PropsLayer } from '../canvas/PropsLayer';
import { WallLayer } from '../canvas/WallLayer';
import { StoryboardThumbLayer } from '../canvas/StoryboardThumbLayer';
import { LinedScriptPage, linedExcerpt } from '../script/LinedScriptPage';
import { orderedStoryboardShots } from '../../utils/storyboardOrder';
import { slotsOf, boardedFrames, visibleStoryboardSlots } from '../../utils/storyboardFrames';
import { Shot } from '../../types';
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
  const [omitBlankWaypoints, setOmitBlankWaypoints] = useState(
    displaySettings.hideBlankStoryboardWaypoints ?? false
  );
  const [exportViewMode, setExportViewMode] = useState<'full' | 'canvas'>('full');
  const [customOverrides, setCustomOverrides] = useState<Partial<DisplaySettings>>({});

  // When the export opens, default the storyboard toggle ON if any shot has a
  // storyboard attached (still fully toggleable off/on by the user).
  useEffect(() => {
    if (isExportModalOpen) {
      setShowStoryboards(activeSetup.shots.some((s) => !!s.storyboardImage));
      setOmitBlankWaypoints(displaySettings.hideBlankStoryboardWaypoints ?? false);
    }
  }, [isExportModalOpen, activeSetup, displaySettings.hideBlankStoryboardWaypoints]);

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
        fovConeOpacity: displaySettings.fovConeOpacity ?? 1,
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

  const effectiveDisplaySettings: DisplaySettings = React.useMemo(() => {
    return {
      ...displaySettings,
      showFovCones: eff.showFovCones,
      showLightBeams: eff.showLightBeams,
      showLabels: eff.showLabels,
      showActorLabels: eff.showActorLabels,
      showCameraLabels: eff.showCameraLabels,
      showPropLabels: eff.showPropLabels,
      showTrackLabels: eff.showTrackLabels,
      showLightLabels: eff.showLightLabels,
      showLightNameLabels: eff.showLightNameLabels,
      showLightRoleLabels: eff.showLightRoleLabels,
      showLightKelvinLabels: eff.showLightKelvinLabels,
      showLightIntensityLabels: eff.showLightIntensityLabels,
      showMeasurementLabels: eff.showMeasurementLabels,
      showDoorWindowLabels: eff.showDoorWindowLabels,
      showShotSizeInScript: eff.showShotSizeInScript,
      showShotSizeOnCamera: eff.showShotSizeOnCamera,
      showShotLensOnCamera: eff.showShotLensOnCamera,
      showShotAngleOnCamera: eff.showShotAngleOnCamera,
      showShotNumberOnCamera: eff.showShotNumberOnCamera,
      showLensFovLabel: eff.showLensFovLabel,
      showWaypoints: eff.showWaypoints,
      showWaypointCues: eff.showWaypointCues,
      showStoryboardThumbs: eff.showStoryboardThumbs,
      showGrid: eff.showGrid,
      fovConeOpacity: eff.fovConeOpacity ?? displaySettings.fovConeOpacity ?? 1.0,
      labelOpacity: eff.labelOpacity ?? displaySettings.labelOpacity ?? 1.0,
      labelCategoryOpacity: eff.labelCategoryOpacity ?? displaySettings.labelCategoryOpacity,
      categoryOpacity: eff.categoryOpacity ?? displaySettings.categoryOpacity,
    };
  }, [displaySettings, eff]);

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

  const getShotForCamera = (camera: CameraElement): Shot | null => {
    if (camera.associatedShotId) {
      const assoc = activeSetup.shots.find((s) => s.id === camera.associatedShotId);
      if (assoc) return assoc;
    }
    return activeSetup.shots.find((s) => s.cameraId === camera.id) || null;
  };

  const storyboardThumbs = cameras
    .map((c) => ({ camera: c, shot: getShotForCamera(c) }))
    .filter(
      (item): item is { camera: CameraElement; shot: Shot } =>
        !!item.shot && boardedFrames(item.shot, item.camera).length > 0
    );

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

            {/* Omit blank waypoints toggle for storyboard export */}
            {(exportSection === 'storyboard' || (exportSection === 'combined' && showStoryboards)) && (
              <button
                onClick={() => setOmitBlankWaypoints((prev) => !prev)}
                title={
                  omitBlankWaypoints
                    ? 'Show all waypoint keyframes (including unboarded waypoints) on the exported storyboard'
                    : 'Omit blank waypoint keyframes (only print waypoints with attached art)'
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  omitBlankWaypoints
                    ? 'bg-violet-600 text-white border-violet-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${
                    omitBlankWaypoints ? 'bg-white text-violet-700 border-white' : 'border-slate-500'
                  }`}
                >
                  {omitBlankWaypoints ? '✓' : ''}
                </span>
                Omit Blank Waypoints
              </button>
            )}

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

                                    {/* 1. Walls, Doors & Windows */}
                  <WallLayer
                    walls={walls}
                    doors={doors}
                    windows={windows}
                    selectedIds={[]}
                    showLightBeams={effectiveDisplaySettings.showLightBeams}
                    showDoorWindowLabels={effectiveDisplaySettings.showLabels && effectiveDisplaySettings.showDoorWindowLabels}
                    onSelect={() => {}}
                    categoryOpacity={effectiveDisplaySettings.categoryOpacity}
                    labelOpacity={(effectiveDisplaySettings.labelOpacity ?? 1) * (effectiveDisplaySettings.labelCategoryOpacity?.doorWindows ?? 1)}
                    labelColor={effectiveDisplaySettings.doorWindowLabelColor}
                  />

                  {/* 2. Basic Shapes (Zones, Carpets, Areas) */}
                  <ShapesLayer
                    shapes={shapes}
                    selectedIds={[]}
                    onSelect={() => {}}
                    canvasScale={1}
                  />

                  {/* 3. Dolly Tracks, Props, Measurements, Arrows, Texts */}
                  <PropsLayer
                    propsList={props}
                    tracks={tracks}
                    measurements={measurements}
                    arrows={arrows}
                    texts={texts}
                    selectedIds={[]}
                    onSelect={() => {}}
                    pixelsPerUnit={activeSetup.gridSettings?.pixelsPerUnit || 50}
                    displaySettings={effectiveDisplaySettings}
                  />

                  {/* 4. Lighting Fixtures, Beams & Flags */}
                  <LightingLayer
                    lights={lights}
                    selectedIds={[]}
                    onSelect={() => {}}
                    displaySettings={effectiveDisplaySettings}
                  />

                  {/* 5. Actors & Blocking Waypoints */}
                  {actors.map((actor) => (
                    <ActorElementView
                      key={actor.id}
                      actor={actor}
                      isSelected={false}
                      isHighlighted={false}
                      currentBeat={1}
                      isPlaying={false}
                      onSelect={() => {}}
                      displaySettings={effectiveDisplaySettings}
                    />
                  ))}

                  {/* 6. Cameras, FOV Cones & Shots */}
                  {cameras.map((camera) => (
                    <CameraElementView
                      key={camera.id}
                      camera={camera}
                      shot={getShotForCamera(camera)}
                      isSelected={false}
                      isHighlighted={false}
                      currentBeat={1}
                      isPlaying={false}
                      onSelect={() => {}}
                      displaySettings={effectiveDisplaySettings}
                    />
                  ))}

                  {/* 7. Storyboard Thumbnails pinned near camera */}
                  {showStoryboards && effectiveDisplaySettings.showStoryboardThumbs && (
                    <StoryboardThumbLayer
                      items={storyboardThumbs}
                      canvasScale={1}
                      aspectRatio={sceneAspectRatio}
                      isInteractive={false}
                      onSelectCamera={() => {}}
                    />
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
                  {orderedStoryboardShots(activeSetup).reduce(
                    (sum, s) =>
                      sum +
                      visibleStoryboardSlots(
                        s,
                        cameras.find((c) => c.id === s.cameraId),
                        omitBlankWaypoints
                      ).length,
                    0
                  )}{' '}
                  FRAME{orderedStoryboardShots(activeSetup).length === 1 ? '' : 'S'} ·{' '}
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
                    // One printed frame per camera keyframe (blank waypoints optionally omitted)
                    const frameSlots = visibleStoryboardSlots(shot, cam, omitBlankWaypoints);
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
