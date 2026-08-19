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
    fixtureType === 'c_stand_flag'
  );
}

/** Short human-readable label for a flag, e.g. "Solid 24×36"" */
export function flagLabel(light: LightElement): string {
  const size = FLAG_SIZE_PRESETS.find((s) => s.value === (light.flagSize || '24x36'));
  const sizeLabel = light.fixtureType === 'flag_cutter' ? 'Cutter' : size ? size.label : '24×36"';
  switch (light.fixtureType) {
    case 'flag_silk':
      return `Silk ${sizeLabel}`;
    case 'flag_net':
      return `${light.netValue === 'double' ? 'Dbl' : 'Sng'} Net ${sizeLabel}`;
    case 'flag_cutter':
      return 'Cutter 18×48"';
    case 'c_stand_flag':
    case 'flag_solid':
    default:
      return `Solid ${sizeLabel}`;
  }
}

/** Radius (px) to use for the selection ring around a flag element. */
export function getFlagSelectionRadius(light: LightElement): number {
  const { w, h } = getFlagPanelDims(light);
  return Math.max(52, Math.hypot(w / 2, h / 2) + 16);
}

interface FlagFixtureIconProps {
  light: LightElement;
  selected?: boolean;
}

/**
 * Top-down rendering of a C-stand flag: a simple black fabric square (silk and
 * net get a translucent / woven treatment; cutters stay elongated) with a short
 * riser + gobo arm stub on the left edge so rotation is readable. Drawn centered
 * on the element origin so the caller can wrap it in a `translate(x,y)
 * rotate(rotation)` transform. All parts are clickable so the element can be
 * selected & dragged on the floor plan.
 */
export const FlagFixtureIcon: React.FC<FlagFixtureIconProps> = ({ light, selected }) => {
  const { w: panelW, h: panelH } = getFlagPanelDims(light);
  const net = light.netValue === 'double' ? ('double' as FlagNetValue) : ('single' as FlagNetValue);

  const xL = -panelW / 2; // panel left edge
  const xR = panelW / 2; // panel right edge
  const yT = -panelH / 2; // panel top
  const yB = panelH / 2; // panel bottom

  // Short riser + gobo arm stub on the left edge, purely for orientation.
  const armY = 0;
  const poleLen = Math.max(8, Math.min(14, panelW * 0.22));
  const poleLeft = xL - poleLen;

  const frameStroke = selected ? '#38bdf8' : light.fixtureType === 'flag_silk' ? '#cbd5e1' : '#94a3b8';
  const fill =
    light.fixtureType === 'flag_silk'
      ? 'rgba(226, 232, 240, 0.62)'
      : light.fixtureType === 'flag_net'
      ? 'rgba(15, 23, 42, 0.68)'
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

  return (
    <g>
      <defs>
        {clipId && (
          <clipPath id={clipId}>
            <rect x={xL} y={yT} width={panelW} height={panelH} rx={2} />
          </clipPath>
        )}
      </defs>

      {/* Riser / gobo arm stub (orientation marker) */}
      <line x1={poleLeft} y1={armY} x2={xL} y2={armY} stroke="#94a3b8" strokeWidth={3} strokeLinecap="round" />
      <circle cx={poleLeft - 2} cy={armY} r={3.5} fill="#475569" stroke="#94a3b8" strokeWidth={1} />

      {/* Black fabric square */}
      <rect x={xL} y={yT} width={panelW} height={panelH} rx={2} fill={fill} stroke={frameStroke} strokeWidth={2} />
      {light.fixtureType === 'flag_net' && <g clipPath={`url(#${clipId})`}>{netLines}</g>}
      {light.fixtureType === 'flag_silk' && silkWrinkles}
    </g>
  );
};