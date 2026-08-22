import React, { useState } from 'react';
import { ArrowElement, MeasurementElement, PropElement, TextElement, TrackElement, Waypoint } from '../../types';
import { getDistance, getInterpolatedPositionAndRotation, getSmoothSplinePath } from '../../utils/geometry';
import type { DisplaySettings } from '../../context/FloorPlanContext';
import { ArrowGlyph } from './ArrowGlyph';

interface PropsLayerProps {
  propsList: PropElement[];
  tracks: TrackElement[];
  measurements: MeasurementElement[];
  arrows: ArrowElement[];
  texts: TextElement[];
  selectedIds: string[];
  onSelect: (id: string, e: React.PointerEvent) => void;
  onDoubleClick?: (id: string, e: React.MouseEvent) => void;
  onUpdateText?: (id: string, newText: string) => void;
  pixelsPerUnit?: number;
  displaySettings: DisplaySettings;
  /** Playback beat used to animate prop movement along its waypoint path. */
  currentBeat?: number;
  onAddWaypoint?: (propId: string) => void;
  onWaypointDragStart?: (elementId: string, waypointId: string, e: React.PointerEvent) => void;
  onWaypointRotateStart?: (elementId: string, waypointId: string, e: React.PointerEvent) => void;
}

export const PropsLayer: React.FC<PropsLayerProps> = ({
  propsList,
  tracks,
  measurements,
  arrows,
  texts,
  selectedIds,
  onSelect,
  onDoubleClick,
  onUpdateText,
  pixelsPerUnit = 30,
  displaySettings,
  currentBeat = 1,
  onAddWaypoint,
  onWaypointDragStart,
  onWaypointRotateStart,
}) => {
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editTextValue, setEditTextValue] = useState<string>('');

  const showTrackLabel = displaySettings.showLabels && displaySettings.showTrackLabels;
  const showPropLabel = displaySettings.showLabels && displaySettings.showPropLabels;
  const showMeasurementLabel = displaySettings.showLabels && displaySettings.showMeasurementLabels;
  const baseLabelScale = displaySettings.labelScale ?? 1;
