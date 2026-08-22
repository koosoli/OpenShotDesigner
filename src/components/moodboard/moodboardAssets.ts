import { useEffect, useState } from 'react';
import type { MoodBoardCard } from '../../domain/moodboard';
import { createIdbAssetStore } from '../../domain/storage/idbAssetStore';

/** Single shared asset store for all mood-board surfaces (panel, collage, print). */
export const moodboardAssetStore = createIdbAssetStore();

const cache = new Map<string, string>();

/**
 * Resolve displayable sources for mood-board cards: IDB assets become blob
 * object URLs (cached for the session), external URLs pass through untouched.
 * Returns a map keyed by card id; unresolved entries are null.
 */
export const useMoodboardImageSrcs = (cards: MoodBoardCard[]): Record<string, string | null> => {
  const signature = cards
    .map((c) => `${c.id}:${c.assetId ?? '-'}:${c.sourceUrl ?? '-'}`)
    .join('|');
  const [srcs, setSrcs] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const next: Record<string, string | null> = {};

    (async () => {
      for (const card of cards) {
        if (card.assetId) {
          const cached = cache.get(card.assetId);
          if (cached) {
            next[card.id] = cached;
            continue;
          }
          try {
            const blob = await moodboardAssetStore.get(card.assetId);
            if (!blob) {
              next[card.id] = null;
              continue;
            }
            const url = URL.createObjectURL(blob);
            cache.set(card.assetId, url);
            created.push(url);
            next[card.id] = url;
          } catch {
            next[card.id] = null;
          }
        } else {
          next[card.id] = card.sourceUrl ?? null;
        }
      }
      if (!cancelled) setSrcs(next);
    })();

    return () => {
      cancelled = true;
      // Object URLs stay cached for reuse; they live for the session.
      void created;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return srcs;
};
