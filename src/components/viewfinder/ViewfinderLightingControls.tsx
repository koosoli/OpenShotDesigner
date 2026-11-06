import { useFloorPlan } from '../../context/FloorPlanContext';
import { useSceneView } from '../canvas/useSceneView';
import { SceneLightingControls } from '../canvas/SceneLightingControls';

export function ViewfinderLightingControls({ ready }: { ready: boolean }) {
  const { project, activeSetup } = useFloorPlan();
  const viewKey = project.id + ':' + activeSetup.id;
  const view = useSceneView(viewKey);
  return <fieldset disabled={!ready} className="bg-slate-900 text-slate-200 disabled:opacity-60">
    <legend className="sr-only">Virtual viewfinder lighting</legend>
    <SceneLightingControls viewKey={viewKey} view={view} />
    {!ready && <p className="px-3 pb-2 text-[10px] text-slate-400">Lighting preview requires the 3D camera view and WebGL.</p>}
  </fieldset>;
}
