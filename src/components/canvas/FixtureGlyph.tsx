import React from 'react';
import { LightElement } from '../../types';

interface FixtureGlyphProps {
  fixtureType: string;
  color: string;
  selected?: boolean;
}

/**
 * Top-down housing icon for a non-flag light fixture. Drawn centered on the
 * element origin so the caller wraps it in a `translate(x,y) rotate(rotation)`
 * transform. Shared by the floor plan canvas and the printable export so both
 * render the real fixture shape (not a generic dot).
 */
export const FixtureGlyph: React.FC<FixtureGlyphProps> = ({ fixtureType, color, selected }) => {
  if (fixtureType === 'tube_light') {
    return (
      <g>
        <rect x={-6} y={-24} width={12} height={48} fill={color} stroke="#0f172a" strokeWidth={1.5} rx={6} />
        <circle cx={0} cy={0} r={4} fill="#ffffff" />
      </g>
    );
  }
  if (fixtureType === 'led_panel' || fixtureType === 'softbox') {
    return (
      <g>
        <rect
          x={-8}
          y={-18}
          width={16}
          height={36}
          fill="#1e293b"
          stroke={selected ? '#38bdf8' : '#cbd5e1'}
          strokeWidth={2}
          rx={2}
        />
        <rect x={-4} y={-14} width={8} height={28} fill={color} opacity={0.9} />
      </g>
    );
  }
  if (fixtureType === 'reflector') {
    return (
      <g>
        <rect x={-4} y={-20} width={8} height={40} fill="#ffffff" stroke="#64748b" strokeWidth={2} />
        <line x1={0} y1={-20} x2={0} y2={20} stroke="#94a3b8" strokeWidth={1} />
      </g>
    );
  }
  if (fixtureType === 'kino_flo') {
    return (
      <g>
        <rect
          x={-18}
          y={-14}
          width={36}
          height={28}
          rx={2}
          fill="#0f172a"
          stroke={selected ? '#38bdf8' : '#cbd5e1'}
          strokeWidth={2}
        />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={-13} y={-10 + i * 7} width={26} height={3} rx={1.5} fill={color} />
        ))}
      </g>
    );
  }
  if (fixtureType === 'par_can') {
    return (
      <g>
        <circle cx={0} cy={0} r={13} fill="#1e293b" stroke={selected ? '#38bdf8' : '#e2e8f0'} strokeWidth={2} />
        <circle cx={2} cy={0} r={7} fill={color} />
        <circle cx={2} cy={0} r={9} fill="none" stroke="#0f172a" strokeWidth={1} />
      </g>
    );
  }
  if (fixtureType === 'hmi') {
    return (
      <g>
        <rect
          x={-12}
          y={-9}
          width={16}
          height={18}
          rx={2}
          fill="#1e293b"
          stroke={selected ? '#38bdf8' : '#e2e8f0'}
          strokeWidth={1.5}
        />
        <rect x={4} y={-8} width={10} height={16} rx={1.5} fill={color} />
        <line x1={12} y1={-8} x2={12} y2={8} stroke={color} strokeWidth={2.5} />
      </g>
    );
  }
  // Fresnel / Standard Spot
  return (
    <g>
      <path d="M -12 -12 L -6 0 L -12 12" fill="none" stroke="#94a3b8" strokeWidth={2} />
      <polygon
        points="-8,-10 10,-6 10,6 -8,10"
        fill="#1e293b"
        stroke={selected ? '#38bdf8' : '#e2e8f0'}
        strokeWidth={1.5}
      />
      <line x1={10} y1={-6} x2={10} y2={6} stroke={color} strokeWidth={3} />
    </g>
  );
};