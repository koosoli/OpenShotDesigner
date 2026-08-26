import React from 'react';
import { LightElement, Waypoint } from '../../types';
import {
  getInterpolatedPositionAndRotation,
  getLightBeamPolygon,
  getSmoothSplinePath,
  kelvinToRgb,
} from '../../utils/geometry';
import { LIGHT_FIXTURES, LIGHT_ROLES } from '../../constants/presets';
import type { DisplaySettings } from '../../context/FloorPlanContext';
import { FlagFixtureIcon, flagLabel, getFlagSelectionRadius, isFlagFixture } from './FlagFixtureIcon';
import { FixtureGlyph } from './FixtureGlyph';
import { FixtureModifierGlyph } from './FixtureModifierGlyph';
import { buildPhotometricMarkers, deriveEffectiveLightAppearance } from '../../domain/lighting';

interface LightingLayerProps {
  lights: LightElement[];
  selectedIds: string[];
  onSelect: (id: string, e: React.PointerEvent) => void;
  onDoubleClick?: (id: string, e: React.MouseEvent) => void;
  displaySettings: DisplaySettings;
  gridSettings?: { unit: 'ft' | 'm'; pixelsPerUnit: number };
  /** Playback beat used to animate fixtures along their waypoint path. */
  currentBeat?: number;
  onAddWaypoint?: (lightId: string) => void;
  onWaypointDragStart?: (elementId: string, waypointId: string, e: React.PointerEvent) => void;
  onWaypointRotateStart?: (elementId: string, waypointId: string, e: React.PointerEvent) => void;
}

