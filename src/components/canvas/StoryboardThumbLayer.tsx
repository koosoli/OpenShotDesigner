import React, { useState } from 'react';
import { CameraElement, Shot, Vector2D } from '../../types';
import { slotsOf } from '../../utils/storyboardFrames';

interface StoryboardThumbProps {
  items: { camera: CameraElement; shot: Shot }[];
  canvasScale: number;
  aspectRatio: number;
  isInteractive: boolean;
  onDragThumb?: (shotId: string, slotKey: string, pos: Vector2D) => void;
  onSelectCamera: (cameraId: string) => void;
  onDoubleClickCamera?: (cameraId: string) => void;
  onDropToCamera?: (shot: Shot, center: Vector2D) => void;
}

/**
 * Each boarded keyframe shown as a small thumbnail on the floor plan, anchored
 * to the camera position it belongs to (the camera itself, or one of its
 * waypoints) by a dashed leader line. Thumbnails are dragged with pointer
 * capture so a fast drag can't slip off.
 */
export const StoryboardThumbLayer: React.FC<StoryboardThumbProps> = ({
  items,
  canvasScale,
  aspectRatio,
  isInteractive,
  onDragThumb,
  onSelectCamera,
  onDoubleClickCamera,
  onDropToCamera,
}) => {
  const ratio = aspectRatio > 0 ? aspectRatio : 16 / 9;
  const thumbW = 90;
  const thumbH = thumbW / ratio;

  // The thumbnail follows the pointer from local state and is written to the
  // shot once, on release: committing on every move raced with the canvas's own
  // drag handling and could snap the thumbnail back to where it started.
  const [drag, setDrag] = useState<{ key: string; pos: Vector2D } | null>(null);

  const thumbs = items.flatMap(({ camera, shot }) =>
    slotsOf(shot, camera)
      .filter((slot) => !!slot.frame?.image)
      .map((slot, index) => ({
        camera,
        shot,
        slot,
        key: `${shot.id}-${slot.key}`,
        pos:
          slot.frame?.canvasPosition ||
          { x: slot.anchor.x + 110, y: slot.anchor.y - 60 + index * 20 },
      }))
  );

  return (
    <g className="storyboard-thumb-layer">
      {thumbs.map(({ camera, shot, slot, key, pos: storedPos }) => {
        const pos = drag?.key === key ? drag.pos : storedPos;
        const canDrag = isInteractive;
        const clipId = `sb-clip-${key}`;
        const isEnd = slot.short === 'END';
        const accent = isEnd ? '#f59e0b' : slot.short && slot.short !== 'START' ? '#38bdf8' : '#a78bfa';
        const isFirst = slot.key === 'start';

        const handlePointerDown = (e: React.PointerEvent) => {
          e.stopPropagation();
          if (!canDrag) return;
          onSelectCamera(camera.id);

          const element = e.currentTarget as SVGGElement;
          const pointerId = e.pointerId;
          // Pointer capture keeps every move/up on this element even when the
          // cursor outruns it or leaves the SVG entirely.
          try {
            element.setPointerCapture(pointerId);
          } catch {
            // Older browsers: window listeners below still cover the drag
          }

          const startMouse = { x: e.clientX, y: e.clientY };
          const startPos = { ...storedPos };
          let finalPos = startPos;
          let moved = false;

          const handleMove = (moveEvent: PointerEvent) => {
            const dx = (moveEvent.clientX - startMouse.x) / canvasScale;
            const dy = (moveEvent.clientY - startMouse.y) / canvasScale;
            // A couple of pixels of slop so a click doesn't nudge the frame
            if (!moved && Math.abs(dx * canvasScale) < 3 && Math.abs(dy * canvasScale) < 3) return;
            moved = true;
            finalPos = { x: Math.round(startPos.x + dx), y: Math.round(startPos.y + dy) };
            setDrag({ key, pos: finalPos });
          };

          const handleUp = () => {
            element.removeEventListener('pointermove', handleMove);
            element.removeEventListener('pointerup', handleUp);
            element.removeEventListener('pointercancel', handleUp);
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            try {
              element.releasePointerCapture(pointerId);
            } catch {
              // already released
            }
            setDrag(null);
            if (!moved) return;
            onDragThumb(shot.id, slot.key, finalPos);
            if (isFirst) onDropToCamera?.(shot, finalPos);
          };

          element.addEventListener('pointermove', handleMove);
          element.addEventListener('pointerup', handleUp);
          element.addEventListener('pointercancel', handleUp);
          // Fallback for browsers that drop the capture (e.g. after a re-render)
          window.addEventListener('pointermove', handleMove);
          window.addEventListener('pointerup', handleUp);
        };

        return (
          <g key={key} className="storyboard-thumb-wrap">
            {/* Leader line from this keyframe's camera position to the frame */}
            <line
              x1={slot.anchor.x}
              y1={slot.anchor.y}
              x2={pos.x}
              y2={pos.y}
              stroke={accent}
              strokeWidth={1.5 / canvasScale}
              strokeDasharray={`${4 / canvasScale} ${3 / canvasScale}`}
              opacity={0.7}
              className="pointer-events-none"
            />

            {/* Draggable thumbnail */}
            <g
              transform={`translate(${pos.x}, ${pos.y})`}
              onPointerDown={handlePointerDown}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelectCamera(camera.id);
                onDoubleClickCamera?.(camera.id);
              }}
              style={{
                pointerEvents: canDrag ? 'auto' : 'none',
                cursor: canDrag ? 'move' : 'default',
                touchAction: 'none',
              }}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect x={-thumbW / 2} y={-thumbH / 2} width={thumbW} height={thumbH} rx={4} />
                </clipPath>
              </defs>
              <rect
                x={-thumbW / 2}
                y={-thumbH / 2}
                width={thumbW}
                height={thumbH}
                rx={4}
                fill="#1e293b"
                stroke={accent}
                strokeWidth={1.5 / canvasScale}
              />
              <image
                href={slot.frame!.image}
                x={-thumbW / 2}
                y={-thumbH / 2}
                width={thumbW}
                height={thumbH}
                preserveAspectRatio={slot.frame?.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}
                clipPath={`url(#${clipId})`}
                opacity={0.95}
                className="pointer-events-none"
              />
              {/* Shot number + keyframe label */}
              <rect
                x={-thumbW / 2 + 2}
                y={-thumbH / 2 + 2}
                width={(34 + (shot.shotNumber.length + (slot.short?.length || 0)) * 5) / canvasScale}
                height={12 / canvasScale}
                rx={2 / canvasScale}
                fill="rgba(15,23,42,0.85)"
                stroke={accent}
                strokeWidth={0.5 / canvasScale}
                className="pointer-events-none"
              />
              <text
                x={-thumbW / 2 + 6}
                y={-thumbH / 2 + 11 / canvasScale}
                fontSize={8 / canvasScale}
                fontWeight="bold"
                fill={isEnd ? '#fcd34d' : '#c4b5fd'}
                fontFamily="sans-serif"
                className="pointer-events-none"
              >
                {shot.shotNumber}
                {slot.short ? ` ${slot.short}` : ''}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
};
