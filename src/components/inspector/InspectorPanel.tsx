import React, { useEffect, useId, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  ActorElement,
  ArrowElement,
  CableElement,
  CameraElement,
  DoorElement,
  FloorPlanElement,
  LightElement,
  PropElement,
  RoadElement,
  SceneSetup,
  ShapeElement,
  Shot,
  ShapeType,
  StrokeElement,
  TextElement,
  TrackElement,
  WallElement,
  Waypoint,
  WindowElement,
} from '../../types';
import {
  ACTOR_COLOR_PALETTE,
  ASPECT_RATIOS,
  CABLE_TYPES,
  CAMERA_BODY_PRESETS,
  CAMERA_COLOR_PALETTE,
  CAMERA_HEIGHTS,
  CAMERA_RIGS,
  DEFAULT_FLAG_SIZE,
  FLAG_SIZE_PRESETS,
  FOCAL_LENGTH_PRESETS,
  LIGHT_FIXTURES,
  LIGHTING_BRANDS,
  LIGHT_ROLES,
  PROP_CATALOG,
  SENSOR_FORMATS,
} from '../../constants/presets';
import { validateConnectionCompatibility } from '../../domain/cable';
import { cloneSetupWithNewIds } from '../../domain/clone';
import { createId } from '../../domain/ids';
import { collectCharacterDialogue, deriveScriptBreakdown } from '../../domain/script/logic';
import { bakeGroupRotation, groupPivotOf } from '../../domain/plan';
import { impliedEndpointInfo, impliedSignalTypeForCableType } from '../../domain/cable/cableTypeSignals';
import { flagLabel, isFlagFixture } from '../canvas/FlagFixtureIcon';
import { LayersPanel } from '../canvas/LayersPanel';
import type { DisplaySettings } from '../../context/FloorPlanContext';
import { DmxUniverseView } from '../equipment/DmxUniverseView';
import { FixtureProfilePicker } from './FixtureProfilePicker';
import { calculateFovAngle, ensureHexColor, hexToHsv, hexToRgbParts, hsvToHex, kelvinToHex, kelvinToRgb, rgbToHex } from '../../utils/geometry';
import { APERTURES, FRAME_RATES, ISO_VALUES, ND_FILTERS, SHUTTER_ANGLES } from '../../constants/presets';

const SHAPE_TYPES: ShapeType[] = [
  'line',
  'rectangle',
  'circle',
  'ellipse',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
];
import { loadLogoFile, loadStoryboardImageFile } from '../../utils/image';
import { framesOf, setFramePatch, slotsOf } from '../../utils/storyboardFrames';
import { FresnelLightIcon, MovieCameraIcon } from '../icons/ProductionIcons';
import {
  findProfileForModel,
  fixtureProfileLinkUpdates,
  fixtureProfileSummary,
  listBrandOptions,
  profilesForBrand,
} from '../../domain/fixtures';
import { useFixtureCatalog } from './useFixtureCatalog';
import {
  Circle,
  Compass,
  Copy,
  Crosshair,
  DoorClosed,
  Eye,
  EyeOff,
  Film,
  Flame,
  FlipHorizontal,
  Image as ImageIcon,
  ImagePlus,
  Lock,
  Maximize,
  MapPin,
  MessageCircle,
  Move3d,
  Palette,
  RotateCcw,
  RotateCw,
  Ruler,
  Sliders,
  SquareSplitHorizontal,
  Sun,
  Trash2,
  Tv,
  Unlock,
  User,
  Users,
  Video,
  AppWindow,
  Tags,
  Grid3x3,
  AlignLeft,
  AlignRight,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignStartVertical,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  ChevronDown,
  ChevronRight,
  Gauge,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Settings2,
  Square,
  Type,
  MoveRight,
  Cable,
  Database,
  Zap,
  Package,
} from 'lucide-react';
import { AssembliesPanel, promptSaveAssemblyFromIds } from '../canvas/AssembliesPanel';

type AlignMode = 'left' | 'right' | 'hcenter' | 'top' | 'bottom' | 'vcenter';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Approximate 2D bounding box of an element on the floor plan, used for align/distribute. */
function getElementBounds(el: FloorPlanElement): Bounds {
  if (el.type === 'prop' || el.type === 'shape') {
    const w = (el as any).width || 80;
    const h = (el as any).height || 50;
    return { minX: el.x - w / 2, minY: el.y - h / 2, maxX: el.x + w / 2, maxY: el.y + h / 2 };
  }
  if (el.type === 'wall') {
    const x2 = (el as any).x2 ?? el.x;
    const y2 = (el as any).y2 ?? el.y;
    return { minX: Math.min(el.x, x2), minY: Math.min(el.y, y2), maxX: Math.max(el.x, x2), maxY: Math.max(el.y, y2) };
  }
  if (el.type === 'door' || el.type === 'window') {
    const w = (el as any).width || 60;
    const h = 18;
    return { minX: el.x - w / 2, minY: el.y - h / 2, maxX: el.x + w / 2, maxY: el.y + h / 2 };
  }
  if (el.type === 'light') return { minX: el.x - 14, minY: el.y - 14, maxX: el.x + 14, maxY: el.y + 14 };
  if (el.type === 'actor') return { minX: el.x - 22, minY: el.y - 22, maxX: el.x + 22, maxY: el.y + 22 };
  if (el.type === 'camera') return { minX: el.x - 22, minY: el.y - 22, maxX: el.x + 22, maxY: el.y + 22 };
  return { minX: el.x - 15, minY: el.y - 15, maxX: el.x + 15, maxY: el.y + 15 };
}

/** Compact on/off pill used in the Display & Labels panel */
import { LightInspector } from './elements/LightInspector';
import { compassPoint, formatSunTime, sunPosition, sunTimes } from '../../domain/sun';
import { ProjectImage } from '../common/ProjectImage';
import {
  ColorField,
  PillToggle,
  RubricSection,
  StoryboardField,
  WaypointListEditor,
} from './shared/InspectorPrimitives';

