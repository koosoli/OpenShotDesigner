import React from 'react';
import { LightElement } from '../../types';
import { getLightBeamPolygon, kelvinToRgb } from '../../utils/geometry';
import type { DisplaySettings } from '../../context/FloorPlanContext';

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
  const showBeams = displaySettings.showLightBeams;

  return (
    <g className="lighting-layer">
      {lights.map((light) => {
        const isSelected = selectedIds.includes(light.id);
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

            {/* Beam Cone Throw */}
            {showBeams && beamAngle > 0 && !isOmni && (
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
            {showBeams && isOmni && (
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
                r={24}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
            )}

            {/* Fixture Body depending on type */}
            {light.fixtureType === 'tube_light' ? (
              <g>
                <rect
                  x={-6}
                  y={-24}
                  width={12}
                  height={48}
                  fill={color}
                  stroke="#0f172a"
                  strokeWidth={1.5}
                  rx={6}
                />
                <circle cx={0} cy={0} r={4} fill="#ffffff" />
              </g>
            ) : light.fixtureType === 'led_panel' || light.fixtureType === 'softbox' ? (
              <g>
                <rect
                  x={-8}
                  y={-18}
                  width={16}
                  height={36}
                  fill="#1e293b"
                  stroke={isSelected ? '#38bdf8' : '#cbd5e1'}
                  strokeWidth={2}
                  rx={2}
                />
                <rect
                  x={-4}
                  y={-14}
                  width={8}
                  height={28}
                  fill={color}
                  opacity={0.9}
                />
              </g>
            ) : light.fixtureType === 'reflector' ? (
              <g>
                <rect
                  x={-4}
                  y={-20}
                  width={8}
                  height={40}
                  fill="#ffffff"
                  stroke="#64748b"
                  strokeWidth={2}
                />
                <line x1={0} y1={-20} x2={0} y2={20} stroke="#94a3b8" strokeWidth={1} />
              </g>
            ) : light.fixtureType === 'c_stand_flag' ? (
              <g>
                <rect
                  x={-4}
                  y={-22}
                  width={8}
                  height={44}
                  fill="#020617"
                  stroke="#475569"
                  strokeWidth={2}
                />
              </g>
            ) : (
              /* Fresnel / Standard Spot */
              <g>
                {/* Yoke / Stand */}
                <path
                  d="M -12 -12 L -6 0 L -12 12"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={2}
                />
                {/* Barrel */}
                <polygon
                  points="-8,-10 10,-6 10,6 -8,10"
                  fill="#1e293b"
                  stroke={isSelected ? '#38bdf8' : '#e2e8f0'}
                  strokeWidth={1.5}
                />
                {/* Lens */}
                <line
                  x1={10}
                  y1={-6}
                  x2={10}
                  y2={6}
                  stroke={color}
                  strokeWidth={3}
                />
              </g>
            )}

            {/* Label badge */}
            {showLightLabel && (
              <g
                transform={`rotate(${-light.rotation}) translate(0, 24) scale(${displaySettings.labelScale})`}
                opacity={displaySettings.labelOpacity}
                className="pointer-events-none"
              >
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
                  {light.colorTemp > 0 ? `${light.colorTemp}K` : 'RGB'}{' '}
                  {light.intensity}%
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};
