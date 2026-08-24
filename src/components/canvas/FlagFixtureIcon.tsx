import React from 'react';
import { FlagNetValue, LightElement } from '../../types';
import { FLAG_SIZE_PRESETS, getFlagPanelDims } from '../../constants/presets';

/** True for any light that is a C-stand flag (does not emit light). */
export function isFlagFixture(fixtureType: string): boolean {
  return (
    fixtureType === 'flag_solid' ||
    fixtureType === 'flag_silk' ||
    fixtureType === 'flag_net' ||
    fixtureType === 'flag_cutter' ||
    fixtureType === 'flag_cucoloris' ||
    fixtureType === 'flag_branchaloris' ||
    fixtureType === 'flag_shutter' ||
    fixtureType === 'c_stand_flag' ||
    fixtureType === 'tripod'
  );
}

/** Short human-readable label for a flag, e.g. "Solid 24×36"" */
export function flagLabel(light: LightElement): string {
  const size = FLAG_SIZE_PRESETS.find((s) => s.value === (light.flagSize || '24x36'));
  const sizeLabel = light.fixtureType === 'flag_cutter' ? 'Cutter' : size ? size.label : '24×36"';
  switch (light.fixtureType) {
    case 'c_stand_flag':
      return 'C-Stand + Arm';
    case 'tripod':
      return 'Tripod Stand';
    case 'flag_silk':
      return `Silk ${sizeLabel}`;
    case 'flag_net':
      return `${light.netValue === 'double' ? 'Dbl' : 'Sng'} Net ${sizeLabel}`;
    case 'flag_cutter':
      return 'Cutter 18×48"';
    case 'flag_cucoloris':
      return `Cucoloris ${sizeLabel}`;
    case 'flag_branchaloris':
      return 'Branchaloris';
    case 'flag_shutter':
      return 'Barn Doors / Shutter';
    case 'flag_solid':
    default:
      return `Solid ${sizeLabel}`;
  }
}

/** Radius (px) to use for the selection ring around a flag element. */
export function getFlagSelectionRadius(light: LightElement): number {
  if (light.fixtureType === 'c_stand_flag' || light.fixtureType === 'tripod') {
    return 48;
  }
  const { w, h } = getFlagPanelDims(light);
  return Math.max(52, Math.hypot(w / 2, h / 2) + 16);
}

interface FlagFixtureIconProps {
  light: LightElement;
  selected?: boolean;
}

/**
 * Top-down rendering of a C-stand flag / grip stand:
 * Drawn centered on the element origin.
 */
