import React from 'react';
import { ArrowElement } from '../../types';

interface ArrowGlyphProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  strokeWidth?: number;
  headStyle?: ArrowElement['headStyle'];
  dashStyle?: ArrowElement['dashStyle'];
}

/**
 * Pure visual rendering of an arrow annotation (shaft + arrowhead), centered
 * on the given coordinates in the caller's coordinate space. Shared by the
 * floor plan canvas and the printable export so both stay pixel-identical.
 * Draws the head at the END point (x2,y2) pointing toward it from the start.
 */
export const ArrowGlyph: React.FC<ArrowGlyphProps> = ({
  x1,
  y1,
  x2,
  y2,
  color = '#f97316',
  strokeWidth = 2.5,
  headStyle = 'single',
  dashStyle = 'solid',
}) => {
  const dashArray =
    dashStyle === 'dashed' ? '8 5' : dashStyle === 'dotted' ? '2 5' : undefined;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(10, 7 + strokeWidth * 2);
  const half = 0.45;

  // Back off the shaft ends so the head never overlaps / clips the shaft.
  // Open heads need a visible gap; filled heads inset the shaft so it stops
  // under the triangle instead of poking past the apex with its round cap.
  const lineInsetEnd = headLen * (headStyle === 'open' ? 0.7 : 0.5);
  const lineInsetStart = headLen * (headStyle === 'double' ? 0.5 : 0);
  const lx1 = x1 + Math.cos(angle) * lineInsetStart;
  const ly1 = y1 + Math.sin(angle) * lineInsetStart;
  const lx2 = x2 - Math.cos(angle) * lineInsetEnd;
  const ly2 = y2 - Math.sin(angle) * lineInsetEnd;

  // dir === -1 → apex at the END point, base behind it (pointing toward travel).
  // dir === 1  → apex at the START point, base ahead of it (pointing backward).
  const headAt = (cx: number, cy: number, dir: number) => {
    const a2 = angle + (dir === 1 ? Math.PI : 0);
    const c1 = Math.cos(a2 + half);
    const s1 = Math.sin(a2 + half);
    const c2 = Math.cos(a2 - half);
    const s2 = Math.sin(a2 - half);
    return {
      tip: `${cx},${cy}`,
      p1: `${(cx - headLen * c1).toFixed(1)},${(cy - headLen * s1).toFixed(1)}`,
      p2: `${(cx - headLen * c2).toFixed(1)},${(cy - headLen * s2).toFixed(1)}`,
    };
  };

  const h = headAt(x2, y2, -1);
  const s = headAt(x1, y1, 1);

  return (
    <g>
      <line
        x1={lx1}
        y1={ly1}
        x2={lx2}
        y2={ly2}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={dashArray}
      />
      {headStyle === 'open' ? (
        <path
          d={`M ${h.tip} L ${h.p1} M ${h.tip} L ${h.p2}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ) : (
        <polygon points={`${h.tip} ${h.p1} ${h.p2}`} fill={color} />
      )}
      {headStyle === 'double' && <polygon points={`${s.tip} ${s.p1} ${s.p2}`} fill={color} />}
    </g>
  );
};