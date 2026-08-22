import React from 'react';
import type { MoodBoard } from '../../domain/moodboard';
import { CollageGrid } from '../moodboard/MoodboardCollage';

interface MoodboardPrintViewProps {
  board: MoodBoard;
  srcs: Record<string, string | null>;
}

/**
 * Printable mood-board collage document. Render inside a
 * `.moodboard-print-host` container (see the embedded style block) when used
 * standalone, or directly inside the export studio's paper area.
 */
export const MoodboardPrintView: React.FC<MoodboardPrintViewProps> = ({ board, srcs }) => {
  const generatedAt = new Date().toISOString().split('T')[0];
  const collage = board.collage ?? {};
  const palette = board.palette ?? [];
  const cards = [...board.cards].sort((a, b) => a.order - b.order);
  const hasExternal = cards.some((card) => card.sourceUrl);

  return (
    <>
      <style>{`
        .moodboard-print-host {
          position: absolute;
          left: -10000px;
          top: 0;
          width: 190mm;
          background: #ffffff;
          color: #000000;
          font-family: Arial, Helvetica, sans-serif;
        }
        @media print {
          body #app-root { display: none !important; }
          .moodboard-print-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .mb-doc { padding: 6mm 4mm; color: #000; background: #fff; }
        .mb-doc * { box-sizing: border-box; }
        .mb-kicker { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 2px; color: #555; }
        .mb-title { font-size: 22px; font-weight: bold; text-transform: uppercase; margin: 0 0 4px; }
        .mb-meta { font-size: 10px; color: #444; margin: 0 0 12px; }
        .mb-section { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin: 14px 0 8px; page-break-after: avoid; break-after: avoid; }
        .mb-swatches { display: flex; flex-wrap: wrap; gap: 6px; }
        .mb-swatch { width: 64px; }
        .mb-chip { height: 34px; border: 1px solid #333; border-radius: 3px; }
        .mb-hex { font-family: monospace; font-size: 8.5px; text-align: center; margin-top: 2px; color: #333; }
        .mb-footer { margin-top: 16px; border-top: 1px solid #999; padding-top: 5px; font-size: 8.5px; color: #444; }
      `}</style>
      <div className="mb-doc">
        <header>
          <p className="mb-kicker">Mood board</p>
          <h1 className="mb-title">{collage.title?.trim() || board.title}</h1>
          <p className="mb-meta">
            Visual references · {cards.length} image{cards.length === 1 ? '' : 's'} · {generatedAt}
          </p>
        </header>

        {palette.length > 0 && (
          <section>
            <h2 className="mb-section">Dominant colors</h2>
            <div className="mb-swatches">
              {palette.map((hex) => (
                <div key={hex} className="mb-swatch">
                  <div className="mb-chip" style={{ backgroundColor: hex }} />
                  <div className="mb-hex">{hex.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-section">Collage</h2>
          <CollageGrid cards={cards} srcs={srcs} collage={collage} variant="print" />
        </section>

        <footer className="mb-footer">
          <p>Generated from project data · {generatedAt}</p>
          {hasExternal && <p>Referenced images remain the property of their respective owners — verify licensing before commercial use.</p>}
        </footer>
      </div>
    </>
  );
};
