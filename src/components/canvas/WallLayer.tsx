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
}) => {
  return (
    <g className="wall-layer">
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
          >
            {/* Sunlight throw indicator */}
            {showLightBeams && win.beamVisible !== false && (
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
                fill="#94a3b8"
                fontSize="10"
                textAnchor="middle"
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
          >
            {/* Door frame / threshold (hidden when the closed leaf covers it) */}
            <line
              x1={0}
              y1={0}
              x2={w}
              y2={0}
              stroke={isSelected ? '#38bdf8' : '#94a3b8'}
              strokeWidth={1}
              strokeOpacity={open ? 0.55 : 0}
            />
            {open && swing > 2 && (
              /* Swing Arc */
              <path
                d={`M ${otherX} 0 A ${w} ${w} 0 0 ${leftHinge ? 1 : 0} ${openX} ${openY}`}
                fill="none"
                stroke={isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.4)'}
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            )}
            {/* Door Leaf */}
            <line
              x1={hingeX}
              y1={0}
              x2={open ? openX : otherX}
              y2={open ? openY : 0}
              stroke={isSelected ? '#38bdf8' : '#e2e8f0'}
              strokeWidth={4}
              strokeLinecap="round"
            />
            {/* Hinge Point */}
            <circle cx={hingeX} cy={0} r={4} fill="#f59e0b" />
            {showDoorWindowLabels && (
              <text
                x={w / 2}
                y={-8}
                fill="#94a3b8"
                fontSize="10"
                textAnchor="middle"
                className="select-none font-mono"
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