export const InspectorPanel: React.FC = () => {
  // Prefix for pairing each caption with its control (`htmlFor`/`id`). From
  // `useId` so two instances of this panel on screen cannot collide — the
  // captions used to be plain siblings with no `htmlFor`, which meant screen
  // readers announced every one of these inputs unlabelled.
  const fieldId = useId();
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const [dmxUniverseFixtureId, setDmxUniverseFixtureId] = useState<string | null>(null);
  // Merged brand/model catalog: curated presets + bundled OFL snapshot + custom profiles.
  const fixtureProfiles = useFixtureCatalog().profiles;
  const brandOptions = React.useMemo(() => listBrandOptions(LIGHTING_BRANDS, fixtureProfiles), [fixtureProfiles]);
  const {
    activeSetup,
    project,
    updateProjectMeta,
    selectedElementIds,
    updateElement,
    deleteSelectedElements,
    duplicateSelected,
    openViewfinder,
    selectShot,
    updateShot,
    playback,
    updateSetupMeta,
    setActiveSetupId,
    insertDoorInWall,
    insertWindowInWall,
    rotateElementBy,
    theme,
    backgroundImages,
    selectedBackgroundId,
    setSelectedBackgroundId,
    updateBackgroundImage,
    removeBackgroundImage,
    displaySettings,
    updateDisplaySettings,
    updateMultipleElements,
    setGridSettings,
    calibratingBackgroundId,
    startBackgroundCalibration,
    cancelBackgroundCalibration,
  } = useFloorPlan();

  /**
   * Sun planning for this scene (plan §37). Everything derives from the linked
   * location's pin; with no pin there is nothing to compute and the section
   * says so instead of guessing coordinates.
   */
  const sunLocation = React.useMemo(() => {
    const location = (project.locations ?? []).find((l) => l.id === activeSetup.locationId);
    return location?.lat !== undefined && location?.lng !== undefined ? location : null;
  }, [project.locations, activeSetup.locationId]);

  const sunMoment = React.useMemo(() => {
    const iso = activeSetup.sunSettings?.date || project.date;
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
    if (!parts) return null;
    const minutes = activeSetup.sunSettings?.timeMinutes ?? 720;
    return new Date(
      Number(parts[1]),
      Number(parts[2]) - 1,
      Number(parts[3]),
      Math.floor(minutes / 60),
      minutes % 60,
    );
  }, [activeSetup.sunSettings?.date, activeSetup.sunSettings?.timeMinutes, project.date]);

  const sunDayTimes = React.useMemo(
    () =>
      sunLocation && sunMoment
        ? sunTimes({ lat: sunLocation.lat!, lng: sunLocation.lng!, date: sunMoment })
        : null,
    [sunLocation, sunMoment],
  );

  const sunReadout = React.useMemo(() => {
    if (!sunLocation || !sunMoment) return null;
    const sun = sunPosition({ lat: sunLocation.lat!, lng: sunLocation.lng!, date: sunMoment });
    return sun.elevationDeg > 0
      ? `${compassPoint(sun.azimuthDeg)} ${Math.round(sun.elevationDeg)}°`
      : 'below horizon';
  }, [sunLocation, sunMoment]);

  const patchSunSettings = (updates: Partial<NonNullable<SceneSetup['sunSettings']>>) =>
    updateSetupMeta({ sunSettings: { ...(activeSetup.sunSettings ?? {}), ...updates } });

  /** "07:30" from minutes past midnight. */
  const formatMinutesOfDay = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  const isLight = theme === 'light';
  // Shared styling for the camera exposure dropdowns
  const selectClass = `w-full border rounded px-1.5 py-1 text-[11px] ${
    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
  }`;

  // Script characters (persisted catalog merged with cues detected in the
  // attached screenplay) for linking actor markers; empty when no script.
  const scriptCharacters = React.useMemo(
    () => deriveScriptBreakdown(
      project.scriptLines || [],
      project.characters || [],
      project.locations || [],
    ).characters,
    [project.scriptLines, project.characters, project.locations],
  );

  // --- Location link (plan §4.13 semantic links + §13 master plans) ---

  const assignedLocation = (project.locations ?? []).find(
    (l) => l.id === activeSetup.locationId
  );
  /** The setup currently declared as master plan for the assigned location. */
  const masterSetupForLocation = assignedLocation
    ? project.setups.find((s) => s.masterPlanForLocationId === assignedLocation.id)
    : undefined;
  const isThisSetupTheMaster =
    !!assignedLocation &&
    (activeSetup.masterPlanForLocationId === assignedLocation.id ||
      assignedLocation.masterPlanId === activeSetup.id);

  /** Assign/unassign the semantic location link; releases mastership cleanly. */
  const assignSetupLocation = (locationId: string) => {
    const nextId = locationId || undefined;
    const prevLocation = assignedLocation;
    if (prevLocation && prevLocation.id !== nextId) {
      const wasMasterHere =
        prevLocation.masterPlanId === activeSetup.id ||
        activeSetup.masterPlanForLocationId === prevLocation.id;
      if (wasMasterHere) {
        updateProjectMeta({
          locations: (project.locations ?? []).map((l) =>
            l.id === prevLocation.id ? { ...l, masterPlanId: undefined } : l
          ),
        });
        updateSetupMeta({ locationId: nextId, masterPlanForLocationId: undefined });
        return;
      }
    }
    updateSetupMeta({ locationId: nextId });
  };

  /**
   * Declare this setup as THE reusable master plan for its assigned location.
   * Both sides are kept in sync: SceneSetup.masterPlanForLocationId (§4.13)
   * and Location.masterPlanId. Any previous claimant is demoted first.
   */
  const makeThisSetupMasterPlan = () => {
    const targetId = activeSetup.locationId;
    if (!targetId) return;
    updateProjectMeta({
      locations: (project.locations ?? []).map((l) =>
        l.id === targetId
          ? { ...l, masterPlanId: activeSetup.id }
          : l.masterPlanId === activeSetup.id
          ? { ...l, masterPlanId: undefined }
          : l
      ),
      setups: project.setups.map((s) =>
        s.id !== activeSetup.id && s.masterPlanForLocationId === targetId
          ? { ...s, masterPlanForLocationId: undefined }
          : s
      ),
    });
    updateSetupMeta({ masterPlanForLocationId: targetId });
  };

  const unsetMasterPlan = () => {
    if (!assignedLocation) return;
    updateProjectMeta({
      locations: (project.locations ?? []).map((l) =>
        l.id === assignedLocation.id ? { ...l, masterPlanId: undefined } : l
      ),
    });
    updateSetupMeta({ masterPlanForLocationId: undefined });
  };

  /**
   * Detach-style copy (§13.1): snapshot the master plan's elements into THIS
   * setup with fresh ids — future edits stay independent on both sides.
   */
  const insertCopyOfMasterElements = () => {
    if (!masterSetupForLocation) return;
    const cloned = cloneSetupWithNewIds(masterSetupForLocation);
    updateSetupMeta({ elements: [...activeSetup.elements, ...cloned.elements] });
  };

  // Dedicated Reference Image inspector — shown when a background image is
  // selected on the canvas (separate from the Scene Setup inspector).
  const selectedBg = backgroundImages.find((b) => b.id === selectedBackgroundId);
  if (selectedBg) {
    return (
      <div
        id="inspector-panel-image"
        className={`flex flex-col h-full text-xs p-4 space-y-4 select-none overflow-y-auto ${
          isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200'
        }`}
      >
        <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 text-teal-500 flex-shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider truncate">
              Reference Image
            </h3>
          </div>
          <button
            onClick={() => setSelectedBackgroundId(null)}
            title="Close image settings (back to scene setup)"
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
              isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            ✕
          </button>
        </div>

        {/* Thumbnail preview */}
        <div className={`rounded-xl overflow-hidden border ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div
            className="w-full h-32 bg-slate-100 flex items-center justify-center"
            style={{ backgroundImage: 'linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%),linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0, 8px 8px' }}
          >
            <img
              src={selectedBg.url}
              alt={selectedBg.name || 'Reference image'}
              className="max-h-32 max-w-full object-contain"
              style={{ opacity: selectedBg.opacity ?? 0.5 }}
            />
          </div>
        </div>

        {/* Name */}
        <div>
          <label htmlFor={`${fieldId}-image-name`} className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Image Name
          </label>
          <input id={`${fieldId}-image-name`}
            type="text"
            value={selectedBg.name || ''}
            onChange={(e) => updateBackgroundImage(selectedBg.id, { name: e.target.value })}
            placeholder="e.g. Floorplan Scan, Scout Photo"
            className={`w-full border rounded-lg p-2 focus:border-teal-500 focus:outline-none ${
              isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
            }`}
          />
        </div>

        {/* Opacity */}
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="opacity-60">Opacity</span>
            <span className="font-mono font-bold text-teal-500">
              {Math.round((selectedBg.opacity ?? 0.5) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={selectedBg.opacity ?? 0.5}
            onChange={(e) => updateBackgroundImage(selectedBg.id, { opacity: parseFloat(e.target.value) })}
            className="w-full accent-teal-500 cursor-pointer"
          />
        </div>

        {/* Position & Size */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${fieldId}-x`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>X</label>
            <input id={`${fieldId}-x`}
              type="number"
              value={Math.round(selectedBg.x)}
              onChange={(e) => updateBackgroundImage(selectedBg.id, { x: Number(e.target.value) })}
              className={`w-full border rounded-lg p-2 focus:border-teal-500 ${
                isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-y`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Y</label>
            <input id={`${fieldId}-y`}
              type="number"
              value={Math.round(selectedBg.y)}
              onChange={(e) => updateBackgroundImage(selectedBg.id, { y: Number(e.target.value) })}
              className={`w-full border rounded-lg p-2 focus:border-teal-500 ${
                isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-width`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Width</label>
            <input id={`${fieldId}-width`}
              type="number"
              value={Math.round(selectedBg.width)}
              onChange={(e) => updateBackgroundImage(selectedBg.id, { width: Number(e.target.value) })}
              className={`w-full border rounded-lg p-2 focus:border-teal-500 ${
                isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-height`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Height</label>
            <input id={`${fieldId}-height`}
              type="number"
              value={Math.round(selectedBg.height)}
              onChange={(e) => updateBackgroundImage(selectedBg.id, { height: Number(e.target.value) })}
              className={`w-full border rounded-lg p-2 focus:border-teal-500 ${
                isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
        </div>

        <div className={`rounded-xl border p-3 space-y-2 ${
          isLight ? 'bg-orange-50 border-orange-200' : 'bg-orange-950/20 border-orange-900/70'
        }`}>
          <div className="flex items-start gap-2">
            <Ruler className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-bold">Set image scale from a known distance</div>
              <p className="text-[10px] opacity-65 mt-0.5">
                Mark both ends of a printed scale bar or known dimension, then enter its real length.
              </p>
            </div>
          </div>
          {selectedBg.calibration && (
            <div className={`text-[10px] rounded-md px-2 py-1.5 ${isLight ? 'bg-white/80' : 'bg-slate-950/50'}`}>
              Calibrated from {selectedBg.calibration.realLength}{selectedBg.calibration.unit} · image resized {selectedBg.calibration.appliedScaleFactor.toFixed(3)}×
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (calibratingBackgroundId === selectedBg.id) cancelBackgroundCalibration();
              else if (selectedBg.id) startBackgroundCalibration(selectedBg.id);
            }}
            className={`w-full py-2 rounded-lg text-[11px] font-bold border transition-colors ${
              calibratingBackgroundId === selectedBg.id
                ? 'bg-slate-700 text-white border-slate-600'
                : 'bg-orange-500 hover:bg-orange-400 text-slate-950 border-orange-400'
            }`}
          >
            {calibratingBackgroundId === selectedBg.id ? 'Cancel scale calibration' : selectedBg.calibration ? 'Recalibrate scale' : 'Calibrate scale'}
          </button>
        </div>

        {/* Visibility / Lock */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => updateBackgroundImage(selectedBg.id, { visible: !selectedBg.visible })}
            className={`py-2 text-[11px] font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
              selectedBg.visible
                ? isLight ? 'bg-teal-50 text-teal-700 border-teal-300' : 'bg-teal-950/40 text-teal-300 border-teal-800'
                : isLight ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            {selectedBg.visible ? 'Visible' : 'Hidden'}
          </button>
          <button
            onClick={() => updateBackgroundImage(selectedBg.id, { locked: !selectedBg.locked })}
            title={selectedBg.locked ? 'Unlock (allow moving & resizing)' : 'Lock (prevent accidental moves)'}
            className={`py-2 text-[11px] font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
              selectedBg.locked
                ? isLight ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-amber-950/40 text-amber-300 border-amber-800'
                : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            {selectedBg.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {selectedBg.locked ? 'Locked' : 'Unlocked'}
          </button>
        </div>

        {/* Delete */}
        <button
          onClick={() => {
            removeBackgroundImage(selectedBg.id);
            setSelectedBackgroundId(null);
          }}
          className={`w-full py-2 text-[11px] font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
            isLight
              ? 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100'
              : 'bg-red-950/30 text-red-400 border-red-900 hover:bg-red-950/60'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Image
        </button>

        <p className={`text-[10px] italic ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
          Drag the image on the canvas to move it, use the corner handles to scale
          (proportions preserved), or press <strong>Delete</strong> to remove it.
        </p>
      </div>
    );
  }

  if (selectedElementIds.length === 0) {
    // Show Scene / Setup Meta Inspector
    return (
      <div
        id="inspector-panel-empty"
        className={`flex flex-col h-full text-xs p-4 space-y-4 select-none overflow-y-auto ${
          isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200'
        }`}
      >
        {/* Nothing is selected, so this is the plan/scene settings view rather
            than an element inspector. The two are named apart on purpose:
            "inspector" means the selected element, everything here applies to
            the whole plan, scene or project. */}
        <div className={`pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              Plan &amp; Scene Settings
            </h3>
          </div>
          <p className={`mt-1 text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Nothing selected — pick an element on the plan to inspect it.
          </p>
        </div>
        <AssembliesPanel />
        <div className="space-y-3">
          {/* Rubric 1: Scene & Environment */}
          <RubricSection
            title="Scene & Environment"
            icon={<Sliders className="w-3.5 h-3.5 text-sky-500" />}
            badge={
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500 font-semibold">
                Scene {activeSetup.sceneNumber}
              </span>
            }
            defaultOpen={true}
            isLight={isLight}
          >
            <div>
              <label htmlFor={`${fieldId}-scene-setup-name`} className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Scene Setup Name</label>
              <input id={`${fieldId}-scene-setup-name`}
                type="text"
                value={activeSetup.name}
                onChange={(e) => updateSetupMeta({ name: e.target.value })}
                className={`w-full border rounded-lg p-2 focus:border-sky-500 focus:outline-none ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`${fieldId}-scene-setup-number`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Scene / Setup Number</label>
                <input id={`${fieldId}-scene-setup-number`}
                  type="text"
                  value={activeSetup.sceneNumber}
                  onChange={(e) => updateSetupMeta({ sceneNumber: e.target.value })}
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
              <div>
                <label htmlFor={`${fieldId}-script-page`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Script Page</label>
                <input id={`${fieldId}-script-page`}
                  type="text"
                  value={activeSetup.scriptPage || ''}
                  onChange={(e) => updateSetupMeta({ scriptPage: e.target.value })}
                  placeholder="e.g. p. 12-14"
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
            </div>

            <div>
              <label htmlFor={`${fieldId}-scene-location-slugline`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Scene Location / Slugline</label>
              <input id={`${fieldId}-scene-location-slugline`}
                type="text"
                value={activeSetup.location}
                onChange={(e) => updateSetupMeta({ location: e.target.value })}
                placeholder="e.g. INT. LIVING ROOM - NIGHT"
                className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>

            <div>
              <label htmlFor={`${fieldId}-lighting-time-of-day`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Lighting / Time of Day</label>
              <select id={`${fieldId}-lighting-time-of-day`}
                value={activeSetup.timeOfDay}
                onChange={(e) => updateSetupMeta({ timeOfDay: e.target.value as any })}
                className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              >
                <option value="Day INT">Day INT (Interior Daylight)</option>
                <option value="Night INT">Night INT (Interior Night)</option>
                <option value="Day EXT">Day EXT (Exterior Sun)</option>
                <option value="Night EXT">Night EXT (Exterior Night)</option>
              </select>
            </div>

            {/* Project Aspect Ratio (also frames storyboards) */}
            <div>
              <label htmlFor={`${fieldId}-project-aspect-ratio`} className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Project Aspect Ratio
              </label>
              <select id={`${fieldId}-project-aspect-ratio`}
                value={activeSetup.aspectRatio || '16:9'}
                onChange={(e) => updateSetupMeta({ aspectRatio: e.target.value as any })}
                className={`w-full border rounded-lg p-2 focus:border-violet-500 ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              >
                {ASPECT_RATIOS.map((ar) => (
                  <option key={ar.value} value={ar.value}>
                    {ar.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Measurement / Grid Units */}
            <div>
              <span id={`${fieldId}-measurement-units-group`} className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Measurement Units
              </span>
              <div role="group" aria-labelledby={`${fieldId}-measurement-units-group`} className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setGridSettings({
                      unit: 'm',
                      pixelsPerUnit: 30,
                    })
                  }
                  className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                    (activeSetup.gridSettings?.unit || 'm') === 'm'
                      ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                      : isLight
                      ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <span>Meters (m)</span>
                  <span className="text-[10px] opacity-75 font-mono">Metric</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setGridSettings({
                      unit: 'ft',
                      pixelsPerUnit: 25,
                    })
                  }
                  className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                    activeSetup.gridSettings?.unit === 'ft'
                      ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                      : isLight
                      ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <span>Feet (ft)</span>
                  <span className="text-[10px] opacity-75 font-mono">Imperial</span>
                </button>
              </div>
            </div>
          </RubricSection>

          {/* Rubric 1b: Location link (plan §4.13, §13 master plans) */}
          <RubricSection
            title="Location"
            icon={<MapPin className="w-3.5 h-3.5 text-sky-500" />}
            badge={
              assignedLocation ? (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-semibold truncate max-w-[110px]">
                  {assignedLocation.name}
                </span>
              ) : undefined
            }
            defaultOpen={false}
            isLight={isLight}
          >
            <div>
              <span className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Linked location
              </span>
              {(project.locations ?? []).length === 0 ? (
                <p className={`text-[11px] italic mb-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  No locations defined yet — add some in the Loc tab.
                </p>
              ) : null}
              <select
                value={activeSetup.locationId ?? ''}
                onChange={(e) => assignSetupLocation(e.target.value)}
                className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              >
                <option value="">— none —</option>
                {(project.locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {assignedLocation && !isThisSetupTheMaster && (
              <button
                type="button"
                onClick={makeThisSetupMasterPlan}
                title="Declare this scene setup as the reusable master plan for the linked location"
                className={`w-full py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  isLight
                    ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                    : 'border-emerald-700 text-emerald-300 hover:bg-emerald-900/30'
                }`}
              >
                Make this setup the master plan
              </button>
            )}

            {assignedLocation && isThisSetupTheMaster && (
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] flex items-center gap-1 min-w-0 ${
                  isLight ? 'text-emerald-700' : 'text-emerald-300'
                }`}>
                  <Crosshair className="w-3 h-3 flex-shrink-0" />
                  This is the master plan for “{assignedLocation.name}”.
                </span>
                <button
                  type="button"
                  onClick={unsetMasterPlan}
                  title="Stop being the master plan (keeps this setup untouched)"
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors flex-shrink-0 ${
                    isLight
                      ? 'border-slate-300 text-slate-600 hover:bg-slate-200/70'
                      : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  Unset
                </button>
              </div>
            )}

            {assignedLocation && masterSetupForLocation && masterSetupForLocation.id !== activeSetup.id && (
              <div className={`rounded-lg border p-2 space-y-1.5 ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-700'
              }`}>
                <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Master plan for this location: <strong>{masterSetupForLocation.name}</strong>
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setActiveSetupId(masterSetupForLocation.id)}
                    title="Switch to the master plan setup"
                    className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      isLight
                        ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Open master plan
                  </button>
                  <button
                    type="button"
                    onClick={insertCopyOfMasterElements}
                    title="Copy the master plan's floor plan elements into this setup with fresh ids"
                    className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      isLight
                        ? 'bg-sky-600 text-white hover:bg-sky-700'
                        : 'bg-sky-600 text-white hover:bg-sky-500'
                    }`}
                  >
                    Insert copy of master elements
                  </button>
                </div>
                <p className={`text-[10px] italic ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  Copies current state — future edits stay independent.
                </p>
              </div>
            )}
          </RubricSection>

          {/* Rubric 2: Production Info */}
          <RubricSection
            title="Production Details (whole project)"
            icon={<Film className="w-3.5 h-3.5 text-sky-500" />}
            badge={
              project.title ? (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 opacity-75 truncate max-w-[100px]">
                  {project.title}
                </span>
              ) : undefined
            }
            defaultOpen={false}
            isLight={isLight}
          >
            <div>
              <label htmlFor={`${fieldId}-project-title`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Project Title</label>
              <input id={`${fieldId}-project-title`}
                type="text"
                value={project.title}
                onChange={(e) => updateProjectMeta({ title: e.target.value })}
                className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`${fieldId}-director`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Director</label>
                <input id={`${fieldId}-director`}
                  type="text"
                  list="crew-name-options"
                  value={project.director}
                  placeholder="e.g. Jane Doe"
                  onChange={(e) => updateProjectMeta({ director: e.target.value })}
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
              <div>
                <label htmlFor={`${fieldId}-cinematographer-dp`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Cinematographer / DP</label>
                <input id={`${fieldId}-cinematographer-dp`}
                  type="text"
                  list="crew-name-options"
                  value={project.cinematographer}
                  placeholder="e.g. John Smith"
                  onChange={(e) => updateProjectMeta({ cinematographer: e.target.value })}
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
            </div>
            {/* Same two fields the Crew page assigns by role; typing a name here
                stays valid even with no crew list (plan rule 13). */}
            <datalist id="crew-name-options">
              {(project.people ?? []).map((person) => (
                <option key={person.id} value={person.displayName} />
              ))}
            </datalist>
            <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Assign these by role — with phone, email and department — on the Crew tab.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`${fieldId}-production-company`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Production Company</label>
                <input id={`${fieldId}-production-company`}
                  type="text"
                  value={project.productionCompany || ''}
                  placeholder="e.g. Studio Films"
                  onChange={(e) => updateProjectMeta({ productionCompany: e.target.value })}
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
              <div>
                <label htmlFor={`${fieldId}-date`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Date</label>
                <input id={`${fieldId}-date`}
                  type="text"
                  value={project.date}
                  placeholder="YYYY-MM-DD"
                  onChange={(e) => updateProjectMeta({ date: e.target.value })}
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
            </div>
            {/* Production logo (mirrored with Schedule → Call sheets) */}
            <div>
              <span id={`${fieldId}-production-logo-group`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Production Logo</span>
              <div role="group" aria-labelledby={`${fieldId}-production-logo-group`} className="flex items-center gap-2">
                <div
                  className={`w-16 h-12 rounded-lg border flex items-center justify-center overflow-hidden flex-shrink-0 ${
                    isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'
                  }`}
                >
                  {project.logo ? (
                    <ProjectImage imageRef={project.logo} alt="Production logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <ImagePlus className="w-4 h-4 opacity-40" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        loadLogoFile(file)
                          .then(({ ref, name }) => updateProjectMeta({ logo: ref, logoName: name }))
                          .catch(() => alert('Could not load that image as a logo.'));
                      }
                      e.target.value = '';
                    }}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${
                        isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {project.logo ? 'Replace logo' : 'Upload logo'}
                    </button>
                    {project.logo && (
                      <button
                        onClick={() => updateProjectMeta({ logo: undefined, logoName: undefined })}
                        className="px-2 py-1 rounded-lg border border-rose-500/50 text-rose-500 text-[11px] font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className={`text-[10px] truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                    {project.logoName || 'PNG with transparency works best'}
                  </p>
                </div>
              </div>
            </div>
            {/* Company contact block (same canonical fields as the call-sheet workspace) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label htmlFor={`${fieldId}-company-address`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Company Address</label>
                <input id={`${fieldId}-company-address`}
                  type="text"
                  value={project.productionCompanyInfo?.address || ''}
                  placeholder="Street, city"
                  onChange={(e) =>
                    updateProjectMeta({
                      productionCompanyInfo: { ...(project.productionCompanyInfo ?? {}), address: e.target.value || undefined },
                    })
                  }
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
              <div>
                <label htmlFor={`${fieldId}-company-phone`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Company Phone</label>
                <input id={`${fieldId}-company-phone`}
                  type="text"
                  value={project.productionCompanyInfo?.phone || ''}
                  placeholder="+49 …"
                  onChange={(e) =>
                    updateProjectMeta({
                      productionCompanyInfo: { ...(project.productionCompanyInfo ?? {}), phone: e.target.value || undefined },
                    })
                  }
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
              <div>
                <label htmlFor={`${fieldId}-company-email`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Company Email</label>
                <input id={`${fieldId}-company-email`}
                  type="text"
                  value={project.productionCompanyInfo?.email || ''}
                  placeholder="office@studio.example"
                  onChange={(e) =>
                    updateProjectMeta({
                      productionCompanyInfo: { ...(project.productionCompanyInfo ?? {}), email: e.target.value || undefined },
                    })
                  }
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
              <div className="col-span-2">
                <label htmlFor={`${fieldId}-company-website`} className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Company Website</label>
                <input id={`${fieldId}-company-website`}
                  type="text"
                  value={project.productionCompanyInfo?.website || ''}
                  placeholder="https://…"
                  onChange={(e) =>
                    updateProjectMeta({
                      productionCompanyInfo: { ...(project.productionCompanyInfo ?? {}), website: e.target.value || undefined },
                    })
                  }
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
            </div>
            <p className={`text-[10px] italic ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              These details also appear on every call sheet — the same fields are editable in{' '}
              <span className="font-semibold not-italic">Schedule → Call sheets → Production company</span>.
            </p>
          </RubricSection>

          {/* Rubric 3: Display & Labels */}
          {/* Sun & time of day (plan §37). Needs the scene's location pin;
              without one there is nothing to compute from and we say so
              rather than guessing a position. */}
          <RubricSection
            title="Sun & Time of Day"
            icon={<Sun className="w-3.5 h-3.5 text-amber-500" />}
            badge={
              sunReadout ? (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">
                  {sunReadout}
                </span>
              ) : undefined
            }
            defaultOpen={false}
            isLight={isLight}
          >
            {!sunLocation ? (
              <p className="text-[10px] opacity-60 leading-snug">
                Link this scene to a location and drop its map pin (Locations tab) to plan the
                sun. Coordinates are never guessed.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="opacity-60">Show sun &amp; compass on the plan</span>
                  <PillToggle
                    on={!!activeSetup.sunSettings?.enabled}
                    onClick={() =>
                      patchSunSettings({ enabled: !activeSetup.sunSettings?.enabled })
                    }
                    label={activeSetup.sunSettings?.enabled ? 'On' : 'Off'}
                    isLight={isLight}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${fieldId}-date-2`} className="opacity-60 block mb-1">Date</label>
                    <input id={`${fieldId}-date-2`}
                      type="date"
                      value={activeSetup.sunSettings?.date ?? project.date ?? ''}
                      onChange={(e) => patchSunSettings({ date: e.target.value || undefined })}
                      className={`w-full border rounded p-1.5 text-xs ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="opacity-60 block mb-1">
                      Time — {formatMinutesOfDay(activeSetup.sunSettings?.timeMinutes ?? 720)}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1439}
                      step={5}
                      value={activeSetup.sunSettings?.timeMinutes ?? 720}
                      onChange={(e) => patchSunSettings({ timeMinutes: Number(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="opacity-60 block mb-1">
                    Plan north — {Math.round(activeSetup.sunSettings?.planNorthDeg ?? 0)}° from screen-up
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={Math.round(activeSetup.sunSettings?.planNorthDeg ?? 0)}
                    onChange={(e) => patchSunSettings({ planNorthDeg: Number(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                  <p className="opacity-50 text-[9px] mt-0.5">
                    A floor plan is drawn to fit the page, so tell it which way north actually points.
                  </p>
                </div>

                {sunDayTimes && (
                  <div
                    className={`text-[10px] rounded-lg border p-2.5 space-y-0.5 leading-relaxed ${
                      isLight ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-amber-950/30 text-amber-100 border-amber-900/60'
                    }`}
                  >
                    {sunDayTimes.polarNight ? (
                      <p>The sun does not rise on this date at this latitude.</p>
                    ) : sunDayTimes.midnightSun ? (
                      <p>The sun does not set on this date at this latitude.</p>
                    ) : (
                      <>
                        <p>
                          Sunrise <strong>{formatSunTime(sunDayTimes.sunrise)}</strong> · Solar noon{' '}
                          <strong>{formatSunTime(sunDayTimes.solarNoon)}</strong> · Sunset{' '}
                          <strong>{formatSunTime(sunDayTimes.sunset)}</strong>
                        </p>
                        <p className="opacity-80">
                          Golden hour {formatSunTime(sunDayTimes.sunrise)}–
                          {formatSunTime(sunDayTimes.goldenHourMorningEnd)} and{' '}
                          {formatSunTime(sunDayTimes.goldenHourEveningStart)}–
                          {formatSunTime(sunDayTimes.sunset)}
                        </p>
                        <p className="opacity-80">
                          Civil twilight from {formatSunTime(sunDayTimes.civilDawn)} to{' '}
                          {formatSunTime(sunDayTimes.civilDusk)}
                        </p>
                      </>
                    )}
                    <p className="opacity-70 pt-1">
                      Calculated for {sunLocation.name}. Planning aid — check the site for what
                      actually blocks the light.
                    </p>
                  </div>
                )}
              </>
            )}
          </RubricSection>

          <RubricSection
            title="Display & Labels"
            icon={<Tags className="w-3.5 h-3.5 text-violet-500" />}
            defaultOpen={false}
            isLight={isLight}
          >
            {/* Master toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">Show all labels</span>
              <button
                onClick={() => updateDisplaySettings({ showLabels: !displaySettings.showLabels })}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  displaySettings.showLabels ? 'bg-teal-500' : isLight ? 'bg-slate-300' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    displaySettings.showLabels ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Size & opacity */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="opacity-60">Label size</span>
                <span className="font-mono font-bold text-teal-500">
                  {Math.round(displaySettings.labelScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={displaySettings.labelScale}
                onChange={(e) => updateDisplaySettings({ labelScale: parseFloat(e.target.value) })}
                className="w-full accent-teal-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="opacity-60">Label transparency</span>
                <span className="font-mono font-bold text-teal-500">
                  {Math.round((1 - displaySettings.labelOpacity) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={displaySettings.labelOpacity}
                onChange={(e) => updateDisplaySettings({ labelOpacity: parseFloat(e.target.value) })}
                className="w-full accent-teal-500 cursor-pointer"
              />
            </div>

            {/* Per-type label size (multiplies the global Label size) */}
            {(() => {
              const scale = displaySettings.labelCategoryScale ?? {};
              const rows: Array<{ key: keyof NonNullable<DisplaySettings['labelCategoryScale']>; label: string }> = [
                { key: 'actors', label: 'Actor labels' },
                { key: 'cameras', label: 'Camera labels' },
                { key: 'lights', label: 'Light labels' },
                { key: 'props', label: 'Prop labels' },
                { key: 'tracks', label: 'Track labels' },
                { key: 'cables', label: 'Cable labels' },
                { key: 'measurements', label: 'Measurements' },
              ];
              return (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1.5">
                    Size per label type
                  </span>
                  <div className="space-y-1.5">
                    {rows.map(({ key, label }) => {
                      const value = scale[key] ?? 1;
                      return (
                        <div key={label} className="flex items-center gap-2">
                          <span className="text-[11px] opacity-60 w-[92px] shrink-0">{label}</span>
                          <input
                            type="range"
                            min={0.5}
                            max={2}
                            step={0.05}
                            value={value}
                            onChange={(e) =>
                              updateDisplaySettings({
                                labelCategoryScale: {
                                  ...(displaySettings.labelCategoryScale ?? {}),
                                  [key]: parseFloat(e.target.value),
                                },
                              })
                            }
                            className="flex-1 accent-sky-500 cursor-pointer"
                          />
                          <span className="font-mono text-[10px] font-bold text-sky-500 w-8 text-right">
                            {Math.round(value * 100)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Per-category visibility */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1.5">
                Show labels for
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <PillToggle on={displaySettings.showActorLabels} onClick={() => updateDisplaySettings({ showActorLabels: !displaySettings.showActorLabels })} label="Actors" isLight={isLight} />
                <PillToggle on={displaySettings.showCharacterNames !== false} onClick={() => updateDisplaySettings({ showCharacterNames: displaySettings.showCharacterNames === false })} label="Character names" isLight={isLight} />
                <PillToggle on={displaySettings.showCameraLabels} onClick={() => updateDisplaySettings({ showCameraLabels: !displaySettings.showCameraLabels })} label="Cameras" isLight={isLight} />
                <PillToggle on={displaySettings.showPropLabels} onClick={() => updateDisplaySettings({ showPropLabels: !displaySettings.showPropLabels })} label="Props" isLight={isLight} />
                <PillToggle on={displaySettings.showTrackLabels} onClick={() => updateDisplaySettings({ showTrackLabels: !displaySettings.showTrackLabels })} label="Tracks" isLight={isLight} />
                <PillToggle on={displaySettings.showLightLabels} onClick={() => updateDisplaySettings({ showLightLabels: !displaySettings.showLightLabels })} label="Lights" isLight={isLight} />
                <PillToggle on={displaySettings.showLightNameLabels} onClick={() => updateDisplaySettings({ showLightNameLabels: !displaySettings.showLightNameLabels })} label="Light names" isLight={isLight} />
                <PillToggle on={displaySettings.showMeasurementLabels} onClick={() => updateDisplaySettings({ showMeasurementLabels: !displaySettings.showMeasurementLabels })} label="Measurements" isLight={isLight} />
              </div>
            </div>
          </RubricSection>

          {/* Rubric 4: Camera & Light HUD Badge Info */}
          <RubricSection
            title="Camera & Light HUD Details"
            icon={<Tv className="w-3.5 h-3.5 text-sky-500" />}
            defaultOpen={false}
            isLight={isLight}
          >
            {/* Shot info shown on camera labels */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1.5">
                Camera Badge HUD
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <PillToggle on={displaySettings.showShotNumberOnCamera} onClick={() => updateDisplaySettings({ showShotNumberOnCamera: !displaySettings.showShotNumberOnCamera })} label="Shot #" isLight={isLight} />
                <PillToggle on={displaySettings.showShotSizeOnCamera} onClick={() => updateDisplaySettings({ showShotSizeOnCamera: !displaySettings.showShotSizeOnCamera })} label="Shot size" isLight={isLight} />
                <PillToggle on={displaySettings.showShotLensOnCamera} onClick={() => updateDisplaySettings({ showShotLensOnCamera: !displaySettings.showShotLensOnCamera })} label="Lens" isLight={isLight} />
                <PillToggle on={displaySettings.showShotAngleOnCamera} onClick={() => updateDisplaySettings({ showShotAngleOnCamera: !displaySettings.showShotAngleOnCamera })} label="Angle" isLight={isLight} />
                <PillToggle on={displaySettings.showLensFovLabel} onClick={() => updateDisplaySettings({ showLensFovLabel: !displaySettings.showLensFovLabel })} label="Lens/FOV" isLight={isLight} />
              </div>
            </div>

            {/* Light info shown on light labels */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1.5">
                Light Badge HUD
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <PillToggle
                  on={displaySettings.showLightRoleLabels !== false}
                  onClick={() => updateDisplaySettings({ showLightRoleLabels: !(displaySettings.showLightRoleLabels !== false) })}
                  label="Function / Role"
                  isLight={isLight}
                />
                <PillToggle
                  on={displaySettings.showLightNameLabels !== false}
                  onClick={() => updateDisplaySettings({ showLightNameLabels: !(displaySettings.showLightNameLabels !== false) })}
                  label="Name / Model"
                  isLight={isLight}
                />
                <PillToggle
                  on={displaySettings.showLightKelvinLabels === true}
                  onClick={() => updateDisplaySettings({ showLightKelvinLabels: !(displaySettings.showLightKelvinLabels === true) })}
                  label="Color Temp (K)"
                  isLight={isLight}
                />
                <PillToggle
                  on={displaySettings.showLightIntensityLabels === true}
                  onClick={() => updateDisplaySettings({ showLightIntensityLabels: !(displaySettings.showLightIntensityLabels === true) })}
                  label="Dim Level (%)"
                  isLight={isLight}
                />
              </div>
            </div>
          </RubricSection>

          {/* Rubric 5: Label Colors & Opacity */}
          <RubricSection
            title="Label Colors & Opacity"
            icon={<Palette className="w-3.5 h-3.5 text-amber-500" />}
            defaultOpen={false}
            isLight={isLight}
          >
            <div className="space-y-1">
              <ColorField
                label="Actors"
                value={displaySettings.actorLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.actors ?? 1}
                onChange={(c) => updateDisplaySettings({ actorLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      actors: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Cameras"
                value={displaySettings.cameraLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.cameras ?? 1}
                onChange={(c) => updateDisplaySettings({ cameraLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      cameras: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Props"
                value={displaySettings.propLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.props ?? 1}
                onChange={(c) => updateDisplaySettings({ propLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      props: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Tracks"
                value={displaySettings.trackLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.tracks ?? 1}
                onChange={(c) => updateDisplaySettings({ trackLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      tracks: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Lights"
                value={displaySettings.lightLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.lights ?? 1}
                onChange={(c) => updateDisplaySettings({ lightLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      lights: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Doors/Wins"
                value={displaySettings.doorWindowLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.doorWindows ?? 1}
                onChange={(c) => updateDisplaySettings({ doorWindowLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      doorWindows: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Measures"
                value={displaySettings.measurementLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.measurements ?? 1}
                onChange={(c) => updateDisplaySettings({ measurementLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      measurements: op,
                    },
                  })
                }
                isLight={isLight}
              />
            </div>
          </RubricSection>

          {/* Plan Layers (§6.1): visibility, lock & opacity per layer */}
          <RubricSection
            title="Layers"
            icon={<Layers className="w-3.5 h-3.5 text-violet-500" />}
            defaultOpen={false}
            isLight={isLight}
          >
            <LayersPanel />
          </RubricSection>

          {/* Rubric 6: Declutter Floor Plan */}
          <RubricSection
            title="Declutter Floor Plan"
            icon={<Grid3x3 className="w-3.5 h-3.5 text-emerald-500" />}
            defaultOpen={false}
            isLight={isLight}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <PillToggle on={displaySettings.showWaypoints} onClick={() => updateDisplaySettings({ showWaypoints: !displaySettings.showWaypoints })} label="Waypoints & paths" isLight={isLight} />
              <PillToggle on={displaySettings.showFovCones} onClick={() => updateDisplaySettings({ showFovCones: !displaySettings.showFovCones })} label="Camera FOV cones" isLight={isLight} />
              <PillToggle on={displaySettings.showLightBeams} onClick={() => updateDisplaySettings({ showLightBeams: !displaySettings.showLightBeams })} label="Light beams" isLight={isLight} />
              <PillToggle on={displaySettings.showStoryboardThumbs} onClick={() => updateDisplaySettings({ showStoryboardThumbs: !displaySettings.showStoryboardThumbs })} label="Storyboard frames" isLight={isLight} />
              <PillToggle on={displaySettings.showDoorWindowLabels} onClick={() => updateDisplaySettings({ showDoorWindowLabels: !displaySettings.showDoorWindowLabels })} label="Door/window labels" isLight={isLight} />
              <PillToggle
                on={displaySettings.showGrid || activeSetup.gridSettings?.showGrid === true}
                onClick={() => {
                  const next = !(displaySettings.showGrid || activeSetup.gridSettings?.showGrid === true);
                  updateDisplaySettings({ showGrid: next });
                  setGridSettings({ showGrid: next });
                }}
                label="Grid & axes"
                isLight={isLight}
              />
            </div>

            {/* Camera FOV Cone Opacity Slider */}
            {displaySettings.showFovCones !== false && (
              <div className="pt-2.5 mt-2 border-t border-slate-700/30">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="opacity-70">Camera FOV Cone Opacity</span>
                  <span className="font-mono text-sky-500 font-bold">
                    {Math.round((displaySettings.fovConeOpacity ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round((displaySettings.fovConeOpacity ?? 1) * 100)}
                  onChange={(e) =>
                    updateDisplaySettings({
                      fovConeOpacity: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full accent-sky-500 cursor-pointer h-1.5"
                />
              </div>
            )}
          </RubricSection>

          {/* Rubric 7: Reference Images */}
          {backgroundImages.length > 0 && (
            <RubricSection
              title={`Reference Images (${backgroundImages.length})`}
              icon={<ImageIcon className="w-3.5 h-3.5 text-teal-500" />}
              defaultOpen={false}
              isLight={isLight}
            >
              <div className="space-y-3">
                {backgroundImages.map((bg, idx) => (
                  <div
                    key={bg.id}
                    className={`p-2.5 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold text-teal-500 uppercase truncate pr-2">
                        {bg.name || `Reference ${idx + 1}`}
                      </span>
                      <button
                        onClick={() => updateBackgroundImage(bg.id, { visible: !bg.visible })}
                        title={bg.visible ? 'Hide on canvas' : 'Show on canvas'}
                        className="p-1 rounded hover:bg-slate-500/15 transition-colors"
                      >
                        <Eye
                          className={`w-3.5 h-3.5 ${bg.visible ? 'text-teal-500' : 'text-slate-500'}`}
                        />
                      </button>
                    </div>

                    {/* Opacity */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="opacity-60">Opacity</span>
                        <span className="font-mono font-bold text-teal-500">
                          {Math.round((bg.opacity ?? 0.5) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={bg.opacity ?? 0.5}
                        onChange={(e) =>
                          updateBackgroundImage(bg.id, { opacity: parseFloat(e.target.value) })
                        }
                        className="w-full accent-teal-500 cursor-pointer"
                      />
                    </div>

                    {/* Visibility & Lock Toggles */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => updateBackgroundImage(bg.id, { visible: !bg.visible })}
                        className={`py-1.5 text-[10px] font-semibold rounded-lg border flex items-center justify-center gap-1 transition-colors ${
                          bg.visible
                            ? isLight ? 'bg-teal-50 text-teal-700 border-teal-300' : 'bg-teal-950/40 text-teal-300 border-teal-800'
                            : isLight ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        {bg.visible ? 'Visible' : 'Hidden'}
                      </button>
                      <button
                        onClick={() => updateBackgroundImage(bg.id, { locked: !bg.locked })}
                        title={bg.locked ? 'Unlock (allow moving & resizing)' : 'Lock (prevent accidental moves)'}
                        className={`py-1.5 text-[10px] font-semibold rounded-lg border flex items-center justify-center gap-1 transition-colors ${
                          bg.locked
                            ? isLight ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-amber-950/40 text-amber-300 border-amber-800'
                            : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {bg.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {bg.locked ? 'Locked' : 'Unlocked'}
                      </button>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => removeBackgroundImage(bg.id)}
                      className={`mt-2 w-full py-1.5 text-[10px] font-semibold rounded-lg border flex items-center justify-center gap-1 transition-colors ${
                        isLight
                          ? 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100'
                          : 'bg-red-950/30 text-red-400 border-red-900 hover:bg-red-950/60'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Image
                    </button>
                  </div>
                ))}

                <p className={`text-[10px] italic ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  Click an image on the canvas to select it, drag it to move, use the corner handles to scale
                  (proportions preserved), or press <strong>Delete</strong> to remove it. Upload more via the
                  teal image button in the left toolbar.
                </p>
              </div>
            </RubricSection>
          )}

          <div className={`pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
            <h4 className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-2">
              Scene Statistics
            </h4>            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                <span className="opacity-60 block text-[10px]">TOTAL ELEMENTS</span>
                <span className="text-base font-bold font-mono text-sky-500">{activeSetup.elements.length}</span>
              </div>
              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                <span className="opacity-60 block text-[10px]">PLANNED SHOTS</span>
                <span className="text-base font-bold font-mono text-emerald-500">{activeSetup.shots.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multi-element selection
  if (selectedElementIds.length > 1) {
    const allLocked = selectedElementIds.every((id) => activeSetup.elements.find((e) => e.id === id)?.locked);

    // The one plan group whose full member set equals this selection.
    const activeGroup = (activeSetup.groups || []).find(
      (group) =>
        selectedElementIds.length >= 2 &&
        group.childIds.length === selectedElementIds.length &&
        selectedElementIds.every((id) => group.childIds.includes(id)),
    );
    const persistGroups = (groups: SceneSetup['groups']) => updateSetupMeta({ groups } as Partial<SceneSetup>);
    const groupMemberPoses = (transformed: FloorPlanElement): Record<string, unknown> => {
      const patch: Record<string, unknown> = { x: transformed.x, y: transformed.y, rotation: transformed.rotation };
      if ('x2' in transformed) {
        patch.x2 = (transformed as WallElement).x2;
        patch.y2 = (transformed as WallElement).y2;
      }
      if (transformed.type === 'stroke') {
        patch.points = (transformed as StrokeElement).points;
      } else if ('path' in transformed) {
        patch.path = (transformed as { path?: Waypoint[] }).path;
      }
      return patch;
    };
    /** Whole-group rigid rotate around the shared pivot (falls back to per-element spins). */
    const rotateMultiSelection = (delta: number) => {
      if (!activeGroup) {
        selectedElementIds.forEach((id) => rotateElementBy(id, delta));
        return;
      }
      const baked = bakeGroupRotation(activeSetup.elements, activeGroup.childIds, delta);
      const updates: { id: string; updates: Partial<FloorPlanElement> }[] = [];
      activeSetup.elements.forEach((el, index) => {
        const nextEl = baked[index];
        if (nextEl !== el) updates.push({ id: el.id, updates: groupMemberPoses(nextEl) as Partial<FloorPlanElement> });
      });
      if (updates.length > 0) updateMultipleElements(updates, true);
    };
    return (
      <div
        id="inspector-panel-multi"
        className={`flex flex-col h-full text-xs p-4 space-y-4 select-none ${
          isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200'
        }`}
      >
        <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              {selectedElementIds.length} Items Selected
            </h3>
          </div>

          <button
            onClick={() => {
              const selectedEls = activeSetup.elements.filter((e) => selectedElementIds.includes(e.id));
              const anyUnlocked = selectedEls.some((e) => !e.locked);
              updateMultipleElements(
                selectedElementIds.map((id) => ({ id, updates: { locked: anyUnlocked } })),
                true
              );
            }}
            title="Lock or unlock all selected elements (prevent accidental drag moves) [L]"
            className={`py-1.5 px-2.5 rounded-lg border flex items-center gap-1.5 font-bold text-xs transition-colors ${
              selectedElementIds.every((id) => activeSetup.elements.find((e) => e.id === id)?.locked)
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                : isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {selectedElementIds.every((id) => activeSetup.elements.find((e) => e.id === id)?.locked) ? (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>All Locked</span>
              </>
            ) : (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>Lock All</span>
              </>
            )}
          </button>
        </div>

        <p className="text-xs opacity-75">
          Multiple floor plan elements selected. You can move them together or rotate the selection.
        </p>

        {/* Reusable assemblies (plan §6.5): save the selection as a template */}
        <button
          onClick={() => promptSaveAssemblyFromIds(selectedElementIds, activeSetup.elements)}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-colors ${
            isLight
              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
              : 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-800'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Save Selection as Assembly</span>
        </button>

        {/* Multi rotate buttons */}
        <div className="space-y-1.5 pt-2">
          <span id={`${fieldId}-rotate-selection-group`} className="text-[10px] font-bold uppercase opacity-60 block">Rotate Selection</span>
          <div role="group" aria-labelledby={`${fieldId}-rotate-selection-group`} className="grid grid-cols-2 gap-2">
            <button
              onClick={() => rotateMultiSelection(-45)}
              className={`py-2 px-3 border rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rotate -45&deg;</span>
            </button>
            <button
              onClick={() => rotateMultiSelection(45)}
              className={`py-2 px-3 border rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Rotate +45&deg;</span>
            </button>
          </div>
        </div>

        {/* Plan group: rigid rotate + shared keyframe animation */}
        {(() => {
          if (!activeGroup) {
            return (
              <p className="text-[10px] opacity-50 leading-snug">
                Tip: group items (right-click &gt; Group) to rotate them around a shared pivot and animate them together with keyframes.
              </p>
            );
          }
          const keyframes = (activeGroup.path || []).slice().sort((a, b) => a.beat - b.beat);
          const nextBeat = Math.max(2, ...keyframes.map((wp) => wp.beat + 1));
          const addGroupKeyframe = () => {
            const members = activeGroup.childIds
              .map((id) => activeSetup.elements.find((el) => el.id === id))
              .filter((el): el is FloorPlanElement => !!el);
            const pivot = groupPivotOf(members);
            if (!pivot) return;
            const last = keyframes[keyframes.length - 1];
            const carried = last ? (last.rotation ?? 0) : 0;
            // Spawn each new keyframe clear of the previous one (the way camera
            // waypoints do). Stacking them on the same pivot made the group look
            // like it was not animating at all, because every beat resolved to
            // the same position.
            const origin = last ?? pivot;
            const spawnX = Math.round(origin.x + (last ? 80 : 0));
            const spawnY = Math.round(origin.y);
            persistGroups([
              ...(activeSetup.groups || []).map((g) =>
                g.id !== activeGroup.id
                  ? g
                  : { ...g, path: [...(g.path || []), { id: createId('gpwp'), x: spawnX, y: spawnY, beat: nextBeat, rotation: carried }] },
              ),
            ]);
            if (nextBeat > (activeSetup.totalBeats || 1)) updateSetupMeta({ totalBeats: nextBeat });
          };
          const updateGroupKeyframe = (wpId: string, patch: Partial<Waypoint>) => {
            persistGroups(
              (activeSetup.groups || []).map((g) =>
                g.id !== activeGroup.id
                  ? g
                  : { ...g, path: (g.path || []).map((wp) => (wp.id === wpId ? { ...wp, ...patch } : wp)) },
              ),
            );
          };
          const deleteGroupKeyframe = (wpId: string) => {
            persistGroups(
              (activeSetup.groups || []).map((g) =>
                g.id !== activeGroup.id
                  ? g
                  : { ...g, path: (g.path || []).filter((wp) => wp.id !== wpId) },
              ),
            );
          };
          return (
            <>
              <div className="space-y-1.5 pt-2">
                <label className="text-[10px] font-bold uppercase opacity-60 block">
                  Group ({activeGroup.childIds.length} items)
                </label>
                <p className="text-[10px] opacity-50 leading-snug">
                  Rotation turns the whole group around its shared pivot. Keyframes move and rotate every member
                  together during playback — drag the numbered dots on the plan to set where the group travels.
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {keyframes.length === 0 && (
                    <p className="text-[10px] opacity-50">No keyframes yet.</p>
                  )}
                  {keyframes.map((wp) => (
                    <div
                      key={wp.id}
                      className={`flex items-center gap-1.5 p-1 rounded border ${
                        isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'
                      }`}
                    >
                      <span className="w-6 text-[10px] font-mono font-bold text-sky-500">B{wp.beat}</span>
                      <input
                        type="number"
                        min={1}
                        value={wp.beat}
                        onChange={(e) => updateGroupKeyframe(wp.id, { beat: Math.max(1, Math.round(Number(e.target.value)) || 1) })}
                        title="Beat"
                        aria-label={`Group keyframe beat (currently ${wp.beat})`}
                        className={`w-12 border rounded px-1 py-0.5 text-[10px] font-mono ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'}`}
                      />
                      <input
                        type="number"
                        value={Math.round(wp.rotation ?? 0)}
                        onChange={(e) => updateGroupKeyframe(wp.id, { rotation: Number(e.target.value) || 0 })}
                        title="Rotation delta at this keyframe (degrees)"
                        aria-label="Group keyframe rotation delta in degrees"
                        className={`flex-1 min-w-0 border rounded px-1 py-0.5 text-[10px] font-mono ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'}`}
                      />
                      <span className="text-[9px] opacity-50">deg</span>
                      <button
                        onClick={() => deleteGroupKeyframe(wp.id)}
                        title="Delete keyframe"
                        aria-label="Delete group keyframe"
                        className="p-1 rounded text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addGroupKeyframe}
                  className={`w-full py-2 border rounded-lg text-xs font-semibold cursor-pointer select-none active:scale-[0.98] transition-transform ${
                    isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                  }`}
                >
                  + Add Group Keyframe (Beat {nextBeat})
                </button>
              </div>
            </>
          );
        })()}

        {/* Align & Distribute tools */}
        <div className="space-y-3 pt-2">
          <div>
            <span id={`${fieldId}-align-selection-group`} className="text-[10px] font-bold uppercase opacity-60 block mb-1.5">Align Selection</span>
            <div role="group" aria-labelledby={`${fieldId}-align-selection-group`} className="grid grid-cols-6 gap-1.5">
              {(
                [
                  { mode: 'left' as AlignMode, Icon: AlignLeft, title: 'Align Left Edges' },
                  { mode: 'hcenter' as AlignMode, Icon: AlignCenterHorizontal, title: 'Align Horizontal Centers' },
                  { mode: 'right' as AlignMode, Icon: AlignRight, title: 'Align Right Edges' },
                  { mode: 'top' as AlignMode, Icon: AlignStartVertical, title: 'Align Top Edges' },
                  { mode: 'vcenter' as AlignMode, Icon: AlignCenterVertical, title: 'Align Vertical Centers' },
                  { mode: 'bottom' as AlignMode, Icon: AlignEndVertical, title: 'Align Bottom Edges' },
                ]
              ).map(({ mode, Icon, title }) => {
                const doAlign = () => {
                  const els = activeSetup.elements.filter((e) => selectedElementIds.includes(e.id));
                  if (els.length < 2) return;
                  const bounds = els.map((e) => ({ el: e, b: getElementBounds(e) }));
                  const minX = Math.min(...bounds.map((x) => x.b.minX));
                  const maxX = Math.max(...bounds.map((x) => x.b.maxX));
                  const minY = Math.min(...bounds.map((x) => x.b.minY));
                  const maxY = Math.max(...bounds.map((x) => x.b.maxY));
                  const cx = (minX + maxX) / 2;
                  const cy = (minY + maxY) / 2;
                  const updates = bounds.map(({ el, b }) => {
                    let nx = el.x;
                    let ny = el.y;
                    if (mode === 'left') nx = el.x + (minX - b.minX);
                    else if (mode === 'right') nx = el.x + (maxX - b.maxX);
                    else if (mode === 'hcenter') nx = el.x + (cx - (b.minX + b.maxX) / 2);
                    else if (mode === 'top') ny = el.y + (minY - b.minY);
                    else if (mode === 'bottom') ny = el.y + (maxY - b.maxY);
                    else if (mode === 'vcenter') ny = el.y + (cy - (b.minY + b.maxY) / 2);
                    return { id: el.id, updates: { x: Math.round(nx), y: Math.round(ny) } };
                  });
                  updateMultipleElements(updates, true);
                };
                return (
                  <button
                    key={mode}
                    onClick={doAlign}
                    title={title}
                    className={`py-2 border rounded-lg flex items-center justify-center transition-colors ${
                      isLight
                        ? 'bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 border-slate-300'
                        : 'bg-slate-800 hover:bg-sky-950 text-slate-300 hover:text-sky-300 border-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span id={`${fieldId}-distribute-spacing-3-items-group`} className="text-[10px] font-bold uppercase opacity-60 block mb-1.5">Distribute Spacing (3+ items)</span>
            <div role="group" aria-labelledby={`${fieldId}-distribute-spacing-3-items-group`} className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => {
                  const els = activeSetup.elements.filter((e) => selectedElementIds.includes(e.id));
                  if (els.length < 3) return;
                  const bounds = els.map((e) => ({ el: e, b: getElementBounds(e) }));
                  bounds.sort((a, c) => (a.b.minX + a.b.maxX) / 2 - (c.b.minX + c.b.maxX) / 2);
                  const minC = (bounds[0].b.minX + bounds[0].b.maxX) / 2;
                  const maxC = (bounds[bounds.length - 1].b.minX + bounds[bounds.length - 1].b.maxX) / 2;
                  const step = (maxC - minC) / (bounds.length - 1);
                  const updates = bounds.map(({ el, b }, i) => ({
                    id: el.id,
                    updates: { x: Math.round(el.x + (minC + step * i - (b.minX + b.maxX) / 2)) },
                  }));
                  updateMultipleElements(updates, true);
                }}
                title="Evenly space selected items horizontally"
                className={`py-2 border rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                  isLight
                    ? 'bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 border-slate-300'
                    : 'bg-slate-800 hover:bg-sky-950 text-slate-300 hover:text-sky-300 border-slate-700'
                }`}
              >
                <AlignHorizontalSpaceBetween className="w-4 h-4" />
                <span>Horizontal</span>
              </button>
              <button
                onClick={() => {
                  const els = activeSetup.elements.filter((e) => selectedElementIds.includes(e.id));
                  if (els.length < 3) return;
                  const bounds = els.map((e) => ({ el: e, b: getElementBounds(e) }));
                  bounds.sort((a, c) => (a.b.minY + a.b.maxY) / 2 - (c.b.minY + c.b.maxY) / 2);
                  const minC = (bounds[0].b.minY + bounds[0].b.maxY) / 2;
                  const maxC = (bounds[bounds.length - 1].b.minY + bounds[bounds.length - 1].b.maxY) / 2;
                  const step = (maxC - minC) / (bounds.length - 1);
                  const updates = bounds.map(({ el, b }, i) => ({
                    id: el.id,
                    updates: { y: Math.round(el.y + (minC + step * i - (b.minY + b.maxY) / 2)) },
                  }));
                  updateMultipleElements(updates, true);
                }}
                title="Evenly space selected items vertically"
                className={`py-2 border rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                  isLight
                    ? 'bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 border-slate-300'
                    : 'bg-slate-800 hover:bg-sky-950 text-slate-300 hover:text-sky-300 border-slate-700'
                }`}
              >
                <AlignVerticalSpaceBetween className="w-4 h-4" />
                <span>Vertical</span>
              </button>
            </div>
          </div>
        </div>

        <div className="pt-3">
          <button
            onClick={deleteSelectedElements}
            disabled={allLocked}
            title={allLocked ? 'Locked elements cannot be deleted' : 'Delete selected elements'}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors border ${
              allLocked
                ? 'bg-slate-500/10 text-slate-500 border-slate-600/30 cursor-not-allowed opacity-60'
                : 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30'
            }`}
          >
            <Trash2 className="w-4 h-4 text-red-400" />
            <span>Delete {selectedElementIds.length} Selected Items</span>
          </button>
        </div>
      </div>
    );
  }

  // Single element selected
  const activeId = selectedElementIds[0];
  const el = activeSetup.elements.find((e) => e.id === activeId);
  if (!el) return null;

  const currentRotation = Math.round((el.rotation || 0) % 360 + 360) % 360;

  return (
    <div
      id="inspector-panel"
      className={`flex flex-col h-full p-4 space-y-4 select-none overflow-y-auto custom-scrollbar text-xs ${
        isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200'
      }`}
    >
      {/* 1. Header with Delete & Duplicate */}
      <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div className="flex items-center gap-2">
          {el.type === 'camera' ? (
            <MovieCameraIcon className="w-4 h-4 text-sky-500" />
          ) : el.type === 'actor' ? (
            <User className="w-4 h-4 text-emerald-500" />
          ) : el.type === 'light' ? (
            <FresnelLightIcon className="w-4 h-4 text-amber-500" />
          ) : (
            <Sliders className="w-4 h-4 text-purple-500" />
          )}
          <h3 className="text-xs font-bold uppercase tracking-wider">
            {el.type} Inspector
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => updateElement(el.id, { locked: !el.locked })}
            title={el.locked ? 'Unlock element (allow moving & rotating) [L]' : 'Lock element (prevent accidental drag moves) [L]'}
            className={`px-2 py-1 rounded-lg border flex items-center gap-1 font-bold text-xs transition-colors ${
              el.locked
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                : isLight
                  ? 'text-slate-600 hover:text-slate-900 border-slate-300 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white border-slate-700 hover:bg-slate-800'
            }`}
          >
            {el.locked ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{el.locked ? 'Locked' : 'Lock'}</span>
          </button>
          <button
            onClick={duplicateSelected}
            title="Duplicate (Ctrl+D)"
            className={`p-1.5 rounded-lg transition-colors ${
              isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={deleteSelectedElements}
            disabled={el.locked}
            title={el.locked ? 'Locked elements cannot be deleted' : 'Delete element (Del)'}
            className={`p-1.5 rounded-lg transition-colors ${
              el.locked
                ? 'text-slate-500 cursor-not-allowed opacity-50'
                : 'text-red-500 hover:text-red-400 hover:bg-red-500/10'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Common Properties (Name & Position Rubric) */}
      <div className="space-y-3">
        <div>
          <label htmlFor={`${fieldId}-element-name-label`} className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Element Name / Label</label>
          <input id={`${fieldId}-element-name-label`}
            type="text"
            value={el.name}
            onChange={(e) => updateElement(el.id, { name: e.target.value })}
            className={`w-full border rounded-lg p-2 focus:border-sky-500 focus:outline-none ${
              isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
            }`}
          />
        </div>

        {/* Position, Rotation & Transform Rubric */}
        <RubricSection
          title="Position & Orientation"
          icon={<Move3d className="w-3.5 h-3.5 text-slate-400" />}
          badge={
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 opacity-75">
              X:{Math.round(el.x)} Y:{Math.round(el.y)} {currentRotation !== undefined ? `· ${currentRotation}°` : ''}
            </span>
          }
          defaultOpen={false}
          isLight={isLight}
        >
          {/* Position Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${fieldId}-pos-x-px`} className="opacity-60 block text-[10px]">POS X (px)</label>
              <input id={`${fieldId}-pos-x-px`}
                type="number"
                value={Math.round(el.x)}
                onChange={(e) => updateElement(el.id, { x: Number(e.target.value) })}
                className={`w-full border rounded px-2 py-1 font-mono text-xs ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-pos-y-px`} className="opacity-60 block text-[10px]">POS Y (px)</label>
              <input id={`${fieldId}-pos-y-px`}
                type="number"
                value={Math.round(el.y)}
                onChange={(e) => updateElement(el.id, { y: Number(e.target.value) })}
                className={`w-full border rounded px-2 py-1 font-mono text-xs ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>
          </div>

          {/* Rotation & Orientation Section */}
          {el.type !== 'wall' && el.type !== 'track' && el.type !== 'road' && el.type !== 'measurement' && el.type !== 'arrow' && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs flex items-center gap-1.5 opacity-80">
                  <Compass className="w-3.5 h-3.5 text-sky-500" />
                  Rotation Angle
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={360}
                    value={currentRotation}
                    onChange={(e) => updateElement(el.id, { rotation: ((Number(e.target.value) % 360) + 360) % 360 })}
                    className={`w-14 text-right border rounded px-1.5 py-0.5 font-mono text-xs font-bold text-sky-500 ${
                      isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                    }`}
                  />
                  <span className="text-xs font-mono font-bold text-sky-500">°</span>
                </div>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={0}
                max={360}
                value={currentRotation}
                onChange={(e) => updateElement(el.id, { rotation: Number(e.target.value) })}
                className="w-full accent-sky-500 cursor-pointer"
              />

              {/* Quick Rotate Buttons */}
              <div className="grid grid-cols-4 gap-1 pt-0.5">
                <button
                  onClick={() => rotateElementBy(el.id, -90)}
                  title="Rotate -90°"
                  className={`py-1 text-[10px] font-mono rounded border flex items-center justify-center gap-0.5 ${
                    isLight ? 'bg-white hover:bg-slate-100 border-slate-300' : 'bg-slate-900 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <RotateCcw className="w-2.5 h-2.5" /> -90°
                </button>
                <button
                  onClick={() => rotateElementBy(el.id, -45)}
                  title="Rotate -45°"
                  className={`py-1 text-[10px] font-mono rounded border flex items-center justify-center gap-0.5 ${
                    isLight ? 'bg-white hover:bg-slate-100 border-slate-300' : 'bg-slate-900 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <RotateCcw className="w-2.5 h-2.5" /> -45°
                </button>
                <button
                  onClick={() => rotateElementBy(el.id, 45)}
                  title="Rotate +45°"
                  className={`py-1 text-[10px] font-mono rounded border flex items-center justify-center gap-0.5 ${
                    isLight ? 'bg-white hover:bg-slate-100 border-slate-300' : 'bg-slate-900 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <RotateCw className="w-2.5 h-2.5" /> +45°
                </button>
                <button
                  onClick={() => rotateElementBy(el.id, 90)}
                  title="Rotate +90°"
                  className={`py-1 text-[10px] font-mono rounded border flex items-center justify-center gap-0.5 ${
                    isLight ? 'bg-white hover:bg-slate-100 border-slate-300' : 'bg-slate-900 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <RotateCw className="w-2.5 h-2.5" /> +90°
                </button>
              </div>

              {/* Cardinal Facing Presets */}
              <div className="grid grid-cols-4 gap-1 text-[9px] font-mono">
                <button
                  onClick={() => updateElement(el.id, { rotation: 0 })}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 0 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  0° (Right)
                </button>
                <button
                  onClick={() => updateElement(el.id, { rotation: 90 })}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 90 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  90° (Down)
                </button>
                <button
                  onClick={() => updateElement(el.id, { rotation: 180 })}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 180 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  180° (Left)
                </button>
                <button
                  onClick={() => updateElement(el.id, { rotation: 270 })}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 270 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  270° (Up)
                </button>
              </div>
            </div>
          )}

          {/* Per-Item Opacity Slider */}
          <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
            <div className="flex justify-between text-[11px] mb-1 font-medium">
              <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>Item Opacity</span>
              <span className="font-mono font-bold text-sky-500">
                {Math.round((el.opacity ?? 1.0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round((el.opacity ?? 1.0) * 100)}
              onChange={(e) => updateElement(el.id, { opacity: Number(e.target.value) / 100 })}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>
        </RubricSection>
      </div>

      {/* 3. CAMERA SPECIFIC INSPECTOR */}
        {el.type === 'camera' && (() => {
          const cam = el as CameraElement;
          return (
            <div className="space-y-3 pt-1">
              {/* Quick Viewfinder Button */}
              <button
                onClick={() => openViewfinder(cam.id)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold text-xs transition-colors shadow-sm"
              >
                <Eye className="w-4 h-4" />
                <span>Simulate Camera Viewfinder</span>
              </button>

              {/* Rubric 1: Camera Identification & Rig */}
              <RubricSection
                title="Camera Identity & Rig"
                icon={<MovieCameraIcon className="w-3.5 h-3.5 text-sky-500" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500 font-bold">
                    CAM {cam.cameraLabel}
                  </span>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                {/* Camera Letter & Color */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${fieldId}-camera-id`} className="opacity-60 block mb-1">Camera ID</label>
                    <input id={`${fieldId}-camera-id`}
                      type="text"
                      value={cam.cameraLabel}
                      maxLength={3}
                      onChange={(e) => updateElement(cam.id, { cameraLabel: e.target.value.toUpperCase() })}
                      className={`w-full border rounded px-2 py-1 font-bold text-center ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <span id={`${fieldId}-color-marker-group`} className="opacity-60 block mb-1">Color Marker</span>
                    <div role="group" aria-labelledby={`${fieldId}-color-marker-group`} className="flex gap-1.5 pt-1">
                      {CAMERA_COLOR_PALETTE.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateElement(cam.id, { color: c })}
                          style={{ backgroundColor: c }}
                          className={`w-5 h-5 rounded-full border ${
                            cam.color === c ? 'border-white ring-2 ring-sky-400' : 'border-transparent'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Camera Body Model & Brand Preset */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="opacity-75 block text-xs font-semibold">Camera Body & Model Preset</span>
                    <span className="text-[10px] text-sky-400 font-mono font-bold">
                      {cam.cameraModel ? cam.cameraModel.split(' ')[0] : 'Custom'}
                    </span>
                  </div>
                  <select
                    value={cam.cameraModel || ''}
                    onChange={(e) => {
                      const selectedModel = e.target.value;
                      const matchedPreset = CAMERA_BODY_PRESETS.find((p) => p.model === selectedModel);
                      const updates: Partial<CameraElement> = { cameraModel: selectedModel };
                      if (matchedPreset) {
                        updates.sensorFormat = matchedPreset.sensor;
                        updates.fovAngle = calculateFovAngle(cam.focalLength || 35, matchedPreset.sensor);
                      }
                      updateElement(cam.id, updates);
                    }}
                    className={`w-full border rounded-lg p-2 text-xs font-semibold ${
                      isLight ? 'bg-white text-slate-900 border-slate-300' : 'bg-slate-900 text-slate-100 border-slate-700'
                    }`}
                  >
                    <option value="" className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                      -- Custom / Generic Cinema Camera --
                    </option>
                    <optgroup label="Sony Cinema Line & Camcorders" className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                      {CAMERA_BODY_PRESETS.filter((p) => p.brand === 'Sony').filter((p) => !p.label.includes('HDC')).map((p) => (
                        <option key={p.model} value={p.model} className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="ARRI Digital & 35mm" className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                      {CAMERA_BODY_PRESETS.filter((p) => p.brand === 'ARRI').map((p) => (
                        <option key={p.model} value={p.model} className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="RED Digital Cinema" className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                      {CAMERA_BODY_PRESETS.filter((p) => p.brand === 'RED').map((p) => (
                        <option key={p.model} value={p.model} className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Blackmagic Design" className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                      {CAMERA_BODY_PRESETS.filter((p) => p.brand === 'Blackmagic').map((p) => (
                        <option key={p.model} value={p.model} className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Canon Cinema EOS" className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                      {CAMERA_BODY_PRESETS.filter((p) => p.brand === 'Canon').map((p) => (
                        <option key={p.model} value={p.model} className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Panasonic Cinema & Lumix" className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                      {CAMERA_BODY_PRESETS.filter((p) => p.brand === 'Panasonic').filter((p) => !p.label.includes('Studio') && !p.label.includes('PTZ')).map((p) => (
                        <option key={p.model} value={p.model} className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Broadcast / OB Studio & Live" className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                      {CAMERA_BODY_PRESETS.filter((p) =>
                        p.brand === 'Grass Valley' ||
                        p.label.includes('HDC') ||
                        p.label.includes('SK-HD') ||
                        p.label.includes('Z-HD') ||
                        p.label.includes('UHK') ||
                        p.label.includes('AK-UC') ||
                        p.label.includes('AW-UE')
                      ).map((p) => (
                        <option key={p.model} value={p.model} className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Camera Rig & Height */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${fieldId}-camera-rig`} className="opacity-60 block mb-1">Camera Rig</label>
                    <select id={`${fieldId}-camera-rig`}
                      value={cam.rigType}
                      onChange={(e) => updateElement(cam.id, { rigType: e.target.value as any })}
                      className={`w-full border rounded-lg p-1.5 text-xs ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    >
                      {CAMERA_RIGS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${fieldId}-camera-height`} className="opacity-60 block mb-1">Camera Height</label>
                    <select id={`${fieldId}-camera-height`}
                      value={cam.cameraHeight}
                      onChange={(e) => updateElement(cam.id, { cameraHeight: e.target.value as any })}
                      className={`w-full border rounded-lg p-1.5 text-xs ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    >
                      {CAMERA_HEIGHTS.map((h) => (
                        <option key={h.value} value={h.value}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </RubricSection>

              {/* Rubric 2: Lens, Sensor & Optics */}
              <RubricSection
                title="Lens & Optics"
                icon={<Eye className="w-3.5 h-3.5 text-indigo-500" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-bold">
                    {cam.focalLength}mm · {cam.fovAngle}°
                  </span>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                {/* Lens Focal Length */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium opacity-75">Lens Focal Length</span>
                    <span className="font-mono text-sky-500 font-bold">{cam.focalLength}mm</span>
                  </div>
                  {/* Focal length preset buttons */}
                  <div className="grid grid-cols-5 gap-1 mb-2">
                    {FOCAL_LENGTH_PRESETS.slice(0, 10).map((mm) => (
                      <button
                        key={mm}
                        onClick={() => updateElement(cam.id, { focalLength: mm })}
                        className={`py-1 text-[11px] font-mono rounded border transition-colors ${
                          cam.focalLength === mm
                            ? 'bg-sky-600 text-white border-sky-500 font-bold'
                            : isLight ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {mm}
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={200}
                    step={1}
                    value={cam.focalLength}
                    onChange={(e) => updateElement(cam.id, { focalLength: Number(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                {/* Sensor Format */}
                <div>
                  <label htmlFor={`${fieldId}-sensor-format`} className="opacity-60 block mb-1">Sensor Format</label>
                  <select id={`${fieldId}-sensor-format`}
                    value={cam.sensorFormat}
                    onChange={(e) => updateElement(cam.id, { sensorFormat: e.target.value as any })}
                    className={`w-full border rounded-lg p-2 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  >
                    {SENSOR_FORMATS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] opacity-60 mt-1 block">
                    Horizontal FOV: <strong className="text-sky-500">{cam.fovAngle}°</strong>
                  </span>
                </div>

                {/* Aspect Ratio */}
                <div>
                  <label htmlFor={`${fieldId}-aspect-ratio`} className="opacity-60 block mb-1">Aspect Ratio</label>
                  <select id={`${fieldId}-aspect-ratio`}
                    value={cam.aspectRatio}
                    onChange={(e) => updateElement(cam.id, { aspectRatio: e.target.value as any })}
                    className={`w-full border rounded-lg p-2 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  >
                    {ASPECT_RATIOS.map((ar) => (
                      <option key={ar.value} value={ar.value}>
                        {ar.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* FOV Cone Opacity */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-60">FOV Cone Opacity</span>
                    <span className="font-mono text-sky-500 font-bold">{Math.round((cam.fovOpacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={Math.round((cam.fovOpacity ?? 1) * 100)}
                    onChange={(e) => updateElement(cam.id, { fovOpacity: Number(e.target.value) / 100 })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
              </RubricSection>

              {/* Rubric 3: Cinematography Exposure HUD */}
              <RubricSection
                title="Cinematography Exposure"
                icon={<Gauge className="w-3.5 h-3.5 text-amber-500" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">
                    {cam.aperture || 'f/2.8'} · ISO {cam.iso ?? 800}
                  </span>
                }
                defaultOpen={false}
                isLight={isLight}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${fieldId}-iris-t-stop`} className="opacity-60 block mb-1">Iris / T-stop</label>
                    <select id={`${fieldId}-iris-t-stop`}
                      value={cam.aperture || 'f/2.8'}
                      onChange={(e) => updateElement(cam.id, { aperture: e.target.value })}
                      className={selectClass}
                    >
                      {APERTURES.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${fieldId}-iso`} className="opacity-60 block mb-1">ISO</label>
                    <select id={`${fieldId}-iso`}
                      value={cam.iso ?? 800}
                      onChange={(e) => updateElement(cam.id, { iso: Number(e.target.value) })}
                      className={selectClass}
                    >
                      {ISO_VALUES.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${fieldId}-shutter-angle`} className="opacity-60 block mb-1">Shutter Angle</label>
                    <select id={`${fieldId}-shutter-angle`}
                      value={cam.shutterAngle ?? 180}
                      onChange={(e) => updateElement(cam.id, { shutterAngle: Number(e.target.value) })}
                      className={selectClass}
                    >
                      {SHUTTER_ANGLES.map((value) => (
                        <option key={value} value={value}>{value}°</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${fieldId}-nd-filter`} className="opacity-60 block mb-1">ND Filter</label>
                    <select id={`${fieldId}-nd-filter`}
                      value={cam.ndFilter || 'None'}
                      onChange={(e) => updateElement(cam.id, { ndFilter: e.target.value })}
                      className={selectClass}
                    >
                      {ND_FILTERS.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const fpsShot =
                      activeSetup.shots.find((shot) => shot.id === cam.associatedShotId) ||
                      activeSetup.shots.find((shot) => shot.cameraId === cam.id);
                    if (!fpsShot) return null;
                    return (
                      <div>
                        <label className="opacity-60 block mb-1">Frame Rate (shot {fpsShot.shotNumber})</label>
                        <select
                          value={fpsShot.frameRate ?? 24}
                          onChange={(e) => updateShot(fpsShot.id, { frameRate: Number(e.target.value) })}
                          className={selectClass}
                        >
                          {FRAME_RATES.map((value) => (
                            <option key={value} value={value}>{value} fps</option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                </div>
              </RubricSection>

              {/* Rubric 4: Waypoints & Storyboard */}
              {(() => {
                const nextBeat = Math.max(2, ...(cam.path || []).map((wp) => wp.beat + 1));
                const handleAddCamWp = () => {
                  const existingPath = cam.path || [];
                  const lastPoint = existingPath.length > 0
                    ? existingPath[existingPath.length - 1]
                    : { x: cam.x, y: cam.y, rotation: cam.rotation || 0 };
                  const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
                  const offsetDist = 60;
                  const newWp = {
                    id: createId('wp'),
                    x: Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist),
                    y: Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist),
                    rotation: lastPoint.rotation || 0,
                    beat: nextBeat,
                    dialogueCue: '',
                  };
                  updateElement(cam.id, { path: [...existingPath, newWp] });
                  if (nextBeat > (activeSetup.totalBeats || 1)) {
                    updateSetupMeta({ totalBeats: nextBeat });
                  }
                };

                return (
                  <RubricSection
                    title="Waypoints & Storyboard"
                    icon={<Compass className="w-3.5 h-3.5 text-emerald-500" />}
                    defaultOpen={true}
                    isLight={isLight}
                    headerRight={
                      <button
                        type="button"
                        title={`Add camera movement waypoint (Beat ${nextBeat})`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleAddCamWp();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="px-2 py-0.5 text-[10px] font-bold rounded bg-sky-500 hover:bg-sky-600 active:scale-95 text-white transition-all cursor-pointer select-none"
                      >
                        + Waypoint
                      </button>
                    }
                  >
                    {/* Camera Movement Waypoints */}
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        handleAddCamWp();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className={`w-full py-2 border rounded-lg text-xs font-semibold cursor-pointer select-none active:scale-[0.98] transition-transform ${
                        isLight ? 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100' : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700'
                      }`}
                    >
                      + Add Camera Movement Waypoint (Beat {nextBeat})
                    </button>

                {/* Editable waypoint list */}
                <WaypointListEditor
                  boardShot={
                    activeSetup.shots.find((shot) => shot.id === cam.associatedShotId) ||
                    activeSetup.shots.find((shot) => shot.cameraId === cam.id) ||
                    null
                  }
                  elementId={cam.id}
                  path={cam.path || []}
                  baseRotation={cam.rotation}
                  accentClass="text-sky-500"
                  isLight={isLight}
                />

                {/* Storyboard frames */}
                {(() => {
                  const linkedShot =
                    activeSetup.shots.find((s) => s.id === cam.associatedShotId) ||
                    activeSetup.shots.find((s) => s.cameraId === cam.id);
                  if (!linkedShot) return null;

                  const slots = slotsOf(linkedShot, cam);
                  const sceneRatio =
                    ASPECT_RATIOS.find((a) => a.value === (activeSetup.aspectRatio || '16:9'))?.ratio || 16 / 9;

                  return (
                    <div className={`pt-3 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-1 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-violet-500" />
                        Storyboard — Shot {linkedShot.shotNumber}
                      </h4>
                      <p className={`text-[10px] mb-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {slots.length > 1
                          ? `One frame per keyframe of this move (${slots.map((slot) => slot.label).join(' → ')}).`
                          : 'Add a waypoint to this camera to board the move beat by beat.'}
                      </p>

                      <div className="space-y-3">
                        {slots.map((slot) => (
                          <StoryboardField
                            key={slot.key}
                            label={slots.length > 1 ? `${slot.label} frame` : `Storyboard for Shot ${linkedShot.shotNumber}`}
                            value={slot.frame?.image}
                            onChange={(url) =>
                              updateShot(
                                linkedShot.id,
                                setFramePatch(linkedShot, slot.key, url ? { image: url, fit: 'cover' } : null)
                              )
                            }
                            aspectRatio={sceneRatio}
                            fit={slot.frame?.fit}
                            onFitChange={(fit) =>
                              updateShot(linkedShot.id, setFramePatch(linkedShot, slot.key, { fit }))
                            }
                            isLight={isLight}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </RubricSection>
            );
          })()}
        </div>
      );
    })()}

        {/* 4. ACTOR SPECIFIC INSPECTOR */}
        {el.type === 'actor' && (() => {
          const actor = el as ActorElement;
          const updateActorSpeech = (beat: number, text: string) => {
            const cues = actor.speechCues || [];
            const existing = cues.find((cue) => cue.beat === beat);
            const next = text.length === 0
              ? cues.filter((cue) => cue.beat !== beat)
              : existing
                ? cues.map((cue) => cue.id === existing.id ? { ...cue, text } : cue)
                : [...cues, { id: createId('speech'), beat, text }];
            updateElement(actor.id, { speechCues: next });
          };
          const linkedCharacter = scriptCharacters.find((c) => c.id === actor.characterId);
          const nameMatchedCharacter = !linkedCharacter && (actor.characterName || '').trim()
            ? scriptCharacters.find((c) =>
                c.canonicalName === actor.characterName?.trim().toUpperCase() ||
                c.aliases.some((alias) => alias.toUpperCase() === actor.characterName?.trim().toUpperCase()))
            : undefined;
          const effectiveCharacter = linkedCharacter ?? nameMatchedCharacter;
          const scriptedLines = effectiveCharacter
            ? collectCharacterDialogue(
                project.scriptLines || [],
                effectiveCharacter.canonicalName,
                effectiveCharacter.aliases,
              )
            : [];
          return (
            <div className="space-y-3 pt-1">
              {/* Rubric 1: Character & Stance */}
              <RubricSection
                title="Character & Stance"
                icon={<User className="w-3.5 h-3.5 text-emerald-500" />}
                badge={
                  actor.characterName ? (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold truncate max-w-[100px]">
                      {actor.characterName}
                    </span>
                  ) : undefined
                }
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <span className="opacity-60 block mb-1">Script Character</span>
                  {scriptCharacters.length > 0 ? (
                    <select
                      aria-label="Script Character"
                      value={actor.characterId || ''}
                      onChange={(event) => {
                        const picked = scriptCharacters.find((c) => c.id === event.target.value);
                        updateElement(actor.id, {
                          characterId: picked?.id,
                          ...(picked ? { characterName: picked.canonicalName } : {}),
                        });
                      }}
                      className={selectClass}
                    >
                      <option value="">Not from script / free text</option>
                      {scriptCharacters.map((character) => (
                        <option key={character.id} value={character.id}>
                          {character.canonicalName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[10px] opacity-50 leading-snug">
                      No script attached - name the character freely below.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={`${fieldId}-character-name-id`} className="opacity-60 block mb-1">Character Name / ID</label>
                  <input id={`${fieldId}-character-name-id`}
                    type="text"
                    value={actor.characterName || ''}
                    placeholder="e.g. SARAH (Lead Detective)"
                    onChange={(e) => updateElement(actor.id, { characterName: e.target.value })}
                    className={`w-full border rounded-lg p-2 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>

                {/* Color Marker */}
                <div>
                  <span id={`${fieldId}-avatar-color-group`} className="opacity-60 block mb-1">Avatar Color</span>
                  <div role="group" aria-labelledby={`${fieldId}-avatar-color-group`} className="flex gap-2">
                    {ACTOR_COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateElement(actor.id, { color: c })}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full border ${
                          actor.color === c ? 'border-white ring-2 ring-emerald-400' : 'border-transparent'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Actor Stance */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateElement(actor.id, { isStanding: true })}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      actor.isStanding
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    Standing
                  </button>
                  <button
                    onClick={() => updateElement(actor.id, { isStanding: false })}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      !actor.isStanding
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    Seated / Chair
                  </button>
                </div>

                {/* Blocking Action & Dialogue notes */}
                <div>
                  <label htmlFor={`${fieldId}-actor-action-dialogue-notes`} className="opacity-60 block mb-1">Actor Action / Dialogue Notes</label>
                  <textarea id={`${fieldId}-actor-action-dialogue-notes`}
                    value={actor.actionNotes || ''}
                    onChange={(e) => updateElement(actor.id, { actionNotes: e.target.value })}
                    placeholder="e.g. Enters through front door on Beat 1, confronts Sarah on Beat 2..."
                    rows={2}
                    className={`w-full border rounded-lg p-2 focus:border-emerald-500 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>
              </RubricSection>

              <RubricSection
                title="Speech by Beat"
                icon={<MessageCircle className="w-3.5 h-3.5 text-emerald-500" />}
                badge={
                  <button
                    type="button"
                    onClick={() => updateDisplaySettings({ showSpeechBubbles: !displaySettings.showSpeechBubbles })}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                      displaySettings.showSpeechBubbles
                        ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                        : isLight ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-slate-900 text-slate-500 border-slate-700'
                    }`}
                  >
                    Bubbles {displaySettings.showSpeechBubbles ? 'on' : 'off'}
                  </button>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                <p className="text-[10px] opacity-60 mb-2">
                  Dialogue follows the timeline even when the actor does not move. Empty beats stay silent.
                  {effectiveCharacter && scriptedLines.length > 0
                    ? ` Scripted lines for ${effectiveCharacter.canonicalName} can be picked per beat.`
                    : ''}
                </p>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {Array.from({ length: Math.max(1, playback.totalBeats) }, (_, index) => index + 1).map((beat) => {
                    const cue = (actor.speechCues || []).find((item) => item.beat === beat);
                    const active = Math.round(playback.currentBeat) === beat;
                    return (
                      <div
                        key={beat}
                        className={`rounded-lg border ${
                          active
                            ? 'border-emerald-500/60 bg-emerald-500/10'
                            : isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'
                        }`}
                      >
                        <div className="flex items-center gap-2 p-1.5">
                          <span className={`w-7 text-[10px] font-mono font-bold ${active ? 'text-emerald-500' : 'opacity-50'}`}>B{beat}</span>
                          <input
                            type="text"
                            value={cue?.text || ''}
                            onChange={(event) => updateActorSpeech(beat, event.target.value)}
                            placeholder={beat === 1 ? 'What does the actor say?' : 'Silent beat'}
                            aria-label={`${actor.name} speech at beat ${beat}`}
                            className={`flex-1 min-w-0 border rounded-md px-2 py-1 text-[11px] ${
                              isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
                            }`}
                          />
                        </div>
                        {scriptedLines.length > 0 && (
                          <select
                            value=""
                            onChange={(event) => {
                              const pickedLine = scriptedLines.find((line) => line.lineId === event.target.value);
                              if (pickedLine) updateActorSpeech(beat, pickedLine.text);
                            }}
                            aria-label={`Pick a scripted line for ${actor.name} at beat ${beat}`}
                            className={`w-full px-2 py-1 mb-1.5 mx-1 text-[10px] rounded-md border cursor-pointer ${
                              isLight ? 'bg-white text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-700'
                            }`}
                            style={{ width: 'calc(100% - 0.5rem)' }}
                          >
                            <option value="">Pick line from script...</option>
                            {scriptedLines.map((line, lineIndex) => (
                              <option key={line.lineId} value={line.lineId}>
                                {(line.sceneNumber ? `Sc${line.sceneNumber} ` : '') +
                                  `#${lineIndex + 1} ` +
                                  (line.text.length > 58 ? `${line.text.slice(0, 55)}...` : line.text)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </RubricSection>

              {/* Rubric 2: Waypoints & Movement */}
              {(() => {
                const nextBeat = Math.max(2, ...(actor.path || []).map((wp) => wp.beat + 1));
                const handleAddActorWp = () => {
                  const existingPath = actor.path || [];
                  const lastPoint = existingPath.length > 0
                    ? existingPath[existingPath.length - 1]
                    : { x: actor.x, y: actor.y, rotation: actor.rotation || 0 };
                  const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
                  const offsetDist = 50;
                  const newWp = {
                    id: createId('wp'),
                    x: Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist),
                    y: Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist),
                    rotation: lastPoint.rotation || 0,
                    beat: nextBeat,
                    dialogueCue: '',
                  };
                  updateElement(actor.id, { path: [...existingPath, newWp] });
                  if (nextBeat > (activeSetup.totalBeats || 1)) {
                    updateSetupMeta({ totalBeats: nextBeat });
                  }
                };

                return (
                  <RubricSection
                    title="Waypoints & Trajectory"
                    icon={<Compass className="w-3.5 h-3.5 text-sky-500" />}
                    defaultOpen={true}
                    isLight={isLight}
                    headerRight={
                      <button
                        type="button"
                        title={`Add actor waypoint (Beat ${nextBeat})`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleAddActorWp();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition-all cursor-pointer select-none"
                      >
                        + Waypoint
                      </button>
                    }
                  >
                    {/* Add Waypoint Button */}
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        handleAddActorWp();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className={`w-full py-2 border rounded-lg text-xs font-semibold cursor-pointer select-none active:scale-[0.98] transition-transform ${
                        isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                      }`}
                    >
                      + Add Actor Waypoint (Beat {nextBeat})
                    </button>

                {/* Editable waypoint list */}
                <WaypointListEditor
                  elementId={actor.id}
                  path={actor.path || []}
                  baseRotation={actor.rotation}
                  accentClass="text-emerald-500"
                  isLight={isLight}
                />
              </RubricSection>
            );
          })()}
        </div>
      );
    })()}

        {/* 5. LIGHT SPECIFIC INSPECTOR */}
        {el.type === 'light' && (
          <LightInspector light={el as LightElement} isLight={isLight} />
        )}

        {/* 6. PROP SPECIFIC INSPECTOR */}
        {el.type === 'prop' && (() => {
          const prop = el as PropElement;
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Prop Dimensions & Type"
                icon={<Tv className="w-3.5 h-3.5 text-purple-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label htmlFor={`${fieldId}-prop-type-preset`} className="opacity-60 block mb-1">Prop Type Preset</label>
                  <select id={`${fieldId}-prop-type-preset`}
                    value={prop.propType}
                    onChange={(e) => {
                      const info = PROP_CATALOG.find((p) => p.type === e.target.value);
                      updateElement(prop.id, {
                        propType: e.target.value as any,
                        width: info?.defaultWidth ?? prop.width,
                        height: info?.defaultHeight ?? prop.height,
                        color: info?.defaultColor ?? prop.color,
                      });
                    }}
                    className={`w-full border rounded-lg p-2 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  >
                    {PROP_CATALOG.map((p) => (
                      <option key={p.type} value={p.type}>
                        {p.name} ({p.category})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Scale Presets */}
                <div>
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase opacity-60 mb-1">
                    <span>Quick Scale Factor</span>
                    <span className="font-mono text-sky-500">
                      {Math.round((prop.width / (PROP_CATALOG.find((p) => p.type === prop.propType)?.defaultWidth || 100)) * 100)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-[10px] font-mono">
                    {[
                      { label: '25%', factor: 0.25 },
                      { label: '50%', factor: 0.5 },
                      { label: '75%', factor: 0.75 },
                      { label: '100%', factor: 1.0 },
                      { label: '150%', factor: 1.5 },
                    ].map(({ label, factor }) => {
                      const base = PROP_CATALOG.find((p) => p.type === prop.propType) || { defaultWidth: 100, defaultHeight: 100 };
                      const targetW = Math.round(base.defaultWidth * factor);
                      const targetH = Math.round(base.defaultHeight * factor);
                      const isCurrent = Math.abs(prop.width - targetW) < 4;

                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => updateElement(prop.id, { width: targetW, height: targetH })}
                          className={`py-1 rounded border font-bold transition-colors ${
                            isCurrent
                              ? 'bg-sky-500 text-white border-sky-600 shadow-xs'
                              : isLight
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${fieldId}-width-px`} className="opacity-60 block mb-1">Width (px)</label>
                    <input id={`${fieldId}-width-px`}
                      type="number"
                      min={5}
                      max={3000}
                      value={prop.width}
                      onChange={(e) => updateElement(prop.id, { width: Math.max(5, Number(e.target.value)) })}
                      className={`w-full border rounded p-1 font-mono ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${fieldId}-height-px`} className="opacity-60 block mb-1">Height (px)</label>
                    <input id={`${fieldId}-height-px`}
                      type="number"
                      min={5}
                      max={3000}
                      value={prop.height}
                      onChange={(e) => updateElement(prop.id, { height: Math.max(5, Number(e.target.value)) })}
                      className={`w-full border rounded p-1 font-mono ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    />
                  </div>
                </div>

                {/* Prop Opacity Slider */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-60">Opacity</span>
                    <span className="font-mono text-purple-400 font-bold">
                      {Math.round((prop.opacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={Math.round((prop.opacity ?? 1) * 100)}
                    onChange={(e) => updateElement(prop.id, { opacity: Number(e.target.value) / 100 })}
                    className="w-full accent-purple-500 cursor-pointer h-1.5"
                  />
                </div>

                {/* Color / Material Tint */}
                <div>
                  <span id={`${fieldId}-color-material-tint-group`} className="opacity-60 block mb-1">Color / Material Tint</span>
                  <div role="group" aria-labelledby={`${fieldId}-color-material-tint-group`} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={prop.color || '#475569'}
                      onChange={(e) => updateElement(prop.id, { color: e.target.value })}
                      className="w-8 h-8 rounded border cursor-pointer flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={prop.color || '#475569'}
                      onChange={(e) => updateElement(prop.id, { color: e.target.value })}
                      className={`flex-1 border rounded p-1 font-mono text-xs ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    />
                  </div>
                </div>
              </RubricSection>

              {/* Waypoints & Movement (cars / props that move during a shot) */}
              {(() => {
                const nextBeat = Math.max(2, ...(prop.path || []).map((wp) => wp.beat + 1));
                const handleAddPropWp = () => {
                  const existingPath = prop.path || [];
                  const lastPoint = existingPath.length > 0
                    ? existingPath[existingPath.length - 1]
                    : { x: prop.x, y: prop.y, rotation: prop.rotation || 0 };
                  const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
                  const offsetDist = 70;
                  const newWp = {
                    id: createId('wp'),
                    x: Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist),
                    y: Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist),
                    rotation: lastPoint.rotation || 0,
                    beat: nextBeat,
                    dialogueCue: '',
                  };
                  updateElement(prop.id, { path: [...existingPath, newWp] } as any);
                  if (nextBeat > (activeSetup.totalBeats || 1)) {
                    updateSetupMeta({ totalBeats: nextBeat });
                  }
                };

                return (
                  <RubricSection
                    title="Waypoints & Trajectory"
                    icon={<Compass className="w-3.5 h-3.5 text-purple-500" />}
                    defaultOpen={true}
                    isLight={isLight}
                    headerRight={
                      <button
                        type="button"
                        title={`Add movement waypoint (Beat ${nextBeat})`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleAddPropWp();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-600 hover:bg-purple-700 active:scale-95 text-white transition-all cursor-pointer select-none"
                      >
                        + Waypoint
                      </button>
                    }
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        handleAddPropWp();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className={`w-full py-2 border rounded-lg text-xs font-semibold cursor-pointer select-none active:scale-[0.98] transition-transform ${
                        isLight ? 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100' : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700'
                      }`}
                    >
                      + Add Prop Waypoint (Beat {nextBeat})
                    </button>

                    <WaypointListEditor
                      elementId={prop.id}
                      path={prop.path || []}
                      baseRotation={prop.rotation}
                      accentClass="text-purple-500"
                      isLight={isLight}
                    />
                  </RubricSection>
                );
              })()}
            </div>
          );
        })()}

        {/* 7. WALL SPECIFIC INSPECTOR */}
        {el.type === 'wall' && (() => {
          const wall = el as WallElement;
          const wallLen = Math.round(
            Math.sqrt(Math.pow((wall.x2 ?? wall.x + 200) - wall.x, 2) + Math.pow((wall.y2 ?? wall.y) - wall.y, 2))
          );
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Wall Dimensions & Inserts"
                icon={<Square className="w-3.5 h-3.5 text-slate-400" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 font-bold">
                    {(wallLen / 50).toFixed(2)}m
                  </span>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="opacity-60">Wall Length:</span>
                  <span className="font-mono text-sky-500 font-bold">{(wallLen / 50).toFixed(2)}m ({wallLen}px)</span>
                </div>

                <div>
                  <label htmlFor={`${fieldId}-thickness-px`} className="opacity-60 block mb-1">Thickness (px)</label>
                  <input id={`${fieldId}-thickness-px`}
                    type="number"
                    min={4}
                    max={40}
                    value={wall.thickness || 12}
                    onChange={(e) => updateElement(wall.id, { thickness: Number(e.target.value) })}
                    className={`w-full border rounded p-1.5 font-mono text-xs ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>

                {/* Quick Snap Insert Door / Window Buttons */}
                <div className="pt-2 space-y-2 border-t border-slate-200/60 dark:border-slate-700/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 block">
                    Quick Wall Insertions
                  </span>
                  <button
                    onClick={() => insertDoorInWall(wall.id)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 border border-amber-500/40 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <DoorClosed className="w-4 h-4 text-amber-500" />
                    <span>+ Snap Door onto this Wall</span>
                  </button>
                  <button
                    onClick={() => insertWindowInWall(wall.id)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-sky-500/15 hover:bg-sky-500/25 text-sky-600 border border-sky-500/40 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <AppWindow className="w-4 h-4 text-sky-500" />
                    <span>+ Snap Window onto this Wall</span>
                  </button>
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 7.5 TRACK SPECIFIC INSPECTOR */}
        {el.type === 'track' && (() => {
          const track = el as TrackElement;
          const trackLen = Math.round(
            Math.hypot((track.x2 ?? track.x + 240) - track.x, (track.y2 ?? track.y) - track.y)
          );
          const isCurved = !!track.isCurved;
          const curveOffset = track.curveOffset ?? 60;
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Dolly Track Geometry"
                icon={<MoveRight className="w-3.5 h-3.5 text-slate-400" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 font-bold">
                    {(trackLen / 25).toFixed(0)}ft
                  </span>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="opacity-60">Track Length:</span>
                  <span className="font-mono text-sky-500 font-bold">{(trackLen / 25).toFixed(0)}ft ({trackLen}px)</span>
                </div>

                {/* Straight / Curved toggle */}
                <div>
                  <span id={`${fieldId}-track-shape-group`} className="opacity-60 block mb-1">Track Shape</span>
                  <div role="group" aria-labelledby={`${fieldId}-track-shape-group`} className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateElement(track.id, { isCurved: false })}
                      className={`py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        !isCurved
                          ? 'bg-sky-600 text-white border-sky-500'
                          : isLight
                            ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <MoveRight className="w-3.5 h-3.5" />
                      Straight
                    </button>
                    <button
                      onClick={() => updateElement(track.id, { isCurved: true, curveOffset: curveOffset || 60 })}
                      className={`py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        isCurved
                          ? 'bg-amber-500 text-slate-900 border-amber-400'
                          : isLight
                            ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <Gauge className="w-3.5 h-3.5" />
                      Curved
                    </button>
                  </div>
                </div>

                {isCurved && (
                  <>
                    {/* Curve magnitude slider */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="opacity-60">Curve Magnitude</span>
                        <span className="font-mono font-bold text-amber-500">{curveOffset}px</span>
                      </div>
                      <input
                        type="range"
                        min={-500}
                        max={500}
                        step={5}
                        value={curveOffset}
                        onChange={(e) => updateElement(track.id, { curveOffset: Number(e.target.value) })}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] font-mono opacity-50 mt-0.5">
                        <span>Bends left</span>
                        <span>0</span>
                        <span>Bends right</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateElement(track.id, { curveOffset: -curveOffset })}
                        className={`py-1 rounded-lg border text-[10px] font-semibold transition-colors ${
                          isLight ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100' : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        Flip Curve Direction
                      </button>
                      <button
                        onClick={() => updateElement(track.id, { isCurved: false, curveOffset: 0 })}
                        className={`py-1 rounded-lg border text-[10px] font-semibold transition-colors ${
                          isLight ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100' : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        Make Straight
                      </button>
                    </div>
                  </>
                )}

                <p className="text-[10px] opacity-50 leading-relaxed">
                  Tip: select the track and drag the amber curve handle on the canvas to bend it live.
                  Hold <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[9px]">Shift</kbd> to snap the curve in 10px steps.
                </p>
              </RubricSection>
            </div>
          );
        })()}

        {/* 7b. STREET / ROAD INSPECTOR */}
        {el.type === 'road' && (() => {
          const road = el as RoadElement;
          const length = Math.round(
            Math.hypot((road.x2 ?? road.x + 320) - road.x, (road.y2 ?? road.y) - road.y),
          );
          const curveOffset = road.curveOffset ?? 60;
          const btn = (active: boolean) =>
            `py-1.5 px-2 rounded-lg border text-[10px] font-semibold transition-colors ${
              active
                ? 'bg-sky-600 text-white border-sky-500'
                : isLight
                ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
            }`;
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Street Surface & Markings"
                icon={<Square className="w-3.5 h-3.5 text-zinc-400" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-500/10 font-bold">
                    {(length / 50).toFixed(2)}m
                  </span>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="opacity-60">Run length:</span>
                  <span className="font-mono text-sky-500 font-bold">{(length / 50).toFixed(2)}m ({length}px)</span>
                </div>

                <div>
                  <label className="opacity-60 block mb-1">
                    Carriageway width &mdash; {((road.width || 120) / 50).toFixed(2)}m
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={400}
                    step={5}
                    value={road.width || 120}
                    onChange={(e) => updateElement(road.id, { width: Number(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                <div>
                  <span id={`${fieldId}-surface-group`} className="opacity-60 block mb-1">Surface</span>
                  <div role="group" aria-labelledby={`${fieldId}-surface-group`} className="grid grid-cols-3 gap-1">
                    {([
                      ['asphalt', 'Asphalt'],
                      ['concrete', 'Concrete'],
                      ['cobble', 'Cobble'],
                      ['gravel', 'Gravel'],
                      ['dirt', 'Dirt track'],
                      ['rail', 'Rail / tram'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => updateElement(road.id, { surface: value })}
                        className={btn((road.surface ?? 'asphalt') === value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span id={`${fieldId}-centre-marking-group`} className="opacity-60 block mb-1">Centre marking</span>
                  <div role="group" aria-labelledby={`${fieldId}-centre-marking-group`} className="grid grid-cols-3 gap-1">
                    {([
                      ['none', 'None'],
                      ['dashed', 'Dashed'],
                      ['solid', 'Solid'],
                      ['double', 'Double'],
                      ['crosswalk', 'Crossing'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => updateElement(road.id, { marking: value })}
                        className={btn((road.marking ?? 'dashed') === value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${fieldId}-lanes`} className="opacity-60 block mb-1">Lanes</label>
                    <input id={`${fieldId}-lanes`}
                      type="number"
                      min={1}
                      max={8}
                      value={road.lanes ?? 2}
                      onChange={(e) =>
                        updateElement(road.id, { lanes: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })
                      }
                      className={`w-full border rounded p-1.5 font-mono text-xs ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <span className="opacity-60 block mb-1">Pavements</span>
                    <button
                      aria-label="Pavements"
                      aria-pressed={!!road.sidewalks}
                      onClick={() => updateElement(road.id, { sidewalks: !road.sidewalks })}
                      className={`w-full ${btn(!!road.sidewalks)}`}
                    >
                      {road.sidewalks ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor={`${fieldId}-street-name`} className="opacity-60 block mb-1">Street name</label>
                  <input id={`${fieldId}-street-name`}
                    type="text"
                    value={road.label ?? ''}
                    onChange={(e) => updateElement(road.id, { label: e.target.value || undefined })}
                    placeholder="e.g. Riverside Promenade"
                    className={`w-full border rounded p-1.5 text-xs ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>

                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50 space-y-2">
                  <button
                    onClick={() =>
                      updateElement(road.id, {
                        isCurved: !road.isCurved,
                        curveOffset: road.isCurved ? 0 : 60,
                      })
                    }
                    className={`w-full ${btn(!!road.isCurved)}`}
                  >
                    {road.isCurved ? 'Curved run' : 'Straight run'}
                  </button>
                  {road.isCurved && (
                    <div>
                      <label className="opacity-60 block mb-1">Bend &mdash; {curveOffset}px</label>
                      <input
                        type="range"
                        min={-500}
                        max={500}
                        step={5}
                        value={curveOffset}
                        onChange={(e) => updateElement(road.id, { curveOffset: Number(e.target.value) })}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>
                  )}
                  <p className="text-[10px] opacity-50 leading-relaxed">
                    Drag either endpoint to lay the run, and the amber handle to bend it &mdash; the same
                    controls as a dolly track. Widths convert at the plan scale, so a 6&nbsp;m street is
                    300px at the default 50px/m.
                  </p>
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 8. DOOR SPECIFIC INSPECTOR */}
        {el.type === 'door' && (() => {
          const door = el as DoorElement;
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Door Dimensions & Swing"
                icon={<DoorClosed className="w-3.5 h-3.5 text-amber-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label htmlFor={`${fieldId}-door-width-px`} className="opacity-60 block mb-1">Door Width (px)</label>
                  <input id={`${fieldId}-door-width-px`}
                    type="number"
                    min={30}
                    max={150}
                    value={door.width || 60}
                    onChange={(e) => updateElement(door.id, { width: Number(e.target.value) })}
                    className={`w-full border rounded p-1.5 font-mono text-xs ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>

                <div>
                  <span id={`${fieldId}-door-swing-angle-group`} className="opacity-60 block mb-1">Door Swing Angle</span>
                  <div role="group" aria-labelledby={`${fieldId}-door-swing-angle-group`} className="grid grid-cols-3 gap-1.5">
                    {[45, 90, 180].map((deg) => (
                      <button
                        key={deg}
                        onClick={() => updateElement(door.id, { swingAngle: deg })}
                        className={`py-1.5 text-xs font-mono rounded border ${
                          (door.swingAngle || 90) === deg
                            ? 'bg-amber-600 text-white border-amber-500 font-bold'
                            : isLight ? 'bg-slate-50 text-slate-700 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => updateElement(door.id, { swingDirection: door.swingDirection === 'left' ? 'right' : 'left' })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1 transition-colors ${
                      isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5 text-amber-500" />
                    <span>{door.swingDirection === 'left' ? 'Left Hinge' : 'Right Hinge'}</span>
                  </button>
                  <button
                    onClick={() => updateElement(door.id, { isOpen: !door.isOpen })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1 transition-colors ${
                      isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    <SquareSplitHorizontal className="w-3.5 h-3.5 text-amber-500" />
                    <span>{door.isOpen ? 'Door Open' : 'Door Closed'}</span>
                  </button>
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 9. WINDOW SPECIFIC INSPECTOR */}
        {el.type === 'window' && (() => {
          const win = el as WindowElement;
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Window Dimensions & Sunlight"
                icon={<AppWindow className="w-3.5 h-3.5 text-sky-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label htmlFor={`${fieldId}-window-width-px`} className="opacity-60 block mb-1">Window Width (px)</label>
                  <input id={`${fieldId}-window-width-px`}
                    type="number"
                    min={30}
                    max={250}
                    value={win.width || 80}
                    onChange={(e) => updateElement(win.id, { width: Number(e.target.value) })}
                    className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                  />
                </div>

                <div>
                  <label htmlFor={`${fieldId}-depth-frame-px`} className="opacity-60 block mb-1">Depth / Frame (px)</label>
                  <input id={`${fieldId}-depth-frame-px`}
                    type="number"
                    min={6}
                    max={30}
                    value={win.depth || 12}
                    onChange={(e) => updateElement(win.id, { depth: Number(e.target.value) })}
                    className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                  />
                </div>

                <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 rounded-lg text-[11px] text-sky-600">
                  <span className="font-semibold block mb-0.5">Natural Sunlight Simulation</span>
                  Acts as an ambient daylight portal on the floor plan and camera coverage preview.
                </div>

                <PillToggle
                  on={win.beamVisible === true}
                  onClick={() =>
                    updateElement(win.id, {
                      beamVisible: !win.beamVisible,
                    })
                  }
                  label="Sunlight cone"
                  isLight={isLight}
                />

                {/* Window Orientation & Direction */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="opacity-60 text-xs">Window Facing Angle</span>
                    <span className="font-mono text-xs font-bold text-sky-500">
                      {Math.round(((win.rotation || 0) % 360 + 360) % 360)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={Math.round(((win.rotation || 0) % 360 + 360) % 360)}
                    onChange={(e) => updateElement(win.id, { rotation: Number(e.target.value) })}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateElement(win.id, {
                          rotation: Math.round(((win.rotation || 0) + 180) % 360),
                        })
                      }
                      className={`py-1.5 px-2 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                        isLight
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                      }`}
                    >
                      <RotateCw className="w-3 h-3" />
                      Flip 180°
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateElement(win.id, {
                          rotation: Math.round(((win.rotation || 0) + 90) % 360),
                        })
                      }
                      className={`py-1.5 px-2 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                        isLight
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                      }`}
                    >
                      <RotateCw className="w-3 h-3" />
                      Rotate +90°
                    </button>
                  </div>
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 10. TEXT SPECIFIC INSPECTOR */}
        {el.type === 'text' && (() => {
          const txt = el as TextElement;
          const txtInputClass = `w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`;
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Text Content & Typography"
                icon={<Type className="w-3.5 h-3.5 text-blue-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label htmlFor={`${fieldId}-text-content`} className="opacity-60 block mb-1">Text Content</label>
                  <textarea id={`${fieldId}-text-content`}
                    value={txt.text}
                    onChange={(e) => updateElement(txt.id, { text: e.target.value })}
                    rows={2}
                    className={txtInputClass}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-60">Font Size (px)</span>
                    <span className="font-mono font-bold">{txt.fontSize || 16}px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={96}
                    step={1}
                    value={txt.fontSize || 16}
                    onChange={(e) => updateElement(txt.id, { fontSize: Number(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <PillToggle
                    on={(txt.fontWeight || 'normal') === 'bold'}
                    onClick={() => updateElement(txt.id, { fontWeight: txt.fontWeight === 'bold' ? 'normal' : 'bold' })}
                    label="Bold"
                    isLight={isLight}
                  />
                  <PillToggle
                    on={(txt.fontStyle || 'normal') === 'italic'}
                    onClick={() => updateElement(txt.id, { fontStyle: txt.fontStyle === 'italic' ? 'normal' : 'italic' })}
                    label="Italic"
                    isLight={isLight}
                  />
                  <PillToggle
                    on={txt.underline === true}
                    onClick={() => updateElement(txt.id, { underline: txt.underline !== true })}
                    label="Underline"
                    isLight={isLight}
                  />
                  <PillToggle
                    on={txt.strikethrough === true}
                    onClick={() => updateElement(txt.id, { strikethrough: txt.strikethrough !== true })}
                    label="Strikethrough"
                    isLight={isLight}
                  />
                </div>

                <div>
                  <label htmlFor={`${fieldId}-font-family`} className="opacity-60 block mb-1">Font Family</label>
                  <select id={`${fieldId}-font-family`}
                    value={txt.fontFamily || 'sans-serif'}
                    onChange={(e) => updateElement(txt.id, { fontFamily: e.target.value })}
                    className={txtInputClass}
                  >
                    <option value="sans-serif">Sans-Serif</option>
                    <option value="serif">Serif</option>
                    <option value="monospace">Monospace</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="Verdana, sans-serif">Verdana</option>
                    <option value="Impact, sans-serif">Impact</option>
                  </select>
                </div>

                <div>
                  <span id={`${fieldId}-text-alignment-group`} className="opacity-60 block mb-1">Text Alignment</span>
                  <div role="group" aria-labelledby={`${fieldId}-text-alignment-group`} className="grid grid-cols-3 gap-1">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button
                        key={align}
                        onClick={() => updateElement(txt.id, { textAlign: align })}
                        className={`py-1.5 text-[10px] font-semibold rounded border capitalize ${
                          (txt.textAlign || 'center') === align
                            ? 'bg-sky-600 text-white border-sky-500'
                            : isLight
                            ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                            : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        {align}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="opacity-60">Text Color</span>
                    <span className="font-mono font-bold uppercase">{txt.color || '#94a3b8'}</span>
                  </div>
                  <input
                    type="color"
                    value={(txt.color || '#94a3b8').startsWith('#') ? txt.color || '#94a3b8' : `#${txt.color}`}
                    onChange={(e) => updateElement(txt.id, { color: e.target.value })}
                    className="w-full h-8 cursor-pointer rounded border bg-transparent"
                  />
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 11. SHAPE SPECIFIC INSPECTOR */}
        {el.type === 'shape' && (() => {
          const shape = el as ShapeElement;
          const fill = shape.color || '#38bdf8';
          const strokeColor = shape.strokeColor || fill;
          const fillOpacity = shape.opacity ?? 0.3;
          const strokeWidth = shape.strokeWidth ?? 2;
          const strokeOpacity = shape.strokeOpacity ?? 1;
          const dashStyle = shape.dashStyle || 'solid';
          const filled = shape.filled !== false;
          const optionBtn = (active: boolean) =>
            `py-1.5 text-[10px] font-semibold rounded border capitalize ${
              active
                ? 'bg-sky-600 text-white border-sky-500'
                : isLight
                ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
            }`;

          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Shape Geometry & Styling"
                icon={<Circle className="w-3.5 h-3.5 text-cyan-500" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 font-bold capitalize">
                    {shape.shapeType}
                  </span>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label htmlFor={`${fieldId}-type`} className="opacity-60 block mb-1">Type</label>
                  <select id={`${fieldId}-type`}
                    value={shape.shapeType}
                    onChange={(e) => updateElement(shape.id, { shapeType: e.target.value as ShapeType })}
                    className={selectClass}
                  >
                    {SHAPE_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value.charAt(0).toUpperCase() + value.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs opacity-60">Show on floor plan</span>
                  <button
                    onClick={() => updateElement(shape.id, { visible: shape.visible === false ? true : false })}
                    title={shape.visible === false ? 'Hidden shapes stay on the canvas as a faint dashed ghost' : 'Hide this shape (it becomes a faint ghost you can click to re-show)'}
                    className={`px-3 py-1 text-[10px] font-bold rounded border ${
                      shape.visible !== false
                        ? 'bg-sky-600 text-white border-sky-500'
                        : isLight
                        ? 'bg-slate-50 text-slate-500 border-slate-300'
                        : 'bg-slate-950 text-slate-500 border-slate-700'
                    }`}
                  >
                    {shape.visible !== false ? 'Visible' : 'Hidden'}
                  </button>
                </div>

                <div>
                  <label htmlFor={`${fieldId}-label-optional`} className="opacity-60 block mb-1">Label (optional)</label>
                  <input id={`${fieldId}-label-optional`}
                    type="text"
                    value={shape.label || ''}
                    onChange={(e) => updateElement(shape.id, { label: e.target.value })}
                    placeholder="e.g. Hot zone, carpet, shadow…"
                    className={`w-full border rounded p-1.5 text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                  />
                </div>

                {shape.shapeType === 'line' ? (
                  /* Tailored controls for Line Shape */
                  <div className="space-y-3 pt-1">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-300">Line Length (px)</span>
                        <span className="font-mono font-bold text-sky-400">{Math.round(shape.width)} px</span>
                      </div>
                      <input
                        type="range"
                        min={20}
                        max={1200}
                        value={shape.width}
                        onChange={(e) => updateElement(shape.id, { width: Number(e.target.value) })}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-300">Line Thickness / Stroke (px)</span>
                        <span className="font-mono font-bold text-sky-400">{shape.strokeWidth ?? 4} px</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={40}
                        step={1}
                        value={shape.strokeWidth ?? 4}
                        onChange={(e) => updateElement(shape.id, { strokeWidth: Number(e.target.value) })}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-300">Line Color</span>
                        <span className="font-mono font-bold uppercase text-sky-400">{strokeColor}</span>
                      </div>
                      <input
                        type="color"
                        value={strokeColor}
                        onChange={(e) => updateElement(shape.id, { strokeColor: e.target.value, color: e.target.value })}
                        className="w-full h-8 cursor-pointer rounded border bg-transparent"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-300">Line Opacity</span>
                        <span className="font-mono font-bold text-sky-400">{Math.round(strokeOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={strokeOpacity}
                        onChange={(e) => updateElement(shape.id, { strokeOpacity: Number(e.target.value) })}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>
                  </div>
                ) : (
                  /* Controls for 2D Polygons, Rectangles & Circles */
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Width</span>
                          <span className="font-mono font-bold">{Math.round(shape.width)}</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={900}
                          value={shape.width}
                          onChange={(e) => updateElement(shape.id, { width: Number(e.target.value) })}
                          className="w-full accent-sky-500 cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Height</span>
                          <span className="font-mono font-bold">{Math.round(shape.height)}</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={900}
                          value={shape.height}
                          onChange={(e) => updateElement(shape.id, { height: Number(e.target.value) })}
                          className="w-full accent-sky-500 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="opacity-60">Fill</span>
                        <button
                          onClick={() => updateElement(shape.id, { filled: !filled })}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            filled
                              ? 'bg-sky-600 text-white border-sky-500'
                              : isLight
                              ? 'bg-slate-100 text-slate-500 border-slate-300'
                              : 'bg-slate-950 text-slate-400 border-slate-700'
                          }`}
                        >
                          {filled ? 'Filled' : 'Outline only'}
                        </button>
                      </div>
                      <input
                        type="color"
                        value={fill}
                        onChange={(e) => updateElement(shape.id, { color: e.target.value })}
                        className="w-full h-8 cursor-pointer rounded border bg-transparent"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="opacity-60">Fill Opacity</span>
                        <span className="font-mono font-bold">{Math.round(fillOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={fillOpacity}
                        onChange={(e) => updateElement(shape.id, { opacity: Number(e.target.value) })}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="opacity-60">Outline Color</span>
                        <span className="font-mono font-bold uppercase">{strokeColor}</span>
                      </div>
                      <input
                        type="color"
                        value={strokeColor}
                        onChange={(e) => updateElement(shape.id, { strokeColor: e.target.value })}
                        className="w-full h-8 cursor-pointer rounded border bg-transparent"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Outline</span>
                          <span className="font-mono font-bold">{strokeWidth}px</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={0.5}
                          value={strokeWidth}
                          onChange={(e) => updateElement(shape.id, { strokeWidth: Number(e.target.value) })}
                          className="w-full accent-sky-500 cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Outline Opacity</span>
                          <span className="font-mono font-bold">{Math.round(strokeOpacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={strokeOpacity}
                          onChange={(e) => updateElement(shape.id, { strokeOpacity: Number(e.target.value) })}
                          className="w-full accent-sky-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <span id={`${fieldId}-outline-style-group`} className="opacity-60 block mb-1">Outline Style</span>
                  <div role="group" aria-labelledby={`${fieldId}-outline-style-group`} className="grid grid-cols-3 gap-1">
                    {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => updateElement(shape.id, { dashStyle: style })}
                        className={optionBtn(dashStyle === style)}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {shape.shapeType === 'rectangle' && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="opacity-60">Corner Radius</span>
                      <span className="font-mono font-bold">{shape.cornerRadius ?? 0}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={shape.cornerRadius ?? 0}
                      onChange={(e) => updateElement(shape.id, { cornerRadius: Number(e.target.value) })}
                      className="w-full accent-sky-500 cursor-pointer"
                    />
                  </div>
                )}
              </RubricSection>
            </div>
          );
        })()}

        {/* 12. ARROW SPECIFIC INSPECTOR */}
        {el.type === 'arrow' && (() => {
          const arr = el as ArrowElement;
          const arrowColor = arr.color || '#f97316';
          const strokeWidth = arr.strokeWidth || 2.5;
          const headStyle = arr.headStyle || 'single';
          const dashStyle = arr.dashStyle || 'solid';
          const optionBtn = (active: boolean) =>
            `py-1.5 text-[10px] font-semibold rounded border capitalize ${
              active
                ? 'bg-sky-600 text-white border-sky-500'
                : isLight
                ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
            }`;

          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Arrow Direction & Style"
                icon={<MoveRight className="w-3.5 h-3.5 text-orange-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label htmlFor={`${fieldId}-label-optional-2`} className="opacity-60 block mb-1">Label (optional)</label>
                  <input id={`${fieldId}-label-optional-2`}
                    type="text"
                    value={arr.label || ''}
                    onChange={(e) => updateElement(arr.id, { label: e.target.value })}
                    placeholder="e.g. Camera move, Actor blocking…"
                    className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="opacity-60">Arrow Color</span>
                    <span className="font-mono font-bold uppercase">{arrowColor}</span>
                  </div>
                  <input
                    type="color"
                    value={arrowColor}
                    onChange={(e) => updateElement(arr.id, { color: e.target.value })}
                    className="w-full h-8 cursor-pointer rounded border bg-transparent"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-60">Line Weight</span>
                    <span className="font-mono font-bold">{strokeWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    step={0.5}
                    value={strokeWidth}
                    onChange={(e) => updateElement(arr.id, { strokeWidth: Number(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                <div>
                  <span id={`${fieldId}-arrowhead-group`} className="opacity-60 block mb-1">Arrowhead</span>
                  <div role="group" aria-labelledby={`${fieldId}-arrowhead-group`} className="grid grid-cols-3 gap-1">
                    {(['single', 'double', 'open'] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => updateElement(arr.id, { headStyle: style })}
                        className={optionBtn(headStyle === style)}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span id={`${fieldId}-line-style-group`} className="opacity-60 block mb-1">Line Style</span>
                  <div role="group" aria-labelledby={`${fieldId}-line-style-group`} className="grid grid-cols-3 gap-1">
                    {(['solid', 'dashed', 'dotted'] as const).map((dash) => (
                      <button
                        key={dash}
                        onClick={() => updateElement(arr.id, { dashStyle: dash })}
                        className={optionBtn(dashStyle === dash)}
                      >
                        {dash}
                      </button>
                    ))}
                  </div>
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 13. CABLE / PATCH RUN SPECIFIC INSPECTOR */}
        {el.type === 'cable' && (() => {
          const cable = el as CableElement;
          const cableInfo = CABLE_TYPES.find((c) => c.type === cable.cableType) || CABLE_TYPES[0];
          const ppu = activeSetup.gridSettings?.pixelsPerUnit || 50;
          const unit = activeSetup.gridSettings?.unit || 'm';
          const lengthVal = Math.round((Math.hypot((cable.x2 ?? cable.x + 150) - cable.x, (cable.y2 ?? cable.y) - cable.y) / ppu) * 10) / 10;
          const strokeWidth = cable.strokeWidth || 3.5;
          const inputClass = `w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`;
          const linkableElements = activeSetup.elements.filter((e) => e.id !== cable.id);
          const fromLinked = cable.fromElementId ? activeSetup.elements.find((e) => e.id === cable.fromElementId) : undefined;
          const toLinked = cable.toElementId ? activeSetup.elements.find((e) => e.id === cable.toElementId) : undefined;
          const impliedSignal = impliedSignalTypeForCableType(cable.cableType);
          const endpointIssues =
            fromLinked && toLinked
              ? validateConnectionCompatibility(
                  impliedEndpointInfo(cable.cableType),
                  impliedEndpointInfo(cable.cableType),
                )
              : [];
          const linkEndpoint = (side: 'from' | 'to', elementId: string) => {
            const target = elementId ? activeSetup.elements.find((e) => e.id === elementId) : undefined;
            if (side === 'from') {
              updateElement(cable.id, {
                fromElementId: target ? target.id : undefined,
                ...(target ? { fromLabel: target.name } : {}),
              });
            } else {
              updateElement(cable.id, {
                toElementId: target ? target.id : undefined,
                ...(target ? { toLabel: target.name } : {}),
              });
            }
          };
          const endpointChipClass = (linked: boolean) =>
            `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
              linked
                ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
                : isLight
                ? 'bg-slate-50 border-slate-300 text-slate-400'
                : 'bg-slate-900/60 border-slate-700 text-slate-500'
            }`;

          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Cable / Patch Run"
                icon={<Cable className="w-3.5 h-3.5 text-cyan-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label htmlFor={`${fieldId}-cable-type`} className="opacity-60 block mb-1">Cable Type</label>
                  <select id={`${fieldId}-cable-type`}
                    value={cable.cableType}
                    onChange={(e) => {
                      const next = CABLE_TYPES.find((c) => c.type === e.target.value) || CABLE_TYPES[0];
                      updateElement(cable.id, { cableType: next.type, color: cable.color || next.color } as any);
                    }}
                    className={inputClass}
                  >
                    {CABLE_TYPES.map((ct) => (
                      <option key={ct.type} value={ct.type}>
                        {ct.name}
                      </option>
                    ))}
                  </select>
                </div>

                {cableInfo.isPower && (
                  <div className="flex items-center gap-2 text-[11px] rounded-lg px-2.5 py-2 border bg-rose-950/40 border-rose-800/50 text-rose-300">
                    <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      Power run · {cableInfo.connector}
                      {cableInfo.rating ? ` · ${cableInfo.rating}` : ''}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${fieldId}-from-source`} className="opacity-60 block mb-1">From (source)</label>
                    <input id={`${fieldId}-from-source`}
                      type="text"
                      value={cable.fromLabel || ''}
                      onChange={(e) => updateElement(cable.id, { fromLabel: e.target.value })}
                      placeholder="e.g. CAM A, CCU 1, FOH…"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${fieldId}-to-destination`} className="opacity-60 block mb-1">To (destination)</label>
                    <input id={`${fieldId}-to-destination`}
                      type="text"
                      value={cable.toLabel || ''}
                      onChange={(e) => updateElement(cable.id, { toLabel: e.target.value })}
                      placeholder="e.g. CCU 1, MON 3…"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <span id={`${fieldId}-endpoint-link-group`} className="opacity-60 block text-[11px] font-semibold uppercase tracking-wide">
                    Endpoint link
                  </span>
                  <div role="group" aria-labelledby={`${fieldId}-endpoint-link-group`} className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <select
                        value={cable.fromElementId || ''}
                        onChange={(e) => linkEndpoint('from', e.target.value)}
                        className={inputClass}
                      >
                        <option value="">— none (label only) —</option>
                        {linkableElements.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} [{e.type}]
                          </option>
                        ))}
                      </select>
                      <span className={endpointChipClass(!!fromLinked)}>
                        {fromLinked ? `linked to ${fromLinked.name}` : 'unlinked'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <select
                        value={cable.toElementId || ''}
                        onChange={(e) => linkEndpoint('to', e.target.value)}
                        className={inputClass}
                      >
                        <option value="">— none (label only) —</option>
                        {linkableElements.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} [{e.type}]
                          </option>
                        ))}
                      </select>
                      <span className={endpointChipClass(!!toLinked)}>
                        {toLinked ? `linked to ${toLinked.name}` : 'unlinked'}
                      </span>
                    </div>
                  </div>

                  {fromLinked && toLinked && (
                    <div className="rounded-lg px-2.5 py-2 border bg-slate-900/40 border-slate-800 space-y-1.5">
                      <div className="text-[11px] text-slate-300">
                        <span className="font-mono">{cableInfo.shortLabel}</span>
                        {' → carries '}
                        <span className="font-mono font-bold text-slate-100">
                          {impliedSignal ?? 'unknown signal'}
                        </span>
                      </div>
                      {endpointIssues.map((iss, i) => (
                        <div
                          key={`${iss.code}-${i}`}
                          className="flex items-start gap-1.5 text-[11px] rounded px-2 py-1 border bg-amber-950/40 border-amber-700/50 text-amber-300"
                        >
                          <Zap className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          <span>{iss.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg px-2.5 py-2 border bg-slate-900/40 border-slate-800">
                  <span className="text-[11px] text-slate-400">
                    Run length ≈{' '}
                    <span className="font-mono font-bold text-slate-100">
                      {lengthVal}
                      {unit}
                    </span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {cableInfo.shortLabel} · {cableInfo.connector}
                  </span>
                </div>

                {/* Per-cable label visibility (on top of the global label toggle) */}
                <div
                  className={`flex items-center justify-between rounded-lg px-2.5 py-2 border ${
                    isLight ? 'bg-white border-slate-300' : 'bg-slate-900/40 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] opacity-70">Show label on plan</span>
                  <button
                    type="button"
                    aria-label="Show label on plan"
                    role="switch"
                    aria-checked={cable.showLabel !== false}
                    onClick={() => updateElement(cable.id, { showLabel: cable.showLabel === false })}
                    className={`w-9 h-5 rounded-full transition-colors relative ${
                      cable.showLabel !== false ? 'bg-teal-500' : isLight ? 'bg-slate-300' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                        cable.showLabel !== false ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="opacity-60">Cable Color</span>
                    <span className="font-mono font-bold uppercase">{cable.color || cableInfo.color}</span>
                  </div>
                  <input
                    type="color"
                    value={cable.color || cableInfo.color}
                    onChange={(e) => updateElement(cable.id, { color: e.target.value })}
                    className="w-full h-8 cursor-pointer rounded border bg-transparent"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-60">Line Weight</span>
                    <span className="font-mono font-bold">{strokeWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    step={0.5}
                    value={strokeWidth}
                    onChange={(e) => updateElement(cable.id, { strokeWidth: Number(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs opacity-60">Show on floor plan</span>
                  <button
                    onClick={() => updateElement(cable.id, { showLabel: cable.showLabel !== false ? false : true })}
                    className={`px-3 py-1 text-[10px] font-bold rounded border ${
                      cable.showLabel !== false
                        ? 'bg-sky-600 text-white border-sky-500'
                        : isLight
                        ? 'bg-slate-50 text-slate-500 border-slate-300'
                        : 'bg-slate-950 text-slate-500 border-slate-700'
                    }`}
                  >
                    {cable.showLabel !== false ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div>
                  <label htmlFor={`${fieldId}-notes`} className="opacity-60 block mb-1">Notes</label>
                  <textarea id={`${fieldId}-notes`}
                    value={cable.notes || ''}
                    onChange={(e) => updateElement(cable.id, { notes: e.target.value })}
                    placeholder="e.g. Route under stage, spare 10m, tie to truss…"
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                </div>
              </RubricSection>
            </div>
          );
        })()}
    </div>
  );
};

