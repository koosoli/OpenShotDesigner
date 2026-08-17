import React, { useState } from 'react';
import { MeasurementElement, PropElement, TextElement, TrackElement } from '../../types';
import { getDistance } from '../../utils/geometry';
import type { DisplaySettings } from '../../context/FloorPlanContext';

interface PropsLayerProps {
  propsList: PropElement[];
  tracks: TrackElement[];
  measurements: MeasurementElement[];
  texts: TextElement[];
  selectedIds: string[];
  onSelect: (id: string, e: React.PointerEvent) => void;
  onUpdateText?: (id: string, newText: string) => void;
  pixelsPerUnit?: number;
  displaySettings: DisplaySettings;
}

export const PropsLayer: React.FC<PropsLayerProps> = ({
  propsList,
  tracks,
  measurements,
  texts,
  selectedIds,
  onSelect,
  onUpdateText,
  pixelsPerUnit = 30,
  displaySettings,
}) => {
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editTextValue, setEditTextValue] = useState<string>('');

  const showTrackLabel = displaySettings.showLabels && displaySettings.showTrackLabels;
  const showPropLabel = displaySettings.showLabels && displaySettings.showPropLabels;
  const showMeasurementLabel = displaySettings.showLabels && displaySettings.showMeasurementLabels;
  const labelScale = displaySettings.labelScale;
  const labelOpacity = displaySettings.labelOpacity;

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
                <g transform={`translate(${ctrlX}, ${ctrlY - 14}) scale(${labelScale})`} opacity={labelOpacity}>
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
          >
            {/* Rails */}
            <line x1={0} y1={-12} x2={dist} y2={-12} stroke={isSelected ? '#38bdf8' : '#94a3b8'} strokeWidth={3} strokeLinecap="round" />
            <line x1={0} y1={12} x2={dist} y2={12} stroke={isSelected ? '#38bdf8' : '#94a3b8'} strokeWidth={3} strokeLinecap="round" />

            {/* Sleepers */}
            {Array.from({ length: sleeperCount + 1 }).map((_, i) => {
              const sx = (dist / sleeperCount) * i;
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
            {showTrackLabel && (
              <text
                x={dist / 2}
                y={-20}
                fill={displaySettings.trackLabelColor ?? '#94a3b8'}
                fontSize={10 * labelScale}
                textAnchor="middle"
                opacity={labelOpacity}
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

        return (
          <g
            key={prop.id}
            transform={`translate(${prop.x}, ${prop.y}) rotate(${prop.rotation})`}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(prop.id, e)}
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
            ) : prop.propType === 'table_round' || prop.propType === 'circle' ? (
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
                {/* Flanking chairs */}
                <rect x={-w / 2} y={-h / 4} width={12} height={h / 2} fill="#334155" rx={2} />
                <rect x={w / 2 - 12} y={-h / 4} width={12} height={h / 2} fill="#334155" rx={2} />
                <rect x={-w / 4} y={-h / 2} width={w / 2} height={10} fill="#334155" rx={2} />
                <rect x={-w / 4} y={h / 2 - 10} width={w / 2} height={10} fill="#334155" rx={2} />
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
              <g>
                <rect x={-12} y={-10} width={24} height={20} fill="#78350f" stroke="#451a03" rx={2} />
                <line x1={-12} y1={-10} x2={12} y2={10} stroke="#cbd5e1" strokeWidth={2} />
                <line x1={-12} y1={10} x2={12} y2={-10} stroke="#cbd5e1" strokeWidth={2} />
                <line x1={-14} y1={-10} x2={-14} y2={10} stroke="#451a03" strokeWidth={3} strokeLinecap="round" />
              </g>
            ) : prop.propType === 'apple_box' ? (
              <g>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#b45309" stroke="#78350f" strokeWidth={2} rx={2} />
                <rect x={-6} y={-h / 2 + 4} width={12} height={4} fill="#78350f" rx={1} />
                <rect x={-6} y={h / 2 - 8} width={12} height={4} fill="#78350f" rx={1} />
              </g>
            ) : prop.propType === 'c_stand' ? (
              <g>
                {/* Turtle base legs */}
                <line x1={0} y1={0} x2={-16} y2={-12} stroke="#94a3b8" strokeWidth={2.5} strokeLinecap="round" />
                <line x1={0} y1={0} x2={-16} y2={12} stroke="#94a3b8" strokeWidth={2.5} strokeLinecap="round" />
                <line x1={0} y1={0} x2={20} y2={0} stroke="#94a3b8" strokeWidth={2.5} strokeLinecap="round" />
                <circle cx={0} cy={0} r={4} fill="#38bdf8" />
              </g>
            ) : prop.propType === 'sound_boom' ? (
              <g>
                <circle cx={0} cy={0} r={14} fill="#eab308" stroke="#0f172a" strokeWidth={2} />
                <line x1={0} y1={0} x2={42} y2={0} stroke="#eab308" strokeWidth={3} strokeLinecap="round" />
                <ellipse cx={46} cy={0} rx={9} ry={6} fill="#1e293b" />
                <text x={0} y={4} fill="#000" fontSize="10" textAnchor="middle" fontWeight="bold">
                  BOOM
                </text>
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
            ) : prop.propType === 'car' || prop.propType === 'vehicle_suv' || prop.propType === 'vehicle_police' ? (
              <g>
                {/* Vehicle chassis */}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} stroke="#0f172a" strokeWidth={2} rx={16} />
                {/* Front windshield */}
                <path
                  d={`M ${-w / 2 + 18} ${-h / 2 + 35} L ${w / 2 - 18} ${-h / 2 + 35} L ${w / 2 - 25} ${-h / 2 + 65} L ${-w / 2 + 25} ${-h / 2 + 65} Z`}
                  fill="#0f172a"
                />
                {/* Rear windshield */}
                <path
                  d={`M ${-w / 2 + 22} ${h / 2 - 35} L ${w / 2 - 22} ${h / 2 - 35} L ${w / 2 - 25} ${h / 2 - 58} L ${-w / 2 + 25} ${h / 2 - 58} Z`}
                  fill="#0f172a"
                />
                {/* Headlights */}
                <rect x={-w / 2 + 10} y={-h / 2 + 2} width={12} height={4} fill="#fef08a" rx={1} />
                <rect x={w / 2 - 22} y={-h / 2 + 2} width={12} height={4} fill="#fef08a" rx={1} />
                {prop.propType === 'vehicle_police' && (
                  <g>
                    <rect x={-14} y={-4} width={12} height={8} fill="#ef4444" rx={1} />
                    <rect x={2} y={-4} width={12} height={8} fill="#3b82f6" rx={1} />
                  </g>
                )}
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

            {/* Prop Label (always upright) */}
            {showPropLabel && (
              <g transform={`rotate(${-prop.rotation})`} opacity={labelOpacity}>
                <text
                  x={0}
                  y={4}
                  fill={displaySettings.propLabelColor ?? '#ffffff'}
                  fontSize={10 * labelScale}
                  fontWeight="600"
                  textAnchor="middle"
                  className="select-none font-sans pointer-events-none drop-shadow"
                >
                  {prop.label || prop.name}
                </text>
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

        return (
          <g
            key={m.id}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(m.id, e)}
          >
            {/* Guide line */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isSelected ? '#38bdf8' : '#f59e0b'}
              strokeWidth={2.5}
              strokeDasharray="6 3"
            />
            {/* Endpoints */}
            <circle cx={x1} cy={y1} r={5} fill="#f59e0b" stroke="#0f172a" strokeWidth={1.5} />
            <circle cx={x2} cy={y2} r={5} fill="#f59e0b" stroke="#0f172a" strokeWidth={1.5} />

            {/* Dimension Badge - Always stays upright */}
            {showMeasurementLabel && (
              <g transform={`translate(${midX}, ${midY}) scale(${labelScale})`} opacity={labelOpacity}>
                <rect
                  x={-34}
                  y={-11}
                  width={68}
                  height={22}
                  fill="#0f172a"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  rx={4}
                  className="drop-shadow-md"
                />
                <text
                  x={0}
                  y={4}
                  fill="#f59e0b"
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

      {/* 4. Text Annotations with Double-Click Inline Editing */}
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
                fontFamily="sans-serif"
                fontWeight="600"
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
