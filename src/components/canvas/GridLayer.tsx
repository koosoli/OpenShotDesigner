import React from 'react';
import { GridSettings } from '../../types';

interface GridLayerProps {
  gridSettings: GridSettings;
  canvasScale?: number;
  canvasOffset?: { x: number; y: number };
  visible?: boolean;
  /** Dark theme: use light strokes. Light theme uses dark slate strokes. */
  dark?: boolean;
}

export const GridLayer: React.FC<GridLayerProps> = ({
  gridSettings,
  canvasScale = 1,
  canvasOffset = { x: 0, y: 0 },
  visible,
  dark = true,
}) => {
  const { size, showGrid } = gridSettings;

  const isVisible = visible !== undefined ? visible : (showGrid === true);
  if (!isVisible) return null;

  const majorGridStep = size * 5; // e.g. 5 meters or 5 feet

  // Light-theme strokes are dark slate; dark-theme strokes are white.
  const fineStroke = dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.09)';
  const majorStroke = dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.2)';
  const axisStroke = 'rgba(59, 130, 246, 0.25)';

  // Interior fine lines inside each major (5x) tile — replicates the old nested
  // fine pattern WITHOUT nesting so the shared pan/zoom transform stays exact.
  const interiorFine =
    [1, 2, 3, 4]
      .map(
        (i) =>
          `M ${size * i} 0 L ${size * i} ${majorGridStep} M 0 ${size * i} L ${majorGridStep} ${size * i}`
      )
      .join(' ');

  // Maps the pattern's world-space tiling onto screen space so the grid is
  // endless and always aligned with the canvas pan/zoom transform.
  const patternTransform = `translate(${canvasOffset.x}, ${canvasOffset.y}) scale(${canvasScale})`;

  return (
    <g className="grid-layer pointer-events-none select-none">
      <defs>
        {/* Major grid pattern (fine lines + heavy 5-unit boundaries), tiled
            across the whole viewport in world coordinates */}
        <pattern
          id="major-grid-pattern"
          width={majorGridStep}
          height={majorGridStep}
          patternUnits="userSpaceOnUse"
          patternTransform={patternTransform}
        >
          <path d={interiorFine} fill="none" stroke={fineStroke} strokeWidth="1" />
          <path
            d={`M ${majorGridStep} 0 L 0 0 0 ${majorGridStep}`}
            fill="none"
            stroke={majorStroke}
            strokeWidth="1.5"
          />
        </pattern>
      </defs>

      {/* Full infinite grid — fills the entire viewport, clipped to visible area */}
      <rect x="0" y="0" width="100%" height="100%" fill="url(#major-grid-pattern)" />

      {/* Coordinate axes — pinned to the world origin */}
      <line
        x1="0"
        y1={canvasOffset.y}
        x2="100%"
        y2={canvasOffset.y}
        stroke={axisStroke}
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <line
        x1={canvasOffset.x}
        y1="0"
        x2={canvasOffset.x}
        y2="100%"
        stroke={axisStroke}
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
    </g>
  );
};