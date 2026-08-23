import React from 'react';
import type { StrokeElement, StrokePoint } from '../../types';
import { getFreehandStrokeAppearance } from '../../domain/plan';
import { boundsCenterOfPoints } from '../../utils/geometry';

interface FreehandStrokeLayerProps {
  strokes: StrokeElement[];
  liveStroke?: StrokePoint[] | null;
  liveColor?: string;
  liveWidth?: number;
  liveOpacity?: number;
  liveToolStyle?: NonNullable<StrokeElement['toolStyle']>;
  ariaLabel?: string;
  /**
   * Editor-only interactivity: invisible wide hit-areas so strokes can be
   * selected, dragged and rotated. Printable exports omit this entirely.
   */
  onStrokePointerDown?: (stroke: StrokeElement, e: React.PointerEvent) => void;
  /** Ids rendered with a selection halo (editor only). */
  selectedStrokeIds?: string[];
}

/** Shared stroke renderer used by both the editor canvas and printable exports. */
const FreehandStrokeLayerImpl: React.FC<FreehandStrokeLayerProps> = ({
  strokes,
  liveStroke,
  liveColor = '#0ea5e9',
  liveWidth = 3,
  liveOpacity = 1,
  liveToolStyle = 'pen',
  ariaLabel = 'Freehand annotations',
  onStrokePointerDown,
  selectedStrokeIds,
}) => {
  const selectedSet = new Set(selectedStrokeIds ?? []);
  return (
    <g className={onStrokePointerDown ? undefined : 'pointer-events-none'} aria-label={ariaLabel}>
      {strokes
        .filter((stroke) => stroke.visible !== false)
        .map((stroke) => {
          const appearance = getFreehandStrokeAppearance(stroke);
          const pointsAttr = stroke.points.map((point) => `${point.x},${point.y}`).join(' ');
          // Strokes keep absolute vertices; rotation is a render transform
          // around the ink's bounding-box centre, so existing saved projects
          // (rotation 0) render identically without any data migration.
          const centre = boundsCenterOfPoints(stroke.points);
          const rotationDeg = stroke.rotation || 0;
          return (
            <g key={stroke.id} transform={centre && rotationDeg ? `rotate(${rotationDeg} ${centre.x} ${centre.y})` : undefined}>
              {selectedSet.has(stroke.id) && (
                <polyline
                  points={pointsAttr}
                  fill="none"
                  stroke="#38bdf8"
                  strokeOpacity={0.35}
                  strokeWidth={appearance.strokeWidth + 10}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <polyline
                points={pointsAttr}
                fill="none"
                stroke={stroke.color}
                strokeWidth={appearance.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={appearance.opacity}
              />
              {/* Invisible fat hit-line: makes strokes clickable/draggable in the editor. */}
              {onStrokePointerDown && (
                <polyline
                  points={pointsAttr}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(appearance.strokeWidth * 3, 18)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ pointerEvents: 'stroke', cursor: 'move' }}
                  onPointerDown={(e) => onStrokePointerDown(stroke, e)}
                />
              )}
            </g>
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
};

/**
 * Memoised because the canvas re-renders on every pointer move — hovering the
 * plan used to redraw every layer, glyph by glyph. The props are stable by
 * construction on the canvas side (element buckets come from one memoised
 * pass, callbacks are `useCallback`ed), so a shallow compare is enough and a
 * custom comparator would only hide a prop that is not stable yet.
 */
export const FreehandStrokeLayer = React.memo(FreehandStrokeLayerImpl);
FreehandStrokeLayerImpl.displayName = 'FreehandStrokeLayer';
