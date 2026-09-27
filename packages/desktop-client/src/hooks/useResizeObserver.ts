import { useCallback, useRef } from 'react';

type ResizeObserverOptions = {
  /**
   * Also call `func` with the element's bounding box as soon as it is
   * attached. The observer reports just before a paint, and React renders a
   * state update from it only after that paint, so layout that depends on
   * the size would otherwise paint once at the wrong size. Updating state
   * while React attaches the ref renders before the first paint instead.
   * The bounding box is the border box, so this only matches the observer's
   * content rect for elements without padding or borders.
   */
  measureOnAttach?: boolean;
};

export function useResizeObserver<T extends Element>(
  func: (contentRect: DOMRectReadOnly) => void,
  { measureOnAttach = false }: ResizeObserverOptions = {},
): (el: T) => void {
  const observer = useRef<
    | {
        observer: ResizeObserver;
        measure: ((rect: DOMRectReadOnly) => void) | undefined;
      }
    | undefined
  >(undefined);
  if (!observer.current) {
    observer.current = {
      observer: new ResizeObserver(entries => {
        func(entries[0].contentRect);
      }),
      measure: measureOnAttach ? func : undefined,
    };
  }

  const elementRef = useCallback((el: T) => {
    observer.current?.observer.disconnect();
    if (el) {
      observer.current?.measure?.(el.getBoundingClientRect());
      observer.current?.observer.observe(el, { box: 'border-box' });
    }
  }, []);

  return elementRef;
}
