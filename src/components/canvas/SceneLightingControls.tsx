import type { SceneViewSettings } from '../../utils/sceneViewSession';
import { updateSceneView } from '../../utils/sceneViewSession';

export function SceneLightingControls({ viewKey, view }: { viewKey: string; view: SceneViewSettings }) {
  return <div className="space-y-1 border-t border-slate-500/20 px-3 py-2 text-xs">
    <label className="flex items-center gap-2"><input type="checkbox" checked={view.lighting}
      onChange={event => updateSceneView(viewKey, { lighting: event.target.checked })} />Simulate lighting</label>
    {view.lighting && <>
      <label className="flex items-center gap-2">Ambient light<input aria-label="Ambient light" type="range" min="0" max="1" step="0.01"
        value={view.ambient} onChange={event => updateSceneView(viewKey, { ambient: event.target.valueAsNumber })} /></label>
      <label className="flex items-center gap-2">Beam tilt<input aria-label="Preview beam tilt" type="range" min="-60" max="80" step="1"
        value={view.lightTilt} onChange={event => updateSceneView(viewKey, { lightTilt: event.target.valueAsNumber })} />{view.lightTilt}° down</label>
      <p className="text-[10px] opacity-75">Approximate direct light and shadows; no bounce or calibrated lux. Beam tilt is shared; source heights and symbol-light settings are illustrative.</p>
    </>}
  </div>;
}
