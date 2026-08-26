import React from 'react';
import { getSymbolById } from '../../domain/assets';
import type { LightModifier } from '../../domain/lighting';

interface FixtureModifierGlyphProps {
  modifiers?: readonly LightModifier[];
  color: string;
}

const positions = [
  { x: 20, y: -18 },
  { x: 20, y: 0 },
  { x: 20, y: 18 },
  { x: 0, y: -25 },
];

/**
 * Compact modifier badges drawn from the shared Asset Library. Keeping the
 * marker renderer beside FixtureGlyph guarantees canvas and print use the same
 * production symbols rather than one-off component artwork.
 */
export const FixtureModifierGlyph: React.FC<FixtureModifierGlyphProps> = ({ modifiers = [], color }) => {
  const enabled = modifiers.filter((modifier) => modifier.enabled);
  const visible = enabled.slice(0, positions.length);
  if (visible.length === 0) return null;

  return (
    <g className="fixture-modifiers pointer-events-none">
      {visible.map((modifier, index) => {
        const symbol = getSymbolById(modifier.symbolId);
        if (!symbol) return null;
        const position = positions[index];
        const badgeColor = modifier.kind === 'gel' && modifier.colorHex ? modifier.colorHex : color;
        return (
          <g key={modifier.id} transform={`translate(${position.x}, ${position.y})`}>
            <circle r={7.5} fill="#0f172a" stroke={badgeColor} strokeWidth={1.25} />
            <g
              color={badgeColor}
              transform="translate(-6,-6) scale(0.12)"
              dangerouslySetInnerHTML={{ __html: symbol.svg }}
            />
          </g>
        );
      })}
      {enabled.length > positions.length && (
        <g transform="translate(0,25)">
          <circle r={7.5} fill="#0f172a" stroke={color} strokeWidth={1.25} />
          <text y={2.5} textAnchor="middle" fontSize={7} fontWeight={800} fill="#fff">
            +{enabled.length - positions.length}
          </text>
        </g>
      )}
    </g>
  );
};
