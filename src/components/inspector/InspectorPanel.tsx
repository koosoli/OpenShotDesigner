import React from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  ActorElement,
  CameraElement,
  DoorElement,
  FloorPlanElement,
  LightElement,
  PropElement,
  WallElement,
  Waypoint,
  WindowElement,
} from '../../types';
import {
  ACTOR_COLOR_PALETTE,
  ASPECT_RATIOS,
  CAMERA_COLOR_PALETTE,
  CAMERA_HEIGHTS,
  CAMERA_RIGS,
  FOCAL_LENGTH_PRESETS,
  LIGHT_FIXTURES,
  PROP_CATALOG,
  SENSOR_FORMATS,
} from '../../constants/presets';
import {
  Camera,
  Compass,
  Copy,
  DoorClosed,
  Eye,
  Flame,
  FlipHorizontal,
  Image as ImageIcon,
  Lightbulb,
  Lock,
  Maximize,
  Move3d,
  Palette,
  RotateCcw,
  RotateCw,
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
} from 'lucide-react';

type AlignMode = 'left' | 'right' | 'hcenter' | 'top' | 'bottom' | 'vcenter';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Approximate 2D bounding box of an element on the floor plan, used for align/distribute. */
function getElementBounds(el: FloorPlanElement): Bounds {
  if (el.type === 'prop') {
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
const PillToggle: React.FC<{
  on: boolean;
  onClick: () => void;
  label: string;
  isLight: boolean;
}> = ({ on, onClick, label, isLight }) => (
  <button
    onClick={onClick}
    className={`py-1.5 text-[10px] font-semibold rounded-lg border flex items-center justify-center gap-1 transition-colors ${
      on
        ? isLight ? 'bg-teal-50 text-teal-700 border-teal-300' : 'bg-teal-950/40 text-teal-300 border-teal-800'
        : isLight ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-slate-900 text-slate-500 border-slate-800'
    }`}
  >
    {label}
  </button>
);

/** Color swatch input + Auto (reset to element color) row */
const ColorField: React.FC<{
  label: string;
  value: string | null;
  onChange: (color: string | null) => void;
  isLight: boolean;
}> = ({ label, value, onChange, isLight }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[11px] opacity-70">{label}</span>
    <div className="flex items-center gap-1.5">
      <label
        className={`relative w-7 h-7 rounded-lg border cursor-pointer overflow-hidden ${
          isLight ? 'border-slate-300' : 'border-slate-700'
        }`}
        title="Pick a color for these labels"
      >
        <input
          type="color"
          value={value || '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
        <span
          className="absolute inset-0.5 rounded-md border border-black/10"
          style={{ background: value || 'conic-gradient(#94a3b8, #e2e8f0, #94a3b8)' }}
        />
      </label>
      <button
        onClick={() => onChange(null)}
        title="Reset to each element's own color"
        className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
          isLight
            ? 'border-slate-300 text-slate-500 hover:bg-slate-200'
            : 'border-slate-700 text-slate-400 hover:bg-slate-800'
        } ${value ? '' : 'opacity-40 pointer-events-none'}`}
      >
        <RotateCcw className="w-2.5 h-2.5" />
        Auto
      </button>
    </div>
  </div>
);

/**
 * Shared movement waypoint list editor (actors & cameras).
 * Waypoints can also be dragged and rotated directly on the floor plan canvas when the element is selected.
 */
const WaypointListEditor: React.FC<{
  elementId: string;
  path: Waypoint[];
  baseRotation: number;
  accentClass: string;
  isLight: boolean;
}> = ({ elementId, path, baseRotation, accentClass, isLight }) => {
  const { updateElement } = useFloorPlan();

  const updateWaypoint = (wpId: string, updates: Partial<Waypoint>) => {
    const newPath = path.map((wp) => (wp.id === wpId ? { ...wp, ...updates } : wp));
    updateElement(elementId, { path: newPath } as any);
  };

  const removeWaypoint = (wpId: string) => {
    updateElement(elementId, { path: path.filter((wp) => wp.id !== wpId) } as any);
  };

  if (path.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {path.map((wp) => {
        const wpRot = Math.round(((wp.rotation ?? baseRotation) % 360 + 360) % 360);
        return (
          <div
            key={wp.id}
            className={`flex items-center gap-1.5 p-1.5 rounded-lg border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <span className={`text-[10px] font-mono font-bold px-1 ${accentClass}`}>B{wp.beat}</span>
            <input
              type="number"
              min={2}
              value={wp.beat}
              title="Beat number"
              onChange={(e) => updateWaypoint(wp.id, { beat: Math.max(2, Number(e.target.value) || 2) })}
              className={`w-10 border rounded px-1 py-0.5 text-[11px] font-mono ${
                isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
              }`}
            />
            <input
              type="number"
              min={0}
              max={359}
              value={wpRot}
              title="Facing rotation (degrees) at this waypoint"
              onChange={(e) => updateWaypoint(wp.id, { rotation: ((Number(e.target.value) % 360) + 360) % 360 })}
              className={`w-14 border rounded px-1 py-0.5 text-[11px] font-mono text-center ${
                isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
              }`}
            />
            <span className={`text-[9px] font-mono opacity-50 ${accentClass}`}>°</span>
            <input
              type="text"
              value={wp.dialogueCue || ''}
              placeholder="Dialogue / action cue..."
              title="Dialogue or action cue at this waypoint"
              onChange={(e) => updateWaypoint(wp.id, { dialogueCue: e.target.value })}
              className={`flex-1 min-w-0 border rounded px-1.5 py-0.5 text-[11px] ${
                isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
              }`}
            />
            <button
              onClick={() => removeWaypoint(wp.id)}
              title="Delete waypoint"
              className="p-1 rounded text-red-400 hover:bg-red-500/15 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        );
      })}
      <p className={`text-[10px] italic ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
        Tip: drag a numbered marker to reposition it, or drag its small circle handle to rotate its facing.
      </p>
    </div>
  );
};

export const InspectorPanel: React.FC = () => {
  const {
    activeSetup,
    selectedElementIds,
    updateElement,
    deleteSelectedElements,
    duplicateSelected,
    openViewfinder,
    selectShot,
    playback,
    updateSetupMeta,
    insertDoorInWall,
    insertWindowInWall,
    rotateElementBy,
    theme,
    backgroundImages,
    updateBackgroundImage,
    removeBackgroundImage,
    displaySettings,
    updateDisplaySettings,
    updateMultipleElements,
  } = useFloorPlan();

  const isLight = theme === 'light';

  if (selectedElementIds.length === 0) {
    // Show Scene / Setup Meta Inspector
    return (
      <div
        id="inspector-panel-empty"
        className={`flex flex-col h-full text-xs p-4 space-y-4 select-none overflow-y-auto ${
          isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200'
        }`}
      >
        <div className={`flex items-center gap-2 pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <Sliders className="w-4 h-4 text-sky-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            Scene Setup Inspector
          </h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Scene Setup Name</label>
            <input
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
              <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Scene Number</label>
              <input
                type="text"
                value={activeSetup.sceneNumber}
                onChange={(e) => updateSetupMeta({ sceneNumber: e.target.value })}
                className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>
            <div>
              <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Script Page</label>
              <input
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
            <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Scene Location / Slugline</label>
            <input
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
            <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Lighting / Time of Day</label>
            <select
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

          {/* Display & Labels - declutter the floor plan */}
          <div className={`pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
            <h4 className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-2 flex items-center gap-1.5">
              <Tags className="w-3.5 h-3.5 text-violet-500" />
              Display & Labels
            </h4>

            <div className="space-y-3">
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

              {/* Per-category visibility */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1.5">
                  Show labels for
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <PillToggle on={displaySettings.showActorLabels} onClick={() => updateDisplaySettings({ showActorLabels: !displaySettings.showActorLabels })} label="Actors" isLight={isLight} />
                  <PillToggle on={displaySettings.showCameraLabels} onClick={() => updateDisplaySettings({ showCameraLabels: !displaySettings.showCameraLabels })} label="Cameras" isLight={isLight} />
                  <PillToggle on={displaySettings.showPropLabels} onClick={() => updateDisplaySettings({ showPropLabels: !displaySettings.showPropLabels })} label="Props" isLight={isLight} />
                  <PillToggle on={displaySettings.showTrackLabels} onClick={() => updateDisplaySettings({ showTrackLabels: !displaySettings.showTrackLabels })} label="Tracks" isLight={isLight} />
                  <PillToggle on={displaySettings.showLightLabels} onClick={() => updateDisplaySettings({ showLightLabels: !displaySettings.showLightLabels })} label="Lights" isLight={isLight} />
                  <PillToggle on={displaySettings.showMeasurementLabels} onClick={() => updateDisplaySettings({ showMeasurementLabels: !displaySettings.showMeasurementLabels })} label="Measurements" isLight={isLight} />
                </div>
              </div>

              {/* Shot info shown on camera labels */}
              <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-2">
                  On camera labels, show
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <PillToggle on={displaySettings.showShotSizeOnCamera} onClick={() => updateDisplaySettings({ showShotSizeOnCamera: !displaySettings.showShotSizeOnCamera })} label="Shot size" isLight={isLight} />
                  <PillToggle on={displaySettings.showShotLensOnCamera} onClick={() => updateDisplaySettings({ showShotLensOnCamera: !displaySettings.showShotLensOnCamera })} label="Lens" isLight={isLight} />
                  <PillToggle on={displaySettings.showShotAngleOnCamera} onClick={() => updateDisplaySettings({ showShotAngleOnCamera: !displaySettings.showShotAngleOnCamera })} label="Angle" isLight={isLight} />
                </div>
              </div>

              {/* Per-category label colors */}
              <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-2">
                  Label colors
                </span>
                <div className="space-y-2">
                  <ColorField label="Actor labels" value={displaySettings.actorLabelColor} onChange={(c) => updateDisplaySettings({ actorLabelColor: c })} isLight={isLight} />
                  <ColorField label="Camera labels" value={displaySettings.cameraLabelColor} onChange={(c) => updateDisplaySettings({ cameraLabelColor: c })} isLight={isLight} />
                  <ColorField label="Prop labels" value={displaySettings.propLabelColor} onChange={(c) => updateDisplaySettings({ propLabelColor: c })} isLight={isLight} />
                  <ColorField label="Track labels" value={displaySettings.trackLabelColor} onChange={(c) => updateDisplaySettings({ trackLabelColor: c })} isLight={isLight} />
                  <ColorField label="Light labels" value={displaySettings.lightLabelColor} onChange={(c) => updateDisplaySettings({ lightLabelColor: c })} isLight={isLight} />
                </div>
              </div>

              {/* Declutter toggles */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1.5">
                  Declutter floor plan
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <PillToggle on={displaySettings.showWaypoints} onClick={() => updateDisplaySettings({ showWaypoints: !displaySettings.showWaypoints })} label="Waypoint markers & paths" isLight={isLight} />
                  <PillToggle on={displaySettings.showFovCones} onClick={() => updateDisplaySettings({ showFovCones: !displaySettings.showFovCones })} label="Camera FOV cones" isLight={isLight} />
                  <PillToggle on={displaySettings.showLightBeams} onClick={() => updateDisplaySettings({ showLightBeams: !displaySettings.showLightBeams })} label="Light beams" isLight={isLight} />
                  <PillToggle on={displaySettings.showGrid} onClick={() => updateDisplaySettings({ showGrid: !displaySettings.showGrid })} label="Grid & axes" isLight={isLight} />
                </div>
              </div>

              <p className={`text-[10px] italic ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                These are view preferences only — they are saved in your browser and never change the scene itself.
              </p>
            </div>
          </div>

          {/* Reference / Floorplan Images (multiple supported) */}
          {backgroundImages.length > 0 && (
            <div className={`pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <h4 className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-2 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-teal-500" />
                Reference Images ({backgroundImages.length})
              </h4>

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
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={bg.opacity ?? 0.5}
                        onChange={(e) => updateBackgroundImage(bg.id, { opacity: parseFloat(e.target.value) })}
                        className="w-full accent-teal-500 cursor-pointer"
                      />
                    </div>

                    {/* Visibility / Lock */}
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
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
            </div>
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
        </div>

        <p className="text-xs opacity-75">
          Multiple floor plan elements selected. You can move them together or rotate the selection.
        </p>

        {/* Multi rotate buttons */}
        <div className="space-y-1.5 pt-2">
          <label className="text-[10px] font-bold uppercase opacity-60 block">Rotate Selection</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => selectedElementIds.forEach((id) => rotateElementBy(id, -45))}
              className={`py-2 px-3 border rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rotate -45°</span>
            </button>
            <button
              onClick={() => selectedElementIds.forEach((id) => rotateElementBy(id, 45))}
              className={`py-2 px-3 border rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Rotate +45°</span>
            </button>
          </div>
        </div>

        {/* Align & Distribute tools */}
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-[10px] font-bold uppercase opacity-60 block mb-1.5">Align Selection</label>
            <div className="grid grid-cols-6 gap-1.5">
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
            <label className="text-[10px] font-bold uppercase opacity-60 block mb-1.5">Distribute Spacing (3+ items)</label>
            <div className="grid grid-cols-2 gap-1.5">
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
            className="w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-lg text-xs font-semibold transition-colors"
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
            <Camera className="w-4 h-4 text-sky-500" />
          ) : el.type === 'actor' ? (
            <User className="w-4 h-4 text-emerald-500" />
          ) : el.type === 'light' ? (
            <Lightbulb className="w-4 h-4 text-amber-500" />
          ) : (
            <Sliders className="w-4 h-4 text-purple-500" />
          )}
          <h3 className="text-xs font-bold uppercase tracking-wider">
            {el.type} Inspector
          </h3>
        </div>

        <div className="flex items-center gap-1">
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
            title="Delete element (Del)"
            className="p-1.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Common Properties (Name, Coordinates) */}
      <div className="space-y-3">
        <div>
          <label className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Element Name / Label</label>
          <input
            type="text"
            value={el.name}
            onChange={(e) => updateElement(el.id, { name: e.target.value })}
            className={`w-full border rounded-lg p-2 focus:border-sky-500 focus:outline-none ${
              isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
            }`}
          />
        </div>

        {/* Position Controls */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="opacity-60 block text-[10px]">POS X (px)</label>
            <input
              type="number"
              value={Math.round(el.x)}
              onChange={(e) => updateElement(el.id, { x: Number(e.target.value) })}
              className={`w-full border rounded px-2 py-1 font-mono text-xs ${
                isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
          <div>
            <label className="opacity-60 block text-[10px]">POS Y (px)</label>
            <input
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
        {el.type !== 'wall' && el.type !== 'track' && el.type !== 'measurement' && (
          <div className={`p-2.5 rounded-xl border space-y-2 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5">
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
            <div className="grid grid-cols-4 gap-1 pt-1">
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

        {/* 3. CAMERA SPECIFIC INSPECTOR */}
        {el.type === 'camera' && (() => {
          const cam = el as CameraElement;
          return (
            <div className={`space-y-3 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              {/* Quick Viewfinder Button */}
              <button
                onClick={() => openViewfinder(cam.id)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-semibold text-xs transition-colors shadow-md"
              >
                <Eye className="w-4 h-4" />
                <span>Simulate Camera Viewfinder</span>
              </button>

              {/* Camera Letter & Color */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="opacity-60 block mb-1">Camera ID</label>
                  <input
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
                  <label className="opacity-60 block mb-1">Color Marker</label>
                  <div className="flex gap-1.5 pt-1">
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

              {/* Lens Focal Length */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium opacity-75">Lens Focal Length</label>
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
                <label className="opacity-60 block mb-1">Sensor Format</label>
                <select
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

              {/* Camera Rig & Height */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="opacity-60 block mb-1">Camera Rig</label>
                  <select
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
                  <label className="opacity-60 block mb-1">Camera Height</label>
                  <select
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

              {/* Aspect Ratio */}
              <div>
                <label className="opacity-60 block mb-1">Aspect Ratio</label>
                <select
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

              {/* Cone Throw Distance */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">FOV Cone Distance</span>
                  <span className="font-mono text-sky-500 font-bold">{cam.coneDistance || 300} px</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={800}
                  value={cam.coneDistance || 300}
                  onChange={(e) => updateElement(cam.id, { coneDistance: Number(e.target.value) })}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>

              {/* Camera Movement Waypoints (Dolly / Crane moves across beats) */}
              {(() => {
                const nextBeat = Math.max(2, ...(cam.path || []).map((wp) => wp.beat + 1));
                return (
                  <button
                    onClick={() => {
                      const newWp = {
                        id: `wp-${Date.now()}`,
                        x: cam.x + 60,
                        y: cam.y + 60,
                        rotation: cam.rotation,
                        beat: nextBeat,
                        dialogueCue: '',
                      };
                      updateElement(cam.id, { path: [...(cam.path || []), newWp] });
                      // Make sure the timeline actually contains this beat
                      if (nextBeat > (activeSetup.totalBeats || 1)) {
                        updateSetupMeta({ totalBeats: nextBeat });
                      }
                    }}
                    className={`w-full py-1.5 border rounded-lg text-xs font-semibold ${
                      isLight ? 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100' : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700'
                    }`}
                  >
                    + Add Camera Movement Waypoint (Beat {nextBeat})
                  </button>
                );
              })()}

              {/* Editable waypoint list */}
              <WaypointListEditor
                elementId={cam.id}
                path={cam.path || []}
                baseRotation={cam.rotation}
                accentClass="text-sky-500"
                isLight={isLight}
              />
            </div>
          );
        })()}

        {/* 4. ACTOR SPECIFIC INSPECTOR */}
        {el.type === 'actor' && (() => {
          const actor = el as ActorElement;
          return (
            <div className={`space-y-3 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div>
                <label className="opacity-60 block mb-1">Character Name / ID</label>
                <input
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
                <label className="opacity-60 block mb-1">Avatar Color</label>
                <div className="flex gap-2">
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
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Standing
                </button>
                <button
                  onClick={() => updateElement(actor.id, { isStanding: false })}
                  className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                    !actor.isStanding
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Seated / Chair
                </button>
              </div>

              {/* Blocking Action & Dialogue notes */}
              <div>
                <label className="opacity-60 block mb-1">Actor Action / Dialogue Notes</label>
                <textarea
                  value={actor.actionNotes || ''}
                  onChange={(e) => updateElement(actor.id, { actionNotes: e.target.value })}
                  placeholder="e.g. Enters through front door on Beat 1, confronts Sarah on Beat 2..."
                  rows={2}
                  className={`w-full border rounded-lg p-2 focus:border-emerald-500 ${
                    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>

              {/* Add Waypoint Button for animation */}
              {(() => {
                const nextBeat = Math.max(2, ...(actor.path || []).map((wp) => wp.beat + 1));
                return (
                  <button
                    onClick={() => {
                      const newWp = {
                        id: `wp-${Date.now()}`,
                        x: actor.x + 50,
                        y: actor.y + 50,
                        rotation: actor.rotation,
                        beat: nextBeat,
                        dialogueCue: '',
                      };
                      updateElement(actor.id, { path: [...(actor.path || []), newWp] });
                      // Make sure the timeline actually contains this beat
                      if (nextBeat > (activeSetup.totalBeats || 1)) {
                        updateSetupMeta({ totalBeats: nextBeat });
                      }
                    }}
                    className={`w-full py-1.5 border rounded-lg text-xs font-semibold ${
                      isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                    }`}
                  >
                    + Add Movement Waypoint (Beat {nextBeat})
                  </button>
                );
              })()}

              {/* Editable waypoint list */}
              <WaypointListEditor
                elementId={actor.id}
                path={actor.path || []}
                baseRotation={actor.rotation}
                accentClass="text-emerald-500"
                isLight={isLight}
              />
            </div>
          );
        })()}

        {/* 5. LIGHT SPECIFIC INSPECTOR */}
        {el.type === 'light' && (() => {
          const light = el as LightElement;
          return (
            <div className={`space-y-3 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              {/* Fixture Type */}
              <div>
                <label className="opacity-60 block mb-1">Fixture Model / Type</label>
                <select
                  value={light.fixtureType}
                  onChange={(e) => {
                    const fix = LIGHT_FIXTURES.find((f) => f.type === e.target.value);
                    updateElement(light.id, {
                      fixtureType: e.target.value as any,
                      beamAngle: fix?.defaultBeam ?? light.beamAngle,
                      colorTemp: fix?.defaultTemp ?? light.colorTemp,
                      fixtureModel: fix?.defaultModel ?? light.fixtureModel,
                    });
                  }}
                  className={`w-full border rounded-lg p-2 ${
                    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                >
                  {LIGHT_FIXTURES.map((f) => (
                    <option key={f.type} value={f.type}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Color Temperature */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Color Temp (Kelvin)</span>
                  <span className="font-mono text-amber-500 font-bold">
                    {light.colorTemp > 0 ? `${light.colorTemp}K` : 'RGB Gel'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 mb-2">
                  {[2700, 3200, 4500, 5600].map((k) => (
                    <button
                      key={k}
                      onClick={() => updateElement(light.id, { colorTemp: k, rgbColor: undefined })}
                      className={`py-1 text-[10px] font-mono rounded border ${
                        light.colorTemp === k
                          ? 'bg-amber-600 text-white border-amber-500 font-bold'
                          : isLight ? 'bg-slate-50 text-slate-700 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      {k}K
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={2000}
                  max={7000}
                  step={100}
                  value={light.colorTemp || 5600}
                  onChange={(e) => updateElement(light.id, { colorTemp: Number(e.target.value), rgbColor: undefined })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Light Intensity */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Intensity (Dimmer)</span>
                  <span className="font-mono font-bold">{light.intensity}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={light.intensity}
                  onChange={(e) => updateElement(light.id, { intensity: Number(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Beam Throw & Beam Angle */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="opacity-60 block mb-1">Beam Angle ({light.beamAngle}°)</label>
                  <input
                    type="range"
                    min={10}
                    max={160}
                    value={light.beamAngle}
                    onChange={(e) => updateElement(light.id, { beamAngle: Number(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="opacity-60 block mb-1">Throw Distance</label>
                  <input
                    type="range"
                    min={60}
                    max={400}
                    value={light.throwDistance}
                    onChange={(e) => updateElement(light.id, { throwDistance: Number(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {/* 6. PROP SPECIFIC INSPECTOR */}
        {el.type === 'prop' && (() => {
          const prop = el as PropElement;
          return (
            <div className={`space-y-3 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div>
                <label className="opacity-60 block mb-1">Prop Type Preset</label>
                <select
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="opacity-60 block mb-1">Width (px)</label>
                  <input
                    type="number"
                    value={prop.width}
                    onChange={(e) => updateElement(prop.id, { width: Number(e.target.value) })}
                    className={`w-full border rounded p-1 font-mono ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>
                <div>
                  <label className="opacity-60 block mb-1">Height (px)</label>
                  <input
                    type="number"
                    value={prop.height}
                    onChange={(e) => updateElement(prop.id, { height: Number(e.target.value) })}
                    className={`w-full border rounded p-1 font-mono ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>
              </div>
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
            <div className={`space-y-3 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div className="flex items-center justify-between text-xs">
                <span className="opacity-60">Wall Length:</span>
                <span className="font-mono text-sky-500 font-bold">{(wallLen / 50).toFixed(2)}m ({wallLen}px)</span>
              </div>

              <div>
                <label className="opacity-60 block mb-1">Thickness (px)</label>
                <input
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
              <div className="pt-2 space-y-2 border-t border-slate-700/50">
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
            </div>
          );
        })()}

        {/* 8. DOOR SPECIFIC INSPECTOR */}
        {el.type === 'door' && (() => {
          const door = el as DoorElement;
          return (
            <div className={`space-y-3 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div>
                <label className="opacity-60 block mb-1">Door Width (px)</label>
                <input
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
                <label className="opacity-60 block mb-1">Door Swing Angle</label>
                <div className="grid grid-cols-3 gap-1.5">
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
            </div>
          );
        })()}

        {/* 9. WINDOW SPECIFIC INSPECTOR */}
        {el.type === 'window' && (() => {
          const win = el as WindowElement;
          return (
            <div className={`space-y-3 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div>
                <label className="opacity-60 block mb-1">Window Width (px)</label>
                <input
                  type="number"
                  min={30}
                  max={250}
                  value={win.width || 80}
                  onChange={(e) => updateElement(win.id, { width: Number(e.target.value) })}
                  className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                />
              </div>

              <div>
                <label className="opacity-60 block mb-1">Depth / Frame (px)</label>
                <input
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
            </div>
          );
        })()}
      </div>
    </div>
  );
};
