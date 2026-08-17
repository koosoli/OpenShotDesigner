import React from 'react';
import { GridSettings } from '../../types';

interface GridLayerProps {
  gridSettings: GridSettings;
  width?: number;
  height?: number;
  visible?: boolean;
}

export const GridLayer: React.FC<GridLayerProps> = ({
  gridSettings,
  width = 5000,
  height = 5000,
  visible = true,
}) => {
  const { size, showGrid, unit, pixelsPerUnit } = gridSettings;

  if (!showGrid || !visible) return null;

  const majorGridStep = size * 5; // e.g. 5 meters or 5 feet

  return (
    <g className="grid-layer pointer-events-none select-none">
      <defs>
        {/* Fine grid pattern */}
        <pattern
          id="fine-grid-pattern"
          width={size}
          height={size}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${size} 0 L 0 0 0 ${size}`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth="1"
          />
        </pattern>

        {/* Major grid pattern */}
        <pattern
          id="major-grid-pattern"
          width={majorGridStep}
          height={majorGridStep}
          patternUnits="userSpaceOnUse"
        >
          <rect width={majorGridStep} height={majorGridStep} fill="url(#fine-grid-pattern)" />
          <path
            d={`M ${majorGridStep} 0 L 0 0 0 ${majorGridStep}`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="1.5"
          />
        </pattern>
      </defs>

      {/* Full infinite grid canvas */}
      <rect
        x={-2500}
        y={-2500}
        width={width}
        height={height}
        fill="url(#major-grid-pattern)"
      />

      {/* Coordinate axes */}
      <line
        x1={-2500}
        y1={0}
        x2={2500}
        y2={0}
        stroke="rgba(59, 130, 246, 0.25)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <line
        x1={0}
        y1={-2500}
        x2={0}
        y2={2500}
        stroke="rgba(59, 130, 246, 0.25)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />

      {/* Scale indicator marker in top left */}
      <g transform="translate(40, 40)" className="opacity-60">
        <rect
          x={0}
          y={0}
          width={pixelsPerUnit * 5}
          height={20}
          fill="rgba(15, 23, 42, 0.7)"
          stroke="rgba(255, 255, 255, 0.2)"
          rx={4}
        />
        <line
          x1={5}
          y1={10}
          x2={pixelsPerUnit * 5 - 5}
          y2={10}
          stroke="#94a3b8"
          strokeWidth="2"
        />
        <line x1={5} y1={5} x2={5} y2={15} stroke="#94a3b8" strokeWidth="2" />
        <line
          x1={pixelsPerUnit * 5 - 5}
          y1={5}
          x2={pixelsPerUnit * 5 - 5}
          y2={15}
          stroke="#94a3b8"
          strokeWidth="2"
        />
        <text
          x={(pixelsPerUnit * 5) / 2}
          y={35}
          fill="#94a3b8"
          fontSize="11"
          textAnchor="middle"
          fontFamily="monospace"
        >
          5 {unit === 'm' ? 'Meters' : 'Feet'}
        </text>
      </g>
    </g>
  );
};
