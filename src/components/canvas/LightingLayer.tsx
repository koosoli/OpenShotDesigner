import React from 'react';
import { LightElement } from '../../types';
import { getLightBeamPolygon, kelvinToRgb } from '../../utils/geometry';
import { LIGHT_FIXTURES } from '../../constants/presets';
import type { DisplaySettings } from '../../context/FloorPlanContext';
import { FlagFixtureIcon, flagLabel, getFlagSelectionRadius, isFlagFixture } from './FlagFixtureIcon';
import { FixtureGlyph } from './FixtureGlyph';

interface LightingLayerProps {
  lights: LightElement[];
  selectedIds: string[];
  onSelect: (id: string, e: React.PointerEvent) => void;
  displaySettings: DisplaySettings;
}

export const LightingLayer: React.FC<LightingLayerProps> = ({
  lights,
  selectedIds,
  onSelect,
  displaySettings,
}) => {
  const showLightLabel = displaySettings.showLabels && displaySettings.showLightLabels;
  const showLightName = displaySettings.showLabels && displaySettings.showLightNameLabels;
  const showBeams = displaySettings.showLightBeams;

  return (
    <g className="lighting-layer">
      {lights.map((light) => {
        const isSelected = selectedIds.includes(light.id);
        const isFlag = isFlagFixture(light.fixtureType);
        const color = light.rgbColor || kelvinToRgb(light.colorTemp || 5600);
        const intensity = (light.intensity || 80) / 100;
        const throwDist = light.throwDistance || 200;
        const beamAngle = light.beamAngle || 60;

        const isOmni = light.fixtureType === 'practical' || beamAngle >= 350;
        const beamPath = getLightBeamPolygon(
          { x: 0, y: 0 },
          0,
          beamAngle,
          throwDist
        );

        return (
          <g
            key={light.id}
            transform={`translate(${light.x}, ${light.y}) rotate(${light.rotation})`}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(light.id, e)}
          >
            {/* Defs for radial gradient light beam */}
            <defs>
              <radialGradient
                id={`light-grad-${light.id}`}
                cx="0%"
                cy="0%"
                r="100%"
                fx="0%"
                fy="0%"
              >
                <stop offset="0%" stopColor={color} stopOpacity={intensity * 0.45} />
                <stop offset="70%" stopColor={color} stopOpacity={intensity * 0.15} />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Beam Cone Throw (flags never emit light; per-light beamVisible can hide it) */}
            {showBeams && !isFlag && light.beamVisible !== false && beamAngle > 0 && !isOmni && (
              <g className="pointer-events-none">
                <path
                  d={beamPath}
                  fill={`url(#light-grad-${light.id})`}
                  stroke={color}
                  strokeWidth={0.75}
                  strokeOpacity={0.4}
                />
                {/* Center beam line */}
                <line
                  x1={0}
                  y1={0}
                  x2={throwDist}
                  y2={0}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                />
              </g>
            )}

            {/* Omni Bulb Glow */}
            {showBeams && !isFlag && light.beamVisible !== false && isOmni && (
              <circle
                cx={0}
                cy={0}
                r={throwDist / 2}
                fill={`url(#light-grad-${light.id})`}
                className="pointer-events-none"
              />
            )}

            {/* Fixture Icon & Housing */}
            {/* Selection Ring */}
            {isSelected && (
              <circle
                cx={0}
                cy={0}
                r={isFlag ? getFlagSelectionRadius(light) : 24}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
            )}

            {/* Fixture Body depending on type */}
            {isFlag ? (
              <FlagFixtureIcon key={light.flagSize || '24x36'} light={light} selected={isSelected} />
            ) : (
              <FixtureGlyph fixtureType={light.fixtureType} color={color} selected={isSelected} />
            )}

            {/* Label badge */}
            {showLightLabel && (() => {
              const fixtureName = light.name || LIGHT_FIXTURES.find((f) => f.type === light.fixtureType)?.name || 'Light';
              const showName = showLightName && !isFlag;
              return (
                <g
                  transform={`rotate(${-light.rotation}) translate(0, ${showName ? 28 : 24}) scale(${displaySettings.labelScale})`}
                  opacity={displaySettings.labelOpacity}
                  className="pointer-events-none"
                >
                  {showName ? (
                    <>
                      <rect
                        x={-62}
                        y={-11}
                        width={124}
                        height={22}
                        fill="rgba(15, 23, 42, 0.85)"
                        stroke="rgba(255, 255, 255, 0.15)"
                        rx={3}
                      />
                      <text
                        x={0}
                        y={0}
                        fill={displaySettings.lightLabelColor ?? '#e2e8f0'}
                        fontSize="9"
                        textAnchor="middle"
                        fontWeight="600"
                        className="select-none font-sans"
                      >
                        {fixtureName}
                      </text>
                      <text
                        x={0}
                        y={11}
                        fill={displaySettings.lightLabelColor ?? '#94a3b8'}
                        fontSize="7"
                        textAnchor="middle"
                        className="select-none font-mono"
                      >
                        {`${light.colorTemp > 0 ? `${light.colorTemp}K` : 'RGB'} · ${light.intensity}%`}
                      </text>
                    </>
                  ) : (
                    <>
                      <rect
                        x={-45}
                        y={-8}
                        width={90}
                        height={16}
                        fill="rgba(15, 23, 42, 0.85)"
                        stroke="rgba(255, 255, 255, 0.15)"
                        rx={3}
                      />
                      <text
                        x={0}
                        y={4}
                        fill={displaySettings.lightLabelColor ?? '#e2e8f0'}
                        fontSize="9"
                        textAnchor="middle"
                        fontWeight="500"
                        className="select-none font-sans"
                      >
                        {isFlag ? flagLabel(light) : `${light.colorTemp > 0 ? `${light.colorTemp}K` : 'RGB'} ${light.intensity}%`}
                      </text>
                    </>
                  )}
                </g>
              );
            })()}
          </g>
        );
      })}
    </g>
  );
};
