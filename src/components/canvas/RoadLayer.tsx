import React from 'react';
import type { RoadElement } from '../../types';
import type { DisplaySettings } from '../../context/FloorPlanContext';

/**
 * Streets, roads, paths and driveways (plan §6, exterior plans).
 *
 * Geometry is deliberately the dolly track's: two endpoints plus an optional
 * quadratic curve, so endpoint dragging, curve handles, group transforms and
 * snapping all behave the same way. What differs is that a road has real
 * WIDTH — a carriageway with kerbs, lane markings and optional pavements —
 * because on an exterior plan the road is the thing everything else is placed
 * relative to, not an annotation line.
 */

interface RoadLayerProps {
  roads: RoadElement[];
  selectedIds: string[];
  onSelect: (id: string, e: React.PointerEvent) => void;
  onDoubleClick?: (id: string, e: React.MouseEvent) => void;
  displaySettings: DisplaySettings;
}

/** Fill and kerb colours per surface. Explicit table, never derived from a name. */
const SURFACE_STYLE: Record<
  NonNullable<RoadElement['surface']>,
  { fill: string; kerb: string; texture?: 'gravel' | 'cobble' | 'rail' }
> = {
  asphalt: { fill: '#3f3f46', kerb: '#a1a1aa' },
  concrete: { fill: '#71717a', kerb: '#d4d4d8' },
  gravel: { fill: '#57534e', kerb: '#a8a29e', texture: 'gravel' },
  cobble: { fill: '#52525b', kerb: '#a1a1aa', texture: 'cobble' },
  dirt: { fill: '#6b5b44', kerb: '#a8a29e', texture: 'gravel' },
  rail: { fill: '#44403c', kerb: '#78716c', texture: 'rail' },
};

const DEFAULT_SURFACE: NonNullable<RoadElement['surface']> = 'asphalt';

/** Samples along the road centre line, with the unit normal at each sample. */
interface CentreSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * Sample the centre line. A straight road needs two samples; a curved one is
 * walked as a quadratic Bezier so the kerbs stay parallel around the bend.
 */
export const sampleRoadCentre = (road: RoadElement): CentreSample[] => {
  const x1 = road.x;
  const y1 = road.y;
  const x2 = road.x2 ?? road.x + 240;
  const y2 = road.y2 ?? road.y;
  const length = Math.max(1, Math.hypot(x2 - x1, y2 - y1));

  if (!road.isCurved) {
    const nx = -(y2 - y1) / length;
    const ny = (x2 - x1) / length;
    return [
      { x: x1, y: y1, nx, ny },
      { x: x2, y: y2, nx, ny },
    ];
  }

  const offset = road.curveOffset || 60;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const ctrlX = midX + (-(y2 - y1) / length) * offset;
  const ctrlY = midY + ((x2 - x1) / length) * offset;

  const steps = Math.max(6, Math.min(48, Math.floor(length / 20)));
  const samples: CentreSample[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * ctrlX + t * t * x2;
    const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ctrlY + t * t * y2;
    const tx = 2 * (1 - t) * (ctrlX - x1) + 2 * t * (x2 - ctrlX);
    const ty = 2 * (1 - t) * (ctrlY - y1) + 2 * t * (y2 - ctrlY);
    const tLen = Math.hypot(tx, ty) || 1;
    samples.push({ x: px, y: py, nx: -ty / tLen, ny: tx / tLen });
  }
  return samples;
};

/** Closed polygon `offset` px either side of the centre line. */
const bandPath = (samples: CentreSample[], inner: number, outer: number): string => {
  const forward = samples.map(
    (p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x + p.nx * outer).toFixed(1)} ${(p.y + p.ny * outer).toFixed(1)}`,
  );
  const back = [...samples]
    .reverse()
    .map((p) => `L ${(p.x + p.nx * inner).toFixed(1)} ${(p.y + p.ny * inner).toFixed(1)}`);
  return [...forward, ...back, 'Z'].join(' ');
};

/** Open path along the centre line, offset by `offset` px. */
const linePath = (samples: CentreSample[], offset = 0): string =>
  samples
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x + p.nx * offset).toFixed(1)} ${(p.y + p.ny * offset).toFixed(1)}`,
    )
    .join(' ');

