import React, { useMemo, useRef, useState } from 'react';
import type { MoodBoard, MoodBoardCard, MoodBoardCardLayout } from '../../domain/moodboard';
import {
  COLLAGE_CANVAS_WIDTH,
  clampCardLayout,
  collageCanvasHeight,
  collagePaintOrder,
  resolveCollageLayouts,
} from '../../domain/moodboard';

interface CollageGridProps {
  cards: MoodBoardCard[];
  srcs: Record<string, string | null>;
  collage: NonNullable<MoodBoard['collage']>;
  /** 'screen' rounds corners; 'print' keeps flat ink-friendly edges. */
  variant?: 'screen' | 'print';
}

const DEFAULT_COLUMNS = 3;
const DEFAULT_GAP = 8;
const DEFAULT_BACKGROUND = '#ffffff';

const CardImage: React.FC<{ src: string | null; caption?: string; radius: number; fill?: boolean }> = ({ src, caption, radius, fill }) =>
  src ? (
    <img
      src={src}
      alt={caption || 'Mood board reference'}
      draggable={false}
      style={{
        width: '100%',
        height: fill ? '100%' : 150,
        objectFit: 'cover',
        display: 'block',
        borderRadius: radius,
        border: '1px solid rgba(15,23,42,0.18)',
        pointerEvents: 'none',
      }}
    />
  ) : (
    <div
      style={{
        height: fill ? '100%' : 150,
        borderRadius: radius,
        border: '1px dashed rgba(100,116,139,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        color: '#94a3b8',
      }}
    >
      Image unavailable
    </div>
  );

/**
 * Shared collage renderer for the mood-board panel preview and the printed /
 * exported collage document. Pure presentation — layout settings come from
 * the board's persisted `collage` block so both stay in sync.
 */
