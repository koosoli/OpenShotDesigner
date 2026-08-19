import React from 'react';
import { BackgroundImage } from '../../types';

interface BackgroundLayerProps {
  backgroundImages: BackgroundImage[];
  canvasScale: number;
  selectedBackgroundId: string | null;
  isInteractive: boolean;
  onSelectImage: (id: string) => void;
  onUpdate: (id: string, updates: Partial<BackgroundImage>) => void;
  onDelete: (id: string) => void;
  onDropToCamera?: (image: BackgroundImage, center: { x: number; y: number }) => void;
}

type ResizeHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface ImageDragProps {
  img: BackgroundImage;
  canvasScale: number;
  canDrag: boolean;
  onActivate: () => void;
  onUpdate: (updates: Partial<BackgroundImage>) => void;
  onDropToCamera?: (image: BackgroundImage, center: { x: number; y: number }) => void;
}

const DraggableReferenceImage: React.FC<ImageDragProps> = ({
  img,
  canvasScale,
  canDrag,
  onActivate,
  onUpdate,
  onDropToCamera,
}) => {
  const { x, y, width, height } = img;

  const handlePointerDown = (handle: ResizeHandle, e: React.PointerEvent) => {
    if (!canDrag) return;
    e.stopPropagation();
    e.preventDefault();

    // Grabbing the image activates it (deselects elements / selects this image)
    onActivate();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX = x;
    const startY = y;
    const startW = width;
    const startH = height;
    const aspect = startW / startH || 1;
    let finalX = startX;
    let finalY = startY;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startMouseX) / canvasScale;
      const dy = (moveEvent.clientY - startMouseY) / canvasScale;

      if (handle === 'move') {
        finalX = Math.round(startX + dx);
        finalY = Math.round(startY + dy);
        onUpdate({ x: finalX, y: finalY });
        return;
      }

      // Aspect-ratio-locked corner resizing
      let scale: number;
      if (handle === 'se') scale = Math.max((startW + dx) / startW, (startH + dy) / startH);
      else if (handle === 'nw') scale = Math.max((startW - dx) / startW, (startH - dy) / startH);
      else if (handle === 'ne') scale = Math.max((startW + dx) / startW, (startH - dy) / startH);
      else scale = Math.max((startW - dx) / startW, (startH + dy) / startH);

      scale = Math.max(scale, 50 / startW, 50 / startH);

      const nextW = Math.round(startW * scale);
      const nextH = Math.round(nextW / aspect);

      const updates: Partial<BackgroundImage> = { width: nextW, height: nextH };
      if (handle === 'nw') {
        updates.x = Math.round(startX + (startW - nextW));
        updates.y = Math.round(startY + (startH - nextH));
      } else if (handle === 'ne') {
        updates.y = Math.round(startY + (startH - nextH));
      } else if (handle === 'sw') {
        updates.x = Math.round(startX + (startW - nextW));
      }
      onUpdate(updates);
    };

    const handlePointerUp = () => {
      if (handle === 'move') {
        onDropToCamera?.(img, { x: finalX + startW / 2, y: finalY + startH / 2 });
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleSize = 12 / canvasScale;

  const cornerProps = (handle: ResizeHandle, cursor: string) => ({
    fill: '#38bdf8',
    stroke: '#0f172a',
    strokeWidth: 1.5 / canvasScale,
    className: cursor,
    style: { pointerEvents: 'auto' as const },
    onPointerDown: (e: React.PointerEvent) => handlePointerDown(handle, e),
  });

  return (
    <g className="background-reference-item">
      <image
        href={img.url}
        x={x}
        y={y}
        width={width}
        height={height}
        opacity={img.opacity ?? 0.5}
        preserveAspectRatio="none"
        style={{ pointerEvents: canDrag ? 'auto' : 'none', cursor: canDrag ? 'move' : 'default' }}
        onPointerDown={canDrag ? (e) => handlePointerDown('move', e) : undefined}
      />

      {/* Selected bounding box & proportional resize handles */}
      {canDrag && (
        <g className="bg-transform-gizmo">
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={1.5 / canvasScale}
            strokeDasharray="4 4"
            className="cursor-move"
            style={{ pointerEvents: 'auto' }}
            onPointerDown={(e) => handlePointerDown('move', e)}
          />
          <rect x={x - handleSize / 2} y={y - handleSize / 2} width={handleSize} height={handleSize} {...cornerProps('nw', 'cursor-nwse-resize')} />
          <rect x={x + width - handleSize / 2} y={y - handleSize / 2} width={handleSize} height={handleSize} {...cornerProps('ne', 'cursor-nesw-resize')} />
          <rect x={x - handleSize / 2} y={y + height - handleSize / 2} width={handleSize} height={handleSize} {...cornerProps('sw', 'cursor-nesw-resize')} />
          <rect x={x + width - handleSize / 2} y={y + height - handleSize / 2} width={handleSize} height={handleSize} {...cornerProps('se', 'cursor-nwse-resize')} />
        </g>
      )}
    </g>
  );
};

export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  backgroundImages,
  canvasScale,
  selectedBackgroundId,
  isInteractive,
  onSelectImage,
  onUpdate,
  onDelete,
  onDropToCamera,
}) => {
  const visible = backgroundImages.filter((b) => b.visible !== false);

  return (
    <g className="background-reference-layer">
      {/* All reference images (earliest = deepest) */}
      {visible.map((img) => {
        const locked = !!img.locked;
        const canDrag = isInteractive && !locked;
        const isSelected = selectedBackgroundId === img.id;

        return (
          <g key={img.id} className="background-reference-item-wrap">
            <DraggableReferenceImage
              img={img}
              canvasScale={canvasScale}
              canDrag={canDrag}
              onActivate={() => onSelectImage(img.id)}
              onUpdate={(updates) => onUpdate(img.id, updates)}
              onDropToCamera={onDropToCamera}
            />

            {/* Delete button on the selected image (works alongside the Delete key) */}
            {isSelected && canDrag && (
              <g
                transform={`translate(${img.x + img.width}, ${img.y})`}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(img.id);
                }}
              >
                <circle cx={0} cy={0} r={9 / canvasScale} fill="#ef4444" stroke="#0f172a" strokeWidth={1.5 / canvasScale} />
                <path
                  d={`M ${-3 / canvasScale} ${-3 / canvasScale} L ${3 / canvasScale} ${3 / canvasScale} M ${3 / canvasScale} ${-3 / canvasScale} L ${-3 / canvasScale} ${3 / canvasScale}`}
                  stroke="#ffffff"
                  strokeWidth={2 / canvasScale}
                  strokeLinecap="round"
                />
              </g>
            )}

            {/* Name label when selected */}
            {isSelected && img.name && (
              <g
                transform={`translate(${img.x}, ${img.y - 14 / canvasScale})`}
                className="pointer-events-none"
              >
                <rect
                  x={-4 / canvasScale}
                  y={-10 / canvasScale}
                  width={(img.name.length * 5.5 + 16) / canvasScale}
                  height={16 / canvasScale}
                  rx={3 / canvasScale}
                  fill="rgba(15,23,42,0.9)"
                  stroke="#38bdf8"
                  strokeWidth={1 / canvasScale}
                />
                <text
                  x={4 / canvasScale}
                  y={3 / canvasScale}
                  fill="#38bdf8"
                  fontSize={9 / canvasScale}
                  fontWeight="bold"
                >
                  {img.name}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};
