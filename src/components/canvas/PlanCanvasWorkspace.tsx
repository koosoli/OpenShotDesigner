import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { buildAssetPreview } from '../../domain/plan/assetPreview';
import { buildWallPreview, projectWallPreview } from '../../domain/plan/wallPreview';
import { PlanPreviewButton } from './PlanPreviewButton';
import { SplitCanvasArea } from './SplitCanvasArea';
import { useConstructCadFrame } from './useConstructCadFrame';

function LiveWallView() {
  const { activeSetup } = useFloorPlan();
  const [angle, setAngle] = useState(35);
  const [tilt, setTilt] = useState(36);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [orbiting, setOrbiting] = useState(false);
  const [viewportPixels, setViewportPixels] = useState(1280);
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setViewportPixels(Math.max(640, Math.min(2048, Math.ceil(Math.min(width, height) * window.devicePixelRatio * Math.max(1, zoom)))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [zoom]);
  const drag = useRef<{ id: number; x: number; y: number; orbit: boolean } | null>(null);
  const { elements, layers, gridSettings } = activeSetup;
  const solids = useMemo(() => [
    ...buildWallPreview(elements, layers, gridSettings, true),
    ...buildAssetPreview(elements, layers, gridSettings),
  ], [elements, layers, gridSettings]);
  const nativeFrame = useConstructCadFrame(solids, angle, tilt, orbiting, viewportPixels);
  const nativeCanvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (nativeFrame) nativeCanvas.current?.getContext('2d')?.putImageData(nativeFrame, 0, 0);
  }, [nativeFrame]);
  const hasNativeFrame = Boolean(nativeFrame);
  const preview = useMemo(
    () => hasNativeFrame ? null : projectWallPreview(solids, angle, tilt),
    [solids, angle, tilt, hasNativeFrame],
  );

  return (
    <section aria-label="Live 3D view" className="flex h-[36%] min-h-0 flex-col border-t border-slate-500/30 bg-slate-950 text-slate-100 md:h-full md:w-[40%] md:border-l md:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-1.5 text-xs">
        <span className="font-semibold">Live 3D · {nativeFrame ? 'ConstructCAD' : 'Scene'}</span>
        <label className="flex items-center gap-2">
          Rotate
          <input type="range" min={0} max={360} value={angle} onChange={(event) => setAngle(event.currentTarget.valueAsNumber)} className="w-24 accent-sky-400" />
        </label>
      </div>
      <div
        ref={viewport}
        className="relative min-h-0 w-full flex-1 overflow-hidden overscroll-contain touch-none select-none cursor-grab active:cursor-grabbing"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if ((!hasNativeFrame && !preview) || drag.current || ![0, 1, 2].includes(event.button)) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId, x: event.clientX, y: event.clientY,
            orbit: event.button === 0 || (event.button === 1 && event.shiftKey),
          };
          setOrbiting(drag.current.orbit);
        }}
        onPointerMove={(event) => {
          const previous = drag.current;
          if (!previous || previous.id !== event.pointerId) return;
          const dx = event.clientX - previous.x;
          const dy = event.clientY - previous.y;
          // ConstructCAD view3d.rs: primary or Shift+middle rotates, other
          // mouse buttons pan. The orthographic preview uses a floor-up tilt.
          if (previous.orbit) {
            setAngle((value) => ((value + dx * .4) % 360 + 360) % 360);
            setTilt((value) => Math.max(5, Math.min(89, value + dy * .4)));
          } else {
            setPan((value) => ({ x: value.x + dx, y: value.y + dy }));
          }
          drag.current = { ...previous, x: event.clientX, y: event.clientY };
        }}
        onLostPointerCapture={(event) => {
          if (drag.current?.id === event.pointerId) {
            drag.current = null;
            setOrbiting(false);
          }
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          drag.current = null;
          setOrbiting(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { drag.current = null; setOrbiting(false); }}
        onWheel={(event) => {
          const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1);
          setZoom((value) => Math.max(.25, Math.min(12, value * Math.exp(-delta * .0025))));
        }}
      >
        {nativeFrame ? (
          <canvas
            ref={nativeCanvas}
            role="img"
            aria-label="ConstructCAD live scene"
            width={nativeFrame.width}
            height={nativeFrame.height}
            className="pointer-events-none h-full w-full object-contain"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          />
        ) : preview ? (
          <svg
            role="img"
            aria-label="Live projection of the floor plan and placed assets"
            viewBox={preview.viewBox}
            className="pointer-events-none h-full w-full"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
          {preview.faces.map(({ key, points, color, shade }) => (
            <g key={key}>
              <polygon points={points} fill={color} />
              <polygon points={points} fill="black" fillOpacity={shade} />
            </g>
          ))}
          </svg>
        ) : (
          <p className="grid h-full place-items-center px-3 text-center text-xs text-slate-300">Draw a wall or place an asset to preview it here.</p>
        )}
      </div>
      <p className="px-3 py-1.5 text-[10px] text-slate-400">Left-drag to orbit · Right or middle-drag to pan · Scroll to zoom</p>
    </section>
  );
}

export function PlanCanvasWorkspace() {
  const [showLive3D, setShowLive3D] = useState(false);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <SplitCanvasArea />
        <div className="absolute right-2 top-2 z-20 flex items-center gap-2">
          {showLive3D && <PlanPreviewButton />}
          <button
            type="button"
            aria-pressed={showLive3D}
            onClick={() => setShowLive3D((open) => !open)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 shadow-md hover:bg-slate-700 aria-pressed:border-sky-400"
          >
            <Box className="size-3.5" aria-hidden="true" />
            Live 3D
          </button>
        </div>
      </div>
      {showLive3D && <LiveWallView />}
    </div>
  );
}
