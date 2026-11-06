import { useFloorPlan } from '../../context/FloorPlanContext';
import type { CameraElement, Shot } from '../../types';
import type { OpticalSetting } from '../../domain/camera/opticalComparison';
import { APERTURES, ASPECT_RATIOS, FRAME_RATES, ISO_VALUES, ND_FILTERS, SENSOR_FORMATS, SHUTTER_ANGLES } from '../../constants/presets';
const CAMERA_HEIGHTS: NonNullable<CameraElement['cameraHeight']>[] = [
  'Ground',
  'Knee',
  'Waist',
  'Eye Level',
  'High',
  'Low Angle',
  'High Angle',
  'Overhead / Bird\'s Eye',
  'Dutch Angle',
];

const hudSelect =
  'bg-slate-950 border border-slate-800 text-slate-200 rounded-md px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:border-sky-500 cursor-pointer';

interface Props { selectedCamera: CameraElement; targetShot: Shot | undefined; changeOptics: (next: Partial<OpticalSetting>) => void }

export function ViewfinderExposureControls({ selectedCamera, targetShot, changeOptics }: Props) {
  const { updateElement, updateShot } = useFloorPlan();
  const aperture = selectedCamera.aperture || 'f/2.8';
  const iso = selectedCamera.iso ?? 800;
  const shutterAngle = selectedCamera.shutterAngle ?? 180;
  const ndFilter = selectedCamera.ndFilter || 'None';
  const frameRate = targetShot?.frameRate ?? 24;
  return (<>
        {/* 3a. Exposure & recording settings — everything on the HUD is editable */}
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="text-slate-400 font-medium">Exposure:</span>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Iris</span>
            <select
              value={aperture}
              onChange={(e) => updateElement(selectedCamera.id, { aperture: e.target.value })}
              className={hudSelect}
            >
              {APERTURES.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">ISO</span>
            <select
              value={iso}
              onChange={(e) => updateElement(selectedCamera.id, { iso: Number(e.target.value) })}
              className={hudSelect}
            >
              {ISO_VALUES.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Shutter</span>
            <select
              value={shutterAngle}
              onChange={(e) => updateElement(selectedCamera.id, { shutterAngle: Number(e.target.value) })}
              className={hudSelect}
            >
              {SHUTTER_ANGLES.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}°
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">FPS</span>
            <select
              value={frameRate}
              onChange={(e) => targetShot && updateShot(targetShot.id, { frameRate: Number(e.target.value) })}
              disabled={!targetShot}
              title={targetShot ? 'Frame rate for this shot' : 'This camera has no shot yet'}
              className={`${hudSelect} ${targetShot ? '' : 'opacity-40 cursor-not-allowed'}`}
            >
              {FRAME_RATES.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">ND</span>
            <select
              value={ndFilter}
              onChange={(e) => updateElement(selectedCamera.id, { ndFilter: e.target.value })}
              className={hudSelect}
            >
              {ND_FILTERS.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Sensor</span>
            <select
              value={selectedCamera.sensorFormat}
              onChange={(e) => changeOptics({ sensorFormat: e.target.value as CameraElement['sensorFormat'] })}
              className={hudSelect}
            >
              {SENSOR_FORMATS.map((entry) => (
                <option key={entry.value} value={entry.value} className="bg-slate-900">
                  {entry.value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Ratio</span>
            <select
              value={selectedCamera.aspectRatio}
              onChange={(e) =>
                updateElement(selectedCamera.id, { aspectRatio: e.target.value as CameraElement['aspectRatio'] })
              }
              className={hudSelect}
            >
              {ASPECT_RATIOS.map((entry) => (
                <option key={entry.value} value={entry.value} className="bg-slate-900">
                  {entry.value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Height</span>
            <select
              value={selectedCamera.cameraHeight || 'Eye Level'}
              onChange={(e) =>
                updateElement(selectedCamera.id, { cameraHeight: e.target.value as CameraElement['cameraHeight'] })
              }
              className={hudSelect}
            >
              {CAMERA_HEIGHTS.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>


</>);
}
