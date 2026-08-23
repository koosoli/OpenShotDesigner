import React from 'react';
import { BackgroundImage, IdentifiedBackgroundImage } from '../../types';
import { useImageRefSrc } from '../../utils/assetImages';

interface BackgroundLayerProps {
  backgroundImages: IdentifiedBackgroundImage[];
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
  img: IdentifiedBackgroundImage;
  canvasScale: number;
  isInteractive: boolean;
  isSelected: boolean;
  onActivate: () => void;
  onUpdate: (updates: Partial<BackgroundImage>) => void;
  onDelete: () => void;
  onDropToCamera?: (image: BackgroundImage, center: { x: number; y: number }) => void;
}

const DraggableReferenceImage: React.FC<ImageDragProps> = ({
  img,
  canvasScale,
  isInteractive,
  isSelected,
  onActivate,
  onUpdate,
  onDelete,
  onDropToCamera,
}) => {
  const { x, y, width, height } = img;
  const locked = !!img.locked;
  const resolvedUrl = useImageRefSrc(img.url);

  const handlePointerDown = (handle: ResizeHandle, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Clicking or grabbing the image activates it (selects this image and opens its inspector)
    onActivate();

    // If the image is locked, do NOT start dragging/resizing!
    if (locked) return;

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

      scale = Math.max(scale, 30 / startW, 30 / startH);

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
      {/* Reference plates were inline data URLs until the media migration and
          may still be, so the reference is resolved rather than used raw. */}
      <image
        href={resolvedUrl ?? undefined}
        x={x}
        y={y}
        width={width}
        height={height}
        opacity={img.opacity ?? 0.5}
        preserveAspectRatio="none"
        style={{
          // A locked reference image never grabs the pointer: clicks and lasso
          // drags pass straight through it to the elements / canvas beneath.
          pointerEvents: isInteractive && !locked ? 'auto' : 'none',
          cursor: isInteractive && !locked ? 'move' : 'default',
        }}
        onPointerDown={(e) => handlePointerDown('move', e)}
      />

      {/* Selected bounding box: Unlocked (Sky Blue) or Locked (Amber) */}
      {isSelected && isInteractive && (
        <g className="bg-transform-gizmo">
          {locked ? (
            /* Locked State Outline (selection frame only) */
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2 / canvasScale}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          ) : (
            /* Unlocked State Handles & Lock Badge */
            <>
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

              {/* Interactive Lock Button Badge */}
              <g
                transform={`translate(${x}, ${y - 16 / canvasScale})`}
                className="pointer-events-auto cursor-pointer select-none"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate({ locked: true });
                }}
              >
                <title>Click to Lock image (prevent accidental moves) [L]</title>
                <rect
                  x={0}
                  y={-9 / canvasScale}
                  width={80 / canvasScale}
                  height={18 / canvasScale}
                  rx={4 / canvasScale}
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth={1 / canvasScale}
                />
                <text
                  x={40 / canvasScale}
                  y={3.5 / canvasScale}
                  textAnchor="middle"
                  fill="#38bdf8"
                  fontSize={9 / canvasScale}
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  🔓 Lock (L)
                </text>
              </g>

              {/* Delete button on the selected image (works alongside the Delete key) */}
              <g
                transform={`translate(${x + width}, ${y - 8 / canvasScale})`}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <title>Delete reference image (Del)</title>
                <circle cx={0} cy={0} r={9 / canvasScale} fill="#ef4444" stroke="#0f172a" strokeWidth={1.5 / canvasScale} />
                <path
                  d={`M ${-3 / canvasScale} ${-3 / canvasScale} L ${3 / canvasScale} ${3 / canvasScale} M ${3 / canvasScale} ${-3 / canvasScale} L ${-3 / canvasScale} ${3 / canvasScale}`}
                  stroke="#ffffff"
                  strokeWidth={2 / canvasScale}
                  strokeLinecap="round"
                />
              </g>
            </>
          )}
        </g>
      )}

      {/* Always-visible lock chip: a locked image's body lets pointer events pass
          through (so lasso drags and elements placed on top still work), which
          means its unlock control must stay on screen at all times. */}
      {locked && isInteractive && (
        <g
          transform={`translate(${x}, ${y - 16 / canvasScale})`}
          className="pointer-events-auto cursor-pointer select-none"
          onClick={(e) => {
            e.stopPropagation();
            onUpdate({ locked: false });
          }}
        >
          <title>Click to Unlock image (or press L)</title>
          <rect
            x={0}
            y={-9 / canvasScale}
            width={118 / canvasScale}
            height={18 / canvasScale}
            rx={4 / canvasScale}
            fill="#78350f"
            stroke="#f59e0b"
            strokeWidth={1.5 / canvasScale}
          />
          <text
            x={59 / canvasScale}
            y={3.5 / canvasScale}
            textAnchor="middle"
            fill="#fef3c7"
            fontSize={9 / canvasScale}
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            🔒 LOCKED (Click / L)
          </text>
        </g>
      )}
    </g>
  );
};

