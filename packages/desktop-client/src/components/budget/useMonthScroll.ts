import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import * as monthUtils from '@actual-app/core/shared/months';

import type { MonthBounds } from './MonthsContext';

// Months on each side of the ones in view that can be scrolled to, and so are
// kept mounted.
const OVERSCAN = 1;
// Months passed that stay mounted while the arrows are clicked in a row, or as
// many as are in view if that's more.
const MAX_SPAN = 6;

type UseMonthScrollProps = {
  startMonth: string;
  numMonths: number;
  monthBounds: MonthBounds;
  /** A month that has to stay mounted wherever the table is scrolled. */
  pinnedMonth: string | null;
  /** Called with the first month in view once a scroll comes to rest. */
  onSettle: (month: string) => void;
};

/**
 * Keeps the table's horizontal scroll position and `startMonth` in step, and
 * works out which months to mount.
 *
 * The browser does the scrolling. At rest the table can only scroll one month
 * either way, which is what limits a swipe to one month however long it is; the
 * range moves along once the scroll ends. While scrolling to a month that was
 * picked some other way, it covers every month.
 */
export function useMonthScroll({
  startMonth,
  numMonths,
  monthBounds,
  pinnedMonth,
  onSettle,
}: UseMonthScrollProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  // As wide as every month the table can scroll to
  const stripRef = useRef<HTMLDivElement>(null);

  const lastIndex = monthUtils.differenceInCalendarMonths(
    monthBounds.end,
    monthBounds.start,
  );
  const maxIndex = Math.max(lastIndex + 1 - numMonths, 0);

  function getIndex(month: string) {
    return clamp(
      monthUtils.differenceInCalendarMonths(month, monthBounds.start),
      0,
      maxIndex,
    );
  }

  // Where the table last came to rest, and where it's scrolling to
  const [scroll, setScroll] = useState({ from: startMonth, to: startMonth });
  const from = getIndex(scroll.from);
  const to = getIndex(scroll.to);
  const isScrolling = from !== to;

  const startIndex = getIndex(startMonth);

  // The months that can be scrolled to
  const firstIndex = isScrolling ? 0 : Math.max(from - OVERSCAN, 0);
  const totalMonths =
    (isScrolling
      ? lastIndex
      : Math.min(from + numMonths - 1 + OVERSCAN, lastIndex)) -
    firstIndex +
    1;

  // The first render only has the months in view; the rest follow it.
  const [overscan, setOverscan] = useState(0);
  // Coming to rest mounts the months now in reach without holding up the scroll
  const deferredFrom = useDeferredValue(from);
  const deferredTo = useDeferredValue(to);
  const range = isScrolling
    ? { from, to: deferredTo }
    : { from: deferredFrom, to: from };
  if (Math.abs(range.to - range.from) > Math.max(numMonths, MAX_SPAN)) {
    range.from = range.to;
  }

  function getMonthWidth() {
    return (stripRef.current?.getBoundingClientRect().width ?? 0) / totalMonths;
  }

  function scrollToStartMonth(index: number) {
    const isSmooth =
      (isScrolling || Math.abs(startIndex - index) <= numMonths) &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setScroll({
      from: isSmooth
        ? monthUtils.addMonths(monthBounds.start, index)
        : startMonth,
      to: startMonth,
    });
  }

  const isMoving = useRef(false);
  const onStartMonthChange = useEffectEvent(() => {
    // A swipe under way would hold it back, so it waits for that to end
    if (startIndex !== to && (isScrolling || !isMoving.current)) {
      scrollToStartMonth(from);
    }
  });
  useLayoutEffect(() => onStartMonthChange(), [startMonth]);

  const prevFirstIndex = useRef<number | null>(null);
  const updatePosition = useEffectEvent(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const monthWidth = getMonthWidth();
    const left = (to - firstIndex) * monthWidth;
    const isFirst = prevFirstIndex.current === null;
    const hasRangeMoved = prevFirstIndex.current !== firstIndex;
    prevFirstIndex.current = firstIndex;

    if (isScrolling && !isFirst) {
      if (hasRangeMoved) {
        scroller.scrollTo({
          left: (from - firstIndex) * monthWidth,
          behavior: 'instant',
        });
      }
      // Rounded to whole pixels of the screen, so never quite exact
      if (Math.abs(scroller.scrollLeft - left) < 1) {
        setScroll({ from: scroll.to, to: scroll.to });
      } else {
        scroller.scrollTo({ left, behavior: 'smooth' });
      }
    } else if (Math.abs(scroller.scrollLeft - left) >= 1) {
      scroller.scrollTo({ left, behavior: 'instant' });
    }
  });
  // Not when the width of a month changes: the browser keeps the month it has
  // snapped to in place.
  useLayoutEffect(
    () => updatePosition(),
    [isScrolling, to, firstIndex, totalMonths],
  );

  const onScrollEnd = useEffectEvent(() => {
    isMoving.current = false;
    const position =
      (scrollerRef.current?.scrollLeft ?? 0) / getMonthWidth() + firstIndex;
    const index = clamp(Math.round(position), 0, maxIndex);
    // Between two months, it was cut short by a scroll to another month
    if (Math.abs(position - index) >= 0.01) {
      return;
    }
    if (startIndex !== to) {
      scrollToStartMonth(index);
      return;
    }
    // Where it started, it has yet to move
    if (index === from) {
      return;
    }
    const month = monthUtils.addMonths(monthBounds.start, index);
    setScroll({ from: month, to: month });
    if (index !== startIndex) {
      onSettle(month);
    }
  });

  useEffect(() => {
    startTransition(() => setOverscan(OVERSCAN));

    const scroller = scrollerRef.current;
    isMoving.current = false;
    let left = scroller?.scrollLeft;
    const handleScroll = () => {
      // Not when only scrolled vertically
      if (scroller?.scrollLeft !== left) {
        left = scroller?.scrollLeft;
        isMoving.current = true;
      }
    };
    const handleScrollEnd = () => onScrollEnd();
    scroller?.addEventListener('scroll', handleScroll, { passive: true });
    scroller?.addEventListener('scrollend', handleScrollEnd);
    return () => {
      scroller?.removeEventListener('scroll', handleScroll);
      scroller?.removeEventListener('scrollend', handleScrollEnd);
    };
  }, []);

  return {
    scrollerRef,
    stripRef,
    firstMonth: monthUtils.addMonths(monthBounds.start, firstIndex),
    totalMonths,
    ...getMountedMonths({
      monthBounds,
      range,
      numMonths,
      overscan,
      pinnedMonth,
    }),
  };
}

