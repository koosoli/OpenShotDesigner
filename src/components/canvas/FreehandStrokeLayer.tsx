import React from 'react';
import type { StrokeElement, StrokePoint } from '../../types';
import { getFreehandStrokeAppearance } from '../../domain/plan';

interface FreehandStrokeLayerProps {
  strokes: StrokeElement[];
  liveStroke?: StrokePoint[] | null;
  liveColor?: string;
  liveWidth?: number;
  liveOpacity?: number;
  liveToolStyle?: NonNullable<StrokeElement['toolStyle']>;
  ariaLabel?: string;
}

/** Shared stroke renderer used by both the editor canvas and printable exports. */
export const FreehandStrokeLayer: React.FC<FreehandStrokeLayerProps> = ({
  strokes,
  liveStroke,
  liveColor = '#0ea5e9',
  liveWidth = 3,
  liveOpacity = 1,
  liveToolStyle = 'pen',
  ariaLabel = 'Freehand annotations',
}) => (
  <g className="pointer-events-none" aria-label={ariaLabel}>
    {strokes
      .filter((stroke) => stroke.visible !== false)
      .map((stroke) => {
        const appearance = getFreehandStrokeAppearance(stroke);
        return (
          <polyline
            key={stroke.id}
            points={stroke.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={stroke.color}
            strokeWidth={appearance.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={appearance.opacity}
          />
        );
      })}
    {liveStroke && liveStroke.length > 1 && (
      <polyline
        points={liveStroke.map((point) => `${point.x},${point.y}`).join(' ')}
        fill="none"
        stroke={liveColor}
        strokeWidth={liveToolStyle === 'highlighter' ? liveWidth * 3 : liveWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={liveOpacity}
      />
    )}
  </g>
);
