import { describe, expect, it } from 'vitest';

import { getMountedMonths } from './useMonthScroll';

const budget = {
  monthBounds: { start: '2026-01', end: '2026-12' },
  range: { from: 4, to: 4 },
  numMonths: 3,
  overscan: 1,
  pinnedMonth: null,
};

describe('getMountedMonths', () => {
  it('mounts the months in view and one on each side', () => {
    expect(getMountedMonths(budget)).toEqual({
      months: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
      offscreenMonths: ['2026-04', '2026-08'],
    });
  });

  it('only mounts the months in view without overscan', () => {
    expect(getMountedMonths({ ...budget, overscan: 0 })).toEqual({
      months: ['2026-05', '2026-06', '2026-07'],
      offscreenMonths: [],
    });
  });

  it('mounts nothing more while scrolling to the next month', () => {
    const { months } = getMountedMonths(budget);
    expect(
      getMountedMonths({ ...budget, range: { from: 4, to: 5 } }).months,
    ).toEqual(months);
    expect(
      getMountedMonths({ ...budget, range: { from: 4, to: 3 } }).months,
    ).toEqual(months);
  });

  it('mounts every month passed while scrolling further', () => {
    expect(getMountedMonths({ ...budget, range: { from: 4, to: 7 } })).toEqual({
      months: [
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
      ],
      offscreenMonths: ['2026-04'],
    });
  });

  it('stays within the budget at either end', () => {
    expect(
      getMountedMonths({ ...budget, range: { from: 0, to: 0 } }).months,
    ).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(
      getMountedMonths({ ...budget, range: { from: 9, to: 9 } }).months,
    ).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
  });

  it('shows every month when they all fit', () => {
    expect(
      getMountedMonths({
        ...budget,
        monthBounds: { start: '2026-01', end: '2026-02' },
        range: { from: 0, to: 0 },
      }),
    ).toEqual({ months: ['2026-01', '2026-02'], offscreenMonths: [] });
  });

  it('keeps a pinned month mounted, in order, wherever it is', () => {
    expect(
      getMountedMonths({ ...budget, pinnedMonth: '2026-01' }).months,
    ).toEqual([
      '2026-01',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('leaves a pinned month usable while it is out of view', () => {
    const { offscreenMonths } = getMountedMonths({
      ...budget,
      pinnedMonth: '2026-08',
    });
    expect(offscreenMonths).toEqual(['2026-04']);
  });
});
