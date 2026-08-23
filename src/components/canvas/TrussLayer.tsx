import React from 'react';

export interface TrussRunOnPlan {
  id: string;
  label: string;
  /** Canvas position of the run's start point, in scene units. */
  x: number;
  y: number;
  /** Degrees clockwise from pointing right. */
  rotation: number;
  /** Run length in millimetres; undefined when neither profile nor override says. */
  lengthMm?: number;
  /** Chord width in millimetres, for drawing the bay to scale; undefined = unknown. */
  widthMm?: number;
  /** Loads hung on this run, drawn as tick marks along it. */
  hangPointsMm: number[];
  /** True when the run's planned load is over its rated capacity. */
  overloaded?: boolean;
}

interface TrussLayerProps {
  runs: TrussRunOnPlan[];
  /** Scene units per millimetre, so a 3 m bay draws 3 m long. */
  unitsPerMm: number;
  selectedId?: string | null;
  isInteractive: boolean;
  onSelect: (id: string) => void;
  /** `record` is false during the drag and true once on release, so a whole
      drag is a single undo step. */
  onMove: (id: string, position: { x: number; y: number }, record: boolean) => void;
  onRotate: (id: string, rotation: number, record: boolean) => void;
  canvasScale: number;
  isLight: boolean;
}

/** A run with no known length still has to be visible and grabbable. */
const FALLBACK_LENGTH_UNITS = 160;
const FALLBACK_WIDTH_UNITS = 14;

/**
 * Truss runs drawn on the floor plan (plan §6, rigging).
 *
 * `TrussElement` has carried `x`, `y` and `rotation` since it was introduced,
 * and nothing ever set or drew them — so a rig existed in the rigging panel as
 * a list of runs with no relationship to the room they hang in. You could plan
 * a 3 m bay over a set you could not see it above.
 *
 * The run is drawn to scale from its profile length, with a tick per hang
 * point, and dragged with its own pointer handling rather than through the
 * element drag state machine — the same arrangement `BackgroundLayer` uses for
 * reference images, because a truss is not a `FloorPlanElement` and should not
 * pretend to be one just to be movable.
 */
const TrussLayerImpl: React.FC<TrussLayerProps> = ({
  runs,
  unitsPerMm,
  selectedId,
  isInteractive,
  onSelect,
  onMove,
  onRotate,
  canvasScale,
  isLight,
}) => {
  const beam = isLight ? '#475569' : '#94a3b8';
  const overloadBeam = '#dc2626';

  const startDrag = (run: TrussRunOnPlan, mode: 'move' | 'rotate', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(run.id);
    if (!isInteractive) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = run.x;
    const startY = run.y;
    const startRotation = run.rotation;

    let moved = false;
    let lastPosition = { x: startX, y: startY };
    let lastRotation = startRotation;

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startClientX) / canvasScale;
      const dy = (moveEvent.clientY - startClientY) / canvasScale;
      moved = true;
      if (mode === 'move') {
        lastPosition = { x: Math.round(startX + dx), y: Math.round(startY + dy) };
        onMove(run.id, lastPosition, false);
        return;
      }
      // Rotation follows the pointer around the run's start point, which is
      // the end a rigger measures from.
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      lastRotation = Math.round((startRotation + angle) % 360);
      onRotate(run.id, lastRotation, false);
    };

    const finish = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      // One history entry for the whole gesture, and none at all for a click
      // that never moved anything.
      if (!moved) return;
      if (mode === 'move') onMove(run.id, lastPosition, true);
      else onRotate(run.id, lastRotation, true);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  return (
    <g className="truss-layer">
      {runs.map((run) => {
        const length = run.lengthMm !== undefined ? run.lengthMm * unitsPerMm : FALLBACK_LENGTH_UNITS;
        const width = run.widthMm !== undefined ? run.widthMm * unitsPerMm : FALLBACK_WIDTH_UNITS;
        const selected = selectedId === run.id;
        const stroke = run.overloaded ? overloadBeam : beam;

        return (
          <g
            key={run.id}
            transform={`translate(${run.x}, ${run.y}) rotate(${run.rotation})`}
            className={isInteractive ? 'cursor-move' : undefined}
            onPointerDown={(e) => startDrag(run, 'move', e)}
          >
            {/* The bay: two chords and the diagonal lacing between them, which
                is what makes a truss read as a truss rather than a wall. */}
            <rect
              x={0}
              y={-width / 2}
              width={length}
              height={width}
              fill={isLight ? '#f8fafc' : '#0f172a'}
              fillOpacity={0.85}
              stroke={stroke}
              strokeWidth={selected ? 2 : 1.25}
            />
            {Array.from({ length: Math.max(1, Math.round(length / (width * 1.5))) }).map((_, i, all) => {
              const step = length / all.length;
              const x1 = i * step;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={-width / 2}
                  x2={x1 + step}
                  y2={width / 2}
                  stroke={stroke}
                  strokeWidth={0.75}
                  opacity={0.65}
                />
              );
            })}

            {/* Hang points, at their measured position along the run. */}
            {run.hangPointsMm.map((positionMm, index) => (
              <circle
                key={index}
                cx={positionMm * unitsPerMm}
                cy={0}
                r={Math.max(2, width * 0.22)}
                fill={stroke}
              />
            ))}

            <text
              x={length / 2}
              y={-width / 2 - 4}
              textAnchor="middle"
              fontSize={11}
              fill={stroke}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {run.label}
              {run.lengthMm === undefined ? ' · length unknown' : ''}
            </text>

            {selected && isInteractive && (
              <circle
                cx={length + 14}
                cy={0}
                r={5}
                fill="#0ea5e9"
                stroke="#fff"
                strokeWidth={1.5}
                className="cursor-grab"
                onPointerDown={(e) => startDrag(run, 'rotate', e)}
              />
            )}
          </g>
        );
      })}
    </g>
  );
};

/**
 * Memoised for the same reason as every other layer: the canvas re-renders on
 * pointer move, and a rig of twenty runs should not be redrawn each time.
 */
export const TrussLayer = React.memo(TrussLayerImpl);
TrussLayerImpl.displayName = 'TrussLayer';