/** The months to mount, and which of them are out of view. */
export function getMountedMonths({
  monthBounds,
  range,
  numMonths,
  overscan,
  pinnedMonth,
}: {
  monthBounds: MonthBounds;
  /** The first month in view at each end of a scroll. */
  range: { from: number; to: number };
  numMonths: number;
  overscan: number;
  pinnedMonth: string | null;
}) {
  const lastIndex = monthUtils.differenceInCalendarMonths(
    monthBounds.end,
    monthBounds.start,
  );
  const { from, to } = range;
  const firstInView = Math.min(from, to);
  const lastInView = Math.max(from, to) + numMonths - 1;
  // A scroll to the next month needs no more than is mounted already
  const start = clamp(Math.min(from - overscan, to), 0, lastIndex);
  const end = clamp(
    Math.max(from + overscan, to) + numMonths - 1,
    0,
    lastIndex,
  );

  const months: string[] = [];
  const offscreenMonths: string[] = [];
  for (let index = start; index <= end; index++) {
    const month = monthUtils.addMonths(monthBounds.start, index);
    months.push(month);
    // A pinned month has focus, which being inert would take away
    if ((index < firstInView || index > lastInView) && month !== pinnedMonth) {
      offscreenMonths.push(month);
    }
  }

  if (pinnedMonth && !months.includes(pinnedMonth)) {
    months.push(pinnedMonth);
    months.sort();
  }

  return { months, offscreenMonths };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
