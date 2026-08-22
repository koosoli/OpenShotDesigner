import React from 'react';
import type { MoodBoard, MoodBoardCard } from '../../domain/moodboard';

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
        {cards.map((card) => {
          const src = srcs[card.id] ?? null;
          return (
            <figure key={card.id} style={{ margin: 0, breakInside: 'avoid' }}>
              {src ? (
                <img
                  src={src}
                  alt={card.caption || 'Mood board reference'}
                  style={{
                    width: '100%',
                    height: 150,
                    objectFit: 'cover',
                    display: 'block',
                    borderRadius: radius,
                    border: '1px solid rgba(15,23,42,0.18)',
                  }}
                />
              ) : (
                <div
                  style={{
                    height: 150,
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
              )}
              {showCaptions && (card.caption || card.tags.length > 0) && (
                <figcaption
                  style={{
                    marginTop: gap / 2,
                    fontSize: 9,
                    lineHeight: 1.3,
                    color: '#334155',
                  }}
                >
                  {card.caption}
                  {card.tags.length > 0 && (
                    <span style={{ opacity: 0.65 }}> · {card.tags.join(' · ')}</span>
                  )}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>
      {cards.length === 0 && (
        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', padding: '24px 0', margin: 0 }}>
          Add images to build the collage.
        </p>
      )}
    </div>
  );
};
