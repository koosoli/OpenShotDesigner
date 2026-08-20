import React from 'react';
import { CableElement } from '../../types';
import { getDistance } from '../../utils/geometry';
import { CABLE_TYPES } from '../../constants/presets';
import type { DisplaySettings } from '../../context/FloorPlanContext';

interface CableLayerProps {
  cables: CableElement[];
  selectedIds: string[];
  onSelect: (id: string, e: React.PointerEvent) => void;
  onDoubleClick?: (id: string, e: React.MouseEvent) => void;
  pixelsPerUnit?: number;
  displaySettings: DisplaySettings;
  /** Drag a cable routing handle to reroute the run. */
  onWaypointDragStart?: (cableId: string, pointId: string, e: React.PointerEvent) => void;
  /** Insert a routing point at the given segment (index among segments). */
  onAddWaypoint?: (cableId: string, segmentIndex: number) => void;
}

interface CableSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  d: number;
  angle: number;
}

const buildSegments = (cable: CableElement) => {
  const x1 = cable.x;
  const y1 = cable.y;
  const x2 = cable.x2 ?? cable.x + 150;
  const y2 = cable.y2 ?? cable.y;
  const pts = [
    { x: x1, y: y1 },
    ...(cable.path || []).map((p) => ({ x: p.x, y: p.y })),
    { x: x2, y: y2 },
  ];
  const segs: CableSeg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    segs.push({
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      d: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    });
  }
  return { pts, segs, totalLen: segs.reduce((sum, s) => sum + s.d, 0) };
};

