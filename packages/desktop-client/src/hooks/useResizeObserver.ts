import { useCallback, useInsertionEffect, useRef } from 'react';

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
  // The observer is created once, so it calls `func` through this ref to get
  // the latest one rather than the first render's. Updated in an insertion
  // effect, which runs before refs attach, so `measureOnAttach` sees it too.
  const funcRef = useRef(func);
  useInsertionEffect(() => {
    funcRef.current = func;
  });

  const observer = useRef<ResizeObserver | undefined>(undefined);
  if (!observer.current) {
    observer.current = new ResizeObserver(entries => {
      funcRef.current(entries[0].contentRect);
    });
  }

  const elementRef = useCallback(
    (el: T) => {
      observer.current?.disconnect();
      if (el) {
        if (measureOnAttach) {
          funcRef.current(el.getBoundingClientRect());
        }
        observer.current?.observe(el, { box: 'border-box' });
      }
    },
    [measureOnAttach],
  );

  return elementRef;
}
