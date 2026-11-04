import { getViewfinderTilt, MAX_CAMERA_TILT_DEG } from '../../domain/camera/viewfinderScene';
import type { CameraElement } from '../../types';

interface Props {
  camera: CameraElement;
  tiltDisabled: boolean;
  onPan: (degrees: number) => void;
  onTilt: (degrees: number | null) => void;
}

export function CameraOrientationControls({ camera, tiltDisabled, onPan, onTilt }: Props) {
  const tilt = getViewfinderTilt(camera);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <span>Pan</span>
        <input type="range" min={0} max={360} value={camera.rotation} onChange={(event) => onPan(event.currentTarget.valueAsNumber)}
          className="w-24 accent-sky-500 cursor-pointer" />
        <span aria-hidden="true" className="w-9 font-mono text-sky-400">{camera.rotation}°</span>
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <span>Tilt</span>
        <input type="range" min={-MAX_CAMERA_TILT_DEG} max={MAX_CAMERA_TILT_DEG} value={tilt} disabled={tiltDisabled}
          onChange={(event) => onTilt(event.currentTarget.valueAsNumber)}
          className="w-24 accent-sky-500 cursor-pointer disabled:cursor-default" />
        <span aria-hidden="true" className="w-9 font-mono text-sky-400">{tilt > 0 ? '+' : ''}{tilt}°</span>
      </label>
      {camera.tiltDeg != null && (
        <button type="button" onClick={() => onTilt(null)} disabled={tiltDisabled} title="Restore the tilt from the height preset"
          className="rounded px-1.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
          Reset tilt
        </button>
      )}
    </div>
  );
}
