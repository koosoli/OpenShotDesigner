import React from 'react';
import { ShapeElement } from '../../types';

interface ShapesLayerProps {
  shapes: ShapeElement[];
  selectedIds: string[];
  onSelect: (id: string, e: React.PointerEvent) => void;
  canvasScale: number;
}

/** Outline path for the shapes that aren't a plain rect/ellipse. */
const polygonPoints = (shape: ShapeElement): string => {
  const w = shape.width;
  const h = shape.height;
  const half = { x: w / 2, y: h / 2 };

  switch (shape.shapeType) {
    case 'triangle':
      return `0,${-half.y} ${half.x},${half.y} ${-half.x},${half.y}`;
    case 'diamond':
      return `0,${-half.y} ${half.x},0 0,${half.y} ${-half.x},0`;
    case 'pentagon':
    case 'hexagon': {
      const sides = shape.shapeType === 'pentagon' ? 5 : 6;
      return Array.from({ length: sides }, (_, i) => {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        return `${(Math.cos(angle) * w) / 2},${(Math.sin(angle) * h) / 2}`;
      }).join(' ');
    }
    case 'star': {
      return Array.from({ length: 10 }, (_, i) => {
        const angle = (Math.PI * i) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? 1 : 0.45;
        return `${(Math.cos(angle) * w * radius) / 2},${(Math.sin(angle) * h * radius) / 2}`;
      }).join(' ');
    }
    default:
      return '';
  }
};

/**
 * Free-form shapes on the floor plan: blocking zones, set pieces, light pools,
 * callout boxes. Drawn under the elements so they read as background graphics.
 */
export const ShapesLayer: React.FC<ShapesLayerProps> = ({ shapes, selectedIds, onSelect, canvasScale }) => (
  <g className="shapes-layer">
    {shapes.map((shape) => {
      if (shape.visible === false) return null;

      const isSelected = selectedIds.includes(shape.id);
      const fill = shape.filled === false ? 'none' : shape.color || '#38bdf8';
      const stroke = shape.strokeColor || shape.color || '#38bdf8';
      const strokeWidth = shape.strokeWidth ?? 2;
      const dash =
        shape.dashStyle === 'dashed'
          ? `${10 / canvasScale} ${6 / canvasScale}`
          : shape.dashStyle === 'dotted'
            ? `${2 / canvasScale} ${5 / canvasScale}`
            : undefined;

      const common = {
        fill,
        fillOpacity: shape.filled === false ? 0 : (shape.opacity ?? 0.35),
        stroke,
        strokeWidth,
        strokeOpacity: shape.strokeOpacity ?? 1,
        strokeDasharray: dash,
        vectorEffect: 'non-scaling-stroke' as const,
      };

      return (
        <g
          key={shape.id}
          transform={`translate(${shape.x}, ${shape.y}) rotate(${shape.rotation || 0})`}
          onPointerDown={(e) => !shape.locked && onSelect(shape.id, e)}
          style={{ cursor: shape.locked ? 'default' : 'move' }}
          className="shape-element"
        >
          {shape.shapeType === 'circle' || shape.shapeType === 'ellipse' ? (
            <ellipse rx={shape.width / 2} ry={shape.height / 2} {...common} />
          ) : shape.shapeType === 'rectangle' ? (
            <rect
              x={-shape.width / 2}
              y={-shape.height / 2}
              width={shape.width}
              height={shape.height}
              rx={shape.cornerRadius ?? 0}
              {...common}
            />
          ) : (
            <polygon points={polygonPoints(shape)} {...common} />
          )}

          {/* Selection outline */}
          {isSelected && (
            <rect
              x={-shape.width / 2 - 6}
              y={-shape.height / 2 - 6}
              width={shape.width + 12}
              height={shape.height + 12}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth={1.5 / canvasScale}
              strokeDasharray={`${5 / canvasScale} ${4 / canvasScale}`}
              className="pointer-events-none"
            />
          )}

          {shape.label && (
            <text
              y={shape.height / 2 + 14 / canvasScale}
              textAnchor="middle"
              fontSize={11 / canvasScale}
              fill={stroke}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight="600"
              className="pointer-events-none"
            >
              {shape.label}
            </text>
          )}
        </g>
      );
    })}
  </g>
);
