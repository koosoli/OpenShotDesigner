import React from 'react';
import { LightElement } from '../../types';
import { getLightBeamPolygon, kelvinToRgb } from '../../utils/geometry';
import { LIGHT_FIXTURES, LIGHT_ROLES } from '../../constants/presets';
import type { DisplaySettings } from '../../context/FloorPlanContext';
import { FlagFixtureIcon, flagLabel, getFlagSelectionRadius, isFlagFixture } from './FlagFixtureIcon';
import { FixtureGlyph } from './FixtureGlyph';

interface LightingLayerProps {
  lights: LightElement[];
  selectedIds: string[];
  onSelect: (id: string, e: React.PointerEvent) => void;
  onDoubleClick?: (id: string, e: React.MouseEvent) => void;
  displaySettings: DisplaySettings;
}

export const LightingLayer: React.FC<LightingLayerProps> = ({
  lights,
  selectedIds,
  onSelect,
  onDoubleClick,
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

        const lightOpacity = (displaySettings.categoryOpacity?.lights ?? 1.0) * (light.opacity ?? 1.0);

        const omniRadius = light.fixtureType === 'practical' ? Math.min(30, Math.max(16, throwDist / 6)) : throwDist / 2;

        return (
          <g
            key={light.id}
            transform={`translate(${light.x}, ${light.y}) rotate(${light.rotation})`}
            opacity={lightOpacity}
            className="cursor-pointer"
            onPointerDown={(e) => onSelect(light.id, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(light.id, e);
            }}
          >
            {/* Defs for radial gradient light beam & omni glow */}
            <defs>
              {/* Directional beam gradient */}
              <radialGradient
                id={`light-grad-${light.id}`}
                cx="0"
                cy="0"
                r={throwDist}
                fx="0"
                fy="0"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={color} stopOpacity={intensity * 0.45} />
                <stop offset="70%" stopColor={color} stopOpacity={intensity * 0.15} />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </radialGradient>

              {/* Omni bulb radial gradient: solid/bright at center, faded to 0 opacity on outside perimeter */}
              <radialGradient
                id={`omni-grad-${light.id}`}
                cx="0"
                cy="0"
                r={omniRadius}
                fx="0"
                fy="0"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={color} stopOpacity={intensity * 0.55} />
                <stop offset="35%" stopColor={color} stopOpacity={intensity * 0.35} />
                <stop offset="70%" stopColor={color} stopOpacity={intensity * 0.12} />
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

            {/* Omni Bulb Glow (Center solid at bulb, fading smoothly to transparent on the outside) */}
            {showBeams && !isFlag && light.beamVisible !== false && isOmni && (
              <circle
                cx={0}
                cy={0}
                r={omniRadius}
                fill={`url(#omni-grad-${light.id})`}
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
              const roleObj = LIGHT_ROLES.find((r) => r.value === light.lightRole);
              const hasRole = !!roleObj && roleObj.value !== 'unassigned';
              const showRole = (displaySettings.showLightRoleLabels !== false) && hasRole;
              const roleLabel = hasRole ? roleObj.label : null;
              const fixObj = LIGHT_FIXTURES.find((f) => f.type === light.fixtureType);
              const fixName = fixObj?.name || 'Light';
              const fullTitle = isFlag
                ? flagLabel(light)
                : (light.name || (light.brand ? `${light.brand} ${light.fixtureModel || fixName}` : (light.fixtureModel || fixName)));
              const showName = displaySettings.showLightNameLabels !== false;

              const showKelvin = displaySettings.showLightKelvinLabels === true;
              const showIntensity = displaySettings.showLightIntensityLabels === true;

              const beamColor = isFlag
                ? '#ffffff'
                : (light.rgbColor || kelvinToRgb(light.colorTemp || 5600));
              const roleColor = light.roleColor || beamColor;
              const customLabelColor = light.labelColor || beamColor;

              const specsParts: string[] = [];
              if (isFlag) {
                if (!showRole && roleLabel) specsParts.push(roleLabel);
              } else {
                if (showKelvin) specsParts.push(light.colorTemp > 0 ? `${light.colorTemp}K` : 'RGB');
                if (showIntensity) specsParts.push(`${light.intensity}%`);
              }
              const specsStr = specsParts.join(' · ');
              const showSpecs = specsStr.length > 0;

              // If all label components are turned off, don't draw any badge
              if (!showRole && !showName && !showSpecs) return null;

              const lineCount = (showRole ? 1 : 0) + (showName ? 1 : 0) + (showSpecs ? 1 : 0);
              const badgeHeight = lineCount === 3 ? 44 : lineCount === 2 ? 30 : 18;
              const maxTextLength = Math.max(
                showName ? fullTitle.length : 0,
                showRole ? (roleLabel?.length || 0) : 0,
                showSpecs ? specsStr.length : 0
              );

              return (
                <g
                  transform={`rotate(${-light.rotation}) translate(0, ${isOmni ? 34 : 26}) scale(${displaySettings.labelScale})`}
                  opacity={(displaySettings.labelOpacity ?? 1) * (displaySettings.labelCategoryOpacity?.lights ?? 1)}
                  className="pointer-events-none"
                >
                  {lineCount === 3 ? (
                    <>
                      <text
                        x={0}
                        y={-8}
                        fill={roleColor}
                        stroke="rgba(15, 23, 42, 0.9)"
                        strokeWidth={2.5}
                        paintOrder="stroke fill"
                        strokeLinejoin="round"
                        fontSize="8"
                        textAnchor="middle"
                        fontWeight="800"
                        letterSpacing="0.6"
                        className="select-none font-sans uppercase"
                      >
                        {`[ ${roleLabel} ]`}
                      </text>
                      <text
                        x={0}
                        y={2}
                        fill={customLabelColor ?? '#f8fafc'}
                        stroke="rgba(15, 23, 42, 0.9)"
                        strokeWidth={2.5}
                        paintOrder="stroke fill"
                        strokeLinejoin="round"
                        fontSize="9"
                        textAnchor="middle"
                        fontWeight="700"
                        className="select-none font-sans"
                      >
                        {fullTitle}
                      </text>
                      <text
                        x={0}
                        y={12}
                        fill={customLabelColor ?? '#94a3b8'}
                        stroke="rgba(15, 23, 42, 0.9)"
                        strokeWidth={2.5}
                        paintOrder="stroke fill"
                        strokeLinejoin="round"
                        fontSize="7.5"
                        textAnchor="middle"
                        className="select-none font-mono"
                      >
                        {specsStr}
                      </text>
                    </>
                  ) : lineCount === 2 ? (
                    <>
                      {showRole ? (
                        <>
                          <text
                            x={0}
                            y={-4}
                            fill={roleColor}
                            stroke="rgba(15, 23, 42, 0.9)"
                            strokeWidth={2.5}
                            paintOrder="stroke fill"
                            strokeLinejoin="round"
                            fontSize="8"
                            textAnchor="middle"
                            fontWeight="800"
                            letterSpacing="0.5"
                            className="select-none font-sans uppercase"
                          >
                            {`[ ${roleLabel} ]`}
                          </text>
                          <text
                            x={0}
                            y={6}
                            fill={customLabelColor ?? (showName ? '#f8fafc' : '#94a3b8')}
                            stroke="rgba(15, 23, 42, 0.9)"
                            strokeWidth={2.5}
                            paintOrder="stroke fill"
                            strokeLinejoin="round"
                            fontSize={showName ? '9' : '7.5'}
                            textAnchor="middle"
                            fontWeight={showName ? '700' : '500'}
                            className={showName ? 'select-none font-sans' : 'select-none font-mono'}
                          >
                            {showName ? fullTitle : specsStr}
                          </text>
                        </>
                      ) : (
                        <>
                          <text
                            x={0}
                            y={-3}
                            fill={customLabelColor ?? '#f8fafc'}
                            stroke="rgba(15, 23, 42, 0.9)"
                            strokeWidth={2.5}
                            paintOrder="stroke fill"
                            strokeLinejoin="round"
                            fontSize="9"
                            textAnchor="middle"
                            fontWeight="700"
                            className="select-none font-sans"
                          >
                            {fullTitle}
                          </text>
                          <text
                            x={0}
                            y={7}
                            fill={customLabelColor ?? '#94a3b8'}
                            stroke="rgba(15, 23, 42, 0.9)"
                            strokeWidth={2.5}
                            paintOrder="stroke fill"
                            strokeLinejoin="round"
                            fontSize="7.5"
                            textAnchor="middle"
                            className="select-none font-mono"
                          >
                            {specsStr}
                          </text>
                        </>
                      )}
                    </>
                  ) : (
                    <text
                      x={0}
                      y={0}
                      fill={showRole ? roleColor : (customLabelColor ?? '#f8fafc')}
                      stroke="rgba(15, 23, 42, 0.9)"
                      strokeWidth={2.5}
                      paintOrder="stroke fill"
                      strokeLinejoin="round"
                      fontSize={showRole ? '8' : (showName ? '9' : '7.5')}
                      textAnchor="middle"
                      fontWeight="700"
                      className={showSpecs ? 'select-none font-mono' : 'select-none font-sans'}
                    >
                      {showRole ? `[ ${roleLabel} ]` : (showName ? fullTitle : specsStr)}
                    </text>
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
