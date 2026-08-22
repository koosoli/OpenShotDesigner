import React from 'react';
import { ActorElement, Vector2D } from '../../types';
import { getInterpolatedPositionAndRotation, getSmoothSplinePath } from '../../utils/geometry';
import type { DisplaySettings } from '../../context/FloorPlanContext';
import { speechCueAtBeat, wrapSpeechText } from '../../domain/plan';

interface ActorElementViewProps {
  actor: ActorElement;
  isSelected: boolean;
  isHighlighted: boolean;
  currentBeat: number;
  isPlaying: boolean;
  onSelect: (id: string, e: React.PointerEvent) => void;
  onDoubleClick?: (id: string, e: React.MouseEvent) => void;
  onAddWaypoint?: (id: string) => void;
  onWaypointDragStart?: (elementId: string, waypointId: string, e: React.PointerEvent) => void;
  onWaypointRotateStart?: (elementId: string, waypointId: string, e: React.PointerEvent) => void;
  displaySettings: DisplaySettings;
}

export const ActorElementView: React.FC<ActorElementViewProps> = ({
  actor,
  isSelected,
  isHighlighted,
  currentBeat,
  isPlaying,
  onSelect,
  onDoubleClick,
  onAddWaypoint,
  onWaypointDragStart,
  onWaypointRotateStart,
  displaySettings,
}) => {
  // Interpolate position based on waypoints whenever the timeline is scrubbed or playing
  const hasWaypoints = (actor.path || []).length > 0;
  const dynamicState =
    hasWaypoints && currentBeat > 1
      ? getInterpolatedPositionAndRotation(
          { x: actor.x, y: actor.y },
          actor.rotation,
          actor.path,
          currentBeat
        )
      : { position: { x: actor.x, y: actor.y }, rotation: actor.rotation };

  const { position, rotation } = dynamicState;
  const color = actor.color || '#3b82f6';
  const isStanding = actor.isStanding !== false;

  const waypoints = actor.path || [];
  const hasPath = waypoints.length > 0;

  const showActorLabel = displaySettings.showLabels && displaySettings.showActorLabels;
  const labelScale = (displaySettings.labelScale ?? 1) * (displaySettings.labelCategoryScale?.actors ?? 1);
  const labelOpacity = (displaySettings.labelOpacity ?? 1) * (displaySettings.labelCategoryOpacity?.actors ?? 1);
  const labelColor = displaySettings.actorLabelColor;

  const trajectoryPoints: Vector2D[] = [
    { x: actor.x, y: actor.y },
    ...waypoints.map((wp) => ({ x: wp.x, y: wp.y })),
  ];
  const splinePathString = getSmoothSplinePath(trajectoryPoints);

  const actorOpacity = (displaySettings.categoryOpacity?.actors ?? 1.0) * (actor.opacity ?? 1.0);
  const showCues = displaySettings.showWaypointCues === true;
  const activeSpeech = displaySettings.showSpeechBubbles
    ? speechCueAtBeat(actor.speechCues, currentBeat)
    : undefined;
  const speechLines = activeSpeech ? wrapSpeechText(activeSpeech.text) : [];
  const bubbleWidth = Math.max(100, Math.min(230, Math.max(...speechLines.map((line) => line.length), 10) * 6.2 + 24));
  const bubbleHeight = 28 + speechLines.length * 14;

  return (
    <g className="actor-element" opacity={actorOpacity}>
      {/* 1. Waypoint Path Trail, Base Marker & Ghost Instances (behind the actor) */}
      {hasPath && displaySettings.showWaypoints && (
        <g className="actor-path pointer-events-none">
          <path
            d={splinePathString}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeDasharray="6 4"
            strokeOpacity={0.75}
          />

          {/* Base start point (Beat 1) */}
          <g transform={`translate(${actor.x}, ${actor.y})`}>
            <circle cx={0} cy={0} r={5} fill="#0f172a" stroke={color} strokeWidth={2} />
            <circle cx={0} cy={0} r={2} fill={color} />
          </g>

          {/* Ghost figures at waypoints */}
          {waypoints.map((wp, i) => {
            const wpRot = wp.rotation ?? actor.rotation;
            return (
              <g key={wp.id || i} transform={`translate(${wp.x}, ${wp.y}) rotate(${wpRot})`} opacity={0.35}>
                <path
                  d="M -6 -18 C 0 -19, 10 -16, 12 -12 C 14 -7, 14 7, 12 12 C 10 16, 0 19, -6 18 C -14 14, -14 -14, -6 -18 Z"
                  fill="#1e293b"
                  stroke={color}
                  strokeWidth={1.5}
                />
                <circle cx={0} cy={0} r={11} fill={color} fillOpacity={0.5} stroke="#0f172a" strokeWidth={1.5} />
                <polygon points="11,-3 16,0 11,3" fill={color} />
              </g>
            );
          })}
        </g>
      )}

      {/* 2. Main Actor Human Figure */}
      <g
        transform={`translate(${position.x}, ${position.y}) rotate(${rotation})`}
        className="cursor-pointer"
        onPointerDown={(e) => onSelect(actor.id, e)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick?.(actor.id, e);
        }}
      >
        <path
          d="M 0 0 L 36 -20 A 42 42 0 0 1 36 20 Z"
          fill={color}
          fillOpacity={isSelected || isHighlighted ? 0.22 : 0.12}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="2 2"
          strokeOpacity={0.5}
        />

        {(isSelected || isHighlighted) && (
          <circle
            cx={0}
            cy={0}
            r={28}
            fill="none"
            stroke={isHighlighted ? '#f59e0b' : '#38bdf8'}
            strokeWidth={2.5}
            strokeDasharray={isSelected ? 'none' : '4 4'}
            className={isHighlighted ? 'animate-pulse' : ''}
          />
        )}

        <path
          d={
            isStanding
              ? 'M -8 -19 C 2 -21, 12 -16, 14 -11 C 16 -6, 16 6, 14 11 C 12 16, 2 21, -8 19 C -16 15, -16 -15, -8 -19 Z'
              : 'M -12 -17 C -2 -19, 8 -15, 10 -10 C 12 -5, 12 5, 10 10 C 8 15, -2 19, -12 17 C -18 13, -18 -13, -12 -17 Z'
          }
          fill="#1e293b"
          stroke={isSelected ? '#38bdf8' : color}
          strokeWidth={2}
        />

        <circle cx={-1} cy={-15} r={5} fill={color} opacity={0.6} />
        <circle cx={-1} cy={15} r={5} fill={color} opacity={0.6} />

        {!isStanding && (
          <g opacity={0.85}>
            <line x1={-16} y1={-15} x2={-16} y2={15} stroke="#64748b" strokeWidth={3} strokeLinecap="round" />
            <line x1={6} y1={-8} x2={18} y2={-8} stroke={color} strokeWidth={3} strokeLinecap="round" />
            <line x1={6} y1={8} x2={18} y2={8} stroke={color} strokeWidth={3} strokeLinecap="round" />
          </g>
        )}

        <circle cx={0} cy={0} r={13} fill={color} stroke="#0f172a" strokeWidth={2} className="drop-shadow-md" />
        <polygon points="13,-3.5 19,0 13,3.5" fill="#ffffff" stroke="#0f172a" strokeWidth={1} />

        <g transform={`rotate(${-rotation})`}>
          <text
            x={0}
            y={4.5}
            fill="#ffffff"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
            className="select-none font-sans drop-shadow-sm"
          >
            {actor.characterLetter || actor.name.charAt(0)}
          </text>
        </g>

        {!isStanding && (
          <g transform={`rotate(${-rotation}) translate(-14, -14)`}>
            <rect x={-8} y={-5} width={16} height={10} rx={2} fill="#f59e0b" stroke="#0f172a" strokeWidth={1} />
            <text x={0} y={3} fill="#0f172a" fontSize="7" fontWeight="bold" textAnchor="middle" className="select-none font-mono">
              SIT
            </text>
          </g>
        )}

        {actor.locked && (
          <g
            transform={`rotate(${-rotation}) translate(-16, -16)`}
            className="pointer-events-none select-none"
          >
            <circle cx={0} cy={0} r={7.5} fill="#78350f" stroke="#f59e0b" strokeWidth={1} />
            <text x={0} y={3} fill="#fef3c7" fontSize="8" fontWeight="bold" textAnchor="middle">
              ðŸ”’
            </text>
          </g>
        )}

        {showActorLabel && (
          <g
            transform={`rotate(${-rotation}) translate(0, 26) scale(${labelScale})`}
            opacity={labelOpacity}
            className="pointer-events-none"
          >
            <rect
              x={-(actor.name.length * 4.2) - 10}
              y={-10}
              width={actor.name.length * 8.4 + 20}
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
              fill={labelColor ?? '#ffffff'}
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
              className="select-none font-sans"
            >
              {actor.name}
            </text>
          </g>
        )}

        {isSelected && onAddWaypoint && (
          <g
            transform={`rotate(${-rotation}) translate(24, -24)`}
            className="cursor-pointer select-none"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onAddWaypoint(actor.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <title>Add Actor Waypoint</title>
            {/* Expanded invisible hit area */}
            <circle cx={0} cy={0} r={18} fill="transparent" />
            <circle cx={0} cy={0} r={11} fill="#10b981" stroke="#ffffff" strokeWidth={2} className="drop-shadow-md" />
            <path
              d="M -4.5 0 L 4.5 0 M 0 -4.5 L 0 4.5"
              stroke="#ffffff"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </g>
        )}
      </g>

      {activeSpeech && speechLines.length > 0 && (
        <g
          transform={`translate(${position.x}, ${position.y})`}
          className={`actor-speech-bubble pointer-events-none ${isPlaying ? 'transition-opacity duration-150' : ''}`}
        >
          <path
            d={`M ${-bubbleWidth / 2} ${-bubbleHeight - 46} h ${bubbleWidth} a 9 9 0 0 1 9 9 v ${bubbleHeight - 18} a 9 9 0 0 1 -9 9 h -${bubbleWidth / 2 - 12} l -12 13 l -2 -13 h -${bubbleWidth / 2 - 14} a 9 9 0 0 1 -9 -9 v -${bubbleHeight - 18} a 9 9 0 0 1 9 -9 z`}
            fill="rgba(255,255,255,0.97)"
            stroke={color}
            strokeWidth={2}
          />
          <text
            x={-bubbleWidth / 2 + 12}
            y={-bubbleHeight - 29}
            fill={color}
            fontSize="9"
            fontWeight="700"
            className="select-none font-sans"
          >
            {(actor.characterName || actor.name).toUpperCase()} Â· B{Math.max(1, Math.round(currentBeat))}
          </text>
          <text
            x={-bubbleWidth / 2 + 12}
            y={-bubbleHeight - 13}
            fill="#0f172a"
            fontSize="11"
            className="select-none font-sans"
          >
            {speechLines.map((line, index) => (
              <tspan key={`${line}-${index}`} x={-bubbleWidth / 2 + 12} dy={index === 0 ? 0 : 14}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}

      {/* 3. Interactive Waypoint Markers & Rotation Handles (always on top) */}
      {hasPath && displaySettings.showWaypoints && (
        <g className={isSelected ? 'actor-waypoint-handles pointer-events-auto' : 'actor-waypoint-handles pointer-events-none'}>
          {waypoints.map((wp, i) => {
            const wpRot = wp.rotation ?? actor.rotation;
            return (
              <g
                key={wp.id || i}
                transform={`translate(${wp.x}, ${wp.y})`}
                onPointerDown={
                  isSelected && onWaypointDragStart
                    ? (e) => onWaypointDragStart(actor.id, wp.id, e)
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
                      onPointerDown={(e) => onWaypointRotateStart(actor.id, wp.id, e)}
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
                  fill={color}
                  fontSize="9"
                  fontWeight="bold"
                  textAnchor="middle"
                  className="select-none font-mono"
                >
                  B{wp.beat}
                </text>

                {/* Dialogue snippet near waypoint */}
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
                    <text x={2} y={3} fill="#cbd5e1" fontSize="9" fontStyle="italic" className="select-none">
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
