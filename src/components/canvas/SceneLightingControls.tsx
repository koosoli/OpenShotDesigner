import type { SceneViewSettings } from '../../utils/sceneViewSession';
import { updateSceneView } from '../../utils/sceneViewSession';

export function SceneLightingControls({ viewKey, view }: { viewKey: string; view: SceneViewSettings }) {
  return <div className="space-y-1 border-t border-slate-500/20 px-3 py-2 text-xs">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <label className="flex items-center gap-2"><input type="checkbox" checked={view.lighting}
        onChange={event => updateSceneView(viewKey, { lighting: event.target.checked })} />Simulate lighting</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={view.lighting && view.bounce} disabled={!view.lighting}
        onChange={event => updateSceneView(viewKey, { bounce: event.target.checked })} />Bounce light</label>
    </div>
    {view.lighting && <>
      <label className="flex items-center gap-2">Ambient light<input aria-label="Ambient light" type="range" min="0" max="1" step="0.01"
        value={view.ambient} onChange={event => updateSceneView(viewKey, { ambient: event.target.valueAsNumber })} /></label>
      <label className="flex items-center gap-2">Beam tilt<input aria-label="Preview beam tilt" type="range" min="-60" max="80" step="1"
        value={view.lightTilt} onChange={event => updateSceneView(viewKey, { lightTilt: event.target.valueAsNumber })} />{view.lightTilt}° down</label>
      <p className="text-[10px] opacity-75">Bounce light adds fill from lit walls and reflector boards. Beam tilt is the scene default; individual fixtures can override it in the inspector. Source heights and symbol-light settings are illustrative.</p>
    </>}
  </div>;
}
