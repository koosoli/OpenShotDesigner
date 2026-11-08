import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { SceneSetup } from '../../types';
import type { SceneViewSettings } from '../../utils/sceneViewSession';
import type { ViewfinderPose } from '../../domain/camera/viewfinderScene';
import { buildAssetPreview } from '../../domain/plan/assetPreview';
import { buildWallPreview, projectWallPreview } from '../../domain/plan/wallPreview';
import { buildLightBlockers, buildPreviewLights, previewLightSummary } from '../../domain/plan/sceneLighting';
import { aimFromDirection, directionFromScreen, lightAimTargets, projectOrthographic, type LightAimTarget } from '../../domain/plan/lightAim';
import { buildScenePreviewMesh, litLimitNote, sceneOrbitPose, sceneFallbackViewBox } from '../../domain/plan/scenePreviewMesh';
import { createViewfinderRenderer } from '../viewfinder/viewfinderWebGL';

type Vec3 = [number, number, number];
const NO_IDS: readonly string[] = [];

export interface BeamAim { beamPanDeg: number; beamTiltDeg: number }
interface Props {
  setup: SceneSetup; view: SceneViewSettings; width: number; height: number;
  onSnapshot?: (png: string | undefined, lightingApplied: boolean) => void;
  /** Selected elements. Selected lights get a beam handle while simulated lighting is on. */
  selectedIds?: readonly string[];
  /** Live aim while a handle is dragged; the caller records history on commit. */
  onAimLive?: (id: string, aim: BeamAim) => void;
  onAimCommit?: () => void;
}
export function Scene3DCanvas({ setup, view, width, height, onSnapshot, selectedIds = NO_IDS, onAimLive, onAimCommit }: Props) {
  const { elements, layers, gridSettings } = setup;
  const solids = useMemo(() => [...buildWallPreview(elements, layers, gridSettings, true),
    ...buildAssetPreview(elements, layers, gridSettings, { lightTiltDeg: view.lightTilt })], [elements, layers, gridSettings, view.lightTilt]);
  const lights = useMemo(() => buildPreviewLights(elements, layers, gridSettings, view.lightTilt), [elements, layers, gridSettings, view.lightTilt]);
  const blockers = useMemo(() => view.lighting ? buildLightBlockers(solids, elements) : [], [solids, elements, view.lighting]);
  const mesh = useMemo(() => buildScenePreviewMesh(solids, view.lighting ? { lights, blockers, ambient: view.ambient } : undefined),
    [solids, view.lighting, view.ambient, lights, blockers]);
  const pose = useMemo(() => sceneOrbitPose(solids, view, width / height), [solids, view, width, height]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const renderer = useRef<ReturnType<typeof createViewfinderRenderer>>(null);
  const snapshot = useRef(onSnapshot);
  const aimDrag = useRef<{ pointerId: number; id: string; pivot: Vec3; rotationDeg: number; direction: Vec3; length: number; pose: ViewfinderPose } | null>(null);
  useLayoutEffect(() => { snapshot.current = onSnapshot; }, [onSnapshot]);
  const [available, setAvailable] = useState(true);
  const [revision, setRevision] = useState(0);
  const fallback = useMemo(() => !available ? projectWallPreview(solids, view.angle, view.tilt) : null,
    [available, solids, view.angle, view.tilt]);
  const aimTargets = useMemo(() => view.lighting && available
    ? lightAimTargets(elements, layers, gridSettings, selectedIds, view.lightTilt) : [],
  [elements, layers, gridSettings, selectedIds, view.lighting, view.lightTilt, available]);
  // The handle reaches across the whole view, so the pointer can always land on it at any zoom.
  const handleLength = (pose.orthographicSpan || 1) * .4;
  const handles = aimTargets.map((target: LightAimTarget) => {
    const tip = target.pivot.map((v, i) => v + handleLength * target.direction[i]) as Vec3;
    return { ...target, from: projectOrthographic(pose, width, height, target.pivot), to: projectOrthographic(pose, width, height, tip) };
  });
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

  // The handle's own pointer events stop here, so dragging it does not orbit the view.
  const startAim = (handle: LightAimTarget, event: ReactPointerEvent<SVGCircleElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // The view is fixed for the whole drag, so the solver does not chase its own bounds.
    aimDrag.current = { pointerId: event.pointerId, id: handle.id, pivot: handle.pivot, rotationDeg: handle.rotationDeg, direction: handle.direction, length: handleLength, pose };
  };
  const moveAim = (event: ReactPointerEvent<SVGCircleElement>) => {
    const drag = aimDrag.current;
    const element = overlay.current;
    if (!drag || drag.pointerId !== event.pointerId || !element) return;
    const matrix = element.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    drag.direction = directionFromScreen(drag.pose, width, height, drag.pivot, [point.x, point.y], drag.direction, drag.length);
    onAimLive?.(drag.id, aimFromDirection(drag.direction, drag.rotationDeg));
  };
  const endAim = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (aimDrag.current?.pointerId !== event.pointerId) return;
    aimDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onAimCommit?.();
  };

  return <div className="relative size-full overflow-hidden bg-slate-950">
    <canvas ref={canvas} width={width} height={height} role="img" aria-label="3D scene preview"
      className={`size-full object-contain ${available ? '' : 'hidden'}`} />
    {!available && fallback && <svg ref={svg} xmlns="http://www.w3.org/2000/svg" width={width} height={height}
      role="img" aria-label="3D scene fallback" viewBox={sceneFallbackViewBox(fallback.viewBox, view, width / height)} className="size-full">
      <rect x="-10000000" y="-10000000" width="20000000" height="20000000" fill="#0f172a" />
      {fallback.faces.map(face => <g key={face.key}><polygon points={face.points} fill={face.color} />
        <polygon points={face.points} fill="black" fillOpacity={face.shade} /></g>)}
    </svg>}
    {handles.length > 0 && <svg ref={overlay} viewBox={`0 0 ${width} ${height}`} aria-label="Beam aim handles"
      className="pointer-events-none absolute inset-0 size-full print:hidden">
      {handles.map(handle => <g key={handle.id}>
        <line x1={handle.from[0]} y1={handle.from[1]} x2={handle.to[0]} y2={handle.to[1]}
          stroke="#fbbf24" strokeWidth={2} strokeDasharray="8 5" />
        <circle cx={handle.from[0]} cy={handle.from[1]} r={3} fill="#fbbf24" />
        <circle cx={handle.to[0]} cy={handle.to[1]} r={9} fill="#fbbf24" stroke="#0f172a" strokeWidth={2}
          className="pointer-events-auto cursor-grab touch-none" data-aim-handle={handle.id}
          aria-label="Aim light beam"
          onPointerDown={event => startAim(handle, event)} onPointerMove={moveAim}
          onPointerUp={endAim} onLostPointerCapture={endAim} />
      </g>)}
    </svg>}
    {view.lighting && <p className="absolute bottom-1 left-2 rounded bg-slate-950/80 px-2 text-[10px] text-slate-200 print:hidden">
      {available ? `${previewLightSummary(lights)}${litLimitNote(mesh.lit)}${handles.length > 0 ? ' · drag the amber handle to aim' : ''}`
        : 'WebGL unavailable — lighting preview is disabled'}
    </p>}
  </div>;
}
