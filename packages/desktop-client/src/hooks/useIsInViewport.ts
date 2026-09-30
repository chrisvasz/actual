import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Check if the given element (by ref) is visible in the viewport.
 */
export function useIsInViewport(ref: RefObject<Element | null>) {
  const [isIntersecting, setIsIntersecting] = useState(false);

  const observer = useMemo(
    () =>
      new IntersectionObserver(([entry]) =>
        setIsIntersecting(entry.isIntersecting),
      ),
    [],
  );

  // The observer reports asynchronously, after the first paint. Take the
  // first reading from the element's position instead, so something visible
  // from the start renders before the browser paints.
  useLayoutEffect(() => {
    const view = ref.current;
    if (!view) {
      return;
    }

    const rect = view.getBoundingClientRect();
    if (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    ) {
      setIsIntersecting(true);
    }
  }, [ref]);

  useEffect(() => {
    const view = ref.current;

    if (!view) {
      return;
    }

    observer.observe(view);

    return () => {
      observer.disconnect();
    };
  }, [ref, observer]);

  return isIntersecting;
}
