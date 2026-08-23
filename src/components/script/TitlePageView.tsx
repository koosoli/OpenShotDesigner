import React from 'react';
import { resolveTitlePage } from '../../domain/script';
import type { ScreenplayTitlePage } from '../../domain/script';

interface TitlePageViewProps {
  page: ScreenplayTitlePage | undefined;
  /** The project's script title, used when the cover leaves the title blank. */
  fallbackTitle?: string;
  /** Courier size in px, matched to the pages that follow it. */
  fontSize?: number;
  /** Print media: page-break after the cover, and no screen chrome. */
  print?: boolean;
  isLight?: boolean;
}

/**
 * The screenplay's cover, laid out the way a submitted script is.
 *
 * Title about a third down, centred, in caps; the credit and author beneath it;
 * the source under those. The contact block sits bottom-left and the draft and
 * date bottom-right, which is where a reader's eye goes for "which version is
 * this and who do I ring".
 *
 * Everything is optional: a cover with only a title prints only a title rather
 * than a scaffold of empty labels (rule 13).
 */
export const TitlePageView: React.FC<TitlePageViewProps> = ({
  page,
  fallbackTitle,
  fontSize = 12,
  print = false,
  isLight = false,
}) => {
  const cover = resolveTitlePage(page, fallbackTitle);
  const ink = print || isLight ? '#0f172a' : '#e2e8f0';

  return (
    <div
      className="relative"
      style={{
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: `${fontSize}px`,
        lineHeight: 1.35,
        color: ink,
        // A cover is a page: it stands alone and the script starts after it.
        minHeight: print ? '245mm' : '52em',
        display: 'flex',
        flexDirection: 'column',
        padding: `${fontSize * 2}px`,
        breakAfter: print ? 'page' : undefined,
        pageBreakAfter: print ? 'always' : undefined,
      }}
    >
      {cover.draft && (
        // The same stamp the printed pages carry, so the cover cannot be
        // separated from the fact that this is a work in progress.
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              transform: 'rotate(-32deg)',
              fontSize: `${fontSize * 6}px`,
              fontWeight: 900,
              letterSpacing: '0.14em',
              color: 'rgba(220, 38, 38, 0.13)',
              border: '6px solid rgba(220, 38, 38, 0.13)',
              padding: '6px 34px',
              whiteSpace: 'nowrap',
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
          >
            DRAFT
          </span>
        </div>
      )}

      <div style={{ flex: '0 0 34%' }} />

      <div style={{ textAlign: 'center' }}>
        <div style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>{cover.title}</div>
        {cover.credit && <div style={{ marginTop: '2.5em' }}>{cover.credit}</div>}
        {cover.authors.map((author) => (
          <div key={author} style={{ marginTop: cover.credit ? '1em' : '2.5em' }}>{author}</div>
        ))}
        {cover.source && <div style={{ marginTop: '2.5em' }}>{cover.source}</div>}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '4em' }}>
        <div style={{ whiteSpace: 'pre-line' }}>
          {cover.contact.join('\n')}
          {cover.copyright && <div style={{ marginTop: cover.contact.length ? '1em' : 0 }}>{cover.copyright}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {cover.draftLabel && <div>{cover.draftLabel}</div>}
          {cover.draft && <div style={{ fontWeight: 700 }}>DRAFT</div>}
          {cover.date && <div>{cover.date}</div>}
        </div>
      </div>

      {cover.notes && (
        <div style={{ marginTop: '2em', fontSize: `${fontSize * 0.85}px`, opacity: 0.75, whiteSpace: 'pre-line' }}>
          {cover.notes}
        </div>
      )}
    </div>
  );
};