const RoadLayerImpl: React.FC<RoadLayerProps> = ({
  roads,
  selectedIds,
  onSelect,
  onDoubleClick,
  displaySettings,
}) => {
  const showLabels = displaySettings.showLabels;

  return (
    <g className="road-layer">
      {roads.map((road) => {
        const isSelected = selectedIds.includes(road.id);
        const samples = sampleRoadCentre(road);
        const width = Math.max(10, road.width || 120);
        const half = width / 2;
        const style = SURFACE_STYLE[road.surface ?? DEFAULT_SURFACE];
        const fill = road.color || style.fill;
        const lanes = Math.max(1, Math.round(road.lanes ?? 2));
        const marking = road.marking ?? 'dashed';
        const opacity = (displaySettings.categoryOpacity?.props ?? 1.0) * (road.opacity ?? 1.0);
        const pavement = road.sidewalks
          ? Math.max(6, road.sidewalkWidth ?? Math.round(width * 0.18))
          : 0;

        // Lane dividers sit between lanes, never on the kerbs themselves.
        const dividers: number[] = [];
        for (let i = 1; i < lanes; i++) dividers.push(-half + (width / lanes) * i);

        return (
          <g
            key={road.id}
            opacity={opacity}
            className="cursor-pointer road-item"
            onPointerDown={(e) => onSelect(road.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(road.id, e);
            }}
          >
            {/* Pavements / kerbs outside the carriageway */}
            {pavement > 0 && (
              <>
                <path d={bandPath(samples, half, half + pavement)} fill="#d4d4d8" stroke={style.kerb} strokeWidth={1} />
                <path d={bandPath(samples, -half - pavement, -half)} fill="#d4d4d8" stroke={style.kerb} strokeWidth={1} />
              </>
            )}

            {/* Carriageway */}
            <path d={bandPath(samples, -half, half)} fill={fill} stroke={style.kerb} strokeWidth={isSelected ? 2.5 : 1.5} />

            {/* Surface texture: sleepers for rail, speckle rows for gravel/cobble */}
            {style.texture === 'rail' &&
              samples.map((p, i) =>
                i % 2 === 0 ? (
                  <line
                    key={`sleeper-${i}`}
                    x1={p.x - p.nx * half * 0.8}
                    y1={p.y - p.ny * half * 0.8}
                    x2={p.x + p.nx * half * 0.8}
                    y2={p.y + p.ny * half * 0.8}
                    stroke="#78716c"
                    strokeWidth={3}
                  />
                ) : null,
              )}
            {style.texture === 'rail' && (
              <>
                <path d={linePath(samples, -half * 0.45)} fill="none" stroke="#a8a29e" strokeWidth={2.5} />
                <path d={linePath(samples, half * 0.45)} fill="none" stroke="#a8a29e" strokeWidth={2.5} />
              </>
            )}
            {(style.texture === 'gravel' || style.texture === 'cobble') && (
              <path
                d={linePath(samples)}
                fill="none"
                stroke={style.kerb}
                strokeWidth={Math.max(2, half * 0.9)}
                strokeOpacity={0.18}
                strokeDasharray={style.texture === 'cobble' ? '3 5' : '1 6'}
              />
            )}

            {/* Lane dividers */}
            {dividers.map((offset, i) => (
              <path
                key={`lane-${i}`}
                d={linePath(samples, offset)}
                fill="none"
                stroke="#e4e4e7"
                strokeWidth={1.5}
                strokeDasharray="10 12"
                strokeOpacity={0.55}
              />
            ))}

            {/* Centre-line marking */}
            {marking === 'dashed' && (
              <path d={linePath(samples)} fill="none" stroke="#fde047" strokeWidth={2.5} strokeDasharray="16 14" />
            )}
            {marking === 'solid' && (
              <path d={linePath(samples)} fill="none" stroke="#fde047" strokeWidth={2.5} />
            )}
            {marking === 'double' && (
              <>
                <path d={linePath(samples, -3)} fill="none" stroke="#fde047" strokeWidth={2} />
                <path d={linePath(samples, 3)} fill="none" stroke="#fde047" strokeWidth={2} />
              </>
            )}
            {marking === 'crosswalk' &&
              samples.map((p, i) =>
                i % 2 === 0 ? (
                  <line
                    key={`zebra-${i}`}
                    x1={p.x - p.nx * half * 0.85}
                    y1={p.y - p.ny * half * 0.85}
                    x2={p.x + p.nx * half * 0.85}
                    y2={p.y + p.ny * half * 0.85}
                    stroke="#f4f4f5"
                    strokeWidth={Math.max(4, width * 0.09)}
                    strokeOpacity={0.9}
                  />
                ) : null,
              )}

            {/* Selection outline */}
            {isSelected && (
              <path
                d={bandPath(samples, -half - pavement - 4, half + pavement + 4)}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )}

            {/* Street name, laid along the run at its midpoint */}
            {showLabels && (road.label || road.name) && (() => {
              const mid = samples[Math.floor(samples.length / 2)];
              const angle = (Math.atan2(-mid.nx, mid.ny) * 180) / Math.PI;
              return (
                <text
                  x={mid.x}
                  y={mid.y}
                  transform={`rotate(${angle} ${mid.x} ${mid.y})`}
                  fill="#f8fafc"
                  stroke="rgba(15,23,42,0.85)"
                  strokeWidth={2.5}
                  paintOrder="stroke fill"
                  fontSize={Math.max(9, Math.min(16, width * 0.22))}
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  letterSpacing="1"
                  className="select-none font-sans pointer-events-none uppercase"
                >
                  {road.label || road.name}
                </text>
              );
            })()}
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
export const RoadLayer = React.memo(RoadLayerImpl);
RoadLayerImpl.displayName = 'RoadLayer';
