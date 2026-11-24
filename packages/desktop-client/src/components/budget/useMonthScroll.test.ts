import { describe, expect, it } from 'vitest';

import { getMountedMonths } from './useMonthScroll';

const budget = {
  firstMonth: '2026-01',
  totalMonths: 12,
  firstInView: 4,
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

  it('stays within the budget at either end', () => {
    expect(getMountedMonths({ ...budget, firstInView: 0 }).months).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
    expect(getMountedMonths({ ...budget, firstInView: 9 }).months).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });

  it('shows every month when they all fit', () => {
    expect(
      getMountedMonths({ ...budget, totalMonths: 2, firstInView: 0 }),
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
