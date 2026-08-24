import React, { useId } from 'react';
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
  StrokeElement,
  TextElement,
  TrackElement,
  WallElement,
  Waypoint,
  WindowElement,
} from '../../types';
import { ASPECT_RATIOS } from '../../constants/presets';
import { parseOption, parseOptionFrom } from '../../domain/optionValue';

/** The four values the Lighting / Time of Day options declare. */
const TIME_OF_DAY_VALUES = ['Day INT', 'Night INT', 'Day EXT', 'Night EXT'] as const;
import { cloneSetupWithNewIds } from '../../domain/clone';
import { createId } from '../../domain/ids';
import { bakeGroupRotation, groupPivotOf } from '../../domain/plan';
import { LayersPanel } from '../canvas/LayersPanel';
import type { DisplaySettings } from '../../context/FloorPlanContext';

import { loadLogoFile } from '../../utils/image';
import { FresnelLightIcon, MovieCameraIcon } from '../icons/ProductionIcons';
import {
  Compass,
  Copy,
  Crosshair,
  Eye,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Lock,
  MapPin,
  Move3d,
  Palette,
  RotateCcw,
  RotateCw,
  Ruler,
  Sliders,
  Sun,
  Trash2,
  Tv,
  Unlock,
  User,
  Users,
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
  Layers,
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
    const w = el.width || 80;
    const h = el.height || 50;
    return { minX: el.x - w / 2, minY: el.y - h / 2, maxX: el.x + w / 2, maxY: el.y + h / 2 };
  }
  if (el.type === 'wall') {
    const x2 = el.x2 ?? el.x;
    const y2 = el.y2 ?? el.y;
    return { minX: Math.min(el.x, x2), minY: Math.min(el.y, y2), maxX: Math.max(el.x, x2), maxY: Math.max(el.y, y2) };
  }
  if (el.type === 'door' || el.type === 'window') {
    const w = el.width || 60;
    const h = 18;
    return { minX: el.x - w / 2, minY: el.y - h / 2, maxX: el.x + w / 2, maxY: el.y + h / 2 };
  }
  if (el.type === 'light') return { minX: el.x - 14, minY: el.y - 14, maxX: el.x + 14, maxY: el.y + 14 };
  if (el.type === 'actor') return { minX: el.x - 22, minY: el.y - 22, maxX: el.x + 22, maxY: el.y + 22 };
  if (el.type === 'camera') return { minX: el.x - 22, minY: el.y - 22, maxX: el.x + 22, maxY: el.y + 22 };
  return { minX: el.x - 15, minY: el.y - 15, maxX: el.x + 15, maxY: el.y + 15 };
}

/** Compact on/off pill used in the Display & Labels panel */
import { CameraInspector } from './elements/CameraInspector';
import { ActorInspector } from './elements/ActorInspector';
import { PropInspector } from './elements/PropInspector';
import { WallInspector } from './elements/WallInspector';
import { TrackInspector } from './elements/TrackInspector';
import { RoadInspector } from './elements/RoadInspector';
import { DoorInspector } from './elements/DoorInspector';
import { WindowInspector } from './elements/WindowInspector';
import { TextInspector } from './elements/TextInspector';
import { ShapeInspector } from './elements/ShapeInspector';
import { ArrowInspector } from './elements/ArrowInspector';
import { CableInspector } from './elements/CableInspector';
import { LightInspector } from './elements/LightInspector';
import { compassPoint, formatSunTime, sceneSunPlan } from '../../domain/sun';
import { ProjectImage } from '../common/ProjectImage';
import {
  ColorField,
  PillToggle,
  RubricSection,
} from './shared/InspectorPrimitives';

