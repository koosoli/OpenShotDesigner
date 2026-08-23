import React, { useRef, useState } from 'react';
import { RotateCcw, RotateCw, ZoomIn } from 'lucide-react';
import {
  DEFAULT_HEADSHOT_FRAMING,
  framingSlack,
  MAX_HEADSHOT_ZOOM,
  headshotImageStyle,
  isDefaultFraming,
  normaliseFraming,
  panFraming,
  rotateFraming,
  rotateFramingBy,
  zoomFraming,
  zoomToCoverRotation,
} from '../../domain/people';
import type { HeadshotFraming } from '../../domain/people';

interface HeadshotReframerProps {
  /** Resolved image URL; the reframer is only shown once there is one. */
  src: string;
  framing?: HeadshotFraming;
  onChange: (framing: HeadshotFraming) => void;
  isLight: boolean;
}

const PREVIEW_SIZE = 96;

/**
 * Drag-to-reposition and zoom for a headshot.
 *
 * The preview is deliberately the same shape the headshot is actually used in —
 * a circle — because framing a square and then seeing it cropped to a circle is
 * how you end up with an ear. What you drag is what the crew list prints.
 *
 * Nothing here touches the image bytes: the framing is stored beside them, so a
 * reframe is reversible and two people sharing a photo keep sharing it (see
 * `domain/people/headshot.ts`).
 */
export const HeadshotReframer: React.FC<HeadshotReframerProps> = ({
  src,
  framing,
  onChange,
  isLight,
}) => {
  const current = normaliseFraming(framing);
  const [dragging, setDragging] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  // `cover` only overflows the picture's longer axis, so a landscape headshot
  // has nothing hidden above or below and dragging up and down does nothing.
  // That reads as a broken control, so the panel says which way it can move and
  // offers the zoom that frees the other axis.
  const slack = framingSlack(natural?.width, natural?.height, current.zoom);
  const rotation = current.rotation ?? 0;
  // A tilted rectangle shows its background at the rim of a round window
  // unless it is also enlarged; offer exactly the zoom that hides it.
  const coverZoom = zoomToCoverRotation(rotation);
  const needsCoverZoom = rotation !== 0 && current.zoom + 0.001 < coverZoom;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    last.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!last.current) return;
    const dx = event.clientX - last.current.x;
    const dy = event.clientY - last.current.y;
    last.current = { x: event.clientX, y: event.clientY };
    // Pixels to percentage points of the preview. Dividing by zoom keeps the
    // drag tracking the picture: zoomed in, the same pixel of travel covers
    // less of the image, and without this the crop races ahead of the pointer.
    const scale = 100 / (PREVIEW_SIZE * current.zoom);
    onChange(panFraming(current, dx * scale, dy * scale));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    last.current = null;
    setDragging(false);
  };

  /** Arrow keys move the crop for anyone not using a pointer. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    // Arrows move the CROP, not the picture, so they are not inverted the way
    // the drag is: pressing right should look right.
    onChange(panFraming(current, -move[0], -move[1]));
  };

  const button = `text-[10px] font-semibold px-2 py-1 rounded-lg border ${
    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
  }`;

  return (
    <div className="flex items-center gap-3">
      <div
        role="application"
        aria-label="Reframe headshot: drag or use the arrow keys"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, touchAction: 'none' }}
        className={`rounded-full overflow-hidden border-2 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-sky-500 ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        } ${isLight ? 'border-slate-300' : 'border-slate-700'}`}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(event) =>
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          style={{
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
            ...headshotImageStyle(current),
          }}
        />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <label className="block text-[9px] font-bold uppercase text-slate-500">
          <span className="flex items-center gap-1">
            <ZoomIn className="w-3 h-3" /> Zoom
          </span>
          <input
            type="range"
            min={1}
            max={MAX_HEADSHOT_ZOOM}
            step={0.05}
            value={current.zoom}
            onChange={(event) => onChange(zoomFraming(current, Number(event.target.value)))}
            className="w-full accent-sky-500 cursor-pointer mt-0.5"
          />
        </label>
        <div className="flex items-end gap-1.5">
          <label className="block flex-1 text-[9px] font-bold uppercase text-slate-500">
            <span className="flex items-center gap-1">
              <RotateCw className="w-3 h-3" /> Tilt
              <span className="ml-auto font-mono normal-case opacity-70">{rotation}°</span>
            </span>
            <input
              type="range"
              min={-45}
              max={45}
              step={1}
              value={Math.max(-45, Math.min(45, rotation))}
              onChange={(event) => onChange(rotateFraming(current, Number(event.target.value)))}
              onDoubleClick={() => onChange(rotateFraming(current, 0))}
              title="Tilt; double-click to straighten"
              className="w-full accent-sky-500 cursor-pointer mt-0.5"
            />
          </label>
          {/* Quarter turns for pictures that arrived on their side. */}
          <button type="button" onClick={() => onChange(rotateFramingBy(current, -90))} className={button} title="Turn a quarter anticlockwise" aria-label="Turn a quarter anticlockwise">
            <RotateCcw className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => onChange(rotateFramingBy(current, 90))} className={button} title="Turn a quarter clockwise" aria-label="Turn a quarter clockwise">
            <RotateCw className="w-3 h-3" />
          </button>
        </div>
        {needsCoverZoom && (
          <button type="button" onClick={() => onChange(zoomFraming(current, coverZoom))} className={`${button} w-full`}>
            Zoom to {coverZoom.toFixed(2)}× to hide the tilted corners
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(DEFAULT_HEADSHOT_FRAMING)}
            disabled={isDefaultFraming(current)}
            className={`${button} ${isDefaultFraming(current) ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <span className="flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Reset
            </span>
          </button>
          <span className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {slack.horizontal && slack.vertical
              ? 'Drag the circle to reframe'
              : slack.horizontal
                ? 'Drag left and right to reframe'
                : slack.vertical
                  ? 'Drag up and down to reframe'
                  : 'Zoom in to reframe'}
          </span>
        </div>
        {slack.zoomToUnlock !== null && (
          <button
            type="button"
            onClick={() => onChange(zoomFraming(current, slack.zoomToUnlock as number))}
            className={`${button} w-full`}
          >
            {slack.vertical ? 'Zoom in to move it sideways' : 'Zoom in to move it up and down'}
          </button>
        )}
      </div>
    </div>
  );
};
