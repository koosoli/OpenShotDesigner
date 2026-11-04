import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { CameraElement, SceneSetup } from '../../types';
import { buildViewfinderMesh, getViewfinderPose } from '../../domain/camera/viewfinderScene';
import { createViewfinderRenderer } from './viewfinderWebGL';

interface Props {
  setup: SceneSetup;
  camera: CameraElement;
  slotKey: string;
  aspectRatio: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onReady: (ready: boolean) => void;
}

export function ViewfinderScene({ setup, camera, slotKey, aspectRatio, canvasRef, onReady }: Props) {
  const { elements, layers, gridSettings } = setup;
  const cameraId = camera.id;
  const beat = camera.path?.find(({ id }) => id === slotKey)?.beat ?? 1;
  const mesh = useMemo(() => buildViewfinderMesh({ elements, layers, gridSettings }, cameraId, beat), [elements, layers, gridSettings, cameraId, beat]);
  const pose = useMemo(() => getViewfinderPose(camera, gridSettings, slotKey), [camera, gridSettings, slotKey]);
  const [revision, setRevision] = useState(0);
  const renderer = useRef<ReturnType<typeof createViewfinderRenderer>>(null);
  const width = Math.min(960, Math.round(960 * aspectRatio));
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
    onReady(Boolean(pose && renderer.current?.draw(mesh, pose)));
  }, [mesh, pose, width, height, onReady, revision]);

  return <canvas ref={canvasRef} width={width} height={height} role="img" aria-label="3D camera view" className="block size-full" />;
}