export const CollageGrid: React.FC<CollageGridProps> = ({ cards, srcs, collage, variant = 'screen' }) => {
  const columns = Math.max(1, Math.min(6, collage.columns ?? DEFAULT_COLUMNS));
  const gap = Math.max(0, Math.min(32, collage.gap ?? DEFAULT_GAP));
  const background = collage.background || DEFAULT_BACKGROUND;
  const showCaptions = collage.showCaptions ?? true;
  const radius = variant === 'print' ? 0 : 6;

  return (
    <div style={{ backgroundColor: background, padding: gap, borderRadius: variant === 'print' ? 0 : 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap }}>
        {cards.map((card) => (
          <figure key={card.id} style={{ margin: 0, breakInside: 'avoid' }}>
            <CardImage src={srcs[card.id] ?? null} caption={card.caption} radius={radius} />
            {showCaptions && (card.caption || card.tags.length > 0) && (
              <figcaption style={{ marginTop: gap / 2, fontSize: 9, lineHeight: 1.3, color: '#334155' }}>
                {card.caption}
                {card.tags.length > 0 && <span style={{ opacity: 0.65 }}> · {card.tags.join(' · ')}</span>}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      {cards.length === 0 && (
        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', padding: '24px 0', margin: 0 }}>
          Add images to build the collage.
        </p>
      )}
    </div>
  );
};

interface CollageFreeformProps {
  board: MoodBoard;
  srcs: Record<string, string | null>;
  variant?: 'screen' | 'print';
  /** When provided the collage is editable: drag to move, corner handle to resize, click to raise. */
  onLayoutChange?: (cardId: string, layout: MoodBoardCardLayout) => void;
  onRaise?: (cardId: string) => void;
  selectedCardId?: string | null;
  onSelect?: (cardId: string | null) => void;
}

type Gesture = {
  cardId: string;
  mode: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  origin: MoodBoardCardLayout;
};

/**
 * Free-form collage: every card is absolutely positioned on a virtual canvas
 * (1000 units wide), scaled to whatever width the container has. Pointer
 * gestures are converted to canvas units here; clamping/persistence is the
 * domain layer's job (`collageLayout.ts`).
 */
export const CollageFreeform: React.FC<CollageFreeformProps> = ({
  board,
  srcs,
  variant = 'screen',
  onLayoutChange,
  onRaise,
  selectedCardId,
  onSelect,
}) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // The active gesture lives in a ref so pointermove can read it in the same
  // tick it was started (state would lag one render behind).
  const gestureRef = useRef<Gesture | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ cardId: string; layout: MoodBoardCardLayout } | null>(null);

  const canvasHeight = collageCanvasHeight(board);
  const layouts = useMemo(() => resolveCollageLayouts(board), [board]);
  const ordered = useMemo(() => collagePaintOrder(board), [board]);
  const background = board.collage?.background || DEFAULT_BACKGROUND;
  const showCaptions = board.collage?.showCaptions ?? true;
  const radius = variant === 'print' ? 0 : 6;
  const editable = !!onLayoutChange;

  const unitsPerPixel = () => {
    const width = canvasRef.current?.clientWidth || COLLAGE_CANVAS_WIDTH;
    return COLLAGE_CANVAS_WIDTH / width;
  };

  const beginGesture = (e: React.PointerEvent, cardId: string, mode: Gesture['mode']) => {
    if (!editable) return;
    const origin = layouts.get(cardId);
    if (!origin) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Capture is best-effort (synthetic events / older browsers).
    }
    gestureRef.current = { cardId, mode, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origin };
    setActiveCardId(cardId);
    onSelect?.(cardId);
    onRaise?.(cardId);
  };

  const layoutForGesture = (gesture: Gesture, e: React.PointerEvent): MoodBoardCardLayout => {
    const scale = unitsPerPixel();
    const dx = (e.clientX - gesture.startX) * scale;
    const dy = (e.clientY - gesture.startY) * scale;
    // z is deliberately dropped: the domain keeps the card's current stacking
    // (which "raise on pointer-down" may have changed after `origin` was read).
    const { z: _z, ...origin } = gesture.origin;
    const next =
      gesture.mode === 'move'
        ? { ...origin, x: origin.x + dx, y: origin.y + dy }
        : { ...origin, w: origin.w + dx, h: origin.h + dy };
    return clampCardLayout(next, canvasHeight);
  };

  const moveGesture = (e: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    setPreview({ cardId: gesture.cardId, layout: layoutForGesture(gesture, e) });
  };

  const endGesture = (e: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const final = layoutForGesture(gesture, e);
    const moved =
      final.x !== gesture.origin.x ||
      final.y !== gesture.origin.y ||
      final.w !== gesture.origin.w ||
      final.h !== gesture.origin.h;
    if (moved) onLayoutChange?.(gesture.cardId, final);
    gestureRef.current = null;
    setActiveCardId(null);
    setPreview(null);
  };

  const pct = (units: number, total: number) => `${(units / total) * 100}%`;

  return (
    <div
      ref={canvasRef}
      onPointerDown={() => onSelect?.(null)}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${COLLAGE_CANVAS_WIDTH} / ${canvasHeight}`,
        backgroundColor: background,
        borderRadius: variant === 'print' ? 0 : 10,
        overflow: 'hidden',
        touchAction: editable ? 'none' : undefined,
        userSelect: 'none',
      }}
    >
      {ordered.map((card) => {
        const base = layouts.get(card.id);
        if (!base) return null;
        const layout = preview?.cardId === card.id ? preview.layout : base;
        const selected = selectedCardId === card.id;
        return (
          <div
            key={card.id}
            onPointerDown={(e) => beginGesture(e, card.id, 'move')}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            style={{
              position: 'absolute',
              left: pct(layout.x, COLLAGE_CANVAS_WIDTH),
              top: pct(layout.y, canvasHeight),
              width: pct(layout.w, COLLAGE_CANVAS_WIDTH),
              height: pct(layout.h, canvasHeight),
              cursor: editable ? (activeCardId === card.id ? 'grabbing' : 'grab') : undefined,
              outline: selected && editable ? '2px solid #0ea5e9' : undefined,
              outlineOffset: 1,
              borderRadius: radius,
              boxShadow: variant === 'print' ? undefined : '0 1px 3px rgba(15,23,42,0.25)',
            }}
          >
            <CardImage src={srcs[card.id] ?? null} caption={card.caption} radius={radius} fill />
            {showCaptions && card.caption && (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: '2px 5px',
                  fontSize: 9,
                  lineHeight: 1.3,
                  color: '#f8fafc',
                  background: 'linear-gradient(to top, rgba(15,23,42,0.75), rgba(15,23,42,0))',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  pointerEvents: 'none',
                  borderRadius: `0 0 ${radius}px ${radius}px`,
                }}
              >
                {card.caption}
              </span>
            )}
            {editable && (
              <div
                onPointerDown={(e) => beginGesture(e, card.id, 'resize')}
                onPointerMove={moveGesture}
                onPointerUp={endGesture}
                onPointerCancel={endGesture}
                title="Drag to resize"
                style={{
                  position: 'absolute',
                  right: -4,
                  bottom: -4,
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: '#0ea5e9',
                  border: '2px solid #ffffff',
                  cursor: 'nwse-resize',
                  opacity: selected ? 1 : 0.55,
                }}
              />
            )}
          </div>
        );
      })}
      {board.cards.length === 0 && (
        <p style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 11, color: '#94a3b8', margin: 0 }}>
          Add images to build the collage.
        </p>
      )}
    </div>
  );
};
