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
  if (fixtureType === 'practical') {
    return (
      <g className="fixture-practical-bulb">
        {/* Subtle Soft Glow hugging the bulb */}
        <circle cx={0} cy={-5} r={11} fill={color} fillOpacity={0.25} />

        {/* Threaded Screw Base */}
        <rect x={-3.5} y={5} width={7} height={5.5} rx={1} fill="#475569" stroke="#0f172a" strokeWidth={1} />
        <line x1={-3} y1={7} x2={3} y2={7} stroke="#94a3b8" strokeWidth={0.8} />
        <line x1={-3} y1={8.8} x2={3} y2={8.8} stroke="#94a3b8" strokeWidth={0.8} />
        <path d="M -1.8 10.5 L 1.8 10.5 C 1.2 12, -1.2 12, -1.8 10.5 Z" fill="#1e293b" stroke="#0f172a" strokeWidth={0.6} />

        {/* Glass Bulb Envelope */}
        <path
          d="M -3.5 5 C -5 3, -9 -0.5, -9 -5 C -9 -10, -5 -14, 0 -14 C 5 -14, 9 -10, 9 -5 C 9 -0.5, 5 3, 3.5 5 Z"
          fill={color}
          stroke={selected ? '#38bdf8' : '#0f172a'}
          strokeWidth={selected ? 2 : 1.5}
        />

        {/* Glass Reflection Highlight */}
        <path
          d="M -6 -8 C -6 -11, -3.5 -12, -1 -12"
          fill="none"
          stroke="#ffffff"
          strokeWidth={1}
          strokeLinecap="round"
          strokeOpacity={0.6}
        />

        {/* Glowing Incandescent Filament Loop */}
        <path
          d="M -2.5 2.5 L -1.2 -3 C -1.2 -5.5, 1.2 -5.5, 1.2 -3 L 2.5 2.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }
  if (fixtureType === 'china_ball') {
    return (
      <g className="fixture-china-ball">
        {/* Ambient Omnidirectional Glow */}
        <circle cx={0} cy={0} r={18} fill={color} fillOpacity={0.25} />
        {/* Main Lantern Sphere */}
        <circle cx={0} cy={0} r={14} fill={color} stroke={selected ? '#38bdf8' : '#0f172a'} strokeWidth={1.75} />
        {/* Ribbed paper lines */}
        <ellipse cx={0} cy={0} rx={10} ry={14} fill="none" stroke="rgba(15, 23, 42, 0.4)" strokeWidth={1} />
        <ellipse cx={0} cy={0} rx={5} ry={14} fill="none" stroke="rgba(15, 23, 42, 0.3)" strokeWidth={1} />
        <line x1={-14} y1={0} x2={14} y2={0} stroke="rgba(15, 23, 42, 0.35)" strokeWidth={1} />
        {/* Top/Bottom Cap Rings */}
        <circle cx={0} cy={-13.5} r={2} fill="#334155" stroke="#0f172a" strokeWidth={0.8} />
        <circle cx={0} cy={13.5} r={2} fill="#334155" stroke="#0f172a" strokeWidth={0.8} />
      </g>
    );
  }
  if (fixtureType === 'tube_light') {
    return (
      <g className="fixture-tube-light">
        {/* Ambient Phosphor Tube Glow */}
        <rect x={-8} y={-26} width={16} height={52} rx={8} fill={color} fillOpacity={0.22} />
        {/* Polycarbonate Tube Body */}
        <rect x={-5} y={-24} width={10} height={48} rx={5} fill={color} stroke={selected ? '#38bdf8' : '#0f172a'} strokeWidth={1.5} />
        {/* 8 Discrete Glowing Pixel Segments */}
        {[-20, -14, -8, -2, 4, 10, 16].map((y) => (
          <line key={y} x1={-4} y1={y} x2={4} y2={y} stroke="rgba(15, 23, 42, 0.25)" strokeWidth={1} />
        ))}
        {/* High-intensity Core Emitter Line */}
        <line x1={0} y1={-21} x2={0} y2={21} stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" strokeOpacity={0.85} />
        {/* Metallic Anodized End Caps */}
        <rect x={-6} y={-26} width={12} height={4} rx={1.5} fill="#334155" stroke="#0f172a" strokeWidth={1} />
        <rect x={-6} y={22} width={12} height={4} rx={1.5} fill="#334155" stroke="#0f172a" strokeWidth={1} />
        {/* Center Astera Tube Clamp / Baby Pin Mount */}
        <rect x={-7} y={-4} width={14} height={8} rx={2} fill="#0f172a" stroke={selected ? '#38bdf8' : '#94a3b8'} strokeWidth={1.2} />
        <circle cx={0} cy={0} r={2} fill="#38bdf8" />
      </g>
    );
  }
  if (fixtureType === 'softbox') {
    return (
      <g className="fixture-softbox-dome">
        {/* Rear Heavy Speedring / Housing */}
        <rect x={-14} y={-9} width={8} height={18} rx={2.5} fill="#0f172a" stroke={selected ? '#38bdf8' : '#64748b'} strokeWidth={1.5} />
        <line x1={-14} y1={0} x2={-18} y2={0} stroke="#94a3b8" strokeWidth={3} strokeLinecap="round" />
        <circle cx={-18} cy={0} r={2.5} fill="#38bdf8" />
        {/* Flared Octa / Parabolic Softbox Canopy */}
        <polygon points="-6,-9 14,-18 14,18 -6,9" fill="#1e293b" stroke={selected ? '#38bdf8' : '#94a3b8'} strokeWidth={1.75} />
        {/* Canopy Rib Tension Lines */}
        <line x1="-5" y1="-5" x2="13" y2="-9" stroke="#334155" strokeWidth={1} />
        <line x1="-5" y1="0" x2="13" y2="0" stroke="#334155" strokeWidth={1} />
        <line x1="-5" y1="5" x2="13" y2="9" stroke="#334155" strokeWidth={1} />
        {/* Recessed Front Diffusion Screen with Velcro Lip */}
        <line x1={14} y1={-18} x2={14} y2={18} stroke={color} strokeWidth={4.5} strokeLinecap="round" />
        <line x1={14} y1={-15} x2={14} y2={15} stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
        {/* Honeycomb Eggcrate Grid Highlights */}
        <line x1="2" y1="-10" x2="12" y2="-10" stroke="rgba(255,255,255,0.4)" strokeWidth={0.75} strokeDasharray="2 2" />
        <line x1="2" y1="0" x2="12" y2="0" stroke="rgba(255,255,255,0.4)" strokeWidth={0.75} strokeDasharray="2 2" />
        <line x1="2" y1="10" x2="12" y2="10" stroke="rgba(255,255,255,0.4)" strokeWidth={0.75} strokeDasharray="2 2" />
      </g>
    );
  }
  if (fixtureType === 'led_panel') {
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
      <g className="fixture-reflector-bounce">
        {/* Left-side gobo mounting arm & knuckle (same visual language as C-stand flags) */}
        <line x1={-18} y1={0} x2={-12} y2={0} stroke="#94a3b8" strokeWidth={3} strokeLinecap="round" />
        <circle cx={-18} cy={0} r={3} fill="#1e293b" stroke="#94a3b8" strokeWidth={1} />
        <line x1={-18} y1={-4} x2={-18} y2={4} stroke="#38bdf8" strokeWidth={1.5} strokeLinecap="round" />

        {/* Outer Foamcore / Beadboard / Aluminum Frame */}
        <rect
          x={-12}
          y={-18}
          width={24}
          height={36}
          rx={2}
          fill="rgba(241, 245, 249, 0.85)"
          stroke={selected ? '#38bdf8' : '#cbd5e1'}
          strokeWidth={selected ? 2 : 1.5}
        />

        {/* Inner Silk/Reflective Sheen Inset */}
        <rect
          x={-9}
          y={-15}
          width={18}
          height={30}
          rx={1}
          fill="rgba(255, 255, 255, 0.4)"
          stroke="rgba(148, 163, 184, 0.5)"
          strokeWidth={0.8}
        />

        {/* 4 Corner Grommets / Tie Points */}
        <circle cx={-9} cy={-15} r={1.2} fill="#64748b" />
        <circle cx={9} cy={-15} r={1.2} fill="#64748b" />
        <circle cx={-9} cy={15} r={1.2} fill="#64748b" />
        <circle cx={9} cy={15} r={1.2} fill="#64748b" />

        {/* Diagonal Silk / Silver Bounce Sheen Wrinkle Lines (like Flag Silk) */}
        <line x1={-8} y1={-10} x2={8} y2={-4} stroke="rgba(255, 255, 255, 0.9)" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={-8} y1={-4} x2={8} y2={2} stroke="rgba(255, 255, 255, 0.9)" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={-8} y1={4} x2={8} y2={10} stroke="rgba(255, 255, 255, 0.9)" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={-7} y1={-12} x2={7} y2={0} stroke="rgba(56, 189, 248, 0.5)" strokeWidth={0.8} />
        <line x1={-7} y1={0} x2={7} y2={12} stroke="rgba(56, 189, 248, 0.5)" strokeWidth={0.8} />
      </g>
    );
  }
  if (fixtureType === 'overhead_diffusion') {
    return (
      <g className="fixture-overhead-frame">
        {/* Speedrail Square Pipe Frame */}
        <rect
          x={-24}
          y={-24}
          width={48}
          height={48}
          rx={3}
          fill="rgba(241, 245, 249, 0.45)"
          stroke={selected ? '#38bdf8' : '#94a3b8'}
          strokeWidth={2.5}
        />
        {/* Corner Speedrail Elbow Castings */}
        <circle cx={-24} cy={-24} r={3} fill="#0f172a" stroke="#cbd5e1" strokeWidth={1} />
        <circle cx={24} cy={-24} r={3} fill="#0f172a" stroke="#cbd5e1" strokeWidth={1} />
        <circle cx={-24} cy={24} r={3} fill="#0f172a" stroke="#cbd5e1" strokeWidth={1} />
        <circle cx={24} cy={24} r={3} fill="#0f172a" stroke="#cbd5e1" strokeWidth={1} />
        {/* Center Fabric Cross Folds */}
        <line x1={-20} y1={0} x2={20} y2={0} stroke="rgba(255, 255, 255, 0.6)" strokeWidth={1} strokeDasharray="3 2" />
        <line x1={0} y1={-20} x2={0} y2={20} stroke="rgba(255, 255, 255, 0.6)" strokeWidth={1} strokeDasharray="3 2" />
        {/* Bungee Tie Loops */}
        {[-12, 0, 12].map((p) => (
          <React.Fragment key={p}>
            <circle cx={p} cy={-24} r={1.5} fill="#475569" />
            <circle cx={p} cy={24} r={1.5} fill="#475569" />
            <circle cx={-24} cy={p} r={1.5} fill="#475569" />
            <circle cx={24} cy={p} r={1.5} fill="#475569" />
          </React.Fragment>
        ))}
      </g>
    );
  }
  if (fixtureType === 'kino_flo') {
    return (
      <g className="fixture-kino-flo">
        {/* Outer Black Shell */}
        <rect
          x={-18}
          y={-14}
          width={36}
          height={28}
          rx={3}
          fill="#0f172a"
          stroke={selected ? '#38bdf8' : '#64748b'}
          strokeWidth={1.5}
        />
        {/* Honeycomb Eggcrate Louvers */}
        <line x1={-18} y1={-7} x2={18} y2={-7} stroke="#334155" strokeWidth={0.75} />
        <line x1={-18} y1={0} x2={18} y2={0} stroke="#334155" strokeWidth={0.75} />
        <line x1={-18} y1={7} x2={18} y2={7} stroke="#334155" strokeWidth={0.75} />
        {/* 4 Distinct Fluorescent/LED Tubes */}
        {[-10.5, -3.5, 3.5, 10.5].map((y) => (
          <g key={y}>
            <rect x={-15} y={y - 1.5} width={30} height={3} rx={1.5} fill={color} />
            <line x1={-13} y1={y} x2={13} y2={y} stroke="#ffffff" strokeWidth={0.75} strokeOpacity={0.8} />
          </g>
        ))}
        {/* Center Baby-Ball Receiver */}
        <circle cx={0} cy={0} r={3} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
      </g>
    );
  }
  if (fixtureType === 'led_panel') {
    return (
      <g className="fixture-led-panel">
        {/* Dual Yoke Mounting Knobs */}
        <line x1={0} y1={-22} x2={0} y2={22} stroke="#64748b" strokeWidth={2.5} />
        <circle cx={0} cy={-22} r={2.5} fill="#0f172a" stroke="#cbd5e1" strokeWidth={1} />
        <circle cx={0} cy={22} r={2.5} fill="#0f172a" stroke="#cbd5e1" strokeWidth={1} />
        {/* Main Panel Housing */}
        <rect
          x={-10}
          y={-18}
          width={20}
          height={36}
          rx={3}
          fill="#1e293b"
          stroke={selected ? '#38bdf8' : '#cbd5e1'}
          strokeWidth={1.75}
        />
        {/* Emitter Matrix Area */}
        <rect x={-7} y={-15} width={14} height={30} rx={1.5} fill={color} fillOpacity={0.85} />
        {/* 3x6 LED Diode Matrix Grid */}
        {[-10, -5, 0, 5, 10].map((y) => (
          <React.Fragment key={y}>
            <circle cx={-3.5} cy={y} r={1} fill="#ffffff" fillOpacity={0.9} />
            <circle cx={0} cy={y} r={1} fill="#ffffff" fillOpacity={0.9} />
            <circle cx={3.5} cy={y} r={1} fill="#ffffff" fillOpacity={0.9} />
          </React.Fragment>
        ))}
      </g>
    );
  }
  if (fixtureType === 'par_can') {
    return (
      <g className="fixture-par-can">
        {/* U-Yoke */}
        <path d="M -12 -12 C -18 0, -18 0, -12 12" fill="none" stroke="#94a3b8" strokeWidth={2} />
        {/* Spun Aluminum Par Body */}
        <rect x={-8} y={-9} width={18} height={18} rx={2} fill="#1e293b" stroke={selected ? '#38bdf8' : '#e2e8f0'} strokeWidth={1.5} />
        {/* Par Bulb Reflector */}
        <circle cx={10} cy={0} r={8} fill={color} stroke="#0f172a" strokeWidth={1} />
        <circle cx={10} cy={0} r={3} fill="#ffffff" />
        {/* Gel Frame Holder */}
        <line x1={12} y1={-10} x2={12} y2={10} stroke="#cbd5e1" strokeWidth={2} strokeLinecap="round" />
      </g>
    );
  }
  if (fixtureType === 'hmi') {
    return (
      <g className="fixture-hmi-max">
        {/* Heavy U-Yoke */}
        <path d="M -14 -14 C -20 0, -20 0, -14 14" fill="none" stroke="#94a3b8" strokeWidth={2.5} />
        {/* Heavy Cast Aluminum Igniter Housing */}
        <rect
          x={-12}
          y={-11}
          width={18}
          height={22}
          rx={3}
          fill="#1e293b"
          stroke={selected ? '#38bdf8' : '#e2e8f0'}
          strokeWidth={1.5}
        />
        {/* Cooling Ribs */}
        <line x1={-8} y1={-11} x2={-8} y2={11} stroke="#475569" strokeWidth={1} />
        <line x1={-4} y1={-11} x2={-4} y2={11} stroke="#475569" strokeWidth={1} />
        {/* Faceted MAX Reflector Nose */}
        <polygon points="6,-10 14,-14 14,14 6,10" fill={color} stroke="#0f172a" strokeWidth={1.5} />
        <line x1={14} y1={-14} x2={14} y2={14} stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
        {/* 4-Leaf Barndoors */}
        <line x1={14} y1={-14} x2={22} y2={-20} stroke="#334155" strokeWidth={2} strokeLinecap="round" />
        <line x1={14} y1={14} x2={22} y2={20} stroke="#334155" strokeWidth={2} strokeLinecap="round" />
      </g>
    );
  }
  if (fixtureType === 'spotlight') {
    return (
      <g className="fixture-spotlight-leko">
        {/* Yoke Bracket */}
        <path d="M -16 -12 C -22 0, -22 0, -16 12" fill="none" stroke="#94a3b8" strokeWidth={2.5} />
        {/* Rear Lamp Housing */}
        <rect x={-14} y={-8} width={10} height={16} rx={2} fill="#1e293b" stroke={selected ? '#38bdf8' : '#cbd5e1'} strokeWidth={1.5} />
        {/* Stepped Barrel / Lens Tube */}
        <polygon points="-4,-7 14,-5 14,5 -4,7" fill="#0f172a" stroke={selected ? '#38bdf8' : '#94a3b8'} strokeWidth={1.5} />
        {/* Front Lens Ring */}
        <rect x={14} y={-5} width={4} height={10} rx={1} fill={color} stroke="#0f172a" strokeWidth={1} />
        <line x1={18} y1={-5} x2={18} y2={5} stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
        {/* 4 Framing Shutter Blade Handles */}
        <line x1={2} y1={-12} x2={2} y2={-5} stroke="#cbd5e1" strokeWidth={2} strokeLinecap="round" />
        <line x1={2} y1={5} x2={2} y2={12} stroke="#cbd5e1" strokeWidth={2} strokeLinecap="round" />
      </g>
    );
  }
  // Fresnel Standard
  return (
    <g className="fixture-fresnel">
      {/* Heavy Yoke Bracket */}
      <path d="M -12 -12 C -18 0, -18 0, -12 12" fill="none" stroke="#94a3b8" strokeWidth={2.5} />
      {/* Cylindrical Ribbed Body */}
      <polygon
        points="-10,-9 8,-8 8,8 -10,9"
        fill="#1e293b"
        stroke={selected ? '#38bdf8' : '#e2e8f0'}
        strokeWidth={1.5}
      />
      {/* Concentric Stepped Fresnel Glass Rings */}
      <rect x={8} y={-8} width={4} height={16} rx={1.5} fill={color} stroke="#0f172a" strokeWidth={1} />
      <line x1={12} y1={-7} x2={12} y2={7} stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      {/* 4-Way Rotating Barn Doors */}
      <line x1={8} y1={-8} x2={16} y2={-16} stroke="#334155" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={8} y1={8} x2={16} y2={16} stroke="#334155" strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );
};