const BackgroundLayerImpl: React.FC<BackgroundLayerProps> = ({
  backgroundImages,
  canvasScale,
  selectedBackgroundId,
  isInteractive,
  onSelectImage,
  onUpdate,
  onDelete,
  onDropToCamera,
}) => {
  return (
    <g className="background-reference-layer">
      {/* All reference images (earliest = deepest). Hidden ones only vanish in
          exports — on the interactive canvas they stay as faint dashed ghosts
          so they can always be found and re-shown. */}
      {backgroundImages.map((img) => {
        const isSelected = selectedBackgroundId === img.id;

        if (img.visible === false) {
          if (!isInteractive) return null;
          return (
            <g
              key={img.id}
              className="background-reference-ghost cursor-pointer select-none"
              onClick={(e) => {
                e.stopPropagation();
                onSelectImage(img.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <title>Hidden reference image — click to select &amp; show it again</title>
              <rect
                x={img.x}
                y={img.y}
                width={img.width}
                height={img.height}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1.5 / canvasScale}
                strokeDasharray={`${6 / canvasScale} ${4 / canvasScale}`}
                opacity={0.5}
              />
              <g transform={`translate(${img.x}, ${img.y - 16 / canvasScale})`}>
                <rect
                  x={0}
                  y={-9 / canvasScale}
                  width={92 / canvasScale}
                  height={18 / canvasScale}
                  rx={4 / canvasScale}
                  fill="#0f172a"
                  stroke="#94a3b8"
                  strokeWidth={1 / canvasScale}
                />
                <text
                  x={46 / canvasScale}
                  y={3.5 / canvasScale}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize={9 / canvasScale}
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  👁 Hidden
                </text>
              </g>
            </g>
          );
        }

        return (
          <g key={img.id} className="background-reference-item-wrap">
            <DraggableReferenceImage
              img={img}
              canvasScale={canvasScale}
              isInteractive={isInteractive}
              isSelected={isSelected}
              onActivate={() => onSelectImage(img.id)}
              onUpdate={(updates) => onUpdate(img.id, updates)}
              onDelete={() => onDelete(img.id)}
              onDropToCamera={onDropToCamera}
            />

            {/* Name label when selected */}
            {isSelected && img.name && (
              <g
                transform={`translate(${img.x + (img.locked ? 126 : 88) / canvasScale}, ${img.y - 16 / canvasScale})`}
                className="pointer-events-none"
              >
                <rect
                  x={-4 / canvasScale}
                  y={-9 / canvasScale}
                  width={(img.name.length * 5.5 + 16) / canvasScale}
                  height={18 / canvasScale}
                  rx={3 / canvasScale}
                  fill="rgba(15,23,42,0.9)"
                  stroke={img.locked ? '#f59e0b' : '#38bdf8'}
                  strokeWidth={1 / canvasScale}
                />
                <text
                  x={4 / canvasScale}
                  y={3.5 / canvasScale}
                  fill={img.locked ? '#f59e0b' : '#38bdf8'}
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

/**
 * Memoised because the canvas re-renders on every pointer move — hovering the
 * plan used to redraw every layer, glyph by glyph. The props are stable by
 * construction on the canvas side (element buckets come from one memoised
 * pass, callbacks are `useCallback`ed), so a shallow compare is enough and a
 * custom comparator would only hide a prop that is not stable yet.
 */
export const BackgroundLayer = React.memo(BackgroundLayerImpl);
BackgroundLayerImpl.displayName = 'BackgroundLayer';
