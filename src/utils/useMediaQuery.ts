import { useEffect, useState } from 'react';

/** Reactive `matchMedia`, safe to call during SSR-less first render. */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener('change', sync);
    // Some mobile browsers fire resize/orientation without a media change event
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, [query]);

  return matches;
};

/**
 * Layout tiers used across the app:
 * - compact: tablet / small laptop — controls shrink, labels drop
 * - tiny: phone — secondary controls collapse into overflow menus
 */
export const useBreakpoint = () => {
  const isCompact = useMediaQuery('(max-width: 900px)');
  const isTiny = useMediaQuery('(max-width: 600px)');
  const isTouch = useMediaQuery('(pointer: coarse)');
  return { isCompact, isTiny, isTouch };
};
