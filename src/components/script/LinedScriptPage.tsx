import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ScriptElementType, ScriptLine, ScriptMark, Shot } from '../../types';

/**
 * Standard Hollywood layout (in character columns, 12pt Courier = 10 chars per
 * inch). The page body is 60 characters wide; every element hangs off the same
 * grid so an imported screenplay reads like a printed script — on screen and
 * on paper.
 */
const LAYOUT: Record<ScriptElementType, { left: number; width: number; className: string }> = {
  scene: { left: 0, width: 60, className: 'font-bold uppercase' },
  action: { left: 0, width: 60, className: '' },
  character: { left: 22, width: 38, className: 'uppercase' },
  parenthetical: { left: 17, width: 26, className: '' },
  dialogue: { left: 12, width: 35, className: '' },
  transition: { left: 40, width: 20, className: 'uppercase' },
  shot: { left: 0, width: 60, className: 'font-bold uppercase' },
  note: { left: 0, width: 60, className: 'italic opacity-70' },
  'page-break': { left: 0, width: 60, className: 'opacity-40' },
};

export const LANE_WIDTH = 26;
export const PAGE_COLUMNS = 62; // 60 text columns + a little breathing room

/** Zigzag (squiggle) used where a subject drops out of frame during the shot. */
const squigglePath = (x: number, from: number, to: number): string => {
  const amplitude = 3.2;
  const step = 6;
  let path = `M ${x} ${from}`;
  let flip = 1;
  for (let y = from + step; y < to; y += step) {
    path += ` L ${x + amplitude * flip} ${y}`;
    flip *= -1;
  }
  return `${path} L ${x} ${to}`;
};

export interface LaidOutMark {
  mark: ScriptMark;
  from: number;
  to: number;
  lane: number;
}

/** Assign each lining a lane so overlapping shots draw side by side. */
export const layoutMarks = (marks: ScriptMark[], indexById: Map<string, number>): LaidOutMark[] => {
  const ordered = marks
    .map((mark) => ({
      mark,
      from: indexById.get(mark.startLineId) ?? -1,
      to: indexById.get(mark.endLineId) ?? -1,
    }))
    .filter((entry) => entry.from !== -1 && entry.to !== -1)
    .map((entry) => ({ ...entry, from: Math.min(entry.from, entry.to), to: Math.max(entry.from, entry.to) }))
    .sort((a, b) => a.from - b.from || a.to - b.to);

  const laneEnds: number[] = [];
  return ordered.map((entry) => {
    let lane = laneEnds.findIndex((end) => end < entry.from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = entry.to;
    return { ...entry, lane };
  });
};

/**
 * The lined portions of the screenplay only: every stretch a shot covers, plus
 * a line of context either side, with an ellipsis marking what was left out.
 * This is what gets printed by default — a lined script is about the covered
 * material, not the whole screenplay.
 */
export const linedExcerpt = (
  lines: ScriptLine[],
  marks: ScriptMark[],
  context = 1
): ScriptLine[] => {
  const indexById = new Map(lines.map((line, index) => [line.id, index]));
  const ranges = marks
    .map((mark) => {
      const a = indexById.get(mark.startLineId);
      const b = indexById.get(mark.endLineId);
      if (a === undefined || b === undefined) return null;
      return { from: Math.max(0, Math.min(a, b) - context), to: Math.min(lines.length - 1, Math.max(a, b) + context) };
    })
    .filter((range): range is { from: number; to: number } => !!range)
    .sort((a, b) => a.from - b.from);

  if (!ranges.length) return [];

  // Merge overlapping / adjacent ranges
  const merged: { from: number; to: number }[] = [];
  ranges.forEach((range) => {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to + 1) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  });

  const out: ScriptLine[] = [];
  merged.forEach((range, index) => {
    if (index > 0) {
      out.push({
        id: `excerpt-gap-${index}`,
        lineNumber: 0,
        text: '⋯',
        type: 'note',
      });
    }
    for (let i = range.from; i <= range.to; i += 1) out.push(lines[i]);
  });
  return out;
};

