import type { SceneSetup } from '../../types';
import type { ScenePreviewMesh } from '../plan/scenePreviewMesh';
import { buildViewfinderMesh, type ViewfinderLightingOptions } from './viewfinderScene';

type Scene = Pick<SceneSetup, 'elements' | 'layers' | 'gridSettings'>;
/** Per-viewer cache. Optical changes to the excluded camera only need a new pose. */
export function createViewfinderMeshCache() {
  let previous: { scene: Scene; cameraId: string; beat: number; lighting?: ViewfinderLightingOptions; mesh: ScenePreviewMesh } | undefined;
  return (scene: Scene, cameraId: string, beat: number, lighting?: ViewfinderLightingOptions): ScenePreviewMesh => {
    const elements = scene.elements.filter(element => element.id !== cameraId);
    if (previous && previous.cameraId === cameraId && previous.beat === beat &&
      previous.scene.layers === scene.layers && previous.scene.gridSettings === scene.gridSettings &&
      Boolean(previous.lighting) === Boolean(lighting) && previous.lighting?.ambient === lighting?.ambient &&
      previous.lighting?.lightTilt === lighting?.lightTilt && previous.scene.elements.length === elements.length &&
      elements.every((element, i) => previous!.scene.elements[i] === element)) return previous.mesh;
    const placed = { ...scene, elements };
    const mesh = buildViewfinderMesh(placed, cameraId, beat, lighting);
    previous = { scene: placed, cameraId, beat, lighting, mesh };
    return mesh;
  };
}
