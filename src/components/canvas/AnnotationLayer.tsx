import React, { useState } from 'react';
import type { AnnotationElement, FloorPlanElement } from '../../types';
import {
  annotationLeaderEndpoints,
  annotationLineDasharray,
  annotationLineStyleOf,
} from '../../domain/plan/annotations';

interface AnnotationLayerProps {
  annotations: AnnotationElement[];
  /** Every element on the plan, so leader lines can resolve their target. */
  allElements: FloorPlanElement[];
  selectedIds: string[];
  onSelect: (id: string, e: React.PointerEvent) => void;
  onDoubleClick?: (id: string, e: React.MouseEvent) => void;
  onUpdateText?: (id: string, newText: string) => void;
  /** Light theme uses a light pill; dark theme a dark one (when no explicit color). */
  isLight?: boolean;
}

/**
 * Callout annotations (plan §6.2): a faint leader line from the target
 * element to freely-movable text.
 *
 * Shared by the editor canvas and the printable blueprint/PNG export so both
 * draw the same line from the same domain geometry (rule 4). The text anchor
 * is a regular point element, so canvas move-drag, rotation, grouping,
 * copy/paste and undo all work without annotation-specific gestures: the line
 * simply re-derives from the target to the new anchor every render.
 *
 * An annotation whose target is gone renders detached (dashed amber outline)
 * rather than pointing at an invented position (rule 13).
 */
const AnnotationLayerImpl: React.FC<AnnotationLayerProps> = ({
  annotations,
  allElements,
  selectedIds,
  onSelect,
  onDoubleClick,
  onUpdateText,
  isLight = false,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const startEdit = (ann: AnnotationElement) => {
    setEditingId(ann.id);
    setEditValue(ann.text);
  };

  const finishEdit = (id: string) => {
    if (onUpdateText && editValue.trim()) {
      onUpdateText(id, editValue);
    }
    setEditingId(null);
  };

  return (
    <g className="annotation-layer">
      {annotations.map((ann) => {
        const isSelected = selectedIds.includes(ann.id);
        const isEditing = editingId === ann.id;
        const leader = annotationLeaderEndpoints(allElements, ann);
        const line = annotationLineStyleOf(ann);
        const fontSize = ann.fontSize || 14;
        const text = ann.text || '';
        const pillWidth = Math.max(48, text.length * fontSize * 0.6 + 20);
        const pillHeight = fontSize + 14;
        // Box-less by default: the pill only renders when explicitly enabled.
        const showBackground = ann.showBackground === true;
        const pillFill = ann.backgroundColor || (isLight ? '#ffffff' : '#0f172a');
        const textFill = ann.color || (isLight ? '#0f172a' : '#e2e8f0');
        const textX =
          ann.textAlign === 'left' ? -pillWidth / 2 + 10 : ann.textAlign === 'right' ? pillWidth / 2 - 10 : 0;

        return (
          <g key={ann.id}>
            {/* Leader line: target anchor -> text anchor. */}
            {leader && (
              <g className="pointer-events-none">
                <line
                  x1={leader.x1}
                  y1={leader.y1}
                  x2={leader.x2}
                  y2={leader.y2}
                  stroke={line.color}
                  strokeWidth={line.width}
                  opacity={line.opacity}
                  strokeDasharray={annotationLineDasharray(line.dash)}
                  strokeLinecap="round"
                />
                <circle cx={leader.x1} cy={leader.y1} r={2.5} fill={line.color} opacity={line.opacity} />
              </g>
            )}

            <g
              transform={`translate(${ann.x}, ${ann.y}) rotate(${ann.rotation || 0})`}
              className="cursor-pointer"
              onPointerDown={(e) => onSelect(ann.id, e)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick?.(ann.id, e);
                startEdit(ann);
              }}
            >
              {(isSelected || !leader) && (
                <rect
                  x={-pillWidth / 2 - 4}
                  y={-fontSize - 10}
                  width={pillWidth + 8}
                  height={pillHeight + 6}
                  fill="none"
                  stroke={!leader ? '#f59e0b' : '#38bdf8'}
                  strokeWidth={1.5}
                  strokeDasharray={!leader ? '5 3' : '3 3'}
                  rx={8}
                >
                  {!leader && <title>Detached annotation — its target element is gone</title>}
                </rect>
              )}

              {showBackground && (
                <rect
                  x={-pillWidth / 2}
                  y={-fontSize - 8}
                  width={pillWidth}
                  height={pillHeight}
                  rx={6}
                  fill={pillFill}
                  fillOpacity={0.92}
                  stroke={line.color}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                />
              )}

              {isEditing ? (
                <foreignObject
                  x={-pillWidth / 2}
                  y={-fontSize - 8}
                  width={Math.max(160, pillWidth + 40)}
                  height={pillHeight + 8}
                >
                  <input
                    type="text"
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => finishEdit(ann.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishEdit(ann.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="w-full bg-slate-900 text-sky-400 border border-sky-500 rounded px-1 text-sm font-semibold outline-none shadow-xl"
                  />
                </foreignObject>
              ) : (
                <text
                  x={textX}
                  y={0}
                  fill={textFill}
                  fontSize={fontSize}
                  fontFamily={ann.fontFamily || 'sans-serif'}
                  fontWeight={ann.fontWeight || 'normal'}
                  fontStyle={ann.fontStyle || 'normal'}
                  textDecoration={
                    ann.underline && ann.strikethrough
                      ? 'underline line-through'
                      : ann.underline
                      ? 'underline'
                      : ann.strikethrough
                      ? 'line-through'
                      : undefined
                  }
                  textAnchor={
                    ann.textAlign === 'left' ? 'start' : ann.textAlign === 'right' ? 'end' : 'middle'
                  }
                  className="select-none"
                >
                  {text}
                </text>
              )}
            </g>
          </g>
        );
      })}
    </g>
  );
};

/**
 * Memoised like every other scene layer: the canvas re-renders on every
 * pointer move and the buckets keep their identity while elements are
 * unchanged, so a shallow compare is enough.
 */
export const AnnotationLayer = React.memo(AnnotationLayerImpl);
AnnotationLayerImpl.displayName = 'AnnotationLayer';