interface LinedScriptPageProps {
  lines: ScriptLine[];
  marks: ScriptMark[];
  shots: Shot[];
  fontSize: number;
  isLight: boolean;
  /** Print/export rendering: white paper, no hover affordances. */
  print?: boolean;
  selection?: { from: number; to: number } | null;
  selectedShotId?: string | null;
  onLinePointerDown?: (event: React.PointerEvent, lineId: string) => void;
  onSelectMark?: (mark: ScriptMark) => void;
  /** Commit a dragged lining edge (called once, on release). */
  onExtendMark?: (markId: string, edge: 'start' | 'end', lineId: string) => void;
  onDeleteMark?: (markId: string) => void;
  registerLineRefs?: (refs: Map<string, HTMLElement>) => void;
}

export const LinedScriptPage: React.FC<LinedScriptPageProps> = ({
  lines,
  marks,
  shots,
  fontSize,
  isLight,
  print = false,
  selection = null,
  selectedShotId = null,
  onLinePointerDown,
  onSelectMark,
  onExtendMark,
  onDeleteMark,
  registerLineRefs,
}) => {
  const pageRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [positions, setPositions] = useState<Record<string, { top: number; height: number }>>({});
  const [markAnchors, setMarkAnchors] = useState<
    Record<string, { top?: number; bottom?: number; wavyTop?: number; wavyBottom?: number }>
  >({});
  const marksRef = useRef<ScriptMark[]>(marks);
  const [dragEdge, setDragEdge] = useState<{ markId: string; edge: 'start' | 'end'; lineId: string } | null>(null);

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((line, index) => map.set(line.id, index));
    return map;
  }, [lines]);

  // While a lining edge is being dragged, preview the new range locally and
  // only commit once on release so the undo history keeps a single step.
  const previewMarks = useMemo(() => {
    if (!dragEdge) return marks;
    return marks.map((mark) =>
      mark.id === dragEdge.markId
        ? { ...mark, [dragEdge.edge === 'start' ? 'startLineId' : 'endLineId']: dragEdge.lineId }
        : mark
    );
  }, [marks, dragEdge]);

  const laidOutMarks = useMemo(() => layoutMarks(previewMarks, indexById), [previewMarks, indexById]);
  const laneCount = laidOutMarks.reduce((max, entry) => Math.max(max, entry.lane + 1), 0);

  /**
   * Vertical position of a character inside a line. Used when a lining covers
   * only part of a line (down to a single word), so the stroke starts and ends
   * exactly where the selected text does — even on wrapped lines.
   */
  const measureAnchor = (lineId: string, offset: number | undefined, edge: 'start' | 'end', pageTop: number) => {
    if (offset === undefined) return null;
    const element = lineRefs.current.get(lineId);
    const textNode = element?.querySelector('[data-line-text]')?.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;

    const length = (textNode.textContent || '').length;
    const index = Math.max(0, Math.min(length, offset));
    const range = document.createRange();
    if (edge === 'start') {
      range.setStart(textNode, index);
      range.setEnd(textNode, Math.min(length, index + 1));
    } else {
      range.setStart(textNode, Math.max(0, index - 1));
      range.setEnd(textNode, index);
    }
    const rect = range.getBoundingClientRect();
    if (!rect.height) return null;
    return { top: rect.top - pageTop, bottom: rect.bottom - pageTop };
  };

  const measurePositions = useCallback(() => {
    const page = pageRef.current;
    if (!page) return;
    const pageTop = page.getBoundingClientRect().top;
    const next: Record<string, { top: number; height: number }> = {};
    lineRefs.current.forEach((element, id) => {
      const rect = element.getBoundingClientRect();
      next[id] = { top: rect.top - pageTop, height: rect.height };
    });
    setPositions(next);

    const anchors: Record<string, { top?: number; bottom?: number; wavyTop?: number; wavyBottom?: number }> = {};
    marksRef.current.forEach((mark) => {
      const start = measureAnchor(mark.startLineId, mark.startOffset, 'start', pageTop);
      const end = measureAnchor(mark.endLineId, mark.endOffset, 'end', pageTop);
      const wavyStart = mark.wavyStartLineId
        ? measureAnchor(mark.wavyStartLineId, mark.wavyStartOffset, 'start', pageTop)
        : null;
      const wavyEnd = mark.wavyEndLineId
        ? measureAnchor(mark.wavyEndLineId, mark.wavyEndOffset, 'end', pageTop)
        : null;
      if (start || end || wavyStart || wavyEnd) {
        anchors[mark.id] = {
          top: start?.top,
          bottom: end?.bottom,
          wavyTop: wavyStart?.top,
          wavyBottom: wavyEnd?.bottom,
        };
      }
    });
    setMarkAnchors(anchors);
  }, []);

  useLayoutEffect(() => {
    marksRef.current = previewMarks;
    measurePositions();
    registerLineRefs?.(lineRefs.current);
  }, [lines, previewMarks, fontSize, measurePositions, registerLineRefs]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const observer = new ResizeObserver(() => measurePositions());
    observer.observe(page);
    return () => observer.disconnect();
  }, [measurePositions]);

  // Drag a lining's top/bottom handle to extend or shorten its range.
  useEffect(() => {
    if (!dragEdge) return;
    const handleMove = (event: PointerEvent) => {
      const page = pageRef.current;
      if (!page) return;
      const y = event.clientY - page.getBoundingClientRect().top;

      // Nearest line to the pointer's height — the handles sit in the lining
      // margin, so hit-testing the element under the cursor would never find a
      // script row.
      let bestId: string | null = null;
      let bestDistance = Infinity;
      lines.forEach((line) => {
        const box = positions[line.id];
        if (!box) return;
        const distance =
          y < box.top ? box.top - y : y > box.top + box.height ? y - (box.top + box.height) : 0;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = line.id;
        }
      });
      if (bestId) setDragEdge((current) => (current ? { ...current, lineId: bestId! } : current));
    };
    const handleUp = () => {
      setDragEdge((current) => {
        if (current) onExtendMark?.(current.markId, current.edge, current.lineId);
        return null;
      });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragEdge, onExtendMark, lines, positions]);

  const shotFor = (mark: ScriptMark) => shots.find((shot) => shot.id === mark.shotId);
  const paperText = print ? 'text-slate-900' : isLight ? 'text-slate-900' : 'text-slate-100';
  const paperBg = print ? 'bg-white' : isLight ? 'bg-white' : 'bg-slate-900';

  return (
    <div
      className={`relative mx-auto rounded select-text ${paperBg} ${paperText} ${print ? '' : 'shadow-sm'}`}
      style={{
        // The app shell is `select-none`; the screenplay itself must be
        // selectable so the user can line as little as a single word.
        userSelect: 'text',
        WebkitUserSelect: 'text',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: `${fontSize}px`,
        lineHeight: 1.35,
        maxWidth: `${PAGE_COLUMNS * 0.62}em`,
        padding: `${fontSize}px`,
        paddingLeft: `${fontSize * 2.2}px`,
        paddingRight: `${fontSize * 0.8 + Math.max(laneCount, 1) * LANE_WIDTH}px`,
        paddingBottom: `${fontSize * 3}px`,
      }}
    >
      <div ref={pageRef} className="relative">
        {lines.map((line, index) => {
          const type = (line.type || 'action') as ScriptElementType;
          const layout = LAYOUT[type] || LAYOUT.action;
          const inSelection = selection && index >= selection.from && index <= selection.to;
          const selectedEntry = laidOutMarks.find(
            (entry) => entry.mark.shotId === selectedShotId && index >= entry.from && index <= entry.to
          );
          const inSelectedShot = !!selectedEntry;
          const covered = selectedEntry
            ? {
                start: index === selectedEntry.from ? selectedEntry.mark.startOffset ?? 0 : 0,
                end: index === selectedEntry.to ? selectedEntry.mark.endOffset ?? line.text.length : line.text.length,
              }
            : null;
          const partialCover = !!covered && (covered.start > 0 || covered.end < line.text.length);

          return (
            <div
              key={line.id}
              data-line-id={line.id}
              ref={(element) => {
                if (element) lineRefs.current.set(line.id, element);
                else lineRefs.current.delete(line.id);
              }}
              onPointerDown={(event) => onLinePointerDown?.(event, line.id)}
              className={`relative rounded-sm transition-colors ${onLinePointerDown ? 'cursor-text' : ''} ${
                inSelection
                  ? isLight || print
                    ? 'bg-amber-200/70'
                    : 'bg-amber-400/25'
                  : inSelectedShot && !partialCover && !print
                    ? isLight
                      ? 'bg-sky-100'
                      : 'bg-sky-500/10'
                    : ''
              }`}
              style={{
                marginTop: type === 'scene' ? '1.6em' : type === 'character' ? '1em' : '0.55em',
                marginLeft: `${layout.left}ch`,
                maxWidth: `${layout.width}ch`,
              }}
            >
              {line.isSceneHeading && line.sceneNumber && (
                <span className="absolute font-bold opacity-70" style={{ left: '-2.6ch', fontSize: '0.85em' }}>
                  {line.sceneNumber}
                </span>
              )}
              <span data-line-text className={`whitespace-pre-wrap break-words ${layout.className}`}>
                {line.text}
              </span>
              {/* Tint only the covered words when the selected lining is partial */}
              {covered && (covered.start > 0 || covered.end < line.text.length) && (
                <span
                  aria-hidden
                  className="absolute inset-0 whitespace-pre-wrap break-words pointer-events-none"
                >
                  <span className="invisible">{line.text.slice(0, covered.start)}</span>
                  <span className={isLight || print ? 'bg-sky-200/70' : 'bg-sky-400/25'}>
                    {line.text.slice(covered.start, covered.end)}
                  </span>
                </span>
              )}
            </div>
          );
        })}

        {/* Lining lines: one vertical stroke per shot, in the right-hand margin */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
          {laidOutMarks.map(({ mark, from, to, lane }) => {
            const start = positions[lines[from]?.id];
            const end = positions[lines[to]?.id];
            if (!start || !end) return null;

            const anchor = markAnchors[mark.id];
            const top = anchor?.top ?? start.top;
            const height = Math.max(14, (anchor?.bottom ?? end.top + end.height) - top);
            const shot = shotFor(mark);
            const isActive = selectedShotId === mark.shotId;
            const label = shot?.shotNumber || mark.label;
            // The description follows the shot so edits in the shot list show up
            // on the lined script too.
            const description = shot?.framingDescription || mark.description || '';
            const centre = LANE_WIDTH / 2;
            const strokeWidth = isActive ? 2.4 : 1.6;

            // Squiggle sub-range: subject out of frame for part of the shot.
            const wavyStartBox = mark.wavyStartLineId ? positions[mark.wavyStartLineId] : undefined;
            const wavyEndBox = mark.wavyEndLineId ? positions[mark.wavyEndLineId] : undefined;
            const lineTop = 6;
            const lineBottom = height - (mark.continuesNext ? 10 : 4);
            let wavyFrom = 0;
            let wavyTo = 0;
            // Word-level squiggle bounds when the user highlighted part of a
            // line, otherwise the whole line box.
            const wavyStartY = anchor?.wavyTop ?? wavyStartBox?.top;
            const wavyEndY =
              anchor?.wavyBottom ?? (wavyEndBox ? wavyEndBox.top + wavyEndBox.height : undefined);
            if (wavyStartY !== undefined && wavyEndY !== undefined) {
              wavyFrom = Math.max(lineTop, Math.min(lineBottom, wavyStartY - top));
              wavyTo = Math.max(lineTop, Math.min(lineBottom, wavyEndY - top));
            }
            const hasWavy = wavyTo - wavyFrom > 6;

            return (
              <div
                key={mark.id}
                className={`absolute group ${print ? '' : 'pointer-events-auto'}`}
                style={{ top, height, right: -(lane + 1) * LANE_WIDTH, width: LANE_WIDTH }}
              >
                {/* Slanted description, the way it is written on a lined script */}
                {description && (
                  <span
                    className="absolute font-semibold whitespace-nowrap pointer-events-none"
                    style={{
                      bottom: `calc(100% + 12px)`,
                      left: centre,
                      transformOrigin: 'left bottom',
                      transform: 'rotate(-58deg)',
                      color: mark.color,
                      fontSize: '9px',
                    }}
                  >
                    {description}
                  </span>
                )}

                {/* Shot bubble */}
                <button
                  onClick={() => onSelectMark?.(mark)}
                  disabled={!onSelectMark}
                  title={`${label}${description ? ` — ${description}` : ''}`}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full border text-[9px] font-bold whitespace-nowrap"
                  style={{
                    borderColor: mark.color,
                    color: mark.color,
                    background: print || isLight ? '#fff' : '#0f172a',
                    boxShadow: isActive ? `0 0 0 2px ${mark.color}55` : undefined,
                  }}
                >
                  {label}
                </button>

                <svg width={LANE_WIDTH} height={height} className="overflow-visible">
                  {/* Start crossbar */}
                  <line
                    x1={centre - 5}
                    y1={lineTop}
                    x2={centre + 5}
                    y2={lineTop}
                    stroke={mark.color}
                    strokeWidth={strokeWidth}
                  />
                  {hasWavy ? (
                    <>
                      <line x1={centre} y1={lineTop} x2={centre} y2={wavyFrom} stroke={mark.color} strokeWidth={strokeWidth} />
                      <path
                        d={squigglePath(centre, wavyFrom, wavyTo)}
                        fill="none"
                        stroke={mark.color}
                        strokeWidth={strokeWidth}
                      />
                      <line x1={centre} y1={wavyTo} x2={centre} y2={lineBottom} stroke={mark.color} strokeWidth={strokeWidth} />
                    </>
                  ) : (
                    <line x1={centre} y1={lineTop} x2={centre} y2={lineBottom} stroke={mark.color} strokeWidth={strokeWidth} />
                  )}

                  {mark.continuesNext ? (
                    /* Arrow only when the shot carries on past this page */
                    <polygon
                      points={`${centre - 5},${lineBottom} ${centre + 5},${lineBottom} ${centre},${lineBottom + 10}`}
                      fill={mark.color}
                    />
                  ) : (
                    /* Otherwise the line simply ends on a crossbar */
                    <line
                      x1={centre - 5}
                      y1={lineBottom}
                      x2={centre + 5}
                      y2={lineBottom}
                      stroke={mark.color}
                      strokeWidth={strokeWidth}
                    />
                  )}
                </svg>

                {/* Drag handles to extend / shorten the lining (screen only) */}
                {!print && onExtendMark && isActive && (
                  <>
                    <button
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDragEdge({ markId: mark.id, edge: 'start', lineId: mark.startLineId });
                      }}
                      title="Drag to extend the top of this lining"
                      className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 bg-white cursor-ns-resize"
                      style={{ top: -1, borderColor: mark.color }}
                    />
                    <button
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDragEdge({ markId: mark.id, edge: 'end', lineId: mark.endLineId });
                      }}
                      title="Drag to extend the bottom of this lining"
                      className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 bg-white cursor-ns-resize"
                      style={{ top: lineBottom - 5, borderColor: mark.color }}
                    />
                  </>
                )}

                {!print && onDeleteMark && (
                  <button
                    onClick={() => onDeleteMark(mark.id)}
                    title="Remove this lining and its shot"
                    className="absolute left-1/2 -translate-x-1/2 -bottom-5 p-0.5 rounded bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
