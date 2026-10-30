import * as monthUtils from '@actual-app/core/shared/months';

/** `months` is how many months a rolling preset spans, the current one included */
export const REPORT_RANGE_PRESETS = [
  { key: '3M', label: '3M', months: 3 },
  { key: '6M', label: '6M', months: 6 },
  { key: 'YTD', label: 'YTD', months: null },
  { key: '1Y', label: '1Y', months: 12 },
  { key: '5Y', label: '5Y', months: 60 },
  { key: 'all', label: 'All', months: null },
] as const;

export type ReportRangePresetKey = (typeof REPORT_RANGE_PRESETS)[number]['key'];

/**
 * The time range every report on the Reports page shows. A preset is
 * relative to the current month, so it moves with time; a custom range is
 * fixed. Months are `yyyy-MM`, inclusive.
 */
export type ReportRange =
  | { preset: ReportRangePresetKey }
  | { start: string; end: string };

export const DEFAULT_REPORT_RANGE: ReportRange = { preset: '1Y' };

/**
 * The first and last month of `range`. `earliestMonth` is the month of the
 * budget's first transaction, where "All" starts; without one, "All" is the
 * current month alone.
 */
export function resolveReportRange(
  range: ReportRange,
  currentMonth: string,
  earliestMonth: string | null,
): { start: string; end: string } {
  if (!('preset' in range)) {
    return range.start <= range.end
      ? { start: range.start, end: range.end }
      : { start: range.end, end: range.start };
  }
  const preset = REPORT_RANGE_PRESETS.find(p => p.key === range.preset);
  let start = currentMonth;
  if (preset?.months) {
    start = monthUtils.subMonths(currentMonth, preset.months - 1);
  } else if (range.preset === 'YTD') {
    start = `${monthUtils.getYear(currentMonth)}-01`;
  } else if (range.preset === 'all' && earliestMonth) {
    start = earliestMonth < currentMonth ? earliestMonth : currentMonth;
  }
  return { start, end: currentMonth };
}

/** Reads a stored range, falling back to the default when it's malformed. */
export function parseReportRange(value: unknown): ReportRange {
  if (typeof value !== 'object' || value == null) {
    return DEFAULT_REPORT_RANGE;
  }
  if ('preset' in value) {
    const preset = REPORT_RANGE_PRESETS.find(p => p.key === value.preset);
    return preset ? { preset: preset.key } : DEFAULT_REPORT_RANGE;
  }
  if (
    'start' in value &&
    'end' in value &&
    isMonth(value.start) &&
    isMonth(value.end)
  ) {
    return { start: value.start, end: value.end };
  }
  return DEFAULT_REPORT_RANGE;
}

function isMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}
