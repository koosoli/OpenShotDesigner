import React from 'react';
import { DoorElement, WallElement, WindowElement } from '../../types';

interface WallLayerProps {
  walls: WallElement[];
  doors: DoorElement[];
  windows: WindowElement[];
  selectedIds: string[];
  snappedWallId?: string | null;
  showLightBeams: boolean;
  showDoorWindowLabels: boolean;
  onSelect: (id: string, e: React.PointerEvent) => void;
  onDoubleClick?: (id: string, e: React.MouseEvent) => void;
  categoryOpacity?: { architecture?: number };
  labelOpacity?: number;
  labelColor?: string | null;
}

export const WallLayer: React.FC<WallLayerProps> = ({
  walls,
  doors,
  windows,
  selectedIds,
  snappedWallId,
  showLightBeams,
  showDoorWindowLabels,
  onSelect,
  onDoubleClick,
  categoryOpacity,
  labelOpacity = 1,
  labelColor,
}) => {
  return (
    <g className="wall-layer" opacity={categoryOpacity?.architecture ?? 1.0}>
      {/* 1. Walls */}
      {walls.map((wall) => {
        const isSelected = selectedIds.includes(wall.id);
        const isSnapped = snappedWallId === wall.id;
        const x1 = wall.x;
        const y1 = wall.y;
        const x2 = wall.x2 ?? wall.x + 200;
        const y2 = wall.y2 ?? wall.y;
        const thickness = wall.thickness || 12;

        return (
          <g
            key={wall.id}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(wall.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(wall.id, e);
            }}
          >
            {/* Hit area */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="transparent"
              strokeWidth={thickness + 18}
              strokeLinecap="round"
            />
            {/* Snap hover glow */}
            {isSnapped && (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#38bdf8"
                strokeWidth={thickness + 8}
                strokeLinecap="round"
                strokeOpacity={0.45}
                className="animate-pulse"
              />
            )}
            {/* Wall Body */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isSelected ? '#38bdf8' : isSnapped ? '#0284c7' : wall.wallColor || '#64748b'}
              strokeWidth={thickness}
              strokeLinecap="round"
            />
            {/* Wall center architectural hatch line */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isSelected ? '#0284c7' : '#334155'}
              strokeWidth={2}
              strokeDasharray="4 4"
            />
            {/* Selection endpoints */}
            {isSelected && (
              <>
                <circle cx={x1} cy={y1} r={6} fill="#38bdf8" stroke="#0f172a" strokeWidth={2} />
                <circle cx={x2} cy={y2} r={6} fill="#38bdf8" stroke="#0f172a" strokeWidth={2} />
              </>
            )}
          </g>
        );
      })}

      {/* 2. Windows */}
      {windows.map((win) => {
        const isSelected = selectedIds.includes(win.id);
        const w = win.width || 100;
        const d = win.depth || 12;

        return (
          <g
            key={win.id}
            transform={`translate(${win.x}, ${win.y}) rotate(${win.rotation})`}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(win.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(win.id, e);
            }}
          >
            {/* Sunlight throw indicator */}
            {showLightBeams && win.beamVisible === true && (
              <path
                d={`M ${-w / 2} 0 L ${-w / 2 - 40} 80 L ${w / 2 + 40} 80 L ${w / 2} 0 Z`}
                fill="rgba(253, 224, 71, 0.08)"
                stroke="rgba(253, 224, 71, 0.25)"
                strokeWidth={1}
                strokeDasharray="3 3"
                className="pointer-events-none"
              />
            )}
            {/* Window frame */}
            <rect
              x={-w / 2}
              y={-d / 2}
              width={w}
              height={d}
              fill="#0f172a"
              stroke={isSelected ? '#38bdf8' : '#94a3b8'}
              strokeWidth={2}
              rx={2}
            />
            {/* Glass pane lines */}
            <line
              x1={-w / 2 + 4}
              y1={0}
              x2={w / 2 - 4}
              y2={0}
              stroke="#38bdf8"
              strokeWidth={2}
            />
            <line
              x1={0}
              y1={-d / 2}
              x2={0}
              y2={d / 2}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
            {/* Label */}
            {showDoorWindowLabels && (
              <text
                x={0}
                y={-d / 2 - 6}
                fill={labelColor ?? '#94a3b8'}
                fontSize="10"
                textAnchor="middle"
                opacity={labelOpacity}
                className="select-none font-mono"
              >
                WINDOW
              </text>
            )}
          </g>
        );
      })}

      {/* 3. Doors */}
      {doors.map((door) => {
        const isSelected = selectedIds.includes(door.id);
        const w = door.width || 60;
        const swing = Math.min(180, door.swingAngle || 90);
        const open = door.isOpen !== false;
        const rad = (swing * Math.PI) / 180;
        const leftHinge = door.swingDirection !== 'right'; // hinge at the left end
        const hingeX = leftHinge ? 0 : w;
        const otherX = w - hingeX; // far end of the leaf when closed

        // Open leaf endpoint (rotated about the hinge).
        const openX = hingeX + (otherX - hingeX) * Math.cos(rad);
        const openY = leftHinge ? (otherX - hingeX) * Math.sin(rad) : -(otherX - hingeX) * Math.sin(rad);

        return (
          <g
            key={door.id}
            transform={`translate(${door.x}, ${door.y}) rotate(${door.rotation})`}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(door.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(door.id, e);
            }}
          >
            {/* Door opening threshold gap line */}
            <line
              x1={0}
              y1={0}
              x2={w}
              y2={0}
              stroke="#0f172a"
              strokeWidth={14}
              strokeLinecap="butt"
            />
            {/* Door frame jambs (left & right posts) */}
            <rect x={-5} y={-8} width={7} height={16} rx={1.5} fill="#d97706" stroke="#0f172a" strokeWidth={1.5} />
            <rect x={w - 2} y={-8} width={7} height={16} rx={1.5} fill="#d97706" stroke="#0f172a" strokeWidth={1.5} />

            <line
              x1={0}
              y1={0}
              x2={w}
              y2={0}
              stroke={isSelected ? '#38bdf8' : '#d97706'}
              strokeWidth={2}
              strokeOpacity={open ? 0.7 : 0}
            />
            {open && swing > 2 && (
              /* Pronounced Swing Arc */
              <path
                d={`M ${otherX} 0 A ${w} ${w} 0 0 ${leftHinge ? 1 : 0} ${openX} ${openY}`}
                fill="none"
                stroke={isSelected ? '#38bdf8' : '#f59e0b'}
                strokeWidth={2}
                strokeDasharray="4 3"
                strokeOpacity={0.85}
              />
            )}
            {/* Bold Door Leaf */}
            <line
              x1={hingeX}
              y1={0}
              x2={open ? openX : otherX}
              y2={open ? openY : 0}
              stroke={isSelected ? '#38bdf8' : '#fbbf24'}
              strokeWidth={5}
              strokeLinecap="round"
            />
            {/* Hinge Point */}
            <circle cx={hingeX} cy={0} r={4.5} fill="#d97706" stroke="#0f172a" strokeWidth={1.5} />
            {/* Handle / Knob indicator near door edge */}
            {open && (
              <circle
                cx={hingeX + (openX - hingeX) * 0.85}
                cy={openY * 0.85}
                r={3}
                fill="#0f172a"
                stroke="#ffffff"
                strokeWidth={1}
              />
            )}
            {showDoorWindowLabels && (
              <text
                x={w / 2}
                y={-10}
                fill={labelColor ?? '#f59e0b'}
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
                opacity={labelOpacity}
                className="select-none font-mono drop-shadow-sm"
              >
                DOOR
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
};
