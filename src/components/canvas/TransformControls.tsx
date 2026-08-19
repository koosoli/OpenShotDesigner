import React from 'react';
import { FloorPlanElement, ShapeElement } from '../../types';

export type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

interface TransformControlsProps {
  selectedElement: FloorPlanElement;
  canvasScale: number;
  onRotateStart: (e: React.PointerEvent) => void;
  onEndpointDragStart?: (endpoint: 'start' | 'end', e: React.PointerEvent) => void;
  onResizeStart?: (handle: ResizeHandle, e: React.PointerEvent) => void;
  onAddWaypoint?: () => void;
  pixelsPerUnit?: number;
  unit?: 'ft' | 'm';
}

export const TransformControls: React.FC<TransformControlsProps> = ({
  selectedElement,
  canvasScale,
  onRotateStart,
  onEndpointDragStart,
  onResizeStart,
  pixelsPerUnit = 50,
  unit = 'm',
}) => {
  const el = selectedElement;
  const rotation = Math.round(el.rotation || 0);
  const isLineShape = el.type === 'shape' && (el as ShapeElement).shapeType === 'line';
  const isLinear =
    el.type === 'wall' ||
    el.type === 'track' ||
    el.type === 'measurement' ||
    el.type === 'arrow' ||
    isLineShape;

  if (isLinear && onEndpointDragStart) {
    let x1 = el.x;
    let y1 = el.y;
    let x2 = (el as any).x2 ?? el.x + 200;
    let y2 = (el as any).y2 ?? el.y;

    if (isLineShape) {
      const shape = el as ShapeElement;
      const rad = ((shape.rotation || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const half = (shape.width || 180) / 2;
      x1 = shape.x - half * cos;
      y1 = shape.y - half * sin;
      x2 = shape.x + half * cos;
      y2 = shape.y + half * sin;
    }

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const lengthPx = Math.hypot(x2 - x1, y2 - y1);
    const isMeasurement = el.type === 'measurement';
    const lengthLabel = isMeasurement
      ? `${(lengthPx / pixelsPerUnit).toFixed(1)}${unit}`
      : isLineShape
      ? `${Math.round(lengthPx)}px`
      : `${(lengthPx / 50).toFixed(2)}m`;
    const badgeWidth = isMeasurement || isLineShape ? 58 : 48;

    return (
      <g className="transform-controls pointer-events-auto">
        {/* Length badge */}
        <g transform={`translate(${midX}, ${midY - 14 / canvasScale})`}>
          <rect
            x={-badgeWidth / 2 / canvasScale}
            y={-10 / canvasScale}
            width={badgeWidth / canvasScale}
            height={20 / canvasScale}
            rx={4 / canvasScale}
            fill="#0f172a"
            stroke={isMeasurement ? '#f59e0b' : '#38bdf8'}
            strokeWidth={1 / canvasScale}
          />
          <text
            x={0}
            y={4 / canvasScale}
            textAnchor="middle"
            fill={isMeasurement ? '#f59e0b' : '#38bdf8'}
            fontSize={10 / canvasScale}
            fontWeight="bold"
            fontFamily="monospace"
          >
            {lengthLabel}
          </text>
        </g>

        {/* Endpoint 1 handle */}
        <g
          className="cursor-move hover:scale-125 transition-transform"
          onPointerDown={(e) => onEndpointDragStart('start', e)}
        >
          <circle
            cx={x1}
            cy={y1}
            r={10 / canvasScale}
            fill="#38bdf8"
            stroke="#0f172a"
            strokeWidth={2.5 / canvasScale}
          />
          <circle cx={x1} cy={y1} r={3 / canvasScale} fill="#ffffff" />
        </g>

        {/* Endpoint 2 handle */}
        <g
          className="cursor-move hover:scale-125 transition-transform"
          onPointerDown={(e) => onEndpointDragStart('end', e)}
        >
          <circle
            cx={x2}
            cy={y2}
            r={10 / canvasScale}
            fill="#38bdf8"
            stroke="#0f172a"
            strokeWidth={2.5 / canvasScale}
          />
          <circle cx={x2} cy={y2} r={3 / canvasScale} fill="#ffffff" />
        </g>
      </g>
    );
  }

  // 2D Shapes & Props: show bounding box + corner/edge resize handles
  const is2DResizable = el.type === 'shape' || el.type === 'prop';
  const width = (el as any).width || 80;
  const height = (el as any).height || 60;
  const halfW = width / 2;
  const halfH = height / 2;

  const baseSize = Math.max(width, height, 40);
  const rotateHandleDistance = Math.max(52, baseSize / 2 + 30);
  const handleSize = 8 / canvasScale;

  return (
    <g
      transform={`translate(${el.x}, ${el.y}) rotate(${rotation})`}
      className="transform-controls pointer-events-auto"
    >
      {/* 2D Bounding box and resize handles for Shapes and Props */}
      {is2DResizable && (
        <g className="resize-controls">
          {/* Bounding box outline */}
          <rect
            x={-halfW}
            y={-halfH}
            width={width}
            height={height}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={1.5 / canvasScale}
            strokeDasharray={`${4 / canvasScale} ${4 / canvasScale}`}
            opacity={0.7}
          />

          {/* 4 Corner Resize Handles */}
          {onResizeStart && (
            <>
              {/* NW */}
              <rect
                x={-halfW - handleSize / 2}
                y={-halfH - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={1.5 / canvasScale}
                className="cursor-nwse-resize hover:scale-125 transition-transform"
                onPointerDown={(e) => onResizeStart('nw', e)}
              />
              {/* NE */}
              <rect
                x={halfW - handleSize / 2}
                y={-halfH - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={1.5 / canvasScale}
                className="cursor-nesw-resize hover:scale-125 transition-transform"
                onPointerDown={(e) => onResizeStart('ne', e)}
              />
              {/* SE */}
              <rect
                x={halfW - handleSize / 2}
                y={halfH - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={1.5 / canvasScale}
                className="cursor-nwse-resize hover:scale-125 transition-transform"
                onPointerDown={(e) => onResizeStart('se', e)}
              />
              {/* SW */}
              <rect
                x={-halfW - handleSize / 2}
                y={halfH - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={1.5 / canvasScale}
                className="cursor-nesw-resize hover:scale-125 transition-transform"
                onPointerDown={(e) => onResizeStart('sw', e)}
              />

              {/* Edge Handles */}
              {/* N */}
              <rect
                x={-handleSize / 2}
                y={-halfH - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={1.5 / canvasScale}
                className="cursor-ns-resize hover:scale-125 transition-transform"
                onPointerDown={(e) => onResizeStart('n', e)}
              />
              {/* S */}
              <rect
                x={-handleSize / 2}
                y={halfH - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={1.5 / canvasScale}
                className="cursor-ns-resize hover:scale-125 transition-transform"
                onPointerDown={(e) => onResizeStart('s', e)}
              />
              {/* E */}
              <rect
                x={halfW - handleSize / 2}
                y={-handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={1.5 / canvasScale}
                className="cursor-ew-resize hover:scale-125 transition-transform"
                onPointerDown={(e) => onResizeStart('e', e)}
              />
              {/* W */}
              <rect
                x={-halfW - handleSize / 2}
                y={-handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={1.5 / canvasScale}
                className="cursor-ew-resize hover:scale-125 transition-transform"
                onPointerDown={(e) => onResizeStart('w', e)}
              />
            </>
          )}
        </g>
      )}

      {/* Rotation Guideline circle */}
      <circle
        cx={0}
        cy={0}
        r={rotateHandleDistance}
        fill="none"
        stroke="#38bdf8"
        strokeWidth={1 / canvasScale}
        strokeDasharray="3 3"
        opacity={0.35}
      />

      {/* Rotation stalk line */}
      <line
        x1={0}
        y1={0}
        x2={rotateHandleDistance}
        y2={0}
        stroke="#38bdf8"
        strokeWidth={1.5 / canvasScale}
        strokeDasharray="3 3"
      />

      {/* Rotation Grab Handle Knob with Curved Arrow & Degree Tooltip */}
      <g
        transform={`translate(${rotateHandleDistance}, 0)`}
        className="cursor-grab active:cursor-grabbing hover:scale-115 transition-transform group"
        onPointerDown={onRotateStart}
      >
        {/* Shadow glow */}
        <circle cx={0} cy={0} r={12 / canvasScale} fill="#0284c7" opacity={0.3} />
        {/* Main Handle Circle */}
        <circle
          cx={0}
          cy={0}
          r={9 / canvasScale}
          fill="#38bdf8"
          stroke="#0f172a"
          strokeWidth={2 / canvasScale}
        />
        {/* Rotate arrow icon */}
        <path
          d={`M ${-3 / canvasScale} ${-3 / canvasScale} A ${4 / canvasScale} ${4 / canvasScale} 0 1 1 ${-3 / canvasScale} ${3 / canvasScale}`}
          fill="none"
          stroke="#0f172a"
          strokeWidth={1.5 / canvasScale}
          strokeLinecap="round"
        />

        {/* Live Degree Badge above handle */}
        <g transform={`translate(${16 / canvasScale}, 0) rotate(${-rotation})`}>
          <rect
            x={-14 / canvasScale}
            y={-9 / canvasScale}
            width={28 / canvasScale}
            height={18 / canvasScale}
            rx={3 / canvasScale}
            fill="#0f172a"
            stroke="#38bdf8"
            strokeWidth={1 / canvasScale}
          />
          <text
            x={0}
            y={3.5 / canvasScale}
            textAnchor="middle"
            fill="#38bdf8"
            fontSize={9 / canvasScale}
            fontWeight="bold"
            fontFamily="monospace"
          >
            {rotation}°
          </text>
        </g>
      </g>
    </g>
  );
};