export const InspectorPanel: React.FC = () => {
  // Prefix for pairing each caption with its control (`htmlFor`/`id`). From
  // `useId` so two instances of this panel on screen cannot collide — the
  // captions used to be plain siblings with no `htmlFor`, which meant screen
  // readers announced every one of these inputs unlabelled.
  const fieldId = useId();
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const {
    activeSetup,
    project,
    updateProjectMeta,
    selectedElementIds,
    updateElement,
    deleteSelectedElements,
    duplicateSelected,
    updateSetupMeta,
    setActiveSetupId,
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

  /**
   * The scrubber's time is a time AT THE LOCATION. `sceneSunPlan` resolves it
   * through the location's zone and returns the position and the day's events
   * together, so this panel and the plan overlay cannot disagree about where
   * the sun is.
   */
  const sunPlan = React.useMemo(
    () =>
      sceneSunPlan({
        lat: sunLocation?.lat,
        lng: sunLocation?.lng,
        timeZone: sunLocation?.timeZone,
        date: activeSetup.sunSettings?.date || project.date,
        timeMinutes: activeSetup.sunSettings?.timeMinutes,
      }),
    [sunLocation, activeSetup.sunSettings?.date, activeSetup.sunSettings?.timeMinutes, project.date],
  );

  const sunDayTimes = sunPlan?.times ?? null;
  /** Every printed clock below is in the location's zone, not the machine's. */
  const sunZoneId = sunPlan?.timeZone.id;

  const sunReadout = React.useMemo(() => {
    if (!sunPlan) return null;
    const { position } = sunPlan;
    return position.elevationDeg > 0
      ? `${compassPoint(position.azimuthDeg)} ${Math.round(position.elevationDeg)}°`
      : 'below horizon';
  }, [sunPlan]);

  const patchSunSettings = (updates: Partial<NonNullable<SceneSetup['sunSettings']>>) =>
    updateSetupMeta({ sunSettings: { ...(activeSetup.sunSettings ?? {}), ...updates } });

  /** "07:30" from minutes past midnight. */
  const formatMinutesOfDay = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  const isLight = theme === 'light';

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
            aria-label="Close image settings (back to scene setup)"
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
            aria-pressed={selectedBg.visible}
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
            aria-pressed={selectedBg.locked}
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
                onChange={(e) =>
                  updateSetupMeta({
                    timeOfDay: parseOption(TIME_OF_DAY_VALUES, e.target.value, activeSetup.timeOfDay),
                  })
                }
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
                onChange={(e) =>
                  updateSetupMeta({
                    aspectRatio: parseOptionFrom(
                      ASPECT_RATIOS,
                      e.target.value,
                      activeSetup.aspectRatio || '16:9',
                    ),
                  })
                }
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
                  aria-pressed={(activeSetup.gridSettings?.unit || 'm') === 'm'}
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
                  aria-pressed={activeSetup.gridSettings?.unit === 'ft'}
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
                          Sunrise <strong>{formatSunTime(sunDayTimes.sunrise, sunZoneId)}</strong> · Solar noon{' '}
                          <strong>{formatSunTime(sunDayTimes.solarNoon, sunZoneId)}</strong> · Sunset{' '}
                          <strong>{formatSunTime(sunDayTimes.sunset, sunZoneId)}</strong>
                        </p>
                        <p className="opacity-80">
                          Golden hour {formatSunTime(sunDayTimes.sunrise, sunZoneId)}–
                          {formatSunTime(sunDayTimes.goldenHourMorningEnd, sunZoneId)} and{' '}
                          {formatSunTime(sunDayTimes.goldenHourEveningStart, sunZoneId)}–
                          {formatSunTime(sunDayTimes.sunset, sunZoneId)}
                        </p>
                        <p className="opacity-80">
                          Civil twilight from {formatSunTime(sunDayTimes.civilDawn, sunZoneId)} to{' '}
                          {formatSunTime(sunDayTimes.civilDusk, sunZoneId)}
                        </p>
                      </>
                    )}
                    <p className="opacity-70 pt-1">
                      Calculated for {sunLocation.name}, times in {sunZoneId}
                      {sunPlan?.timeZone.origin !== 'requested' && (
                        <>
                          {' '}
                          — this machine&rsquo;s zone, because the location has no time zone set
                        </>
                      )}
                      . Planning aid — check the site for what actually blocks the light.
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
                title="Show all labels"
                aria-label="Show all labels"
                aria-pressed={displaySettings.showLabels}
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
                        aria-label={bg.visible ? 'Hide on canvas' : 'Show on canvas'}
                        aria-pressed={bg.visible}
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
                        aria-pressed={bg.visible}
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
                        aria-pressed={bg.locked}
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
            aria-pressed={selectedElementIds.every((id) => activeSetup.elements.find((e) => e.id === id)?.locked)}
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
                    aria-label={title}
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
            aria-pressed={el.locked}
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
            aria-label="Duplicate (Ctrl+D)"
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
            aria-label={el.locked ? 'Locked elements cannot be deleted' : 'Delete element (Del)'}
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
                  aria-pressed={currentRotation === 0}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 0 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  0° (Right)
                </button>
                <button
                  onClick={() => updateElement(el.id, { rotation: 90 })}
                  aria-pressed={currentRotation === 90}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 90 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  90° (Down)
                </button>
                <button
                  onClick={() => updateElement(el.id, { rotation: 180 })}
                  aria-pressed={currentRotation === 180}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 180 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  180° (Left)
                </button>
                <button
                  onClick={() => updateElement(el.id, { rotation: 270 })}
                  aria-pressed={currentRotation === 270}
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
        {el.type === 'camera' && (
          <CameraInspector cam={el as CameraElement} isLight={isLight} />
        )}

        {/* 4. ACTOR SPECIFIC INSPECTOR */}
        {el.type === 'actor' && (
          <ActorInspector actor={el as ActorElement} isLight={isLight} />
        )}

        {/* 5. LIGHT SPECIFIC INSPECTOR */}
        {el.type === 'light' && (
          <LightInspector light={el as LightElement} isLight={isLight} />
        )}

        {/* 6. PROP SPECIFIC INSPECTOR */}
        {el.type === 'prop' && (
          <PropInspector prop={el as PropElement} isLight={isLight} />
        )}

        {/* 7. WALL SPECIFIC INSPECTOR */}
        {el.type === 'wall' && (
          <WallInspector wall={el as WallElement} isLight={isLight} />
        )}

        {/* 7.5 TRACK SPECIFIC INSPECTOR */}
        {el.type === 'track' && (
          <TrackInspector track={el as TrackElement} isLight={isLight} />
        )}

        {/* 7b. STREET / ROAD INSPECTOR */}
        {el.type === 'road' && (
          <RoadInspector road={el as RoadElement} isLight={isLight} />
        )}

        {/* 8. DOOR SPECIFIC INSPECTOR */}
        {el.type === 'door' && (
          <DoorInspector door={el as DoorElement} isLight={isLight} />
        )}

        {/* 9. WINDOW SPECIFIC INSPECTOR */}
        {el.type === 'window' && (
          <WindowInspector win={el as WindowElement} isLight={isLight} />
        )}

        {/* 10. TEXT SPECIFIC INSPECTOR */}
        {el.type === 'text' && (
          <TextInspector txt={el as TextElement} isLight={isLight} />
        )}

        {/* 11. SHAPE SPECIFIC INSPECTOR */}
        {el.type === 'shape' && (
          <ShapeInspector shape={el as ShapeElement} isLight={isLight} />
        )}

        {/* 12. ARROW SPECIFIC INSPECTOR */}
        {el.type === 'arrow' && (
          <ArrowInspector arr={el as ArrowElement} isLight={isLight} />
        )}

        {/* 13. CABLE / PATCH RUN SPECIFIC INSPECTOR */}
        {el.type === 'cable' && (
          <CableInspector cable={el as CableElement} isLight={isLight} />
        )}
    </div>
  );
};

