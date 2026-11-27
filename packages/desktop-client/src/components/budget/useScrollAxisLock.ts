import { useEffect } from 'react';
import type { RefObject } from 'react';

// How long after the last wheel event a gesture, momentum included, is over
const GESTURE_END_MS = 150;

// Keeps each wheel or trackpad gesture to one axis: whichever way it starts
// moving more, the other axis can't scroll until it ends.
export function useScrollAxisLock(scrollerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unlock = () => {
      timer = undefined;
      scroller.style.overflowX = '';
      scroller.style.overflowY = '';
    };
    const onWheel = (e: WheelEvent) => {
      // A pinch to zoom
      if (e.ctrlKey) {
        return;
      }
      if (timer === undefined) {
        // Shift turns a mouse wheel's vertical scroll sideways
        const isSideways =
          e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
        if (isSideways) {
          scroller.style.overflowY = 'hidden';
        } else {
          scroller.style.overflowX = 'hidden';
        }
        // The browser would apply this one before the lock, on both axes
        e.preventDefault();
      }
      clearTimeout(timer);
      timer = setTimeout(unlock, GESTURE_END_MS);
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      clearTimeout(timer);
      unlock();
    };
  }, [scrollerRef]);
}
