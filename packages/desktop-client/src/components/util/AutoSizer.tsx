import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Size = { width: number; height: number };

type AutoSizerProps = {
  renderProp: (size: Size) => ReactNode;
};

/**
 * Renders `renderProp` with the content-box size of its parent element, like
 * `react-virtualized-auto-sizer`. That one only measures from a
 * `ResizeObserver` callback deferred with `setTimeout`, so whatever it sizes
 * paints empty for a frame first. This takes the first measurement in a layout
 * effect instead, which re-renders before the browser paints.
 */
export function AutoSizer({ renderProp }: AutoSizerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) {
      return;
    }

    function measure(element: HTMLElement) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const width =
        rect.width -
        parseFloat(style.paddingLeft || '0') -
        parseFloat(style.paddingRight || '0') -
        parseFloat(style.borderLeftWidth || '0') -
        parseFloat(style.borderRightWidth || '0');
      const height =
        rect.height -
        parseFloat(style.paddingTop || '0') -
        parseFloat(style.paddingBottom || '0') -
        parseFloat(style.borderTopWidth || '0') -
        parseFloat(style.borderBottomWidth || '0');

      setSize(prev =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    }

    measure(parent);

    // Later resizes are deferred out of the observer callback, as the library
    // does, so resizing the child can't trip a ResizeObserver loop error.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => measure(parent), 0);
    });
    observer.observe(parent);

    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={ref} data-auto-sizer="">
      {renderProp(size)}
    </div>
  );
}