const LightingLayerImpl: React.FC<LightingLayerProps> = ({
  lights,
  selectedIds,
  onSelect,
  onDoubleClick,
  displaySettings,
  gridSettings,
  currentBeat = 1,
  onAddWaypoint,
  onWaypointDragStart,
  onWaypointRotateStart,
}) => {
  const showLightLabel = displaySettings.showLabels && displaySettings.showLightLabels;
  const showBeams = displaySettings.showLightBeams;

  return (
    <g className="lighting-layer">
      {lights.map((light) => {
        const isSelected = selectedIds.includes(light.id);
        const isFlag = isFlagFixture(light.fixtureType);
        const appearance = deriveEffectiveLightAppearance(light.beamAngle || 60, light.modifiers);
        const color = appearance.colorHex || light.rgbColor || kelvinToRgb(light.colorTemp || 5600);
        const intensity = (light.intensity || 80) / 100;
        const throwDist = light.throwDistance || 200;
        const beamAngle = appearance.beamAngleDeg;

        const isOmni = light.fixtureType === 'practical' || appearance.omni || beamAngle >= 350;
        const beamPath = getLightBeamPolygon(
          { x: 0, y: 0 },
          0,
          beamAngle,
          throwDist
        );

        const lightOpacity = (displaySettings.categoryOpacity?.lights ?? 1.0) * (light.opacity ?? 1.0);

        const omniRadius = light.fixtureType === 'practical' ? Math.min(30, Math.max(16, throwDist / 6)) : throwDist / 2;
        const photometricMarkers = light.photometricOverlayVisible && gridSettings
          ? buildPhotometricMarkers({
              reference: light.photometricReference,
              modifiers: light.modifiers,
              currentIntensityPercent: light.intensity,
              throwDistancePx: throwDist,
              pixelsPerUnit: gridSettings.pixelsPerUnit,
              gridUnit: gridSettings.unit,
            })
          : [];

        // Movement path: followspots, practicals on a dolly, and event rigs
        // that reposition between numbers. Same beats and easing as actors,
        // cameras and props.
        const waypoints: Waypoint[] = light.path || [];
        const hasPath = waypoints.length > 0;
        const showWaypoints = displaySettings.showWaypoints !== false;
        const moved =
          hasPath && currentBeat > 1
            ? getInterpolatedPositionAndRotation(
                { x: light.x, y: light.y },
                light.rotation,
                waypoints,
                currentBeat,
              )
            : { position: { x: light.x, y: light.y }, rotation: light.rotation };
        const position = moved.position;
        const rotation = moved.rotation;
        const trajectoryPoints = [{ x: light.x, y: light.y }, ...waypoints.map((wp) => ({ x: wp.x, y: wp.y }))];

        return (
          <g key={light.id}>
          {/* Movement trail + ghost fixtures at each keyed beat */}
          {hasPath && showWaypoints && (
            <g className="light-path pointer-events-none">
              <path
                d={getSmoothSplinePath(trajectoryPoints)}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeDasharray="6 4"
                strokeOpacity={0.6}
              />
              {waypoints.map((wp, i) => (
                <g
                  key={`ghost-${wp.id || i}`}
                  transform={`translate(${wp.x}, ${wp.y}) rotate(${wp.rotation ?? light.rotation})`}
                  opacity={0.3}
                >
                  {isFlag ? (
                    <FlagFixtureIcon light={light} />
                  ) : (
                    <>
                      <FixtureGlyph fixtureType={light.fixtureType} color={color} />
                      <FixtureModifierGlyph modifiers={light.modifiers} color={color} />
                    </>
                  )}
                </g>
              ))}
            </g>
          )}

          <g
            transform={`translate(${position.x}, ${position.y}) rotate(${rotation})`}
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
                  strokeWidth={appearance.beamEdge === 'hard' ? 1.25 : 0.75}
                  strokeOpacity={appearance.beamEdge === 'soft' ? 0.2 : 0.4}
                  strokeDasharray={appearance.beamEdge === 'soft' ? '3 3' : undefined}
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
                {light.photometricOverlayVisible && photometricMarkers.map((marker, index) => {
                  const unitDistance = index + 1;
                  const value = gridSettings?.unit === 'ft' ? marker.footCandles : marker.lux;
                  const unitLabel = gridSettings?.unit === 'ft' ? 'fc' : 'lux';
                  return (
                    <g key={marker.distancePx} transform={`translate(${marker.distancePx}, 0)`}>
                      <line y1={-6} y2={6} stroke={color} strokeWidth={0.75} strokeOpacity={0.75} />
                      <rect x={-21} y={-18} width={42} height={11} rx={3} fill="#0f172a" fillOpacity={0.88} />
                      <text x={0} y={-10} textAnchor="middle" fontSize={6.5} fontWeight={700} fill="#f8fafc">
                        {value === null ? '?' : value >= 100 ? Math.round(value) : value.toFixed(1)} {unitLabel}
                      </text>
                      <text x={0} y={14} textAnchor="middle" fontSize={5.5} fill={color}>
                        {unitDistance}{gridSettings?.unit}
                      </text>
                    </g>
                  );
                })}
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
              <>
                <FixtureGlyph fixtureType={light.fixtureType} color={color} selected={isSelected} />
                <FixtureModifierGlyph modifiers={light.modifiers} color={color} />
              </>
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
              if (light.dmxUniverse && light.dmxAddress) {
                specsParts.push(`DMX U${light.dmxUniverse}:${String(light.dmxAddress).padStart(3, '0')}`);
              }
              const specsStr = specsParts.join(' · ');
              const showSpecs = specsStr.length > 0;

              // If all label components are turned off, don't draw any badge
              if (!showRole && !showName && !showSpecs) return null;

              const lineCount = (showRole ? 1 : 0) + (showName ? 1 : 0) + (showSpecs ? 1 : 0);

              return (
                <g
                  transform={`rotate(${-rotation}) translate(0, ${isOmni ? 34 : 26}) scale(${(displaySettings.labelScale ?? 1) * (displaySettings.labelCategoryScale?.lights ?? 1)})`}
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

            {light.locked && (
              <g
                transform={`rotate(${-rotation}) translate(-16, -16)`}
                className="pointer-events-none select-none"
              >
                <circle cx={0} cy={0} r={7.5} fill="#78350f" stroke="#f59e0b" strokeWidth={1} />
                <text x={0} y={3} fill="#fef3c7" fontSize="8" fontWeight="bold" textAnchor="middle">
                  🔒
                </text>
              </g>
            )}

            {/* Add movement waypoint (top-right, stays upright) */}
            {isSelected && onAddWaypoint && (
              <g
                transform={`rotate(${-rotation}) translate(30, -30)`}
                className="pointer-events-auto cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onAddWaypoint(light.id);
                }}
              >
                <title>Add movement waypoint</title>
                <circle cx={0} cy={0} r={11} fill="#22c55e" stroke="#0f172a" strokeWidth={1.5} className="drop-shadow-md" />
                <text x={0} y={4.5} fill="#ffffff" fontSize="14" fontWeight="bold" textAnchor="middle" className="select-none">
                  +
                </text>
              </g>
            )}
          </g>

          {/* Interactive waypoint markers & aim handles */}
          {hasPath && showWaypoints && (
            <g className={isSelected ? 'light-waypoint-handles pointer-events-auto' : 'light-waypoint-handles pointer-events-none'}>
              {waypoints.map((wp, i) => {
                const wpRot = wp.rotation ?? light.rotation;
                return (
                  <g
                    key={wp.id || i}
                    transform={`translate(${wp.x}, ${wp.y})`}
                    onPointerDown={
                      isSelected && onWaypointDragStart
                        ? (e) => onWaypointDragStart(light.id, wp.id, e)
                        : undefined
                    }
                  >
                    {isSelected && onWaypointRotateStart && (
                      <g transform={`rotate(${wpRot})`} className="pointer-events-auto">
                        <line x1={16} y1={0} x2={30} y2={0} stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 3" />
                        <circle
                          cx={33}
                          cy={0}
                          r={6}
                          fill="#38bdf8"
                          stroke="#0f172a"
                          strokeWidth={1.5}
                          className="cursor-grab active:cursor-grabbing"
                          onPointerDown={(e) => onWaypointRotateStart(light.id, wp.id, e)}
                        />
                      </g>
                    )}
                    <circle cx={0} cy={0} r={11} fill="#0f172a" stroke={isSelected ? '#38bdf8' : color} strokeWidth={isSelected ? 3 : 2} className="drop-shadow-md" />
                    <text x={0} y={3.5} fill={color} fontSize="9" fontWeight="bold" textAnchor="middle" className="select-none font-mono">
                      B{wp.beat}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
          </g>
        );
      })}
    </g>
  );
};

/**
 * Memoised because the canvas re-renders on every pointer move — hovering the
 * plan used to redraw every layer, glyph by glyph. The props are stable by
 * construction on the canvas side (element buckets come from one memoised
 * pass, callbacks are `useCallback`ed), so a shallow compare is enough and a
 * custom comparator would only hide a prop that is not stable yet.
 */
export const LightingLayer = React.memo(LightingLayerImpl);
LightingLayerImpl.displayName = 'LightingLayer';
