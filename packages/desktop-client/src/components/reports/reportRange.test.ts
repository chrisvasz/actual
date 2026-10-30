import { parseReportRange, resolveReportRange } from './reportRange';

describe('resolveReportRange', () => {
  it('resolves presets relative to the current month, inclusive', () => {
    const resolve = (preset: '3M' | '6M' | 'YTD' | '1Y' | '5Y') =>
      resolveReportRange({ preset }, '2026-10', '2015-03');

    expect(resolve('3M')).toEqual({ start: '2026-08', end: '2026-10' });
    expect(resolve('6M')).toEqual({ start: '2026-05', end: '2026-10' });
    expect(resolve('YTD')).toEqual({ start: '2026-01', end: '2026-10' });
    expect(resolve('1Y')).toEqual({ start: '2025-11', end: '2026-10' });
    expect(resolve('5Y')).toEqual({ start: '2021-11', end: '2026-10' });
  });

  it('starts "All" at the earliest transaction', () => {
    expect(resolveReportRange({ preset: 'all' }, '2026-10', '2015-03')).toEqual(
      { start: '2015-03', end: '2026-10' },
    );
    expect(resolveReportRange({ preset: 'all' }, '2026-10', null)).toEqual({
      start: '2026-10',
      end: '2026-10',
    });
  });

  it('orders a custom range', () => {
    expect(
      resolveReportRange({ start: '2026-05', end: '2026-01' }, '2026-10', null),
    ).toEqual({ start: '2026-01', end: '2026-05' });
  });
});

describe('parseReportRange', () => {
  it('keeps valid ranges and defaults the rest', () => {
    expect(parseReportRange({ preset: '3M' })).toEqual({ preset: '3M' });
    expect(parseReportRange({ start: '2026-01', end: '2026-03' })).toEqual({
      start: '2026-01',
      end: '2026-03',
    });
    expect(parseReportRange({ preset: '2Y' })).toEqual({ preset: '1Y' });
    expect(parseReportRange({ start: 'x', end: '2026-03' })).toEqual({
      preset: '1Y',
    });
    expect(parseReportRange(undefined)).toEqual({ preset: '1Y' });
  });
});
