import {
  startTransition,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import * as monthUtils from '@actual-app/core/shared/months';

import type { MonthBounds } from './MonthsContext';

// Months kept mounted on each side of the ones in view.
const OVERSCAN = 1;

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
 * works out which months to mount. The browser does the scrolling; months are
 * mounted in a transition, so a scroll never waits for them.
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

  const firstMonth = monthBounds.start;
  const totalMonths =
    monthUtils.differenceInCalendarMonths(monthBounds.end, firstMonth) + 1;
  const maxIndex = Math.max(totalMonths - numMonths, 0);
  const startIndex = clamp(
    monthUtils.differenceInCalendarMonths(startMonth, firstMonth),
    0,
    maxIndex,
  );

  const [firstInView, setFirstInView] = useState(startIndex);
  // The first render only has the months in view; the rest follow it.
  const [overscan, setOverscan] = useState(0);

  function getMonthWidth() {
    return (stripRef.current?.getBoundingClientRect().width ?? 0) / totalMonths;
  }

  const hasScrolled = useRef(false);
  const scrollToStart = useEffectEvent(() => {
    const scroller = scrollerRef.current;
    const monthWidth = getMonthWidth();
    const left = startIndex * monthWidth;
    const distance = Math.abs((scroller?.scrollLeft ?? left) - left);
    const isSmooth =
      hasScrolled.current &&
      distance <= numMonths * monthWidth + 1 &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    hasScrolled.current = true;

    // Rounded to whole pixels of the screen, so never quite exact
    if (distance < 1) {
      return;
    }
    if (!isSmooth) {
      setFirstInView(startIndex);
    }
    scroller?.scrollTo({ left, behavior: isSmooth ? 'smooth' : 'instant' });
  });
  // Not when the width of a month changes: the browser keeps the month it has
  // snapped to in place.
  useLayoutEffect(() => scrollToStart(), [startIndex, totalMonths]);

  const onScroll = useEffectEvent(() => {
    const position = (scrollerRef.current?.scrollLeft ?? 0) / getMonthWidth();
    const index = clamp(Math.floor(position + 0.01), 0, maxIndex);
    if (index !== firstInView) {
      startTransition(() => setFirstInView(index));
    }
  });

  const onScrollEnd = useEffectEvent(() => {
    const position = (scrollerRef.current?.scrollLeft ?? 0) / getMonthWidth();
    const index = clamp(Math.round(position), 0, maxIndex);
    // Between two months, it was cut short by a scroll to another month
    if (index !== startIndex && Math.abs(position - index) < 0.01) {
      onSettle(monthUtils.addMonths(firstMonth, index));
    }
  });

  useEffect(() => {
    startTransition(() => setOverscan(OVERSCAN));

    const scroller = scrollerRef.current;
    const handleScroll = () => onScroll();
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
    firstMonth,
    totalMonths,
    ...getMountedMonths({
      firstMonth,
      totalMonths,
      firstInView,
      numMonths,
      overscan,
      pinnedMonth,
    }),
  };
}

/** The months to mount, and which of them are scrolled out of view. */
export function getMountedMonths({
  firstMonth,
  totalMonths,
  firstInView,
  numMonths,
  overscan,
  pinnedMonth,
}: {
  firstMonth: string;
  totalMonths: number;
  firstInView: number;
  numMonths: number;
  overscan: number;
  pinnedMonth: string | null;
}) {
  const lastIndex = totalMonths - 1;
  const lastInView = firstInView + numMonths - 1;
  const start = clamp(firstInView - overscan, 0, lastIndex);
  const end = clamp(lastInView + overscan, 0, lastIndex);

  const months: string[] = [];
  const offscreenMonths: string[] = [];
  for (let index = start; index <= end; index++) {
    const month = monthUtils.addMonths(firstMonth, index);
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
