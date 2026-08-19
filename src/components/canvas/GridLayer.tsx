import React from 'react';
import { GridSettings } from '../../types';

interface GridLayerProps {
  gridSettings: GridSettings;
  width?: number;
  height?: number;
  visible?: boolean;
  /** Dark theme: use light strokes. Light theme uses dark slate strokes. */
  dark?: boolean;
}

export const GridLayer: React.FC<GridLayerProps> = ({
  gridSettings,
  width = 5000,
  height = 5000,
  visible,
  dark = true,
}) => {
  const { size, showGrid, unit, pixelsPerUnit } = gridSettings;

  const isVisible = visible !== undefined ? visible : (showGrid === true);
  if (!isVisible) return null;

  const majorGridStep = size * 5; // e.g. 5 meters or 5 feet

  // Light-theme strokes are dark slate; dark-theme strokes are white.
  const fineStroke = dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.09)';
  const majorStroke = dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.2)';

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
            stroke={fineStroke}
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
            stroke={majorStroke}
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
    </g>
  );
};
