import React from 'react';
import { CameraElement, Shot, Vector2D } from '../../types';
import { getCameraFovPolygon, getInterpolatedPositionAndRotation, getSmoothSplinePath } from '../../utils/geometry';
import type { DisplaySettings } from '../../context/FloorPlanContext';

interface CameraElementViewProps {
  camera: CameraElement;
  isSelected: boolean;
  isHighlighted: boolean;
  currentBeat: number;
  isPlaying: boolean;
  onSelect: (id: string, e: React.PointerEvent) => void;
  onDoubleClick?: (id: string, e: React.MouseEvent) => void;
  onOpenViewfinder?: (id: string) => void;
  onWaypointDragStart?: (elementId: string, waypointId: string, e: React.PointerEvent) => void;
  onWaypointRotateStart?: (elementId: string, waypointId: string, e: React.PointerEvent) => void;
  displaySettings: DisplaySettings;
  shot?: Shot | null;
}

export const CameraElementView: React.FC<CameraElementViewProps> = ({
  camera,
  isSelected,
  isHighlighted,
  currentBeat,
  isPlaying: _isPlaying,
  onSelect,
  onDoubleClick,
  onOpenViewfinder,
  onWaypointDragStart,
  onWaypointRotateStart,
  displaySettings,
  shot,
}) => {
  // Interpolate position based on waypoints whenever the timeline is scrubbed or playing
  const hasWaypoints = (camera.path || []).length > 0;
  const dynamicState =
    hasWaypoints && currentBeat > 1
      ? getInterpolatedPositionAndRotation(
          { x: camera.x, y: camera.y },
          camera.rotation,
          camera.path,
          currentBeat
        )
      : { position: { x: camera.x, y: camera.y }, rotation: camera.rotation };

  const { position, rotation } = dynamicState;
  const color = camera.color || '#0284c7';
  const focal = camera.focalLength || 35;
  const fovAngle = camera.fovAngle || 45;
  const throwDist = camera.throwDistance || 280;

  const showCameraLabel = displaySettings.showLabels && displaySettings.showCameraLabels;
  const labelScale = displaySettings.labelScale;
  const labelOpacity = (displaySettings.labelOpacity ?? 1) * (displaySettings.labelCategoryOpacity?.cameras ?? 1);
  const labelColor = displaySettings.cameraLabelColor;

  const camDisplayName = camera.name && camera.name.trim() ? camera.name : `CAM ${camera.cameraLabel || 'A'}`;
  const camLetter = camera.cameraLabel || 'A';
  const isAutoName =
    camera.name && camera.name.trim() && new RegExp(`^(Cam|Camera) ${camLetter}(\\s*\\(.*\\))?$`, 'i').test(camera.name.trim());
  const cameraIconLabel =
    camera.name && camera.name.trim() && !isAutoName ? camera.name : camLetter;
  const shotNumberText = shot
    ? (shot.shotNumber && shot.shotNumber.trim()) || `${shot.sceneNumber || '1'}/${shot.order}`
    : '';
  const showShotNumber = displaySettings.showShotNumberOnCamera && shotNumberText.length > 0;
  const cameraBadgeText = showShotNumber ? shotNumberText : camDisplayName;

  const shotInfoParts: string[] = [];
  if (shot) {
    if (displaySettings.showShotSizeOnCamera && shot.shotSize) shotInfoParts.push(shot.shotSize);
    if (displaySettings.showShotLensOnCamera && shot.lensMm) shotInfoParts.push(`${shot.lensMm}mm`);
    if (displaySettings.showShotAngleOnCamera && shot.cameraAngle) shotInfoParts.push(shot.cameraAngle);
  }
  const showShotInfoBadge = showCameraLabel && shot && shotInfoParts.length > 0;
  const shotInfoText = shotInfoParts.join(' • ');

  const { pathString, leftPt, rightPt, centerPt } = getCameraFovPolygon(
    { x: 0, y: 0 },
    0,
    fovAngle,
    throwDist
  );

  const waypoints = camera.path || [];
  const hasPath = waypoints.length > 0;

  const trajectoryPoints: Vector2D[] = [
    { x: camera.x, y: camera.y },
    ...waypoints.map((wp) => ({ x: wp.x, y: wp.y })),
  ];
  const splinePathString = getSmoothSplinePath(trajectoryPoints);

  const cameraOpacity = (displaySettings.categoryOpacity?.cameras ?? 1.0) * (camera.opacity ?? 1.0);
  const showCues = displaySettings.showWaypointCues === true;

  return (
    <g className="camera-element" opacity={cameraOpacity}>
      {/* 1. Camera Movement Trajectory & Ghost Instances (behind the camera) */}
      {hasPath && displaySettings.showWaypoints && (
        <g className="camera-path pointer-events-none">
          <path
            d={splinePathString}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeDasharray="6 4"
            strokeOpacity={0.75}
          />

          {/* Base start point marker (Beat 1) */}
          <g transform={`translate(${camera.x}, ${camera.y})`}>
            <circle cx={0} cy={0} r={6} fill="#0f172a" stroke={color} strokeWidth={2} />
            <circle cx={0} cy={0} r={2.5} fill={color} />
          </g>

          {/* Ghost FOV cones & camera bodies at waypoints */}
          {waypoints.map((wp, i) => {
            const wpRot = wp.rotation ?? camera.rotation;
            const wpFov = getCameraFovPolygon({ x: 0, y: 0 }, 0, fovAngle, throwDist * 0.7);
            return (
              <g key={wp.id || i} transform={`translate(${wp.x}, ${wp.y}) rotate(${wpRot})`} opacity={0.3}>
                {displaySettings.showFovCones && (
                  <path
                    d={wpFov.pathString}
                    fill={color}
                    fillOpacity={0.15}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                )}
                <rect
                  x={-10}
                  y={-8}
                  width={16}
                  height={16}
                  fill="#1e293b"
                  stroke={color}
                  strokeWidth={1.5}
                  rx={2}
                />
                <polygon points="6,-6 14,-9 14,9 6,6" fill={color} opacity={0.6} />
              </g>
            );
          })}
        </g>
      )}

      {/* 2. Camera FOV Cone & Body */}
      <g
        transform={`translate(${position.x}, ${position.y}) rotate(${rotation})`}
        className="cursor-pointer"
        onPointerDown={(e) => onSelect(camera.id, e)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick?.(camera.id, e);
        }}
      >
        {displaySettings.showFovCones && (
          <g className="pointer-events-none">
            <defs>
              <radialGradient
                id={`cam-fov-grad-${camera.id}`}
                cx="0%"
                cy="0%"
                r="100%"
                fx="0%"
                fy="0%"
              >
                <stop offset="0%" stopColor={color} stopOpacity={isSelected || isHighlighted ? 0.38 : 0.2} />
                <stop offset="85%" stopColor={color} stopOpacity={isSelected || isHighlighted ? 0.15 : 0.06} />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </radialGradient>
            </defs>

            <path
              d={pathString}
              fill={`url(#cam-fov-grad-${camera.id})`}
              stroke={color}
              strokeWidth={isSelected || isHighlighted ? 2 : 1}
              strokeDasharray={isSelected ? 'none' : '4 4'}
              strokeOpacity={isSelected || isHighlighted ? 0.95 : 0.55}
            />

            <line
              x1={0}
              y1={0}
              x2={centerPt.x}
              y2={centerPt.y}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="5 5"
              strokeOpacity={0.6}
            />

            <path
              d={`M ${leftPt.x * 0.5} ${leftPt.y * 0.5} A ${throwDist * 0.5} ${throwDist * 0.5} 0 0 1 ${rightPt.x * 0.5} ${rightPt.y * 0.5}`}
              fill="none"
              stroke={color}
              strokeWidth={1}
              strokeDasharray="2 2"
              strokeOpacity={0.4}
            />
          </g>
        )}

        {showCameraLabel && displaySettings.showLensFovLabel && (
          <g
            transform={`translate(${throwDist * 0.65}, 0) rotate(${-rotation}) scale(${labelScale})`}
            opacity={labelOpacity}
            className="pointer-events-none"
          >
            <rect
              x={-38}
              y={-10}
              width={76}
              height={20}
              fill="rgba(15, 23, 42, 0.94)"
              stroke={color}
              strokeWidth={1}
              rx={4}
              className="drop-shadow-md"
            />
            <text
              x={0}
              y={4}
              fill={labelColor ?? '#ffffff'}
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
              className="select-none font-mono"
            >
              {focal}mm ({Math.round(fovAngle)}°)
            </text>
          </g>
        )}

        {(isSelected || isHighlighted) && (
          <circle
            cx={0}
            cy={0}
            r={32}
            fill="none"
            stroke={isHighlighted ? '#f59e0b' : '#38bdf8'}
            strokeWidth={2.5}
            strokeDasharray={isSelected ? 'none' : '4 4'}
            className={isHighlighted ? 'animate-ping' : ''}
          />
        )}

        {/* Rig mount visual indicators */}
        {camera.rigType === 'Tripod' && (
          <g opacity={0.8}>
            <line x1={-18} y1={-12} x2={-8} y2={0} stroke="#64748b" strokeWidth={2} />
            <line x1={-18} y1={12} x2={-8} y2={0} stroke="#64748b" strokeWidth={2} />
            <line x1={-20} y1={0} x2={-8} y2={0} stroke="#64748b" strokeWidth={2} />
          </g>
        )}
        {(camera.rigType === 'Dana Dolly' || camera.rigType === 'Slider') && (
          <g opacity={0.9}>
            <line x1={-12} y1={-18} x2={-12} y2={18} stroke="#38bdf8" strokeWidth={3} strokeLinecap="round" />
            <circle cx={-12} cy={-14} r={3} fill="#0284c7" />
            <circle cx={-12} cy={14} r={3} fill="#0284c7" />
          </g>
        )}
        {(camera.rigType === 'Steadicam' || camera.rigType === 'Gimbal') && (
          <g opacity={0.9}>
            <circle cx={-10} cy={0} r={14} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" />
            <line x1={-18} y1={0} x2={-2} y2={0} stroke="#f59e0b" strokeWidth={1.5} />
          </g>
        )}
        {(camera.rigType === 'Jib / Crane' || camera.rigType === 'TechnoCrane') && (
          <g opacity={0.9}>
            <line x1={-36} y1={0} x2={-8} y2={0} stroke="#e2e8f0" strokeWidth={3.5} strokeLinecap="round" />
            <circle cx={-36} cy={0} r={6} fill="#0f172a" stroke="#e2e8f0" strokeWidth={2} />
          </g>
        )}
        {camera.rigType === 'Handheld' && (
          <g opacity={0.9}>
            <path d="M -22 -8 Q -14 0 -22 8" fill="none" stroke="#f97316" strokeWidth={3.5} strokeLinecap="round" />
            <line x1={-12} y1={-14} x2={-4} y2={-14} stroke="#f97316" strokeWidth={2.5} strokeLinecap="round" />
            <line x1={-12} y1={14} x2={-4} y2={14} stroke="#f97316" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={-12} cy={-14} r={2.5} fill="#f97316" />
            <circle cx={-12} cy={14} r={2.5} fill="#f97316" />
          </g>
        )}
        {camera.rigType === 'Drone' && (
          <g opacity={0.9}>
            <line x1={-26} y1={-20} x2={-6} y2={-6} stroke="#a78bfa" strokeWidth={2.5} strokeLinecap="round" />
            <line x1={-26} y1={20} x2={-6} y2={6} stroke="#a78bfa" strokeWidth={2.5} strokeLinecap="round" />
            <line x1={14} y1={-20} x2={2} y2={-6} stroke="#a78bfa" strokeWidth={2.5} strokeLinecap="round" />
            <line x1={14} y1={20} x2={2} y2={6} stroke="#a78bfa" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={-28} cy={-22} r={7} fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="3 2" />
            <circle cx={-28} cy={22} r={7} fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="3 2" />
            <circle cx={16} cy={-22} r={7} fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="3 2" />
            <circle cx={16} cy={22} r={7} fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="3 2" />
          </g>
        )}
        {camera.rigType === 'Car Mount' && (
          <g opacity={0.9}>
            <rect x={-34} y={-18} width={26} height={36} rx={8} fill="none" stroke="#f43f5e" strokeWidth={2.5} />
            <line x1={-8} y1={0} x2={-2} y2={0} stroke="#f43f5e" strokeWidth={3} strokeLinecap="round" />
            <circle cx={-24} cy={0} r={4} fill="none" stroke="#f43f5e" strokeWidth={2} />
          </g>
        )}
        {camera.rigType === 'Cable Cam' && (
          <g opacity={0.9}>
            <line x1={-40} y1={-18} x2={20} y2={-18} stroke="#34d399" strokeWidth={2} strokeDasharray="6 3" />
            <rect x={-14} y={-22} width={12} height={8} rx={2} fill="#0f172a" stroke="#34d399" strokeWidth={2} />
            <line x1={-8} y1={-14} x2={-8} y2={-8} stroke="#34d399" strokeWidth={2.5} strokeLinecap="round" />
          </g>
        )}

        {/* Main Camera Body */}
        <rect
          x={-14}
          y={-12}
          width={22}
          height={24}
          fill="#1e293b"
          stroke={isSelected ? '#38bdf8' : '#e2e8f0'}
          strokeWidth={2}
          rx={3}
        />

        <polygon
          points="8,-10 18,-14 18,14 8,10"
          fill="#0f172a"
          stroke={color}
          strokeWidth={1.5}
        />

        <rect
          x={4}
          y={-7}
          width={6}
          height={14}
          fill={color}
          rx={1}
        />

        <circle cx={-3} cy={0} r={7.5} fill={color} stroke="#0f172a" strokeWidth={1} />
        <g transform={`rotate(${-rotation}, -3, 0)`}>
          <text
            x={-3}
            y={3}
            fill="#ffffff"
            fontSize="9"
            fontWeight="bold"
            textAnchor="middle"
            className="select-none font-sans"
          >
{cameraIconLabel}
          </text>
        </g>

        {isSelected && onOpenViewfinder && (
          <g
            transform="translate(26, -26)"
            className="cursor-pointer hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              onOpenViewfinder(camera.id);
            }}
          >
            <circle cx={0} cy={0} r={12} fill="#0284c7" stroke="#ffffff" strokeWidth={1.5} />
            <path
              d="M -5 0 L 5 0 M 0 -5 L 0 5"
              stroke="#ffffff"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </g>
        )}

        {showCameraLabel && (
          <g
            transform={`rotate(${-rotation}) translate(0, 34) scale(${labelScale})`}
            opacity={labelOpacity}
            className="pointer-events-none"
          >
            <rect
              x={-(cameraBadgeText.length * 3) - 13}
              y={-10}
              width={cameraBadgeText.length * 6 + 26}
              height={20}
              fill="rgba(15, 23, 42, 0.94)"
              stroke={isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)'}
              strokeWidth={1}
              rx={4}
              className="drop-shadow-md"
            />
            <text
              x={0}
              y={4}
              fill={labelColor ?? '#38bdf8'}
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
              className="select-none font-sans"
            >
              {cameraBadgeText}
            </text>
          </g>
        )}

        {showShotInfoBadge && (
          <g
            transform={`rotate(${-rotation}) translate(0, 58) scale(${labelScale})`}
            opacity={labelOpacity}
            className="pointer-events-none"
          >
            <rect
              x={-(shotInfoText.length * 3) - 13}
              y={-10}
              width={shotInfoText.length * 6 + 26}
              height={20}
              fill="rgba(15, 23, 42, 0.94)"
              stroke={isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)'}
              strokeWidth={1}
              rx={4}
              className="drop-shadow-md"
            />
            <text
              x={0}
              y={4}
              fill={labelColor ?? '#f59e0b'}
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
              className="select-none font-mono"
            >
              {shotInfoText}
            </text>
          </g>
        )}
      </g>

      {/* 3. Interactive Waypoint Markers & Rotation Handles (always on top) */}
      {hasPath && displaySettings.showWaypoints && (
        <g className={isSelected ? 'camera-waypoint-handles pointer-events-auto' : 'camera-waypoint-handles pointer-events-none'}>
          {waypoints.map((wp, i) => {
            const wpRot = wp.rotation ?? camera.rotation;
            return (
              <g
                key={wp.id || i}
                transform={`translate(${wp.x}, ${wp.y})`}
                onPointerDown={
                  isSelected && onWaypointDragStart
                    ? (e) => onWaypointDragStart(camera.id, wp.id, e)
                    : undefined
                }
              >
                {/* Rotation handle stalk + knob */}
                {isSelected && onWaypointRotateStart && (
                  <g transform={`rotate(${wpRot})`} className="pointer-events-auto">
                    <line x1={15} y1={0} x2={28} y2={0} stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 3" />
                    <circle
                      cx={31}
                      cy={0}
                      r={6}
                      fill="#38bdf8"
                      stroke="#0f172a"
                      strokeWidth={1.5}
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={(e) => onWaypointRotateStart(camera.id, wp.id, e)}
                    />
                  </g>
                )}

                {/* Beat badge */}
                <circle
                  cx={0}
                  cy={0}
                  r={11}
                  fill="#0f172a"
                  stroke={isSelected ? '#38bdf8' : color}
                  strokeWidth={isSelected ? 3 : 2}
                  className="drop-shadow-md"
                />
                <text
                  x={0}
                  y={3.5}
                  fill="#38bdf8"
                  fontSize="9"
                  fontWeight="bold"
                  textAnchor="middle"
                  className="select-none font-mono"
                >
                  B{wp.beat}
                </text>

                {/* Dialogue cue near waypoint */}
                {showCues && wp.dialogueCue && !wp.hideCue && (
                  <g transform="translate(16, -10)" className="pointer-events-none">
                    <rect
                      x={-4}
                      y={-9}
                      width={wp.dialogueCue.length * 5.8 + 12}
                      height={16}
                      fill="#0f172a"
                      stroke="rgba(255,255,255,0.2)"
                      rx={3}
                    />
                    <text x={2} y={3} fill="#e2e8f0" fontSize="9" fontStyle="italic" className="select-none">
                      {wp.dialogueCue}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
};
