import { useCallback, useState } from 'react';
import type { SceneSetup } from '../../types';
import type { SceneViewSettings } from '../../utils/sceneViewSession';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useSceneView } from '../canvas/useSceneView';
import { updateSceneView } from '../../utils/sceneViewSession';
import { Scene3DCanvas } from '../canvas/Scene3DCanvas';
import { SceneLightingControls } from '../canvas/SceneLightingControls';

export function Scene3DPrintOptions() {
  const { project, activeSetup } = useFloorPlan();
  const key = project.id + ':' + activeSetup.id;
  const view = useSceneView(key);
  return <div className="border-b border-slate-700 bg-slate-900 px-6 py-2 text-xs text-slate-100 print:hidden">
    <label className="flex items-center gap-2"><input type="checkbox" checked={view.includeInPrint}
      onChange={event => updateSceneView(key, { includeInPrint: event.target.checked })} />Include 3D view in print / PDF</label>
    {view.includeInPrint && <div className="mt-2 flex flex-wrap items-start gap-4">
      <label className="flex items-center gap-2">3D rotation<input aria-label="Print 3D rotation" type="range" min="0" max="360" value={view.angle}
        onChange={event => updateSceneView(key, { angle: event.target.valueAsNumber })} /></label>
      <label className="flex items-center gap-2">3D elevation<input aria-label="Print 3D elevation" type="range" min="5" max="89" value={view.tilt}
        onChange={event => updateSceneView(key, { tilt: event.target.valueAsNumber })} /></label>
      <button type="button" className="rounded border border-slate-500 px-2 py-1" onClick={() => updateSceneView(key, { zoom: 1, panX: 0, panY: 0 })}>Fit 3D scene</button>
      <SceneLightingControls viewKey={key} view={view} />
      <p className="text-[10px] text-slate-400">Uses this scene's Live 3D angle and lighting settings. The image prints on a separate page.</p>
    </div>}
  </div>;
}

export function Scene3DPrintPage() {
  const { project, activeSetup } = useFloorPlan();
  const key = project.id + ':' + activeSetup.id;
  const view = useSceneView(key);
  const [frame, setFrame] = useState<{ png?: string; setup: SceneSetup; view: SceneViewSettings; lighting: boolean }>();
  const capture = useCallback((png: string | undefined, lighting: boolean) => setFrame({ png, setup: activeSetup, view, lighting }), [activeSetup, view]);
  const png = frame?.setup === activeSetup && frame.view === view ? frame.png : undefined;
  if (!view.includeInPrint) return null;
  const caption = view.lighting && frame?.lighting ? 'Approximate direct lighting · relative brightness, not calibrated lux'
    : view.lighting ? '3D overview · WebGL unavailable; lighting preview omitted' : '3D overview';
  return <section className="mb-8 break-before-page break-inside-avoid" aria-label="Printed 3D view" aria-busy={!png}>
    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider">Scene 3D View · {activeSetup.name}</h3>
    <div className="hidden" aria-hidden="true"><Scene3DCanvas setup={activeSetup} view={view} width={1600} height={1000} onSnapshot={capture} /></div>
    {png ? <img id="print-scene3d-image" src={png} alt={`3D view of ${activeSetup.name}`} data-caption={caption}
      className="max-h-[150mm] w-full rounded border border-slate-300 object-contain" /> : <p>Preparing 3D snapshot…</p>}
    <p className="mt-2 text-[10px] text-slate-600">{caption}</p>
  </section>;
}