const catLabelScale = displaySettings.labelCategoryScale ?? {};
const propLabelScale = baseLabelScale * (catLabelScale.props ?? 1);
const trackLabelScale = baseLabelScale * (catLabelScale.tracks ?? 1);
const measurementLabelScale = baseLabelScale * (catLabelScale.measurements ?? 1);
  const masterLabelOpacity = displaySettings.labelOpacity ?? 1;
  const propLabelOpacity = masterLabelOpacity * (displaySettings.labelCategoryOpacity?.props ?? 1);
  const trackLabelOpacity = masterLabelOpacity * (displaySettings.labelCategoryOpacity?.tracks ?? 1);
  const measurementLabelOpacity = masterLabelOpacity * (displaySettings.labelCategoryOpacity?.measurements ?? 1);

  const handleStartEditText = (txt: TextElement) => {
    setEditingTextId(txt.id);
    setEditTextValue(txt.text);
  };

  const handleFinishEditText = (id: string) => {
    if (onUpdateText && editTextValue.trim()) {
      onUpdateText(id, editTextValue);
    }
    setEditingTextId(null);
  };

  return (
    <g className="props-layer">
      {/* 1. Dolly Tracks (Straight & Curved Support) */}
      {tracks.map((track) => {
        const isSelected = selectedIds.includes(track.id);
        const x1 = track.x;
        const y1 = track.y;
        const x2 = track.x2 ?? track.x + 240;
        const y2 = track.y2 ?? track.y;

        const dist = Math.max(20, getDistance({ x: x1, y: y1 }, { x: x2, y: y2 }));
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        const isCurved = !!track.isCurved;
        const curveOffset = track.curveOffset || 60;

        if (isCurved) {
          // Curved dolly track arc
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const normalX = -(y2 - y1) / dist;
          const normalY = (x2 - x1) / dist;
          const ctrlX = midX + normalX * curveOffset;
          const ctrlY = midY + normalY * curveOffset;

          const steps = Math.max(4, Math.floor(dist / 30));
          const sleeperPoints: { x: number; y: number; nx: number; ny: number }[] = [];

          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            // Quadratic Bezier point
            const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * ctrlX + t * t * x2;
            const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ctrlY + t * t * y2;

            // Tangent & Normal
            const tx = 2 * (1 - t) * (ctrlX - x1) + 2 * t * (x2 - ctrlX);
            const ty = 2 * (1 - t) * (ctrlY - y1) + 2 * t * (y2 - ctrlY);
            const tLen = Math.hypot(tx, ty) || 1;
            const nx = -ty / tLen;
            const ny = tx / tLen;

            sleeperPoints.push({ x: px, y: py, nx, ny });
          }

          // Rail paths
          const innerRailD = sleeperPoints
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x - p.nx * 12).toFixed(1)} ${(p.y - p.ny * 12).toFixed(1)}`)
            .join(' ');
          const outerRailD = sleeperPoints
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x + p.nx * 12).toFixed(1)} ${(p.y + p.ny * 12).toFixed(1)}`)
            .join(' ');

          return (
            <g
              key={track.id}
              className="cursor-pointer"
              onPointerDown={(e) => onSelect(track.id, e)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick?.(track.id, e);
              }}
            >
              {/* Rails */}
              <path d={innerRailD} fill="none" stroke={isSelected ? '#38bdf8' : '#94a3b8'} strokeWidth={3} strokeLinecap="round" />
              <path d={outerRailD} fill="none" stroke={isSelected ? '#38bdf8' : '#94a3b8'} strokeWidth={3} strokeLinecap="round" />

              {/* Sleepers along curve */}
              {sleeperPoints.map((p, i) => (
                <line
                  key={i}
                  x1={p.x - p.nx * 16}
                  y1={p.y - p.ny * 16}
                  x2={p.x + p.nx * 16}
                  y2={p.y + p.ny * 16}
                  stroke={isSelected ? '#38bdf8' : '#64748b'}
                  strokeWidth={2.5}
                />
              ))}

              {/* Label */}
              {showTrackLabel && (
                <g transform={`translate(${ctrlX}, ${ctrlY - 14}) scale(${trackLabelScale})`} opacity={trackLabelOpacity}>
                  <rect x={-45} y={-9} width={90} height={18} rx={3} fill="#0f172a" stroke="#38bdf8" strokeWidth={1} />
                  <text x={0} y={3.5} fill={displaySettings.trackLabelColor ?? '#38bdf8'} fontSize="9" fontWeight="bold" textAnchor="middle" className="select-none font-mono">
                    CURVED TRACK
                  </text>
                </g>
              )}
            </g>
          );
        }

        // Straight track
        const sleeperCount = Math.max(2, Math.floor(dist / 25));

        return (
          <g
            key={track.id}
            transform={`translate(${x1}, ${y1}) rotate(${angle})`}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(track.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(track.id, e);
            }}
          >
            {/* Rails */}
            <line x1={0} y1={-12} x2={dist} y2={-12} stroke={isSelected ? '#38bdf8' : '#94a3b8'} strokeWidth={3} strokeLinecap="round" />
            <line x1={0} y1={12} x2={dist} y2={12} stroke={isSelected ? '#38bdf8' : '#94a3b8'} strokeWidth={3} strokeLinecap="round" />

            {/* Sleepers */}
            {Array.from({ length: sleeperCount + 1 }).map((_, i) => {
              const sx = i * (dist / sleeperCount);
              return (
                <line
                  key={i}
                  x1={sx}
                  y1={-16}
                  x2={sx}
                  y2={16}
                  stroke={isSelected ? '#38bdf8' : '#64748b'}
                  strokeWidth={2.5}
                />
              );
            })}

            {/* Label */}
            {showTrackLabel && (
              <text
                x={dist / 2}
                y={-18}
                fill={displaySettings.trackLabelColor ?? '#38bdf8'}
                fontSize="10"
                textAnchor="middle"
                opacity={trackLabelOpacity}
                transform={`scale(${trackLabelScale})`}
                className="select-none font-mono"
              >
                DOLLY TRACK ({Math.round(dist / 25)}ft)
              </text>
            )}
          </g>
        );
      })}

      {/* 2. Props & Set Dressing Catalog */}
      {propsList.map((prop) => {
        const isSelected = selectedIds.includes(prop.id);
        const w = prop.width || 80;
        const h = prop.height || 60;
        const color = prop.color || '#475569';
        const propOpacity = (displaySettings.categoryOpacity?.props ?? 1.0) * (prop.opacity ?? 1.0);

        // Waypoint movement path (cars / props that move during a shot)
        const waypoints: Waypoint[] = prop.path || [];
        const hasPath = waypoints.length > 0;
        const showWaypoints = displaySettings.showWaypoints !== false;
        const dynamicState =
          hasPath && currentBeat > 1
            ? getInterpolatedPositionAndRotation(
                { x: prop.x, y: prop.y },
                prop.rotation,
                prop.path || [],
                currentBeat
              )
            : { position: { x: prop.x, y: prop.y }, rotation: prop.rotation };
        const position = dynamicState.position;
        const rotation = dynamicState.rotation;
        const trajectoryPoints = [{ x: prop.x, y: prop.y }, ...waypoints.map((wp) => ({ x: wp.x, y: wp.y }))];
        const splinePathString = getSmoothSplinePath(trajectoryPoints);

        return (
          <g key={prop.id} className="prop-item">
            {/* Movement path trail + ghost footprints */}
            {hasPath && showWaypoints && (
              <g className="prop-path pointer-events-none">
                <path
                  d={splinePathString}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  strokeOpacity={0.6}
                />
                {waypoints.map((wp, i) => {
                  const wpRot = wp.rotation ?? prop.rotation;
                  return (
                    <g key={wp.id || i} transform={`translate(${wp.x}, ${wp.y}) rotate(${wpRot})`} opacity={0.35}>
                      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={1.5} rx={6} />
                    </g>
                  );
                })}
              </g>
            )}

          <g
            transform={`translate(${position.x}, ${position.y}) rotate(${rotation})`}
            opacity={propOpacity}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(prop.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(prop.id, e);
            }}
          >
            {/* Selection highlight border */}
            {isSelected && (
              <rect
                x={-w / 2 - 5}
                y={-h / 2 - 5}
                width={w + 10}
                height={h + 10}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="4 4"
                rx={6}
              />
            )}

            {/* Render prop shape according to propType */}
            {prop.propType === 'sofa' ? (
              <g>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} stroke="#1e293b" strokeWidth={2} rx={6} />
                <rect x={-w / 2 + 4} y={-h / 2 + 3} width={w - 8} height={12} fill="#1e293b" rx={3} />
                <rect x={-w / 2 + 3} y={-h / 2 + 3} width={12} height={h - 6} fill="#1e293b" rx={3} />
                <rect x={w / 2 - 15} y={-h / 2 + 3} width={12} height={h - 6} fill="#1e293b" rx={3} />
                {/* Cushion dividers */}
                <line x1={0} y1={-h / 2 + 15} x2={0} y2={h / 2 - 4} stroke="#1e293b" strokeWidth={1.5} />
              </g>
            ) : prop.propType === 'sofa_sectional' ? (
              <g>
                {/* L-Shape Sectional */}
                <path
                  d={`M ${-w / 2} ${-h / 2} L ${w / 2} ${-h / 2} L ${w / 2} ${-h / 2 + 45} L ${-w / 2 + 50} ${-h / 2 + 45} L ${-w / 2 + 50} ${h / 2} L ${-w / 2} ${h / 2} Z`}
                  fill={color}
                  stroke="#1e293b"
                  strokeWidth={2}
                />
                {/* Backrest rim */}
                <path
                  d={`M ${-w / 2 + 3} ${h / 2 - 3} L ${-w / 2 + 3} ${-h / 2 + 3} L ${w / 2 - 3} ${-h / 2 + 3}`}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth={6}
                  strokeLinecap="round"
                />
              </g>
            ) : prop.propType === 'armchair' ? (
              <g>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} stroke="#1e293b" strokeWidth={2} rx={8} />
                <rect x={-w / 2 + 4} y={-h / 2 + 3} width={w - 8} height={10} fill="#1e293b" rx={3} />
                <rect x={-w / 2 + 3} y={-h / 2 + 3} width={10} height={h - 6} fill="#1e293b" rx={3} />
                <rect x={w / 2 - 13} y={-h / 2 + 3} width={10} height={h - 6} fill="#1e293b" rx={3} />
              </g>
            ) : prop.propType === 'chair' ? (
              <g className="prop-chair">
                {/* 4 Leg post ends */}
                <circle cx={-w * 0.36} cy={-h * 0.36} r={2.5} fill="#0f172a" />
                <circle cx={w * 0.36} cy={-h * 0.36} r={2.5} fill="#0f172a" />
                <circle cx={-w * 0.36} cy={h * 0.36} r={2.5} fill="#0f172a" />
                <circle cx={w * 0.36} cy={h * 0.36} r={2.5} fill="#0f172a" />
                {/* Padded Seat cushion */}
                <rect x={-w * 0.42} y={-h * 0.42} width={w * 0.84} height={h * 0.84} rx={6} fill={color} stroke="#1e293b" strokeWidth={1.5} />
                {/* Curved ergonomic backrest */}
                <path d={`M ${-w * 0.4} ${-h * 0.32} C ${-w * 0.2} ${-h * 0.48}, ${w * 0.2} ${-h * 0.48}, ${w * 0.4} ${-h * 0.32}`} fill="none" stroke="#0f172a" strokeWidth={4} strokeLinecap="round" />
              </g>
            ) : prop.propType === 'bar_stool' ? (
              <g className="prop-bar-stool">
                {/* Footrest Ring Base */}
                <circle cx={0} cy={0} r={w * 0.46} fill="none" stroke="#94a3b8" strokeWidth={2} />
                {/* 4 Radial Base Spokes */}
                <line x1={-w * 0.46} y1={0} x2={w * 0.46} y2={0} stroke="#64748b" strokeWidth={1.5} />
                <line x1={0} y1={-w * 0.46} x2={0} y2={w * 0.46} stroke="#64748b" strokeWidth={1.5} />
                {/* Padded Round Seat Cushion */}
                <circle cx={0} cy={0} r={w * 0.36} fill={color} stroke="#0f172a" strokeWidth={2} />
                {/* Cushion Stitching Rim & Center Tuft */}
                <circle cx={0} cy={0} r={w * 0.24} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3 2" />
                <circle cx={0} cy={0} r={3} fill="#0f172a" />
                {/* Low curved backrest arch */}
                <path d={`M ${-w * 0.3} ${-w * 0.12} C ${-w * 0.15} ${-w * 0.36}, ${w * 0.15} ${-w * 0.36}, ${w * 0.3} ${-w * 0.12}`} fill="none" stroke="#0f172a" strokeWidth={3} strokeLinecap="round" />
              </g>
            ) : prop.propType === 'bar_counter' ? (
              <g className="prop-bar-counter">
                {/* Main Counter Surface */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={4} fill={color} stroke="#0f172a" strokeWidth={2} />
                {/* Front Customer Overhang / Drink Rail */}
                <rect x={-w / 2 + 2} y={-h / 2 + 2} width={w - 4} height={h * 0.32} rx={2} fill="rgba(255,255,255,0.12)" stroke="#0f172a" strokeWidth={1} />
                {/* Brass/Chrome Customer Footrest Line */}
                <line x1={-w / 2 + 6} y1={-h / 2 - 4} x2={w / 2 - 6} y2={-h / 2 - 4} stroke="#eab308" strokeWidth={2.5} strokeLinecap="round" />
                {/* Bartender work area: Speed rail, sink & ice bin */}
                <rect x={-w * 0.35} y={h * 0.05} width={w * 0.22} height={h * 0.35} rx={2} fill="#334155" stroke="#0f172a" strokeWidth={1} />
                <circle cx={-w * 0.24} cy={h * 0.22} r={3} fill="#0f172a" />
                <rect x={w * 0.05} y={h * 0.05} width={w * 0.3} height={h * 0.35} rx={2} fill="#0f172a" stroke="#475569" strokeWidth={1} />
              </g>
            ) : prop.propType === 'table_round' ? (
              <g className="prop-round-dining-set">
                {/* Four chairs are part of the asset footprint and rotate with the table. */}
                {[
                  { x: 0, y: -h * 0.4, rotation: 0 },
                  { x: w * 0.4, y: 0, rotation: 90 },
                  { x: 0, y: h * 0.4, rotation: 180 },
                  { x: -w * 0.4, y: 0, rotation: 270 },
                ].map((chair, index) => (
                  <g key={index} transform={`translate(${chair.x} ${chair.y}) rotate(${chair.rotation})`}>
                    <rect
                      x={-w * 0.1}
                      y={-h * 0.075}
                      width={w * 0.2}
                      height={h * 0.15}
                      rx={Math.max(2, w * 0.025)}
                      fill="#475569"
                      stroke="#0f172a"
                      strokeWidth={1.5}
                    />
                    <path
                      d={`M ${-w * 0.1} ${-h * 0.075} Q 0 ${-h * 0.13} ${w * 0.1} ${-h * 0.075}`}
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                  </g>
                ))}
                {/* Round tabletop, inset so chairs remain readable at low zoom. */}
                <circle cx={0} cy={0} r={Math.min(w, h) * 0.29} fill={color} stroke="#1e293b" strokeWidth={2.5} />
                <circle cx={0} cy={0} r={Math.min(w, h) * 0.23} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
                <circle cx={0} cy={0} r={Math.max(3, Math.min(w, h) * 0.045)} fill="#422006" opacity={0.8} />
              </g>
            ) : prop.propType === 'circle' ? (
              <circle cx={0} cy={0} r={w / 2} fill={color} stroke="#1e293b" strokeWidth={2} />
            ) : prop.propType === 'table_coffee' ? (
              <g>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} stroke="#38bdf8" strokeWidth={1.5} rx={4} />
                <rect x={-w / 2 + 6} y={-h / 2 + 6} width={w - 12} height={h - 12} fill="#0f172a" fillOpacity={0.4} rx={2} />
              </g>
            ) : prop.propType === 'dining_set' ? (
              <g>
                {/* Center table */}
                <rect x={-w / 2 + 15} y={-h / 2 + 10} width={w - 30} height={h - 20} fill={color} stroke="#1e293b" strokeWidth={2} rx={3} />
                {/* Flanking chairs with curved backrests */}
                <rect x={-w / 2} y={-h / 4} width={12} height={h / 2} fill="#334155" stroke="#0f172a" strokeWidth={1} rx={3} />
                <rect x={w / 2 - 12} y={-h / 4} width={12} height={h / 2} fill="#334155" stroke="#0f172a" strokeWidth={1} rx={3} />
                <rect x={-w / 4} y={-h / 2} width={w / 2} height={10} fill="#334155" stroke="#0f172a" strokeWidth={1} rx={3} />
                <rect x={-w / 4} y={h / 2 - 10} width={w / 2} height={10} fill="#334155" stroke="#0f172a" strokeWidth={1} rx={3} />
              </g>
            ) : prop.propType === 'bed' || prop.propType === 'bed_king' ? (
              <g>
                {/* Bed frame */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} stroke="#1e293b" strokeWidth={2} rx={4} />
                {/* Pillows */}
                <rect x={-w / 2 + 6} y={-h / 2 + 6} width={w / 2 - 10} height={18} fill="#f8fafc" stroke="#94a3b8" rx={3} />
                <rect x={4} y={-h / 2 + 6} width={w / 2 - 10} height={18} fill="#f8fafc" stroke="#94a3b8" rx={3} />
                {/* Blanket fold */}
                <line x1={-w / 2 + 4} y1={-h / 2 + 32} x2={w / 2 - 4} y2={-h / 2 + 32} stroke="#1e293b" strokeWidth={2} strokeDasharray="4 2" />
              </g>
            ) : prop.propType === 'desk' ? (
              <g>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} stroke="#1e293b" strokeWidth={2} rx={4} />
                {/* Laptop/Monitor area */}
                <rect x={-14} y={-h / 2 + 6} width={28} height={10} fill="#0f172a" stroke="#64748b" rx={1} />
                <circle cx={0} cy={h / 2 - 10} r={6} fill="#334155" />
              </g>
            ) : prop.propType === 'tv' ? (
              <g>
                {/* Low stand */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#1e293b" stroke="#334155" rx={2} />
                {/* Screen bar */}
                <line x1={-w / 2 + 4} y1={0} x2={w / 2 - 4} y2={0} stroke="#38bdf8" strokeWidth={4} strokeLinecap="round" />
              </g>
            ) : prop.propType === 'director_chair' ? (
              <g className="prop-director-chair">
                {/* Scissor Cross-Legs */}
                <line x1={-w * 0.36} y1={-h * 0.36} x2={w * 0.36} y2={h * 0.36} stroke="#b45309" strokeWidth={2.5} strokeLinecap="round" />
                <line x1={-w * 0.36} y1={h * 0.36} x2={w * 0.36} y2={-h * 0.36} stroke="#b45309" strokeWidth={2.5} strokeLinecap="round" />
                {/* Stretched Canvas Seat */}
                <rect x={-w * 0.34} y={-h * 0.32} width={w * 0.68} height={h * 0.64} rx={2} fill="#1e293b" stroke="#0f172a" strokeWidth={1.5} />
                <line x1={-w * 0.34} y1={-h * 0.24} x2={w * 0.34} y2={-h * 0.24} stroke="#475569" strokeWidth={1} strokeDasharray="2 2" />
                <line x1={-w * 0.34} y1={h * 0.24} x2={w * 0.34} y2={h * 0.24} stroke="#475569" strokeWidth={1} strokeDasharray="2 2" />
                {/* Wooden Armrests (left & right) */}
                <rect x={-w * 0.44} y={-h * 0.38} width={6} height={h * 0.76} rx={2} fill="#d97706" stroke="#78350f" strokeWidth={1.2} />
                <rect x={w * 0.44 - 6} y={-h * 0.38} width={6} height={h * 0.76} rx={2} fill="#d97706" stroke="#78350f" strokeWidth={1.2} />
                {/* Stretched Canvas Backrest */}
                <rect x={-w * 0.36} y={-h * 0.46} width={w * 0.72} height={6} rx={1.5} fill="#0f172a" stroke="#475569" strokeWidth={1} />
              </g>
            ) : prop.propType === 'camera_cart' ? (
              <g className="prop-camera-cart">
                {/* 4 Large Pneumatic Caster Wheels */}
                <rect x={-w / 2 - 4} y={-h / 2 + 6} width={8} height={20} rx={3} fill="#0f172a" />
                <rect x={w / 2 - 4} y={-h / 2 + 6} width={8} height={20} rx={3} fill="#0f172a" />
                <rect x={-w / 2 - 4} y={h / 2 - 26} width={8} height={20} rx={3} fill="#0f172a" />
                <rect x={w / 2 - 4} y={h / 2 - 26} width={8} height={20} rx={3} fill="#0f172a" />
                {/* Aluminum Lower / Upper Deck */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={4} fill="#334155" stroke="#0f172a" strokeWidth={2} />
                <rect x={-w / 2 + 4} y={-h / 2 + 4} width={w - 8} height={h - 8} rx={2} fill="#1e293b" stroke="#64748b" strokeWidth={1} />
                {/* Equipment dividers */}
                <rect x={-w / 2 + 8} y={-h / 2 + 8} width={w * 0.44} height={h - 16} rx={2} fill="#0f172a" />
                <rect x={w * 0.04} y={-h / 2 + 8} width={w * 0.44} height={h - 16} rx={2} fill="#0f172a" />
                {/* Dual Push Handles (Front & Rear) */}
                <rect x={-w / 2 - 8} y={-h * 0.25} width={8} height={h * 0.5} rx={2} fill="#64748b" stroke="#0f172a" strokeWidth={1} />
                <rect x={w / 2} y={-h * 0.25} width={8} height={h * 0.5} rx={2} fill="#64748b" stroke="#0f172a" strokeWidth={1} />
              </g>
            ) : prop.propType === 'apple_box' ? (
              <g>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#b45309" stroke="#78350f" strokeWidth={2} rx={2} />
                <rect x={-6} y={-h / 2 + 4} width={12} height={4} fill="#78350f" rx={1} />
                <rect x={-6} y={h / 2 - 8} width={12} height={4} fill="#78350f" rx={1} />
              </g>
            ) : prop.propType === 'c_stand' ? (
              <g className="prop-c-stand">
                {/* 1. Medium Leg (Top-Left 135Â°) */}
                <path d="M 0 0 C -10 -12, -20 -22, -32 -16" fill="none" stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
                <rect x={-35} y={-18} width={6} height={4} rx={1} fill="#0f172a" />

                {/* 2. Small Low Leg (Bottom-Left 225Â°) */}
                <path d="M 0 0 C -10 12, -20 22, -32 16" fill="none" stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
                <rect x={-35} y={14} width={6} height={4} rx={1} fill="#0f172a" />

                {/* 3. Big High Leg (Front Load Leg extending 0Â° directly under the grip arm) */}
                <path d="M 0 0 C 12 -4, 24 -6, 36 -1" fill="none" stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
                <rect x={35} y={-3} width={5} height={4} rx={1} fill="#0f172a" />

                {/* Center Base Hub Casting & Spring-Loaded Riser Receiver */}
                <circle cx={0} cy={0} r={7} fill="#1e293b" stroke="#94a3b8" strokeWidth={2} />
                <circle cx={0} cy={0} r={3.5} fill="#475569" />

                {/* Center 2.5" Gobo Knuckle Head (Matthews Grip Head) */}
                <rect x={-5} y={-6} width={10} height={12} rx={2.5} fill="#0f172a" stroke="#94a3b8" strokeWidth={1.5} />
                {/* Ergonomic Aluminum T-Handle Brake Lever */}
                <line x1={-9} y1={0} x2={9} y2={0} stroke="#38bdf8" strokeWidth={2.5} strokeLinecap="round" />
                <circle cx={-9} cy={0} r={1.5} fill="#ffffff" />
                <circle cx={9} cy={0} r={1.5} fill="#ffffff" />

                {/* 40" Stainless Steel Solid Grip Arm */}
                <line x1={0} y1={0} x2={52} y2={0} stroke="#0f172a" strokeWidth={3.5} strokeLinecap="round" />
                <line x1={0} y1={0} x2={52} y2={0} stroke="#cbd5e1" strokeWidth={2} strokeLinecap="round" />
                <line x1={2} y1={-0.5} x2={50} y2={-0.5} stroke="#ffffff" strokeWidth={0.8} strokeLinecap="round" />

                {/* End 2.5" Grip Head Knuckle on Arm Tip */}
                <rect x={46} y={-5} width={8} height={10} rx={2} fill="#0f172a" stroke="#94a3b8" strokeWidth={1.5} />
                <line x1={50} y1={-7} x2={50} y2={7} stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" />
                {/* 5/8" Baby Pin Stud Tip */}
                <circle cx={55} cy={0} r={2} fill="#f59e0b" stroke="#0f172a" strokeWidth={0.6} />
              </g>
            ) : prop.propType === 'tripod' ? (
              <g className="prop-tripod-stand">
                {/* 3 Splayed Tubular Legs at 120Â° offsets */}
                <line x1={0} y1={0} x2={-24} y2={-16} stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
                <rect x={-27} y={-18} width={6} height={4} rx={1} fill="#0f172a" />
                <line x1={0} y1={0} x2={-24} y2={16} stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
                <rect x={-27} y={14} width={6} height={4} rx={1} fill="#0f172a" />
                <line x1={0} y1={0} x2={28} y2={0} stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
                <rect x={27} y={-2} width={4} height={4} rx={1} fill="#0f172a" />

                {/* Central Spreader Spider Braces */}
                <polygon points="-12,-8 -12,8 14,0" fill="none" stroke="#475569" strokeWidth={1.5} />

                {/* Center Riser Base Casting */}
                <circle cx={0} cy={0} r={7} fill="#1e293b" stroke="#cbd5e1" strokeWidth={2} />
                <line x1={-5} y1={0} x2={5} y2={0} stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" />
                <circle cx={0} cy={0} r={3} fill="#f59e0b" stroke="#0f172a" strokeWidth={0.8} />
              </g>
            ) : prop.propType === 'sound_boom' ? (
              <g className="prop-sound-boom-op">
                {/* Directional Supercardioid Sound Pickup Cone / Range Waves */}
                <path
                  d="M 62 -18 Q 80 0 62 18"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  strokeOpacity={0.65}
                />
                <path
                  d="M 74 -26 Q 98 0 74 26"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                />

                {/* 1. Telescopic Carbon-Fiber Boom Pole */}
                <line x1={-6} y1={-8} x2={56} y2={0} stroke="#1e293b" strokeWidth={3.5} strokeLinecap="round" />
                <line x1={-6} y1={-8} x2={56} y2={0} stroke="#475569" strokeWidth={1.5} strokeLinecap="round" />
                {/* Telescoping Section Knurled Collars */}
                <circle cx={14} cy={-5} r={2.5} fill="#f59e0b" />
                <circle cx={34} cy={-2.5} r={2.2} fill="#f59e0b" />

                {/* 2. Rycote Shockmount Cradle & Zeppelin Blimp / Deadcat Windshield */}
                <rect x={48} y={-3} width={8} height={6} rx={1} fill="#0f172a" stroke="#64748b" strokeWidth={0.75} />
                <line x1={52} y1={-6} x2={52} y2={6} stroke="#f59e0b" strokeWidth={1.5} strokeLinecap="round" />
                {/* Zeppelin Blimp Microphone Capsule */}
                <rect x={46} y={-7} width={24} height={14} rx={7} fill="#1e293b" stroke="#0f172a" strokeWidth={1.5} />
                {/* Windshield mesh / acoustic slots */}
                <line x1={51} y1={-5} x2={51} y2={5} stroke="#64748b" strokeWidth={1} />
                <line x1={57} y1={-6} x2={57} y2={6} stroke="#64748b" strokeWidth={1} />
                <line x1={63} y1={-5} x2={63} y2={5} stroke="#64748b" strokeWidth={1} />
                {/* Front dome tip */}
                <circle cx={70} cy={0} r={2} fill="#f59e0b" />

                {/* 3. Operator Torso / Shoulders */}
                <ellipse cx={-12} cy={0} rx={14} ry={20} fill={color} stroke="#0f172a" strokeWidth={2} />

                {/* 4. Audio Mixer Bag / Harness (Strapped across chest) */}
                <rect x={-2} y={-11} width={10} height={22} rx={2} fill="#0f172a" stroke="#475569" strokeWidth={1.2} />
                {/* Mixer LED VU meters / Potentiometers */}
                <rect x={0} y={-8} width={2} height={6} fill="#22c55e" />
                <rect x={0} y={2} width={2} height={6} fill="#22c55e" />
                <circle cx={5} cy={-5} r={1.5} fill="#f59e0b" />
                <circle cx={5} cy={0} r={1.5} fill="#94a3b8" />
                <circle cx={5} cy={5} r={1.5} fill="#f59e0b" />
                {/* Harness Straps */}
                <line x1={-18} y1={-10} x2={-2} y2={-7} stroke="#334155" strokeWidth={2} />
                <line x1={-18} y1={10} x2={-2} y2={7} stroke="#334155" strokeWidth={2} />

                {/* 5. Operator Arms reaching out gripping pole */}
                <path d="M -10 -16 C -2 -16, 6 -14, 14 -7" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
                <path d="M -10 16 C -2 16, 0 10, 6 0" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
                {/* Hands / Gloves gripping the pole */}
                <circle cx={14} cy={-7} r={3} fill="#fcd34d" stroke="#0f172a" strokeWidth={1} />
                <circle cx={6} cy={0} r={3} fill="#fcd34d" stroke="#0f172a" strokeWidth={1} />

                {/* 6. Operator Head & Audio Monitoring Headphones */}
                <circle cx={-12} cy={0} r={9} fill="#fcd34d" stroke="#0f172a" strokeWidth={1.5} />
                {/* Cap / Visor */}
                <path d="M -19 -5 C -19 -10, -5 -10, -5 -5 Z" fill="#1e293b" />
                {/* Headphone headband */}
                <path d="M -12 -11 C -6 -11, -6 11, -12 11" fill="none" stroke="#0f172a" strokeWidth={3} strokeLinecap="round" />
                {/* Over-ear headphone earcups (left & right) */}
                <rect x={-15} y={-12} width={6} height={4} rx={1.5} fill="#0284c7" stroke="#0f172a" strokeWidth={1} />
                <rect x={-15} y={8} width={6} height={4} rx={1.5} fill="#0284c7" stroke="#0f172a" strokeWidth={1} />
              </g>
            ) : prop.propType === 'green_screen' ? (
              <g>
                <rect x={-w / 2} y={-6} width={w} height={12} fill="#22c55e" stroke="#15803d" strokeWidth={2} rx={2} />
                <circle cx={-w / 2} cy={0} r={6} fill="#0f172a" stroke="#22c55e" strokeWidth={2} />
                <circle cx={w / 2} cy={0} r={6} fill="#0f172a" stroke="#22c55e" strokeWidth={2} />
              </g>
            ) : prop.propType === 'stairs' ? (
              <g>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#1e293b" stroke="#64748b" strokeWidth={2} rx={2} />
                {Array.from({ length: 6 }).map((_, i) => (
                  <line
                    key={i}
                    x1={-w / 2}
                    y1={-h / 2 + ((i + 1) * h) / 7}
                    x2={w / 2}
                    y2={-h / 2 + ((i + 1) * h) / 7}
                    stroke="#475569"
                    strokeWidth={1.5}
                  />
                ))}
                {/* Arrow pointing up */}
                <line x1={0} y1={h / 2 - 8} x2={0} y2={-h / 2 + 8} stroke="#38bdf8" strokeWidth={2} />
                <polygon points="-4,-h/2+14 0,-h/2+6 4,-h/2+14" fill="#38bdf8" />
              </g>
            ) : prop.propType === 'plant' ? (
              <g>
                <circle cx={0} cy={0} r={w / 2} fill="#166534" stroke="#14532d" strokeWidth={2} />
                <path d="M 0 0 C -8 -16, 8 -16, 0 0 C 16 -8, 16 8, 0 0 C 8 16, -8 16, 0 0 C -16 8, -16 -8, 0 0 Z" fill="#22c55e" />
              </g>
            ) : prop.propType === 'tree' ? (
              <g className="prop-scenic-tree">
                {/* Outer Canopy Foliage Spread */}
                <circle cx={0} cy={0} r={w * 0.48} fill="#15803d" fillOpacity={0.25} stroke="#166534" strokeWidth={1} strokeDasharray="4 3" />
                
                {/* Overlapping Organic Foliage Clusters */}
                <circle cx={-w * 0.22} cy={-h * 0.22} r={w * 0.24} fill="#16a34a" fillOpacity={0.85} stroke="#15803d" strokeWidth={1.5} />
                <circle cx={w * 0.22} cy={-h * 0.22} r={w * 0.24} fill="#15803d" fillOpacity={0.85} stroke="#166534" strokeWidth={1.5} />
                <circle cx={-w * 0.25} cy={h * 0.18} r={w * 0.22} fill="#15803d" fillOpacity={0.85} stroke="#166534" strokeWidth={1.5} />
                <circle cx={w * 0.22} cy={h * 0.2} r={w * 0.23} fill="#16a34a" fillOpacity={0.85} stroke="#15803d" strokeWidth={1.5} />
                <circle cx={0} cy={-h * 0.28} r={w * 0.2} fill="#22c55e" fillOpacity={0.85} />
                <circle cx={0} cy={h * 0.26} r={w * 0.2} fill="#15803d" fillOpacity={0.85} />
                
                {/* Center High-Density Foliage Crown */}
                <circle cx={0} cy={0} r={w * 0.3} fill="#14532d" stroke="#052e16" strokeWidth={2} />
                
                {/* Radiating Main Wooden Tree Branches */}
                <path d="M 0 0 L -18 -18 M 0 0 L 18 -18 M 0 0 L -20 16 M 0 0 L 20 16 M 0 0 L 0 -22 M 0 0 L 0 22" stroke="#78350f" strokeWidth={3} strokeLinecap="round" />
                <path d="M -18 -18 L -28 -24 M 18 -18 L 28 -24 M -20 16 L -28 22 M 20 16 L 28 22" stroke="#92400e" strokeWidth={1.8} strokeLinecap="round" />
                
                {/* Center Trunk Core */}
                <circle cx={0} cy={0} r={w * 0.1} fill="#78350f" stroke="#451a03" strokeWidth={2} />
                <circle cx={0} cy={0} r={w * 0.05} fill="#451a03" />
              </g>
            ) : prop.propType === 'car' || prop.propType === 'vehicle_suv' || prop.propType === 'vehicle_police' ? (
              <g className="prop-vehicle-4p" transform={`scale(${w / 180}, ${h / 360})`}>
                {/* Wheels / Tires (4 corners) */}
                <rect x={-90 - 3} y={-180 + 35} width={7} height={40} rx={3} fill="#0f172a" />
                <rect x={90 - 4} y={-180 + 35} width={7} height={40} rx={3} fill="#0f172a" />
                <rect x={-90 - 3} y={180 - 75} width={7} height={40} rx={3} fill="#0f172a" />
                <rect x={90 - 4} y={180 - 75} width={7} height={40} rx={3} fill="#0f172a" />

                {/* Side Mirrors */}
                <polygon points={`-90,${-180 + 82} ${-90 - 12},${-180 + 90} ${-90 - 12},${-180 + 104} -90,${-180 + 100}`} fill={color} stroke="#0f172a" strokeWidth={1.5} />
                <polygon points={`90,${-180 + 82} ${90 + 12},${-180 + 90} ${90 + 12},${-180 + 104} 90,${-180 + 100}`} fill={color} stroke="#0f172a" strokeWidth={1.5} />

                {/* Vehicle outer body chassis */}
                <rect x={-90} y={-180} width={180} height={360} fill={color} stroke="#0f172a" strokeWidth={2.5} rx={22} />

                {/* Hood feature lines & grille */}
                <path d="M -54 -170 L -46 -110 M 54 -170 L 46 -110" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />

                {/* 4-Actor Interior Passenger Cabin */}
                <rect x={-78} y={-102} width={156} height={194} rx={10} fill="#1e293b" stroke="#0f172a" strokeWidth={1.5} />

                {/* Front Windshield (curved tinted glass) */}
                <path
                  d="M -74 -104 L 74 -104 L 66 -78 L -66 -78 Z"
                  fill="#0284c7"
                  fillOpacity={0.4}
                  stroke="#38bdf8"
                  strokeWidth={1}
                />

                {/* Dashboard & Steering wheel (Front Left Driver seat) */}
                <rect x={-74} y={-86} width={148} height={10} rx={2} fill="#0f172a" />
                <circle cx={-43} cy={-72} r={11} fill="none" stroke="#94a3b8" strokeWidth={2.5} />

                {/* Center Console */}
                <rect x={-9} y={-70} width={18} height={136} rx={3} fill="#0f172a" />

                {/* 4 Dedicated Actor Bucket Seats (Spacious enough for 4 blocking actors) */}
                {/* 1. Driver Seat (Front Left) */}
                <g transform="translate(-43, -50)">
                  <rect x={-32} y={-16} width={64} height={38} rx={6} fill="#334155" stroke="#64748b" strokeWidth={1.5} />
                  <rect x={-21} y={-23} width={42} height={8} rx={2} fill="#475569" stroke="#64748b" strokeWidth={1} />
                </g>

                {/* 2. Front Passenger Seat (Front Right) */}
                <g transform="translate(43, -50)">
                  <rect x={-32} y={-16} width={64} height={38} rx={6} fill="#334155" stroke="#64748b" strokeWidth={1.5} />
                  <rect x={-21} y={-23} width={42} height={8} rx={2} fill="#475569" stroke="#64748b" strokeWidth={1} />
                </g>

                {/* 3. Rear Left Passenger Seat */}
                <g transform="translate(-43, 45)">
                  <rect x={-32} y={-16} width={64} height={38} rx={6} fill="#334155" stroke="#64748b" strokeWidth={1.5} />
                  <rect x={-21} y={-23} width={42} height={8} rx={2} fill="#475569" stroke="#64748b" strokeWidth={1} />
                </g>

                {/* 4. Rear Right Passenger Seat */}
                <g transform="translate(43, 45)">
                  <rect x={-32} y={-16} width={64} height={38} rx={6} fill="#334155" stroke="#64748b" strokeWidth={1.5} />
                  <rect x={-21} y={-23} width={42} height={8} rx={2} fill="#475569" stroke="#64748b" strokeWidth={1} />
                </g>

                {/* Rear Windshield */}
                <path
                  d="M -68 112 L 68 112 L 72 136 L -72 136 Z"
                  fill="#0284c7"
                  fillOpacity={0.35}
                  stroke="#38bdf8"
                  strokeWidth={1}
                />

                {/* Headlights (Front) */}
                <rect x={-78} y={-178} width={18} height={6} rx={2} fill="#fef08a" stroke="#eab308" strokeWidth={1} />
                <rect x={60} y={-178} width={18} height={6} rx={2} fill="#fef08a" stroke="#eab308" strokeWidth={1} />

                {/* Taillights (Rear) */}
                <rect x={-78} y={172} width={18} height={6} rx={2} fill="#ef4444" stroke="#b91c1c" strokeWidth={1} />
                <rect x={60} y={172} width={18} height={6} rx={2} fill="#ef4444" stroke="#b91c1c" strokeWidth={1} />

                {/* Police cruiser emergency lightbar */}
                {prop.propType === 'vehicle_police' && (
                  <g transform="translate(0, -10)">
                    <rect x={-28} y={-6} width={26} height={12} rx={2} fill="#ef4444" stroke="#0f172a" strokeWidth={1} />
                    <rect x={2} y={-6} width={26} height={12} rx={2} fill="#3b82f6" stroke="#0f172a" strokeWidth={1} />
                    <rect x={-3} y={-7} width={6} height={14} fill="#ffffff" />
                  </g>
                )}
              </g>
            ) : prop.propType === 'vehicle_truck' ? (
              <g className="prop-production-truck" transform={`scale(${w / 200}, ${h / 460})`}>
                {/* Front Wheels (Steer tires) */}
                <rect x={-104} y={-185} width={8} height={46} rx={3} fill="#0f172a" />
                <rect x={96} y={-185} width={8} height={46} rx={3} fill="#0f172a" />
                
                {/* Dual Rear Wheels (4 tires: 2 on each side) */}
                <rect x={-108} y={73} width={12} height={56} rx={3} fill="#0f172a" />
                <rect x={96} y={73} width={12} height={56} rx={3} fill="#0f172a" />
                
                {/* Heavy Front Bumper & Tow Hooks */}
                <rect x={-102} y={-230} width={204} height={14} rx={3} fill="#334155" stroke="#0f172a" strokeWidth={2} />
                
                {/* Front Cab Body */}
                <path
                  d="M -92 -220 L 92 -220 L 96 -115 L -96 -115 Z"
                  fill={color}
                  stroke="#0f172a"
                  strokeWidth={2}
                />
                
                {/* Oversized Heavy Duty Side Mirrors with brackets */}
                <rect x={-116} y={-170} width={14} height={26} rx={2} fill="#1e293b" stroke="#0f172a" strokeWidth={1.5} />
                <line x1={-96} y1={-157} x2={-116} y2={-157} stroke="#64748b" strokeWidth={2} />
                <rect x={102} y={-170} width={14} height={26} rx={2} fill="#1e293b" stroke="#0f172a" strokeWidth={1.5} />
                <line x1={96} y1={-157} x2={116} y2={-157} stroke="#64748b" strokeWidth={2} />
                
                {/* Cab Windshield */}
                <path
                  d="M -84 -195 L 84 -195 L 82 -162 L -82 -162 Z"
                  fill="#0284c7"
                  fillOpacity={0.4}
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                />
                
                {/* Driver & Passenger Cab Seats */}
                <rect x={-76} y={-155} width={60} height={30} rx={4} fill="#1e293b" stroke="#475569" strokeWidth={1} />
                <circle cx={-46} cy={-165} r={9} fill="none" stroke="#94a3b8" strokeWidth={2} />
                <rect x={16} y={-155} width={60} height={30} rx={4} fill="#1e293b" stroke="#475569" strokeWidth={1} />
                
                {/* Rear Cargo Box / Grip Box (Heavy corrugated body) */}
                <rect x={-102} y={-115} width={204} height={303} rx={4} fill="#cbd5e1" stroke="#0f172a" strokeWidth={2.5} />
                
                {/* Roof Ribs / Corrugation */}
                {Array.from({ length: 9 }).map((_, i) => (
                  <line
                    key={i}
                    x1={-96}
                    y1={-90 + i * 31}
                    x2={96}
                    y2={-90 + i * 31}
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                  />
                ))}
                
                {/* "GRIP TRUCK" Roof Banner */}
                <rect x={-70} y={23} width={140} height={20} rx={3} fill="#0f172a" />
                <text x={0} y={37} fill="#38bdf8" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle" className="select-none">
                  GRIP TRUCK
                </text>
                
                {/* Rear Hydraulic Liftgate / Ramp */}
                <rect x={-100} y={218} width={200} height={14} rx={2} fill="#334155" stroke="#0f172a" strokeWidth={2} />
                <line x1={-94} y1={225} x2={94} y2={225} stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" />
                
                {/* Rear Warning Taillights */}
                <rect x={-96} y={220} width={12} height={5} rx={1} fill="#ef4444" />
                <rect x={84} y={220} width={12} height={5} rx={1} fill="#ef4444" />
              </g>
            ) : prop.propType === 'gun' ? (
              <g className="prop-handgun">
                {/* 1. Slide Body */}
                <rect x={-w / 2} y={-h * 0.38} width={w * 0.82} height={h * 0.32} rx={2} fill="#1e293b" stroke="#0f172a" strokeWidth={1.5} />
                
                {/* 2. Front & Rear Sights */}
                <rect x={-w / 2 + 2} y={-h * 0.38 - 3} width={3} height={3} fill="#f8fafc" />
                <rect x={w * 0.24} y={-h * 0.38 - 3} width={3.5} height={3} fill="#94a3b8" />
                
                {/* 3. Barrel Crown / Muzzle */}
                <rect x={-w / 2 - 2} y={-h * 0.38 + 2} width={2.5} height={h * 0.22} fill="#0f172a" rx={0.5} />
                
                {/* 4. Slide Serrations */}
                <line x1={w * 0.12} y1={-h * 0.34} x2={w * 0.12} y2={-h * 0.1} stroke="#64748b" strokeWidth={1} />
                <line x1={w * 0.17} y1={-h * 0.34} x2={w * 0.17} y2={-h * 0.1} stroke="#64748b" strokeWidth={1} />
                <line x1={w * 0.22} y1={-h * 0.34} x2={w * 0.22} y2={-h * 0.1} stroke="#64748b" strokeWidth={1} />
                
                {/* 5. Ejection Port */}
                <rect x={-w * 0.08} y={-h * 0.36} width={w * 0.18} height={h * 0.16} rx={1} fill="#0f172a" stroke="#334155" strokeWidth={0.75} />
                
                {/* 6. Lower Frame / Dustcover */}
                <rect x={-w / 2 + 2} y={-h * 0.08} width={w * 0.46} height={h * 0.18} rx={1} fill="#334155" stroke="#0f172a" strokeWidth={1.2} />
                
                {/* 7. Trigger Guard & Trigger */}
                <path
                  d={`M ${-w * 0.14} ${-h * 0.08} C ${-w * 0.14} ${h * 0.24}, ${w * 0.08} ${h * 0.24}, ${w * 0.08} ${-h * 0.08}`}
                  fill="#0f172a"
                  fillOpacity={0.15}
                  stroke="#0f172a"
                  strokeWidth={1.5}
                />
                <path d={`M ${-w * 0.02} 0 C ${0} ${h * 0.08}, ${w * 0.04} ${h * 0.12}, ${w * 0.04} ${h * 0.16}`} fill="none" stroke="#94a3b8" strokeWidth={1.8} strokeLinecap="round" />
                
                {/* 8. Ergonomic Grip Handle */}
                <path
                  d={`M ${w * 0.06} ${-h * 0.08} L ${w * 0.34} ${h * 0.44} L ${w * 0.08} ${h * 0.48} L ${-w * 0.08} ${-h * 0.04} Z`}
                  fill="#1e293b"
                  stroke="#0f172a"
                  strokeWidth={1.5}
                />
                
                {/* 9. Textured Grip Panel */}
                <polygon
                  points={`${w * 0.08},${0} ${w * 0.3},${h * 0.38} ${w * 0.12},${h * 0.42} ${-w * 0.03},${h * 0.04}`}
                  fill="#334155"
                  stroke="#475569"
                  strokeWidth={0.75}
                />
                <line x1={w * 0.06} y1={h * 0.1} x2={w * 0.2} y2={h * 0.14} stroke="#64748b" strokeWidth={0.8} />
                <line x1={w * 0.08} y1={h * 0.2} x2={w * 0.22} y2={h * 0.24} stroke="#64748b" strokeWidth={0.8} />
                <line x1={w * 0.1} y1={h * 0.3} x2={w * 0.24} y2={h * 0.34} stroke="#64748b" strokeWidth={0.8} />
                
                {/* 10. Magazine Baseplate */}
                <rect x={w * 0.06} y={h * 0.44} width={w * 0.32} height={h * 0.1} rx={1.5} fill="#0f172a" stroke="#334155" strokeWidth={1} />
                
                {/* 11. Hammer & Beavertail */}
                <path d={`M ${w * 0.3} ${-h * 0.16} C ${w * 0.4} ${-h * 0.22}, ${w * 0.44} ${-h * 0.14}, ${w * 0.34} ${-h * 0.04} Z`} fill="#334155" stroke="#0f172a" strokeWidth={1.2} />
                <circle cx={w * 0.32} cy={-h * 0.2} r={3} fill="#64748b" stroke="#0f172a" strokeWidth={1} />
              </g>
            ) : prop.propType === 'rifle' ? (
              <g className="prop-rifle">
                {/* Barrel */}
                <line x1={-w / 2} y1={0} x2={-w * 0.15} y2={0} stroke="#334155" strokeWidth={4} strokeLinecap="round" />
                {/* Flash Hider */}
                <rect x={-w / 2} y={-3.5} width={8} height={7} rx={1} fill="#0f172a" />
                {/* Handguard */}
                <rect x={-w * 0.38} y={-6} width={w * 0.28} height={12} rx={2} fill="#1e293b" stroke="#0f172a" strokeWidth={1.5} />
                {/* Receiver */}
                <rect x={-w * 0.1} y={-7} width={w * 0.32} height={14} rx={2} fill="#1e293b" stroke="#0f172a" strokeWidth={1.5} />
                {/* Optical Scope */}
                <rect x={-w * 0.05} y={-13} width={w * 0.22} height={6} rx={2} fill="#0f172a" stroke="#38bdf8" strokeWidth={1} />
                {/* Magazine */}
                <path d={`M ${-w * 0.02} 7 L ${w * 0.04} 20 L ${-w * 0.03} 20 L ${-w * 0.08} 7 Z`} fill="#0f172a" stroke="#334155" strokeWidth={1} />
                {/* Pistol Grip */}
                <path d={`M ${w * 0.12} 7 L ${w * 0.22} 18 L ${w * 0.15} 18 L ${w * 0.07} 7 Z`} fill="#334155" stroke="#0f172a" strokeWidth={1.5} />
                {/* Stock */}
                <rect x={w * 0.22} y={-5} width={w * 0.26} height={10} rx={3} fill="#334155" stroke="#0f172a" strokeWidth={1.5} />
              </g>
            ) : prop.propType === 'bomb' ? (
              <g className="prop-bomb">
                {/* 3 Red Dynamite Sticks */}
                <rect x={-w / 2} y={-h / 2 + 2} width={w * 0.65} height={h * 0.26} rx={3} fill="#ef4444" stroke="#991b1b" strokeWidth={1} />
                <rect x={-w / 2} y={-h * 0.13} width={w * 0.65} height={h * 0.26} rx={3} fill="#dc2626" stroke="#991b1b" strokeWidth={1} />
                <rect x={-w / 2} y={h * 0.18} width={w * 0.65} height={h * 0.26} rx={3} fill="#b91c1c" stroke="#7f1d1d" strokeWidth={1} />
                
                {/* Bundling Tape Bands */}
                <rect x={-w / 2 + 5} y={-h / 2} width={5} height={h} rx={1} fill="#0f172a" stroke="#334155" strokeWidth={0.5} />
                <rect x={-w * 0.12} y={-h / 2} width={5} height={h} rx={1} fill="#0f172a" stroke="#334155" strokeWidth={0.5} />
                
                {/* Detonator Digital Timer Box */}
                <rect x={w * 0.04} y={-h * 0.32} width={w * 0.44} height={h * 0.64} rx={3} fill="#0f172a" stroke="#475569" strokeWidth={1.5} />
                {/* Timer LCD Screen */}
                <rect x={w * 0.08} y={-h * 0.22} width={w * 0.36} height={h * 0.3} rx={1.5} fill="#450a0a" stroke="#7f1d1d" strokeWidth={0.75} />
                <text x={w * 0.26} y={-h * 0.02} fill="#ef4444" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle" className="select-none">
                  00:07
                </text>
                
                {/* Blasting Wires */}
                <path d={`M ${w * 0.04} ${-h * 0.1} C ${-w * 0.08} ${-h * 0.38}, ${-w * 0.22} ${-h * 0.38}, ${-w * 0.32} ${-h * 0.25}`} fill="none" stroke="#ef4444" strokeWidth={1.5} />
                <path d={`M ${w * 0.04} ${h * 0.1} C ${-w * 0.08} ${h * 0.38}, ${-w * 0.22} ${h * 0.38}, ${-w * 0.32} ${h * 0.25}`} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
                <circle cx={-w * 0.32} cy={-h * 0.25} r={2} fill="#94a3b8" />
                <circle cx={-w * 0.32} cy={h * 0.25} r={2} fill="#94a3b8" />
              </g>
            ) : prop.propType === 'letter' ? (
              <g className="prop-letter">
                {/* Envelope Body */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2.5} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} />
                {/* Flap fold creases */}
                <path d={`M ${-w / 2} ${-h / 2} L 0 ${h * 0.16} L ${w / 2} ${-h / 2}`} fill="#f1f5f9" stroke="#64748b" strokeWidth={1} />
                <line x1={-w / 2} y1={h / 2} x2={-w * 0.16} y2={0} stroke="#cbd5e1" strokeWidth={1} />
                <line x1={w / 2} y1={h / 2} x2={w * 0.16} y2={0} stroke="#cbd5e1" strokeWidth={1} />
                
                {/* Red Wax Seal */}
                <circle cx={0} cy={h * 0.14} r={4.5} fill="#dc2626" stroke="#991b1b" strokeWidth={1} />
                <circle cx={0} cy={h * 0.14} r={2.5} fill="none" stroke="#fca5a5" strokeWidth={0.6} />
                <circle cx={0} cy={h * 0.14} r={1} fill="#fca5a5" />
              </g>
            ) : prop.propType === 'stage' ? (
              <g className="prop-stage">
                {/* Main platform deck */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} stroke="#38bdf8" strokeWidth={2} rx={3} />
                {/* Stage floor seam lines (masonite panels) */}
                <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#475569" strokeWidth={1.5} />
                <line x1={-w / 4} y1={-h / 2} x2={-w / 4} y2={h / 2} stroke="#475569" strokeWidth={1} strokeDasharray="5 4" />
                <line x1={w / 4} y1={-h / 2} x2={w / 4} y2={h / 2} stroke="#475569" strokeWidth={1} strokeDasharray="5 4" />
                {/* Downstage edge highlight (front apron lip) */}
                <line x1={-w / 2} y1={-h / 2 + 6} x2={w / 2} y2={-h / 2 + 6} stroke="#e2e8f0" strokeWidth={2} strokeOpacity={0.5} />
                {/* Center star marker */}
                <polygon
                  points={`0,${-h * 0.18} ${w * 0.03},${-h * 0.05} ${w * 0.16},${-h * 0.05} ${w * 0.05},${h * 0.04} ${w * 0.1},${h * 0.17} 0,${h * 0.09} ${-w * 0.1},${h * 0.17} ${-w * 0.05},${h * 0.04} ${-w * 0.16},${-h * 0.05} ${-w * 0.03},${-h * 0.05}`}
                  fill="#eab308"
                  fillOpacity={0.9}
                  stroke="#78350f"
                  strokeWidth={1}
                />
                {/* Stage label */}
                <text
                  x={0}
                  y={-h / 2 + 20}
                  fill="#e2e8f0"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                  letterSpacing="3"
                  className="select-none font-mono"
                >
                  STAGE
                </text>
              </g>
            ) : prop.propType === 'stage_riser' ? (
              <g className="prop-stage-riser">
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} stroke="#94a3b8" strokeWidth={2} rx={2} />
                {/* Riser hatch grid */}
                <line x1={-w / 2} y1={-h / 4} x2={w / 2} y2={-h / 4} stroke="#64748b" strokeWidth={1.5} />
                <line x1={-w / 2} y1={h / 4} x2={w / 2} y2={h / 4} stroke="#64748b" strokeWidth={1.5} />
                <line x1={-w / 4} y1={-h / 2} x2={-w / 4} y2={h / 2} stroke="#64748b" strokeWidth={1.5} />
                <line x1={w / 4} y1={-h / 2} x2={w / 4} y2={h / 2} stroke="#64748b" strokeWidth={1.5} />
                {/* Support legs visible on the sides */}
                <line x1={-w / 2} y1={-h / 2 + 8} x2={-w / 2} y2={h / 2} stroke="#475569" strokeWidth={3} strokeLinecap="round" />
                <line x1={w / 2} y1={-h / 2 + 8} x2={w / 2} y2={h / 2} stroke="#475569" strokeWidth={3} strokeLinecap="round" />
              </g>
            ) : prop.propType === 'stage_runway' ? (
              <g className="prop-stage-runway">
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} stroke="#38bdf8" strokeWidth={2} rx={2} />
                {/* Center seam + edge lighting strips */}
                <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#64748b" strokeWidth={1.5} strokeDasharray="6 4" />
                <line x1={-w / 2} y1={-h / 2 + 4} x2={w / 2} y2={-h / 2 + 4} stroke="#f59e0b" strokeWidth={1.5} strokeOpacity={0.8} />
                <line x1={-w / 2} y1={h / 2 - 4} x2={w / 2} y2={h / 2 - 4} stroke="#f59e0b" strokeWidth={1.5} strokeOpacity={0.8} />
              </g>
            ) : prop.propType === 'stage_truss' ? (
              <g className="prop-stage-truss">
                {/* Two vertical towers + cross bracing */}
                <rect x={-w / 2} y={-h / 2} width={w * 0.28} height={h} fill={color} stroke="#64748b" strokeWidth={2} />
                <rect x={w / 2 - w * 0.28} y={-h / 2} width={w * 0.28} height={h} fill={color} stroke="#64748b" strokeWidth={2} />
                {/* Cross braces between towers */}
                <line x1={-w * 0.22} y1={-h / 2} x2={w * 0.22} y2={h / 2} stroke="#64748b" strokeWidth={1.5} />
                <line x1={-w * 0.22} y1={h / 2} x2={w * 0.22} y2={-h / 2} stroke="#64748b" strokeWidth={1.5} />
                <line x1={-w * 0.22} y1={0} x2={w * 0.22} y2={0} stroke="#64748b" strokeWidth={1.5} />
                {/* Top load bar */}
                <line x1={-w / 2} y1={-h / 2} x2={w / 2} y2={-h / 2} stroke="#eab308" strokeWidth={2.5} strokeLinecap="round" />
              </g>
            ) : prop.propType === 'drum_kit' ? (
              <g className="prop-drum-kit">
                {/* Drum riser base */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#1e293b" stroke="#64748b" strokeWidth={2} rx={3} />
                {/* Bass drum */}
                <circle cx={0} cy={-h * 0.12} r={Math.min(w, h) * 0.22} fill="#0f172a" stroke="#e2e8f0" strokeWidth={2} />
                <circle cx={0} cy={-h * 0.12} r={Math.min(w, h) * 0.14} fill="none" stroke="#64748b" strokeWidth={1} />
                {/* Floor toms */}
                <circle cx={-w * 0.26} cy={h * 0.08} r={Math.min(w, h) * 0.13} fill="#334155" stroke="#cbd5e1" strokeWidth={1.5} />
                <circle cx={w * 0.26} cy={h * 0.08} r={Math.min(w, h) * 0.13} fill="#334155" stroke="#cbd5e1" strokeWidth={1.5} />
                {/* Snare */}
                <circle cx={0} cy={h * 0.14} r={Math.min(w, h) * 0.1} fill="#475569" stroke="#cbd5e1" strokeWidth={1.5} />
                {/* Cymbal stands */}
                <line x1={-w * 0.34} y1={-h * 0.3} x2={-w * 0.4} y2={-h / 2 + 6} stroke="#94a3b8" strokeWidth={1.5} />
                <line x1={w * 0.34} y1={-h * 0.3} x2={w * 0.4} y2={-h / 2 + 6} stroke="#94a3b8" strokeWidth={1.5} />
                <ellipse cx={-w * 0.4} cy={-h / 2 + 4} rx={w * 0.09} ry={h * 0.05} fill="#eab308" fillOpacity={0.85} stroke="#78350f" strokeWidth={1} />
                <ellipse cx={w * 0.4} cy={-h / 2 + 4} rx={w * 0.09} ry={h * 0.05} fill="#eab308" fillOpacity={0.85} stroke="#78350f" strokeWidth={1} />
                {/* Stool */}
                <circle cx={w * 0.33} cy={h * 0.34} r={4} fill="#94a3b8" />
              </g>
            ) : prop.propType === 'keyboard_rig' ? (
              <g className="prop-keyboard-rig">
                {/* Two-tier keyboard stand */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h * 0.32} fill={color} stroke="#38bdf8" strokeWidth={1.5} rx={2} />
                <rect x={-w / 2 + w * 0.08} y={-h * 0.02} width={w * 0.84} height={h * 0.32} fill="#0f172a" stroke="#64748b" strokeWidth={1.5} rx={2} />
                {/* Keys */}
                <rect x={-w / 2 + 6} y={-h / 2 + 5} width={w - 12} height={h * 0.12} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.75} />
                {Array.from({ length: 10 }).map((_, i) => (
                  <line key={i} x1={-w / 2 + 8 + i * ((w - 16) / 10)} y1={-h / 2 + 5} x2={-w / 2 + 8 + i * ((w - 16) / 10)} y2={-h / 2 + 5 + h * 0.12} stroke="#334155" strokeWidth={0.75} />
                ))}
                {/* X-stand legs */}
                <line x1={-w * 0.3} y1={h * 0.32} x2={-w * 0.34} y2={h / 2} stroke="#64748b" strokeWidth={2} />
                <line x1={w * 0.3} y1={h * 0.32} x2={w * 0.34} y2={h / 2} stroke="#64748b" strokeWidth={2} />
              </g>
            ) : prop.propType === 'amp_stack' ? (
              <g className="prop-amp-stack">
                {/* Guitar head */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h * 0.22} fill="#0f172a" stroke="#94a3b8" strokeWidth={1.5} rx={1} />
                {/* Speaker cabinets */}
                <rect x={-w / 2} y={-h / 2 + h * 0.24} width={w} height={h * 0.38} fill={color} stroke="#e2e8f0" strokeWidth={2} rx={2} />
                <rect x={-w / 2} y={h * 0.14} width={w} height={h * 0.38} fill={color} stroke="#e2e8f0" strokeWidth={2} rx={2} />
                {/* Speaker grille dots */}
                <circle cx={-w * 0.12} cy={-h / 2 + h * 0.43} r={w * 0.16} fill="#0f172a" stroke="#64748b" strokeWidth={1} />
                <circle cx={w * 0.12} cy={-h / 2 + h * 0.43} r={w * 0.16} fill="#0f172a" stroke="#64748b" strokeWidth={1} />
                <circle cx={-w * 0.12} cy={h * 0.33} r={w * 0.16} fill="#0f172a" stroke="#64748b" strokeWidth={1} />
                <circle cx={w * 0.12} cy={h * 0.33} r={w * 0.16} fill="#0f172a" stroke="#64748b" strokeWidth={1} />
              </g>
            ) : prop.propType === 'speaker_stack' ? (
              <g className="prop-speaker-stack">
                {/* Top cabinet (tweeter/mid horn) */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h * 0.3} fill={color} stroke="#94a3b8" strokeWidth={2} rx={2} />
                <circle cx={0} cy={-h / 2 + h * 0.15} r={w * 0.2} fill="#0f172a" stroke="#64748b" strokeWidth={1} />
                <circle cx={0} cy={-h / 2 + h * 0.15} r={w * 0.08} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
                {/* Bottom bass cabinet */}
                <rect x={-w / 2} y={-h * 0.12} width={w} height={h * 0.42} fill={color} stroke="#e2e8f0" strokeWidth={2} rx={2} />
                <circle cx={0} cy={h * 0.08} r={w * 0.22} fill="#0f172a" stroke="#64748b" strokeWidth={1} />
                {/* Feet */}
                <rect x={-w * 0.3} y={h * 0.36} width={w * 0.2} height={h * 0.08} rx={1} fill="#64748b" />
                <rect x={w * 0.1} y={h * 0.36} width={w * 0.2} height={h * 0.08} rx={1} fill="#64748b" />
              </g>
            ) : prop.propType === 'speaker_array' ? (
              <g className="prop-speaker-array">
                {/* Vertical line array hang */}
                {Array.from({ length: Math.max(3, Math.floor(h / 22)) }).map((_, i) => (
                  <g key={i}>
                    <rect x={-w / 2} y={-h / 2 + i * (h / Math.max(3, Math.floor(h / 22)))} width={w} height={h / Math.max(3, Math.floor(h / 22)) - 2} fill={color} stroke="#64748b" strokeWidth={1} rx={2} />
                    <line x1={-w * 0.3} y1={-h / 2 + (i + 0.5) * (h / Math.max(3, Math.floor(h / 22)))} x2={w * 0.3} y2={-h / 2 + (i + 0.5) * (h / Math.max(3, Math.floor(h / 22)))} stroke="#94a3b8" strokeWidth={1} />
                  </g>
                ))}
                {/* Top hang point */}
                <line x1={0} y1={-h / 2} x2={0} y2={-h / 2 - 10} stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 2" />
              </g>
            ) : prop.propType === 'sub_stack' ? (
              <g className="prop-sub-stack">
                {/* 2 stacked subwoofer cabinets */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h * 0.48} fill={color} stroke="#e2e8f0" strokeWidth={2} rx={2} />
                <rect x={-w / 2} y={h * 0.02} width={w} height={h * 0.48} fill={color} stroke="#e2e8f0" strokeWidth={2} rx={2} />
                {/* Sub drivers */}
                <circle cx={-w * 0.2} cy={-h * 0.26} r={w * 0.14} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
                <circle cx={w * 0.2} cy={-h * 0.26} r={w * 0.14} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
                <circle cx={-w * 0.2} cy={h * 0.26} r={w * 0.14} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
                <circle cx={w * 0.2} cy={h * 0.26} r={w * 0.14} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
              </g>
            ) : prop.propType === 'monitor_wedge' ? (
              <g className="prop-monitor-wedge">
                {/* Angled floor wedge (trapezoid) */}
                <path
                  d={`M ${-w / 2} ${h / 2} L ${-w / 2} ${h * 0.1} L ${w / 2} ${-h / 2} L ${w / 2} ${h / 2} Z`}
                  fill={color}
                  stroke="#38bdf8"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {/* Driver grille */}
                <circle cx={0} cy={h * 0.05} r={w * 0.22} fill="#0f172a" stroke="#64748b" strokeWidth={1} />
              </g>
            ) : prop.propType === 'foh_console' || prop.propType === 'monitor_console' ? (
              <g className="prop-console">
                {/* Mixing desk surface */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h * 0.5} fill={color} stroke="#38bdf8" strokeWidth={1.5} rx={2} />
                {/* Fader bank */}
                <rect x={-w / 2 + 4} y={-h / 2 + 6} width={w - 8} height={h * 0.2} fill="#0f172a" rx={1} />
                {Array.from({ length: Math.max(8, Math.floor(w / 16)) }).map((_, i) => (
                  <line
                    key={i}
                    x1={-w / 2 + 8 + i * ((w - 16) / Math.max(8, Math.floor(w / 16)))}
                    y1={-h / 2 + 6}
                    x2={-w / 2 + 8 + i * ((w - 16) / Math.max(8, Math.floor(w / 16)))}
                    y2={-h / 2 + 6 + h * 0.2}
                    stroke="#22c55e"
                    strokeWidth={1.5}
                  />
                ))}
                {/* Meter bridge + screen */}
                <rect x={-w * 0.3} y={-h * 0.06} width={w * 0.6} height={h * 0.26} fill="#0f172a" stroke="#64748b" strokeWidth={1} rx={1} />
                <rect x={-w * 0.28} y={-h * 0.04} width={w * 0.56} height={h * 0.18} fill="#14532d" stroke="#22c55e" strokeWidth={0.75} />
                {/* Desk legs */}
                <rect x={-w * 0.4} y={h * 0.12} width={4} height={h * 0.38} fill="#475569" />
                <rect x={w * 0.4 - 4} y={h * 0.12} width={4} height={h * 0.38} fill="#475569" />
              </g>
            ) : prop.propType === 'mic_stand' ? (
              <g className="prop-mic-stand">
                {/* Vertical pole */}
                <line x1={0} y1={-h / 2 + h * 0.25} x2={0} y2={h / 2} stroke="#94a3b8" strokeWidth={2.5} strokeLinecap="round" />
                {/* Boom arm */}
                <line x1={0} y1={-h * 0.1} x2={-w * 0.3} y2={-h * 0.35} stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" />
                {/* Mic capsule */}
                <rect x={-w * 0.3 - 3} y={-h * 0.42} width={6} height={12} rx={3} fill="#0f172a" stroke="#38bdf8" strokeWidth={1} />
                {/* Tripod base */}
                <line x1={-w * 0.22} y1={h / 2} x2={-w * 0.4} y2={h * 0.42} stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" />
                <line x1={w * 0.22} y1={h / 2} x2={w * 0.4} y2={h * 0.42} stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" />
              </g>
            ) : prop.propType === 'barricade' ? (
              <g className="prop-barricade">
                {/* Barrier top rail */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h * 0.6} fill={color} stroke="#cbd5e1" strokeWidth={1.5} rx={2} />
                {/* Legs */}
                <line x1={-w * 0.32} y1={-h * 0.2} x2={-w * 0.4} y2={h / 2} stroke="#94a3b8" strokeWidth={3} strokeLinecap="round" />
                <line x1={w * 0.32} y1={-h * 0.2} x2={w * 0.4} y2={h / 2} stroke="#94a3b8" strokeWidth={3} strokeLinecap="round" />
                {/* Foot weights */}
                <rect x={-w * 0.44} y={h * 0.3} width={w * 0.14} height={h * 0.2} rx={2} fill="#475569" />
                <rect x={w * 0.3} y={h * 0.3} width={w * 0.14} height={h * 0.2} rx={2} fill="#475569" />
              </g>
            ) : prop.propType === 'video_wall' ? (
              <g className="prop-video-wall">
                {/* LED panel frame */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#020617" stroke="#e2e8f0" strokeWidth={2} rx={2} />
                {/* Pixel grid */}
                {Array.from({ length: Math.max(4, Math.floor(h / 18)) }).map((_, i) =>
                  Array.from({ length: Math.max(6, Math.floor(w / 24)) }).map((__, j) => (
                    <circle
                      key={`${i}-${j}`}
                      cx={-w / 2 + 10 + j * ((w - 20) / Math.max(6, Math.floor(w / 24)))}
                      cy={-h / 2 + 10 + i * ((h - 20) / Math.max(4, Math.floor(h / 18)))}
                      r={1.6}
                      fill={i % 2 === j % 2 ? '#38bdf8' : '#f59e0b'}
                      fillOpacity={0.85}
                    />
                  ))
                )}
                {/* Screen bezel separators */}
                <line x1={0} y1={-h / 2} x2={0} y2={h / 2} stroke="#334155" strokeWidth={1} />
                <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#334155" strokeWidth={1} />
              </g>
            ) : prop.propType === 'broadcast_truck' ? (
              <g className="prop-broadcast-truck" transform={`scale(${w / 260}, ${h / 560})`}>
                {/* Trailer body */}
                <rect x={-110} y={-280} width={220} height={420} fill={color} stroke="#0f172a" strokeWidth={2.5} rx={6} />
                {/* Satellite dish on roof */}
                <line x1={0} y1={-280} x2={0} y2={-310} stroke="#64748b" strokeWidth={3} />
                <ellipse cx={0} cy={-316} rx={34} ry={14} fill="#94a3b8" stroke="#0f172a" strokeWidth={2} />
                <line x1={-28} y1={-314} x2={28} y2={-314} stroke="#0f172a" strokeWidth={1} />
                <circle cx={0} cy={-314} r={3} fill="#f59e0b" />
                {/* Side panels & decals */}
                <rect x={-96} y={-250} width={192} height={110} rx={3} fill="#0f172a" stroke="#38bdf8" strokeWidth={1} />
                <text x={0} y={-200} fill="#38bdf8" fontSize="22" fontWeight="black" textAnchor="middle" fontFamily="monospace" className="select-none">
                  LIVE
                </text>
                <text x={0} y={-180} fill="#e2e8f0" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace" className="select-none">
                  OB UNIT
                </text>
                {/* Lower equipment bays */}
                <rect x={-96} y={-120} width={192} height={70} rx={3} fill="#0f172a" stroke="#64748b" strokeWidth={1} />
                {Array.from({ length: 6 }).map((_, i) => (
                  <rect key={i} x={-86 + i * 31} y={-108} width={26} height={18} rx={2} fill="#1e293b" stroke="#38bdf8" strokeWidth={0.75} />
                ))}
                {/* Rear doors */}
                <line x1={-8} y1={140} x2={-8} y2={-30} stroke="#334155" strokeWidth={2} />
                <rect x={-96} y={140} width={84} height={70} rx={2} fill="#1e293b" stroke="#64748b" strokeWidth={1} />
                <rect x={12} y={140} width={84} height={70} rx={2} fill="#1e293b" stroke="#64748b" strokeWidth={1} />
                {/* Landing gear + wheels */}
                <rect x={-110} y={150} width={8} height={28} rx={2} fill="#475569" />
                <rect x={102} y={150} width={8} height={28} rx={2} fill="#475569" />
                <rect x={-96} y={190} width={16} height={42} rx={4} fill="#0f172a" />
                <rect x={-64} y={190} width={16} height={42} rx={4} fill="#0f172a" />
                <rect x={48} y={190} width={16} height={42} rx={4} fill="#0f172a" />
                <rect x={80} y={190} width={16} height={42} rx={4} fill="#0f172a" />
                {/* Wheel hubs */}
                <circle cx={-88} cy={212} r={4} fill="#64748b" />
                <circle cx={-56} cy={212} r={4} fill="#64748b" />
                <circle cx={56} cy={212} r={4} fill="#64748b" />
                <circle cx={88} cy={212} r={4} fill="#64748b" />
                {/* Tractor unit (attached at front) */}
                <rect x={-110} y={-150} width={44} height={120} rx={8} fill="#0f172a" stroke="#38bdf8" strokeWidth={2} />
                <rect x={-104} y={-120} width={32} height={40} rx={4} fill="#1e293b" stroke="#64748b" strokeWidth={1} />
                <rect x={-118} y={-30} width={60} height={20} rx={3} fill="#475569" stroke="#0f172a" strokeWidth={1.5} />
                <rect x={-108} y={18} width={14} height={36} rx={3} fill="#0f172a" />
                <rect x={-86} y={18} width={14} height={36} rx={3} fill="#0f172a" />
              </g>
            ) : prop.propType === 'broadcast_van' ? (
              <g className="prop-broadcast-van" transform={`scale(${w / 190}, ${h / 380})`}>
                {/* Van body */}
                <path
                  d="M -80 -170 L 80 -170 L 90 -120 L 96 -20 L 96 120 L -96 120 L -96 -20 L -88 -120 Z"
                  fill={color}
                  stroke="#0f172a"
                  strokeWidth={2.5}
                />
                {/* Roof mast / antenna */}
                <line x1={-40} y1={-170} x2={-40} y2={-200} stroke="#64748b" strokeWidth={2.5} />
                <line x1={-34} y1={-196} x2={-46} y2={-206} stroke="#f59e0b" strokeWidth={2} />
                {/* Windshield */}
                <path d="M -80 -140 L -72 -170 L 72 -170 L 84 -140 Z" fill="#0284c7" fillOpacity={0.4} stroke="#38bdf8" strokeWidth={1.5} />
                {/* Side windows */}
                <rect x={-70} y={-90} width={40} height={34} rx={3} fill="#0284c7" fillOpacity={0.35} stroke="#38bdf8" strokeWidth={1} />
                <rect x={22} y={-90} width={50} height={34} rx={3} fill="#0284c7" fillOpacity={0.35} stroke="#38bdf8" strokeWidth={1} />
                {/* News decal */}
                <rect x={-84} y={-30} width={168} height={36} rx={3} fill="#0f172a" stroke="#38bdf8" strokeWidth={1} />
                <text x={0} y={-6} fill="#38bdf8" fontSize="16" fontWeight="black" textAnchor="middle" fontFamily="monospace" className="select-none">
                  NEWS
                </text>
                {/* Rear compartment */}
                <line x1={48} y1={-20} x2={48} y2={120} stroke="#334155" strokeWidth={2} />
                {/* Wheels */}
                <rect x={-72} y={112} width={14} height={34} rx={4} fill="#0f172a" />
                <rect x={58} y={112} width={14} height={34} rx={4} fill="#0f172a" />
                <circle cx={-65} cy={132} r={4} fill="#64748b" />
                <circle cx={65} cy={132} r={4} fill="#64748b" />
              </g>
            ) : prop.propType === 'sat_truck' ? (
              <g className="prop-sat-truck" transform={`scale(${w / 240}, ${h / 480})`}>
                {/* Truck body */}
                <rect x={-95} y={-240} width={190} height={330} fill={color} stroke="#0f172a" strokeWidth={2.5} rx={6} />
                {/* Large satellite dish */}
                <line x1={0} y1={-240} x2={0} y2={-300} stroke="#64748b" strokeWidth={3} />
                <ellipse cx={0} cy={-312} rx={52} ry={22} fill="#cbd5e1" stroke="#0f172a" strokeWidth={2} />
                <line x1={-46} y1={-310} x2={46} y2={-310} stroke="#475569" strokeWidth={1} />
                <line x1={0} y1={-330} x2={0} y2={-296} stroke="#475569" strokeWidth={1} />
                <circle cx={0} cy={-308} r={4} fill="#f59e0b" />
                {/* Uplink equipment bay */}
                <rect x={-82} y={-210} width={164} height={80} rx={3} fill="#0f172a" stroke="#38bdf8" strokeWidth={1} />
                <rect x={-72} y={-198} width={30} height={20} rx={2} fill="#1e293b" stroke="#22c55e" strokeWidth={0.75} />
                <rect x={-34} y={-198} width={30} height={20} rx={2} fill="#1e293b" stroke="#22c55e" strokeWidth={0.75} />
                <rect x={4} y={-198} width={30} height={20} rx={2} fill="#1e293b" stroke="#22c55e" strokeWidth={0.75} />
                <rect x={42} y={-198} width={30} height={20} rx={2} fill="#1e293b" stroke="#22c55e" strokeWidth={0.75} />
                {/* Side wall + logo band */}
                <rect x={-82} y={-110} width={164} height={40} rx={2} fill="#1e293b" stroke="#64748b" strokeWidth={1} />
                <text x={0} y={-84} fill="#e2e8f0" fontSize="15" fontWeight="black" textAnchor="middle" fontFamily="monospace" className="select-none">
                  SAT-LINK
                </text>
                {/* Wheels */}
                <rect x={-88} y={90} width={14} height={36} rx={4} fill="#0f172a" />
                <rect x={-52} y={90} width={14} height={36} rx={4} fill="#0f172a" />
                <rect x={38} y={90} width={14} height={36} rx={4} fill="#0f172a" />
                <rect x={74} y={90} width={14} height={36} rx={4} fill="#0f172a" />
                <circle cx={-81} cy={110} r={4} fill="#64748b" />
                <circle cx={-45} cy={110} r={4} fill="#64748b" />
                <circle cx={45} cy={110} r={4} fill="#64748b" />
                <circle cx={81} cy={110} r={4} fill="#64748b" />
              </g>
            ) : (
              /* Default rectangular prop */
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                fill={color}
                stroke="#1e293b"
                strokeWidth={2}
                rx={4}
              />
            )}

            {/* Prop Label (always upright, positioned cleanly below the icon) */}
            {showPropLabel && (
              <g
                transform={`rotate(${-rotation}) translate(0, ${Math.max(h / 2 + 14, 28)}) scale(${propLabelScale})`}
                opacity={propLabelOpacity}
              >
                <text
                  x={0}
                  y={0}
                  fill={displaySettings.propLabelColor ?? '#ffffff'}
                  stroke="rgba(15, 23, 42, 0.9)"
                  strokeWidth={2.5}
                  paintOrder="stroke fill"
                  strokeLinejoin="round"
                  fontSize={10}
                  fontWeight="600"
                  textAnchor="middle"
                  className="select-none font-sans pointer-events-none drop-shadow"
                >
                  {prop.label || prop.name}
                </text>
              </g>
            )}

            {/* Add movement waypoint button (top-right, stays upright) */}
            {isSelected && onAddWaypoint && (
              <g
                transform={`rotate(${-rotation}) translate(${Math.max(w / 2, 28) + 4}, ${-Math.max(h / 2, 28) - 4})`}
                className="pointer-events-auto cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onAddWaypoint(prop.id);
                }}
              >
                <circle cx={0} cy={0} r={11} fill="#22c55e" stroke="#0f172a" strokeWidth={1.5} className="drop-shadow-md" />
                <text x={0} y={4.5} fill="#ffffff" fontSize="14" fontWeight="bold" textAnchor="middle" className="select-none">
                  +
                </text>
              </g>
            )}
          </g>

          {/* Interactive waypoint markers & rotation handles */}
          {hasPath && showWaypoints && (
            <g className={isSelected ? 'prop-waypoint-handles pointer-events-auto' : 'prop-waypoint-handles pointer-events-none'}>
              {waypoints.map((wp, i) => {
                const wpRot = wp.rotation ?? prop.rotation;
                return (
                  <g
                    key={wp.id || i}
                    transform={`translate(${wp.x}, ${wp.y})`}
                    onPointerDown={
                      isSelected && onWaypointDragStart
                        ? (e) => onWaypointDragStart!(prop.id, wp.id, e)
                        : undefined
                    }
                  >
                    {isSelected && onWaypointRotateStart && (
                      <g transform={`rotate(${wpRot})`} className="pointer-events-auto">
                        <line x1={16} y1={0} x2={30} y2={0} stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 3" />
                        <circle
                          cx={33}
                          cy={0}
                          r={6}
                          fill="#38bdf8"
                          stroke="#0f172a"
                          strokeWidth={1.5}
                          className="cursor-grab active:cursor-grabbing"
                          onPointerDown={(e) => onWaypointRotateStart!(prop.id, wp.id, e)}
                        />
                      </g>
                    )}
                    <circle cx={0} cy={0} r={11} fill="#0f172a" stroke={isSelected ? '#38bdf8' : color} strokeWidth={isSelected ? 3 : 2} className="drop-shadow-md" />
                    <text x={0} y={3.5} fill={color} fontSize="9" fontWeight="bold" textAnchor="middle" className="select-none font-mono">
                      B{wp.beat}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </g>
      );
      })}

      {/* 3. Measurement Rulers */}
      {measurements.map((m) => {
        const isSelected = selectedIds.includes(m.id);
        const x1 = m.x;
        const y1 = m.y;
        const x2 = m.x2 ?? m.x + 150;
        const y2 = m.y2 ?? m.y;
        const dist = Math.round(getDistance({ x: x1, y: y1 }, { x: x2, y: y2 }));
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1);

        return (
          <g
            key={m.id}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(m.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(m.id, e);
            }}
          >
            {/* Guide line */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isSelected ? '#38bdf8' : '#f59e0b'}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            {/* Tick marks */}
            <line
              x1={x1 - (Math.sin(angle) * 8)}
              y1={y1 + (Math.cos(angle) * 8)}
              x2={x1 + (Math.sin(angle) * 8)}
              y2={y1 - (Math.cos(angle) * 8)}
              stroke={isSelected ? '#38bdf8' : '#f59e0b'}
              strokeWidth={2}
            />
            <line
              x1={x2 - (Math.sin(angle) * 8)}
              y1={y2 + (Math.cos(angle) * 8)}
              x2={x2 + (Math.sin(angle) * 8)}
              y2={y2 - (Math.cos(angle) * 8)}
              stroke={isSelected ? '#38bdf8' : '#f59e0b'}
              strokeWidth={2}
            />

            {/* Dimension Badge */}
            {showMeasurementLabel && (
              <g
                transform={`translate(${midX}, ${midY}) rotate(${(angle * 180) / Math.PI}) scale(${measurementLabelScale})`}
                opacity={measurementLabelOpacity}
              >
                <rect
                  x={-32}
                  y={-10}
                  width={64}
                  height={20}
                  fill="#0f172a"
                  stroke={isSelected ? '#38bdf8' : '#f59e0b'}
                  strokeWidth={1.5}
                  rx={4}
                  className="drop-shadow-md"
                />
                <text
                  x={0}
                  y={4}
                  fill={displaySettings.measurementLabelColor ?? '#f59e0b'}
                  fontSize="11"
                  textAnchor="middle"
                  fontWeight="bold"
                  className="select-none font-mono"
                >
                  {Math.round((dist / pixelsPerUnit) * 10) / 10} {m.unit}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* 4. Arrows / Direction Annotations */}
      {arrows.map((a) => {
        const isSelected = selectedIds.includes(a.id);
        const x1 = a.x;
        const y1 = a.y;
        const x2 = a.x2 ?? a.x + 150;
        const y2 = a.y2 ?? a.y;
        const color = isSelected ? '#38bdf8' : a.color || '#f97316';
        const sw = a.strokeWidth || 2.5;
        const headStyle = a.headStyle || 'single';
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = Math.max(10, 7 + sw * 2);

        // Back off the line ends so open / double heads don't overlap the shaft
        const lineInsetEnd = headStyle === 'open' ? headLen * 0.7 : 0;
        const lineInsetStart = headStyle === 'double' ? headLen * 0.7 : 0;
        const lx1 = x1 + Math.cos(angle) * lineInsetStart;
        const ly1 = y1 + Math.sin(angle) * lineInsetStart;
        const lx2 = x2 - Math.cos(angle) * lineInsetEnd;
        const ly2 = y2 - Math.sin(angle) * lineInsetEnd;

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const labelOffsetY = (y2 - y1) !== 0 ? -1 : -10;
        const labelOpacity = 1;

        return (
          <g
            key={a.id}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(a.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(a.id, e);
            }}
          >
            {/* Invisible fat hit area so thin arrows are easy to select */}
            <line
              x1={lx1}
              y1={ly1}
              x2={lx2}
              y2={ly2}
              stroke="transparent"
              strokeWidth={sw + 12}
              fill="none"
            />
            <ArrowGlyph
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              color={color}
              strokeWidth={sw}
              headStyle={headStyle}
              dashStyle={a.dashStyle}
            />
            {/* Optional label */}
            {a.label && (
              <g
                transform={`translate(${midX}, ${midY + labelOffsetY}) scale(${baseLabelScale})`}
                opacity={labelOpacity}
              >
                <rect
                  x={-38}
                  y={-11}
                  width={76}
                  height={22}
                  fill="#0f172a"
                  stroke={isSelected ? '#38bdf8' : color}
                  strokeWidth={1.5}
                  rx={4}
                  className="drop-shadow-md"
                />
                <text
                  x={0}
                  y={4}
                  fill={isSelected ? '#38bdf8' : '#fb923c'}
                  fontSize="11"
                  textAnchor="middle"
                  fontWeight="bold"
                  className="select-none font-mono"
                >
                  {a.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* 5. Text Annotations with Double-Click Inline Editing */}
      {texts.map((txt) => {
        const isSelected = selectedIds.includes(txt.id);
        const isEditing = editingTextId === txt.id;

        return (
          <g
            key={txt.id}
            transform={`translate(${txt.x}, ${txt.y}) rotate(${txt.rotation})`}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(txt.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(txt.id, e);
              handleStartEditText(txt);
            }}
          >
            {isSelected && (
              <rect
                x={-6}
                y={-txt.fontSize - 4}
                width={txt.text.length * (txt.fontSize * 0.6) + 16}
                height={txt.fontSize + 10}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                rx={4}
              />
            )}

            {isEditing ? (
              <foreignObject
                x={-6}
                y={-txt.fontSize - 6}
                width={Math.max(160, txt.text.length * 12 + 40)}
                height={txt.fontSize + 16}
              >
                <input
                  type="text"
                  autoFocus
                  value={editTextValue}
                  onChange={(e) => setEditTextValue(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => handleFinishEditText(txt.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFinishEditText(txt.id);
                    if (e.key === 'Escape') setEditingTextId(null);
                  }}
                  className="w-full bg-slate-900 text-sky-400 border border-sky-500 rounded px-1 text-sm font-semibold outline-none shadow-xl"
                />
              </foreignObject>
            ) : (
              <text
                x={0}
                y={0}
                fill={txt.color || '#94a3b8'}
                fontSize={txt.fontSize || 16}
                fontFamily={txt.fontFamily || 'sans-serif'}
                fontWeight={txt.fontWeight || 'normal'}
                fontStyle={txt.fontStyle || 'normal'}
                textDecoration={
                  txt.underline && txt.strikethrough
                    ? 'underline line-through'
                    : txt.underline
                    ? 'underline'
                    : txt.strikethrough
                    ? 'line-through'
                    : undefined
                }
                textAnchor={
                  txt.textAlign === 'left' ? 'start' : txt.textAlign === 'right' ? 'end' : 'middle'
                }
                className="select-none"
              >
                {txt.text}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
};
