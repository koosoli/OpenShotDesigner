import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { CameraElement, SceneSetup } from '../../types';
import { getViewfinderPose } from '../../domain/camera/viewfinderScene';
import { createViewfinderMeshCache } from '../../domain/camera/viewfinderMeshCache';
import { createViewfinderRenderer } from './viewfinderWebGL';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useSceneView } from '../canvas/useSceneView';

interface Props {
  setup: SceneSetup;
  camera: CameraElement;
  slotKey: string;
  aspectRatio: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onReady: (ready: boolean) => void;
}

export function ViewfinderScene({ setup, camera, slotKey, aspectRatio, canvasRef, onReady }: Props) {
  const { project } = useFloorPlan();
  const view = useSceneView(project.id + ':' + setup.id);
  const { elements, layers, gridSettings } = setup;
  const cameraId = camera.id;
  const beat = camera.path?.find(({ id }) => id === slotKey)?.beat ?? 1;
  const buildMesh = useMemo(createViewfinderMeshCache, []);
  const mesh = useMemo(() => buildMesh({ elements, layers, gridSettings }, cameraId, beat,
    view.lighting ? { ambient: view.ambient, lightTilt: view.lightTilt } : undefined),
  [elements, layers, gridSettings, cameraId, beat, view.lighting, view.ambient, view.lightTilt, buildMesh]);
  const pose = useMemo(() => getViewfinderPose(camera, gridSettings, slotKey), [camera, gridSettings, slotKey]);
  const [revision, setRevision] = useState(0);
  const renderer = useRef<ReturnType<typeof createViewfinderRenderer>>(null);
  const width = Math.min(1920, Math.round(1920 * aspectRatio));
  const height = Math.round(width / aspectRatio);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lost = (event: Event) => { event.preventDefault(); onReady(false); };
    const restored = () => setRevision((value) => value + 1);
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    renderer.current = createViewfinderRenderer(canvas);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [canvasRef, onReady, revision]);

  useLayoutEffect(() => {
    onReady(Boolean(pose && renderer.current?.draw(mesh, pose, { ground: !view.lighting })));
  }, [mesh, pose, width, height, onReady, revision, view.lighting]);

  return <canvas ref={canvasRef} width={width} height={height} role="img" aria-label="3D camera view" className="block size-full" />;
}
