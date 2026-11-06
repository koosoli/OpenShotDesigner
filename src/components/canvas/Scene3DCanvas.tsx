import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SceneSetup } from '../../types';
import type { SceneViewSettings } from '../../utils/sceneViewSession';
import { buildAssetPreview } from '../../domain/plan/assetPreview';
import { buildWallPreview, projectWallPreview } from '../../domain/plan/wallPreview';
import { buildLightBlockers, buildPreviewLights, previewLightSummary } from '../../domain/plan/sceneLighting';
import { buildScenePreviewMesh, sceneOrbitPose, sceneFallbackViewBox } from '../../domain/plan/scenePreviewMesh';
import { createViewfinderRenderer } from '../viewfinder/viewfinderWebGL';

interface Props {
  setup: SceneSetup; view: SceneViewSettings; width: number; height: number;
  onSnapshot?: (png: string | undefined, lightingApplied: boolean) => void;
}
export function Scene3DCanvas({ setup, view, width, height, onSnapshot }: Props) {
  const { elements, layers, gridSettings } = setup;
  const solids = useMemo(() => [...buildWallPreview(elements, layers, gridSettings, true),
    ...buildAssetPreview(elements, layers, gridSettings)], [elements, layers, gridSettings]);
  const lights = useMemo(() => buildPreviewLights(elements, layers, gridSettings, view.lightTilt), [elements, layers, gridSettings, view.lightTilt]);
  const blockers = useMemo(() => view.lighting ? buildLightBlockers(solids, elements) : [], [solids, elements, view.lighting]);
  const mesh = useMemo(() => buildScenePreviewMesh(solids, view.lighting ? { lights, blockers, ambient: view.ambient } : undefined),
    [solids, view.lighting, view.ambient, lights, blockers]);
  const pose = useMemo(() => sceneOrbitPose(solids, view, width / height), [solids, view, width, height]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const renderer = useRef<ReturnType<typeof createViewfinderRenderer>>(null);
  const snapshot = useRef(onSnapshot);
  useLayoutEffect(() => { snapshot.current = onSnapshot; }, [onSnapshot]);
  const [available, setAvailable] = useState(true);
  const [revision, setRevision] = useState(0);
  const fallback = useMemo(() => !available ? projectWallPreview(solids, view.angle, view.tilt) : null,
    [available, solids, view.angle, view.tilt]);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const lost = (event: Event) => { event.preventDefault(); setAvailable(false); snapshot.current?.(undefined, false); };
    const restored = () => setRevision(value => value + 1);
    element.addEventListener('webglcontextlost', lost);
    element.addEventListener('webglcontextrestored', restored);
    renderer.current = createViewfinderRenderer(element);
    setAvailable(Boolean(renderer.current));
    return () => {
      element.removeEventListener('webglcontextlost', lost);
      element.removeEventListener('webglcontextrestored', restored);
      renderer.current?.dispose(); renderer.current = null;
    };
  }, [revision]);
  useLayoutEffect(() => {
    if (renderer.current?.draw(mesh, pose)) onSnapshot?.(canvas.current?.toDataURL('image/png'), view.lighting);
  }, [mesh, pose, width, height, revision, onSnapshot, view.lighting]);
  useLayoutEffect(() => {
    if (available || !svg.current || !onSnapshot) return;
    let cancelled = false;
    const image = new Image();
    const source = new XMLSerializer().serializeToString(svg.current);
    image.onload = () => {
      if (cancelled) return;
      const buffer = document.createElement('canvas'); buffer.width = width; buffer.height = height;
      const ctx = buffer.getContext('2d');
      ctx?.drawImage(image, 0, 0, width, height);
      onSnapshot(ctx ? buffer.toDataURL('image/png') : undefined, false);
    };
    image.onerror = () => { if (!cancelled) onSnapshot(undefined, false); };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    return () => { cancelled = true; };
  }, [available, fallback, width, height, onSnapshot]);
  return <div className="relative size-full overflow-hidden bg-slate-950">
    <canvas ref={canvas} width={width} height={height} role="img" aria-label="3D scene preview"
      className={`size-full object-contain ${available ? '' : 'hidden'}`} />
    {!available && fallback && <svg ref={svg} xmlns="http://www.w3.org/2000/svg" width={width} height={height}
      role="img" aria-label="3D scene fallback" viewBox={sceneFallbackViewBox(fallback.viewBox, view, width / height)} className="size-full">
      <rect x="-10000000" y="-10000000" width="20000000" height="20000000" fill="#0f172a" />
      {fallback.faces.map(face => <g key={face.key}><polygon points={face.points} fill={face.color} />
        <polygon points={face.points} fill="black" fillOpacity={face.shade} /></g>)}
    </svg>}
    {view.lighting && <p className="absolute bottom-1 left-2 rounded bg-slate-950/80 px-2 text-[10px] text-slate-200 print:hidden">
      {available ? previewLightSummary(lights) : 'WebGL unavailable — lighting preview is disabled'}
    </p>}
  </div>;
}
