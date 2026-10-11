import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Whether a row of `count` labelled tabs fits in the element at `ref`, given
 * roughly how wide one labelled tab needs to be. A tab strip that does not fit
 * drops to icons rather than cutting every label down to "Sh…" — the viewport
 * width alone cannot tell, because the side panel is resizable.
 */
export const useFitsLabels = (ref: RefObject<HTMLElement | null>, count: number, widthPerLabel = 96): boolean => {
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setFits(element.clientWidth >= count * widthPerLabel);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, count, widthPerLabel]);
  return fits;
};

/** The element's width in CSS pixels, kept current as it resizes (0 before first layout). */
export const useElementWidth = (ref: RefObject<HTMLElement | null>): number => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
};