export const CableLayer: React.FC<CableLayerProps> = ({
  cables,
  selectedIds,
  onSelect,
  onDoubleClick,
  pixelsPerUnit = 30,
  displaySettings,
  onWaypointDragStart,
  onAddWaypoint,
}) => {
  const showCableLabel = displaySettings.showLabels && displaySettings.showCableLabels !== false;
  const labelScale = displaySettings.labelScale ?? 1;
  const masterLabelOpacity = displaySettings.labelOpacity ?? 1;
  const cableLabelOpacity = masterLabelOpacity * (displaySettings.labelCategoryOpacity?.cables ?? 1);

  if (!cables.length) return null;

  return (
    <g className="cable-layer">
      {cables.map((cable) => {
        const isSelected = selectedIds.includes(cable.id);
        const cableInfo = CABLE_TYPES.find((c) => c.type === cable.cableType);
        const color = isSelected ? '#38bdf8' : cable.color || cableInfo?.color || '#94a3b8';
        const sw = cable.strokeWidth ?? 3.5;
        const { pts, segs, totalLen } = buildSegments(cable);
        const hasPath = (cable.path || []).length > 0;
        const lengthM = Math.round((totalLen / pixelsPerUnit) * 10) / 10;
        const polylinePts = pts.map((p) => `${p.x},${p.y}`).join(' ');
        const firstAngle = segs[0]?.angle ?? 0;
        const lastAngle = segs[segs.length - 1]?.angle ?? 0;
        const connSize = Math.max(6, sw + 3.5);

        // Label sits at the point halfway along the total path length, rotated
        // to follow the tangent of whatever segment contains it.
        let labelX = (cable.x + (cable.x2 ?? cable.x + 150)) / 2;
        let labelY = (cable.y + (cable.y2 ?? cable.y)) / 2;
        let labelAngle = firstAngle;
        if (totalLen > 0) {
          const half = totalLen / 2;
          let acc = 0;
          for (const s of segs) {
            if (acc + s.d >= half || s === segs[segs.length - 1]) {
              const t = s.d > 0 ? (half - acc) / s.d : 0.5;
              labelX = s.x1 + (s.x2 - s.x1) * t;
              labelY = s.y1 + (s.y2 - s.y1) * t;
              labelAngle = s.angle;
              break;
            }
            acc += s.d;
          }
        }
        const labelRot = (labelAngle * 180) / Math.PI;

        return (
          <g
            key={cable.id}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(cable.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(cable.id, e);
            }}
          >
            {/* Cable run */}
            {hasPath ? (
              <polyline
                points={polylinePts}
                fill="none"
                stroke={color}
                strokeWidth={sw}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <line
                x1={cable.x}
                y1={cable.y}
                x2={cable.x2 ?? cable.x + 150}
                y2={cable.y2 ?? cable.y}
                stroke={color}
                strokeWidth={sw}
                strokeLinecap="round"
              />
            )}

            {/* Connector blocks at each end */}
            <g transform={`translate(${pts[0].x}, ${pts[0].y}) rotate(${(firstAngle * 180) / Math.PI})`}>
              <rect x={-connSize / 2} y={-connSize / 2} width={connSize} height={connSize} rx={1.5} fill={color} />
            </g>
            <g transform={`translate(${pts[pts.length - 1].x}, ${pts[pts.length - 1].y}) rotate(${(lastAngle * 180) / Math.PI})`}>
              <rect x={-connSize / 2} y={-connSize / 2} width={connSize} height={connSize} rx={1.5} fill={color} />
            </g>

            {/* Routing handles (selected only) */}
            {isSelected &&
              (cable.path || []).map((p, idx) => (
                <g
                  key={p.id}
                  className="cursor-move"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onWaypointDragStart?.(cable.id, p.id, e);
                  }}
                >
                  <circle cx={p.x} cy={p.y} r={7} fill="#f97316" stroke="#0f172a" strokeWidth={1.5} className="drop-shadow" />
                  <circle cx={p.x} cy={p.y} r={2.5} fill="#ffffff" />
                  {idx === 0 && (
                    <text
                      x={p.x + 10}
                      y={p.y - 6}
                      fontSize={9}
                      fontWeight="bold"
                      fill="#f97316"
                      className="select-none pointer-events-none"
                    >
                      drag to route
                    </text>
                  )}
                </g>
              ))}

            {/* "+" insert handles on each segment (selected only) */}
            {isSelected &&
              segs.map((s, idx) => {
                const mx = (s.x1 + s.x2) / 2;
                const my = (s.y1 + s.y2) / 2;
                return (
                  <g
                    key={`add-${idx}`}
                    className="cursor-pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onAddWaypoint?.(cable.id, idx);
                    }}
                  >
                    <circle cx={mx} cy={my} r={7} fill="rgba(15,23,42,0.55)" stroke="#38bdf8" strokeWidth={1.2} />
                    <text
                      x={mx}
                      y={my + 3.5}
                      fontSize={11}
                      fontWeight="bold"
                      fill="#38bdf8"
                      textAnchor="middle"
                      className="select-none pointer-events-none"
                    >
                      +
                    </text>
                  </g>
                );
              })}

            {/* Cable label: shortLabel · length, with from → to */}
            {showCableLabel && cable.showLabel !== false && (
              <g transform={`translate(${labelX}, ${labelY}) rotate(${labelRot}) scale(${labelScale})`} opacity={cableLabelOpacity}>
                <rect
                  x={-52}
                  y={-19}
                  width={104}
                  height={38}
                  fill="#0f172a"
                  stroke={color}
                  strokeWidth={1.5}
                  rx={5}
                  className="drop-shadow-md"
                />
                <text
                  x={0}
                  y={-4}
                  fill={displaySettings.cableLabelColor ?? color}
                  fontSize="10.5"
                  textAnchor="middle"
                  fontWeight="bold"
                  className="select-none font-mono"
                >
                  {cableInfo?.shortLabel || 'CABLE'} · {lengthM}m
                </text>
                <text x={0} y={10} fill="#cbd5e1" fontSize="8.5" textAnchor="middle" className="select-none">
                  {cable.fromLabel && cable.toLabel ? `${cable.fromLabel} → ${cable.toLabel}` : ''}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};

export { getDistance };