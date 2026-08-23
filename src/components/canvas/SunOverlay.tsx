import React from 'react';
import type { SunPosition } from '../../domain/sun';
import { compassPoint } from '../../domain/sun';

/**
 * Sun direction on the plan (plan §37).
 *
 * Draws where the light comes from and which way shadows fall, for the scene's
 * location pin at the chosen date and time. This is planning information the
 * app cannot substitute any other way: on an exterior, the sun decides the
 * shooting order.
 *
 * The plan's own north is configurable (`planNorthDeg`), because a floor plan is
 * drawn to fit the page, not to point north. Screen up is 0° of plan rotation;
 * the sun's true azimuth is rotated into plan space here and nowhere else.
 */

interface SunOverlayProps {
  sun: SunPosition;
  /** Where true north points on the plan, clockwise from screen-up. */
  planNorthDeg: number;
  /** Plan-space centre for the compass rose. */
  center: { x: number; y: number };
  /** Radius of the rose in plan units. */
  radius: number;
  isLight: boolean;
}

/** Plan-space angle for a true azimuth: SVG 0° points right, so subtract 90°. */
const toPlanAngle = (azimuthDeg: number, planNorthDeg: number): number =>
  azimuthDeg + planNorthDeg - 90;

const SunOverlayImpl: React.FC<SunOverlayProps> = ({
  sun,
  planNorthDeg,
  center,
  radius,
  isLight,
}) => {
  const isUp = sun.elevationDeg > 0;
  const sunAngle = toPlanAngle(sun.azimuthDeg, planNorthDeg);
  const shadowAngle = toPlanAngle(sun.shadowAzimuthDeg, planNorthDeg);
  const northAngle = toPlanAngle(0, planNorthDeg);

  const point = (angleDeg: number, distance: number) => ({
    x: center.x + Math.cos(angleDeg * (Math.PI / 180)) * distance,
    y: center.y + Math.sin(angleDeg * (Math.PI / 180)) * distance,
  });

  const sunPoint = point(sunAngle, radius);
  const shadowPoint = point(shadowAngle, radius * 0.75);
  const northPoint = point(northAngle, radius * 0.92);

  // Below the horizon the whole rose dims: the geometry is still true, but
  // there is no sun to plan around.
  const opacity = isUp ? 1 : 0.4;
  const sunColor = isUp ? '#f59e0b' : '#64748b';
  const ring = isLight ? '#94a3b8' : '#475569';

  return (
    <g className="sun-overlay pointer-events-none" opacity={opacity}>
      {/* Compass ring */}
      <circle
        cx={center.x}
        cy={center.y}
        r={radius}
        fill="none"
        stroke={ring}
        strokeWidth={1.5}
        strokeDasharray="4 6"
        opacity={0.6}
      />

      {/* North marker */}
      <g transform={`translate(${northPoint.x}, ${northPoint.y})`}>
        <circle r={9} fill={isLight ? '#ffffff' : '#0f172a'} stroke={ring} strokeWidth={1.5} />
        <text
          y={3.5}
          textAnchor="middle"
          fontSize={10}
          fontWeight="bold"
          fill={isLight ? '#334155' : '#cbd5e1'}
          className="select-none font-sans"
        >
          N
        </text>
      </g>

      {/* Shadow direction: a soft wedge away from the sun */}
      {isUp && (
        <line
          x1={center.x}
          y1={center.y}
          x2={shadowPoint.x}
          y2={shadowPoint.y}
          stroke="#334155"
          strokeWidth={7}
          strokeLinecap="round"
          opacity={0.28}
        />
      )}

      {/* Sun ray into the plan centre */}
      <line
        x1={sunPoint.x}
        y1={sunPoint.y}
        x2={center.x}
        y2={center.y}
        stroke={sunColor}
        strokeWidth={2.5}
        strokeDasharray={isUp ? undefined : '5 5'}
        opacity={0.85}
      />

      {/* The sun itself */}
      <g transform={`translate(${sunPoint.x}, ${sunPoint.y})`}>
        {isUp && <circle r={17} fill={sunColor} opacity={0.18} />}
        <circle r={10} fill={sunColor} stroke={isLight ? '#ffffff' : '#0f172a'} strokeWidth={2} />
        <text
          y={3.5}
          textAnchor="middle"
          fontSize={9}
          fontWeight="bold"
          fill={isLight ? '#0f172a' : '#0f172a'}
          className="select-none font-mono"
        >
          {Math.round(sun.elevationDeg)}
        </text>
      </g>

      {/* Read-out under the rose */}
      <text
        x={center.x}
        y={center.y + radius + 20}
        textAnchor="middle"
        fontSize={11}
        fontWeight="700"
        fill={isLight ? '#334155' : '#e2e8f0'}
        stroke={isLight ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)'}
        strokeWidth={3}
        paintOrder="stroke fill"
        className="select-none font-sans"
      >
        {isUp
          ? `Sun ${compassPoint(sun.azimuthDeg)} · ${Math.round(sun.elevationDeg)}° up · shadows ${compassPoint(sun.shadowAzimuthDeg)}`
          : `Sun below the horizon (${Math.round(sun.elevationDeg)}°)`}
      </text>
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
export const SunOverlay = React.memo(SunOverlayImpl);
SunOverlayImpl.displayName = 'SunOverlay';