export const FlagFixtureIcon: React.FC<FlagFixtureIconProps> = ({ light, selected }) => {
  const frameStroke = selected ? '#38bdf8' : light.fixtureType === 'flag_silk' ? '#cbd5e1' : '#94a3b8';

  if (light.fixtureType === 'c_stand_flag') {
    return (
      <g className="c-stand-grip-arm">
        {/* Turtle base legs (Standard Grip Safety: High Big Leg under the arm load) */}
        {/* 1. Medium Leg (Top-Left 135°) */}
        <path d="M 0 0 C -10 -12, -20 -22, -32 -16" fill="none" stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
        <rect x={-35} y={-18} width={6} height={4} rx={1} fill="#0f172a" />

        {/* 2. Small Low Leg (Bottom-Left 225°) */}
        <path d="M 0 0 C -10 12, -20 22, -32 16" fill="none" stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
        <rect x={-35} y={14} width={6} height={4} rx={1} fill="#0f172a" />

        {/* 3. Big High Leg (Front Load Leg extending 0° directly under the grip arm) */}
        <path d="M 0 0 C 12 -4, 24 -6, 36 -1" fill="none" stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
        <rect x={35} y={-3} width={5} height={4} rx={1} fill="#0f172a" />

        {/* Center Base Hub Casting & Spring-Loaded Riser Receiver */}
        <circle cx={0} cy={0} r={7} fill="#1e293b" stroke={frameStroke} strokeWidth={2} />
        <circle cx={0} cy={0} r={3.5} fill="#475569" />

        {/* Center 2.5" Gobo Knuckle Head (Matthews Grip Head) */}
        <rect x={-5} y={-6} width={10} height={12} rx={2.5} fill="#0f172a" stroke={frameStroke} strokeWidth={1.5} />
        {/* Ergonomic Aluminum T-Handle Brake Lever */}
        <line x1={-9} y1={0} x2={9} y2={0} stroke="#38bdf8" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={-9} cy={0} r={1.5} fill="#ffffff" />
        <circle cx={9} cy={0} r={1.5} fill="#ffffff" />

        {/* 40" Stainless Steel Solid Grip Arm */}
        <line x1={0} y1={0} x2={52} y2={0} stroke="#0f172a" strokeWidth={3.5} strokeLinecap="round" />
        <line x1={0} y1={0} x2={52} y2={0} stroke="#cbd5e1" strokeWidth={2} strokeLinecap="round" />
        <line x1={2} y1={-0.5} x2={50} y2={-0.5} stroke="#ffffff" strokeWidth={0.8} strokeLinecap="round" />

        {/* End 2.5" Grip Head Knuckle on Arm Tip */}
        <rect x={46} y={-5} width={8} height={10} rx={2} fill="#0f172a" stroke={frameStroke} strokeWidth={1.5} />
        <line x1={50} y1={-7} x2={50} y2={7} stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" />
        {/* 5/8" Baby Pin Stud Tip */}
        <circle cx={55} cy={0} r={2} fill="#f59e0b" stroke="#0f172a" strokeWidth={0.6} />
      </g>
    );
  }

  if (light.fixtureType === 'tripod') {
    return (
      <g className="tripod-stand-fixture">
        {/* 3 Splayed Tubular Legs at 120° offsets */}
        {/* Leg 1 (Top-Left) */}
        <line x1={0} y1={0} x2={-24} y2={-16} stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
        <rect x={-27} y={-18} width={6} height={4} rx={1} fill="#0f172a" />
        {/* Leg 2 (Bottom-Left) */}
        <line x1={0} y1={0} x2={-24} y2={16} stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
        <rect x={-27} y={14} width={6} height={4} rx={1} fill="#0f172a" />
        {/* Leg 3 (Right) */}
        <line x1={0} y1={0} x2={28} y2={0} stroke="#64748b" strokeWidth={3.5} strokeLinecap="round" />
        <rect x={27} y={-2} width={4} height={4} rx={1} fill="#0f172a" />

        {/* Central Spreader Spider Braces (Triangle linking 3 legs) */}
        <polygon points="-12,-8 -12,8 14,0" fill="none" stroke="#475569" strokeWidth={1.5} />

        {/* Center Riser Base Casting */}
        <circle cx={0} cy={0} r={7} fill="#1e293b" stroke={frameStroke} strokeWidth={2} />
        {/* Locking T-Knob */}
        <line x1={-5} y1={0} x2={5} y2={0} stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" />
        {/* 5/8" Brass Baby Pin / Top Stud */}
        <circle cx={0} cy={0} r={3} fill="#f59e0b" stroke="#0f172a" strokeWidth={0.8} />
      </g>
    );
  }

  if (light.fixtureType === 'flag_branchaloris') {
    // Branchaloris: a real tree branch rigged on a C-stand arm to break up
    // light. Drawn as the grip arm plus the branch silhouette it carries.
    const { w: branchW, h: branchH } = getFlagPanelDims(light);
    const reach = branchW / 2;
    const spread = branchH / 2;
    return (
      <g className="branchaloris-fixture">
        {/* C-stand turtle base + gobo arm on the left */}
        <g transform={`translate(${-reach - 20}, 0)`}>
          <path d="M 0 0 C 6 -3, 14 -4, 20 0" fill="none" stroke="#64748b" strokeWidth={3} strokeLinecap="round" />
          <path d="M 0 0 C -6 -7, -12 -12, -18 -8" fill="none" stroke="#64748b" strokeWidth={3} strokeLinecap="round" />
          <path d="M 0 0 C -6 7, -12 12, -18 8" fill="none" stroke="#64748b" strokeWidth={3} strokeLinecap="round" />
          <circle cx={0} cy={0} r={4.5} fill="#1e293b" stroke="#94a3b8" strokeWidth={1.5} />
          <line x1={0} y1={0} x2={20} y2={0} stroke="#0f172a" strokeWidth={3} strokeLinecap="round" />
          <line x1={0} y1={0} x2={20} y2={0} stroke="#cbd5e1" strokeWidth={1.8} strokeLinecap="round" />
          <rect x={17} y={-3.5} width={5.5} height={7} rx={1.2} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
        </g>

        {/* Main limb, lashed to the arm tip and running across the beam */}
        <path
          d={`M ${-reach} 0 C ${-reach * 0.3} ${-spread * 0.35}, ${reach * 0.25} ${spread * 0.2}, ${reach} ${-spread * 0.15}`}
          fill="none"
          stroke={frameStroke}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <path
          d={`M ${-reach} 0 C ${-reach * 0.3} ${-spread * 0.35}, ${reach * 0.25} ${spread * 0.2}, ${reach} ${-spread * 0.15}`}
          fill="none"
          stroke="#4a3520"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* Side branches: what actually breaks the light up */}
        {[-0.55, -0.2, 0.15, 0.5].map((t, index) => {
          const bx = t * reach;
          const dir = index % 2 === 0 ? -1 : 1;
          return (
            <g key={`branch-${t}`}>
              <path
                d={`M ${bx} ${-spread * 0.1} Q ${bx + reach * 0.14} ${dir * spread * 0.45}, ${bx + reach * 0.3} ${dir * spread * 0.85}`}
                fill="none"
                stroke="#4a3520"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <ellipse
                cx={bx + reach * 0.3}
                cy={dir * spread * 0.85}
                rx={Math.max(3, reach * 0.11)}
                ry={Math.max(2, spread * 0.14)}
                fill="rgba(21, 128, 61, 0.55)"
                stroke="#166534"
                strokeWidth={0.8}
              />
            </g>
          );
        })}

        {/* Lash point marker at the arm knuckle */}
        <circle cx={-reach} cy={0} r={3} fill="#0f172a" stroke="#38bdf8" strokeWidth={1.2} />
      </g>
    );
  }

  if (light.fixtureType === 'flag_shutter') {
    // Barn doors / framing shutters: four hinged leaves on the fixture face.
    // Drawn top-down as the fixture ring with the leaves splayed forward.
    const { w: shutterW, h: shutterH } = getFlagPanelDims(light);
    const half = shutterH / 2;
    const leaf = Math.max(8, shutterW * 0.75);
    const cut = Math.max(0, Math.min(85, light.shutterCutDeg ?? 35));
    const rad = (cut * Math.PI) / 180;
    const tipX = Math.cos(rad) * leaf;
    const tipY = Math.sin(rad) * leaf;
    return (
      <g className="barndoor-shutter-fixture">
        {/* Fixture face ring the doors clamp onto */}
        <circle cx={0} cy={0} r={half} fill="rgba(15, 23, 42, 0.85)" stroke={frameStroke} strokeWidth={2} />
        <circle cx={0} cy={0} r={half * 0.55} fill="rgba(248, 250, 252, 0.14)" stroke="#94a3b8" strokeWidth={1} />

        {/* Top and bottom leaves, opened by the cut angle */}
        {[-1, 1].map((side) => (
          <g key={`leaf-${side}`}>
            <line
              x1={0}
              y1={side * half}
              x2={tipX}
              y2={side * (half + tipY)}
              stroke="#0f172a"
              strokeWidth={5}
              strokeLinecap="round"
            />
            <line
              x1={0}
              y1={side * half}
              x2={tipX}
              y2={side * (half + tipY)}
              stroke={frameStroke}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={0} cy={side * half} r={2.2} fill="#f59e0b" stroke="#0f172a" strokeWidth={0.6} />
          </g>
        ))}

        {/* Narrow side leaves, drawn shorter so the glyph reads as 4-leaf */}
        {[-1, 1].map((side) => (
          <line
            key={`side-leaf-${side}`}
            x1={0}
            y1={side * half * 0.35}
            x2={tipX * 0.6}
            y2={side * half * 0.35}
            stroke="#64748b"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </g>
    );
  }

  const { w: panelW, h: panelH } = getFlagPanelDims(light);
  const net = light.netValue === 'double' ? ('double' as FlagNetValue) : ('single' as FlagNetValue);

  const xL = -panelW / 2; // panel left edge
  const xR = panelW / 2; // panel right edge
  const yT = -panelH / 2; // panel top
  const yB = panelH / 2; // panel bottom

  // Short riser + gobo arm stub on the left edge, purely for orientation.
  const armY = 0;

  const fill =
    light.fixtureType === 'flag_silk'
      ? 'rgba(226, 232, 240, 0.62)'
      : light.fixtureType === 'flag_net'
      ? 'rgba(15, 23, 42, 0.68)'
      : light.fixtureType === 'flag_cucoloris'
      ? '#3f2a16' // plywood cookie
      : '#0b0f14'; // solid black

  // Net weave lines, clipped to the square panel.
  const netLines: React.ReactNode[] = [];
  let clipId: string | undefined;
  if (light.fixtureType === 'flag_net') {
    clipId = `flag-clip-${light.id}`;
    const spacing = net === 'double' ? 7 : 13;
    for (let x = xL; x <= xR + spacing; x += spacing) {
      netLines.push(
        <line key={`v-${x}`} x1={x} y1={yT} x2={x} y2={yB} stroke="rgba(148, 163, 184, 0.9)" strokeWidth={1} />
      );
    }
    for (let y = yT; y <= yB + spacing; y += spacing) {
      netLines.push(
        <line key={`h-${y}`} x1={xL} y1={y} x2={xR} y2={y} stroke="rgba(148, 163, 184, 0.9)" strokeWidth={1} />
      );
    }
  }

  // Subtle wrinkle lines on silk so the fabric reads as translucent cloth.
  const silkWrinkles: React.ReactNode[] = [];
  if (light.fixtureType === 'flag_silk') {
    for (const wy of [yT + 4, -2]) {
      silkWrinkles.push(
        <line
          key={`wrinkle-${wy}`}
          x1={xL + 3}
          y1={wy}
          x2={xR - 3}
          y2={wy + 3}
          stroke="rgba(255, 255, 255, 0.5)"
          strokeWidth={1.5}
        />
      );
    }
  }

  // Cucoloris ("cookie"): irregular cut-outs in a plywood panel that throw a
  // dappled shadow. The holes are laid out deterministically from the panel
  // size so the same flag always draws the same pattern.
  const cookieHoles: React.ReactNode[] = [];
  if (light.fixtureType === 'flag_cucoloris') {
    const cols = 4;
    const rows = 5;
    const cellW = panelW / cols;
    const cellH = panelH / rows;
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        // Deterministic pseudo-jitter: no randomness in render output.
        const seed = (cx * 7 + cy * 13) % 11;
        if (seed % 4 === 0) continue; // solid webs between the holes
        const jitterX = ((seed % 5) - 2) * (cellW * 0.08);
        const jitterY = ((seed % 3) - 1) * (cellH * 0.1);
        cookieHoles.push(
          <ellipse
            key={`cookie-${cx}-${cy}`}
            cx={xL + cellW * (cx + 0.5) + jitterX}
            cy={yT + cellH * (cy + 0.5) + jitterY}
            rx={cellW * (0.22 + (seed % 4) * 0.05)}
            ry={cellH * (0.2 + (seed % 3) * 0.06)}
            transform={`rotate(${seed * 17} ${xL + cellW * (cx + 0.5) + jitterX} ${yT + cellH * (cy + 0.5) + jitterY})`}
            fill="rgba(250, 204, 21, 0.32)"
            stroke="rgba(120, 83, 22, 0.9)"
            strokeWidth={0.8}
          />
        );
      }
    }
  }

  // C-Stand Turtle Base & 40" Gobo Arm holding the flag frame
  const standX = xL - 22;

  return (
    <g className="flag-fixture-with-cstand">
      <defs>
        {clipId && (
          <clipPath id={clipId}>
            <rect x={xL} y={yT} width={panelW} height={panelH} rx={2} />
          </clipPath>
        )}
      </defs>

      {/* 1. Full C-Stand Turtle Base mounted to the left of the flag */}
      <g transform={`translate(${standX}, ${armY})`}>
        {/* Turtle base legs */}
        {/* High Load Leg (pointing right towards the flag load) */}
        <path d="M 0 0 C 6 -3, 14 -4, 20 0" fill="none" stroke="#64748b" strokeWidth={3} strokeLinecap="round" />
        <rect x={19} y={-2} width={3.5} height={4} rx={1} fill="#0f172a" />

        {/* Medium Leg (Top-Left) */}
        <path d="M 0 0 C -6 -7, -12 -12, -18 -8" fill="none" stroke="#64748b" strokeWidth={3} strokeLinecap="round" />
        <rect x={-20} y={-10} width={4} height={3.5} rx={1} fill="#0f172a" />

        {/* Small Leg (Bottom-Left) */}
        <path d="M 0 0 C -6 7, -12 12, -18 8" fill="none" stroke="#64748b" strokeWidth={3} strokeLinecap="round" />
        <rect x={-20} y={6} width={4} height={3.5} rx={1} fill="#0f172a" />

        {/* Center Base Hub Casting */}
        <circle cx={0} cy={0} r={4.5} fill="#1e293b" stroke="#94a3b8" strokeWidth={1.5} />
        
        {/* Main 2.5" Gobo Knuckle on Stand Column */}
        <rect x={-3} y={-4} width={6} height={8} rx={1.5} fill="#0f172a" stroke="#94a3b8" strokeWidth={1.2} />
        {/* Blue T-Brake Handle */}
        <line x1={-6} y1={0} x2={6} y2={0} stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" />

        {/* 40" Stainless Steel Gobo Arm extending to flag frame */}
        <line x1={0} y1={0} x2={22} y2={0} stroke="#0f172a" strokeWidth={3} strokeLinecap="round" />
        <line x1={0} y1={0} x2={22} y2={0} stroke="#cbd5e1" strokeWidth={1.8} strokeLinecap="round" />
        <line x1={1} y1={-0.3} x2={21} y2={-0.3} stroke="#ffffff" strokeWidth={0.6} strokeLinecap="round" />

        {/* End 2.5" Gobo Knuckle Clamping onto Flag Mounting Pin */}
        <rect x={19} y={-3.5} width={5.5} height={7} rx={1.2} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
        <line x1={22} y1={-5} x2={22} y2={5} stroke="#38bdf8" strokeWidth={1.5} strokeLinecap="round" />
      </g>

      {/* 2. Flag Panel (Solid / Silk / Net / Cutter) */}
      <rect x={xL} y={yT} width={panelW} height={panelH} rx={2} fill={fill} stroke={frameStroke} strokeWidth={2} />
      {light.fixtureType === 'flag_net' && <g clipPath={`url(#${clipId})`}>{netLines}</g>}
      {light.fixtureType === 'flag_silk' && silkWrinkles}
      {light.fixtureType === 'flag_cucoloris' && cookieHoles}
    </g>
  );
};