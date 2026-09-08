/**
 * The camera element inspector.
 *
 * Lifted out of `InspectorPanel`, which held twelve of these in one switch and
 * had reached 4,600 lines because every new field was one more branch in a file
 * nobody could read end to end (AGENTS.md: one file per variant).
 *
 * Follows `LightInspector`: it reads what it needs from context directly rather
 * than taking a long prop list, since a twenty-prop list is only a copy of the
 * context with extra steps.
 */

import React, { useId } from 'react';
import { inspectorSelectClass } from '../shared/InspectorPrimitives';
import { APERTURES, FRAME_RATES, ISO_VALUES, ND_FILTERS, SHUTTER_ANGLES } from '../../../constants/presets';
import { ASPECT_RATIOS, CAMERA_BODY_PRESETS, CAMERA_COLOR_PALETTE, CAMERA_HEIGHTS, CAMERA_RIGS, FOCAL_LENGTH_PRESETS, SENSOR_FORMATS } from '../../../constants/presets';
import { CameraElement } from '../../../types';
import { Compass, Eye, Image as ImageIcon, Gauge } from 'lucide-react';
import { MovieCameraIcon } from '../../icons/ProductionIcons';
import { RubricSection, StoryboardField, WaypointListEditor } from '../shared/InspectorPrimitives';
import { calculateFovAngle } from '../../../utils/geometry';
import { createId } from '../../../domain/ids';
import { parseOptionFrom } from '../../../domain/optionValue';
import { setFramePatch, slotsOf } from '../../../utils/storyboardFrames';
import { useFloorPlan } from '../../../context/FloorPlanContext';

interface CameraInspectorProps {
  cam: CameraElement;
  isLight: boolean;
}

export const CameraInspector: React.FC<CameraInspectorProps> = ({ cam, isLight }) => {
  const fieldId = useId();
  const selectClass = inspectorSelectClass(isLight);
  const { activeSetup, updateElement, openViewfinder, updateShot, updateSetupMeta } = useFloorPlan();
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
            persistKey="camerainspector.camera-identity-rig"
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
                      title={`Camera color ${c}`}
                      aria-label={`Camera color ${c}`}
                      aria-pressed={cam.color === c}
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
                  onChange={(e) =>
                    updateElement(cam.id, {
                      rigType: parseOptionFrom(CAMERA_RIGS, e.target.value, cam.rigType),
                    })
                  }
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
                  onChange={(e) =>
                    updateElement(cam.id, {
                      cameraHeight: parseOptionFrom(
                        CAMERA_HEIGHTS,
                        e.target.value,
                        cam.cameraHeight,
                      ),
                    })
                  }
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
            persistKey="camerainspector.lens-optics"
            title="Lens & Optics"
            icon={<Eye className="w-3.5 h-3.5 text-indigo-500" />}
            badge={
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-bold">
                {cam.focalLength}mm
              </span>
            }
            defaultOpen={false}
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
                    onClick={() => updateElement(cam.id, { focalLength: mm, fovAngle: calculateFovAngle(mm, cam.sensorFormat) })}
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
                onChange={(e) => {
                  const focalLength = Number(e.target.value);
                  updateElement(cam.id, { focalLength, fovAngle: calculateFovAngle(focalLength, cam.sensorFormat) });
                }}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>

            {/* Sensor Format */}
            <div>
              <label htmlFor={`${fieldId}-sensor-format`} className="opacity-60 block mb-1">Sensor Format</label>
              <select id={`${fieldId}-sensor-format`}
                value={cam.sensorFormat}
                onChange={(e) => {
                  const sensorFormat = parseOptionFrom(SENSOR_FORMATS, e.target.value, cam.sensorFormat);
                  updateElement(cam.id, { sensorFormat, fovAngle: calculateFovAngle(cam.focalLength || 35, sensorFormat) });
                }}
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
                onChange={(e) =>
                  updateElement(cam.id, {
                    aspectRatio: parseOptionFrom(ASPECT_RATIOS, e.target.value, cam.aspectRatio),
                  })
                }
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
            persistKey="camerainspector.cinematography-exposure"
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
            persistKey="camerainspector.waypoints-storyboard"
                title="Waypoints & Storyboard"
                icon={<Compass className="w-3.5 h-3.5 text-emerald-500" />}
                defaultOpen={false}
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
};
