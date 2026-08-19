import React, { useState } from 'react';
import { CameraElement, Shot, Vector2D } from '../../types';

interface StoryboardThumbProps {
  items: { camera: CameraElement; shot: Shot }[];
  canvasScale: number;
  aspectRatio: number;
  isInteractive: boolean;
  onDragThumb: (shotId: string, pos: Vector2D) => void;
  onSelectCamera: (cameraId: string) => void;
  onDropToCamera?: (shot: Shot, center: Vector2D) => void;
}

/**
 * Shows each shot's storyboard as a small thumbnail near its camera on the
 * floor plan, connected by a dashed leader line. The thumbnail can be dragged
 * around the canvas; its position is stored per shot.
 */
export const StoryboardThumbLayer: React.FC<StoryboardThumbProps> = ({
  items,
  canvasScale,
  aspectRatio,
  isInteractive,
  onDragThumb,
  onSelectCamera,
  onDropToCamera,
}) => {
  const ratio = aspectRatio > 0 ? aspectRatio : 16 / 9;
  const thumbW = 90;
  const thumbH = thumbW / ratio;

  // The thumbnail follows the pointer from local state and is written to the
  // shot once, on release. Committing on every move raced with the canvas's own
  // drag handling and could snap the thumbnail back to where it started.
  const [drag, setDrag] = useState<{ shotId: string; pos: Vector2D } | null>(null);

  return (
    <g className="storyboard-thumb-layer">
      {items.map(({ camera, shot }) => {
        const storedPos = shot.storyboardCanvasPosition || { x: camera.x + 110, y: camera.y - 60 };
        const pos = drag?.shotId === shot.id ? drag.pos : storedPos;
        const fit = shot.storyboardFit || 'cover';
        const canDrag = isInteractive;
        const clipId = `sb-clip-${shot.id}`;

        const handlePointerDown = (e: React.PointerEvent) => {
          e.stopPropagation();
          e.preventDefault();
          if (!canDrag) return;
          onSelectCamera(camera.id);

          const startMouse = { x: e.clientX, y: e.clientY };
          const startPos = { ...storedPos };
          let finalPos = startPos;
          let moved = false;

          const handlePointerMove = (moveEvent: PointerEvent) => {
            const dx = (moveEvent.clientX - startMouse.x) / canvasScale;
            const dy = (moveEvent.clientY - startMouse.y) / canvasScale;
            finalPos = {
              x: Math.round(startPos.x + dx),
              y: Math.round(startPos.y + dy),
            };
            moved = true;
            setDrag({ shotId: shot.id, pos: finalPos });
          };

          const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            setDrag(null);
            // A click that never moved shouldn't write anything.
            if (!moved) return;
            onDragThumb(shot.id, finalPos);
            onDropToCamera?.(shot, finalPos);
          };

          window.addEventListener('pointermove', handlePointerMove);
          window.addEventListener('pointerup', handlePointerUp);
        };

        return (
          <g key={shot.id} className="storyboard-thumb-wrap">
            {/* Leader line from the camera to the thumbnail */}
            <line
              x1={camera.x}
              y1={camera.y}
              x2={pos.x}
              y2={pos.y}
              stroke="#a78bfa"
              strokeWidth={1.5 / canvasScale}
              strokeDasharray={`${4 / canvasScale} ${3 / canvasScale}`}
              opacity={0.7}
              className="pointer-events-none"
            />

            {/* Draggable thumbnail */}
            <g
              transform={`translate(${pos.x}, ${pos.y})`}
              onPointerDown={handlePointerDown}
              style={{ pointerEvents: canDrag ? 'auto' : 'none', cursor: canDrag ? 'move' : 'default' }}
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
                stroke="#a78bfa"
                strokeWidth={1.5 / canvasScale}
              />
              <image
                href={shot.storyboardImage}
                x={-thumbW / 2}
                y={-thumbH / 2}
                width={thumbW}
                height={thumbH}
                preserveAspectRatio={fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}
                clipPath={`url(#${clipId})`}
                opacity={0.95}
              />
              {/* Shot number label */}
              <rect
                x={-thumbW / 2 + 2}
                y={-thumbH / 2 + 2}
                width={(32 + shot.shotNumber.length * 5) / canvasScale}
                height={12 / canvasScale}
                rx={2 / canvasScale}
                fill="rgba(15,23,42,0.85)"
                stroke="#a78bfa"
                strokeWidth={0.5 / canvasScale}
              />
              <text
                x={-thumbW / 2 + 6}
                y={-thumbH / 2 + 11 / canvasScale}
                fontSize={8 / canvasScale}
                fontWeight="bold"
                fill="#c4b5fd"
                fontFamily="sans-serif"
              >
                {shot.shotNumber}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
};
