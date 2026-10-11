import type { DateRangePreset } from '@actual-app/components/date-range-picker';
import * as monthUtils from '@actual-app/core/shared/months';
import type { TimeFrame } from '@actual-app/core/types/models';
import type { SyncedPrefs } from '@actual-app/core/types/prefs';

import { getLiveRange } from './getLiveRange';
import { clampMonthRangeToBounds } from './monthRange';
import {
  getFullFutureRange,
  getFullRange,
  getLatestRange,
  getNextRange,
} from './reportRanges';

type PresetRange = readonly [string, string, TimeFrame['mode']];

type BuildDateRangePresetsOptions = {
  onSelectRange: (range: PresetRange) => void;
  earliestTransaction: string;
  latestTransaction: string;
  show1Month?: boolean;
  showFutureRange?: boolean;
  includeAllTime?: boolean;
  firstDayOfWeekIdx?: SyncedPrefs['firstDayOfWeekIdx'];
};

function liveRangeAsMonths(
  rangeName: string,
  includeCurrentInterval: boolean,
  mode: TimeFrame['mode'],
  earliestTransaction: string,
  latestTransaction: string,
  firstDayOfWeekIdx?: SyncedPrefs['firstDayOfWeekIdx'],
): PresetRange {
  const [rangeStart, rangeEnd] = getLiveRange(
    rangeName,
    earliestTransaction,
    latestTransaction,
    includeCurrentInterval,
    firstDayOfWeekIdx,
  );

  return [monthUtils.getMonth(rangeStart), monthUtils.getMonth(rangeEnd), mode];
}

function makePreset(
  key: string,
  label: string,
  getRange: () => PresetRange,
  onSelectRange: (range: PresetRange) => void,
): DateRangePreset {
  return {
    key,
    label,
    getRange: () => {
      const [rangeStart, rangeEnd] = getRange();
      return [rangeStart, rangeEnd];
    },
    onSelect: () => {
      onSelectRange(getRange());
    },
  };
}

export function buildDateRangePresets({
  onSelectRange,
  earliestTransaction,
  latestTransaction,
  show1Month = false,
  showFutureRange = false,
  includeAllTime = true,
  firstDayOfWeekIdx,
}: BuildDateRangePresetsOptions): DateRangePreset[] {
  const earliestMonth = monthUtils.getMonth(earliestTransaction);
  const latestMonth = monthUtils.getMonth(latestTransaction);

  if (showFutureRange) {
    return [
      ...(show1Month
        ? [
            makePreset(
              'next-month',
              'Next month',
              () => getNextRange(0),
              onSelectRange,
            ),
          ]
        : []),
      makePreset(
        'next-3-months',
        'Next 3 months',
        () => getNextRange(2),
        onSelectRange,
      ),
      makePreset(
        'next-6-months',
        'Next 6 months',
        () => getNextRange(5),
        onSelectRange,
      ),
      makePreset(
        'next-year',
        'Next year',
        () => getNextRange(11),
        onSelectRange,
      ),
      makePreset(
        'all-future',
        'All future',
        () => getFullFutureRange(latestMonth),
        onSelectRange,
      ),
    ];
  }

  return [
    ...(show1Month
      ? [
          makePreset(
            '1-month',
            '1 month',
            () => getLatestRange(0),
            onSelectRange,
          ),
        ]
      : []),
    makePreset('3-months', '3 months', () => getLatestRange(2), onSelectRange),
    makePreset('6-months', '6 months', () => getLatestRange(5), onSelectRange),
    makePreset('1-year', '1 year', () => getLatestRange(11), onSelectRange),
    makePreset(
      'year-to-date',
      'Year to date',
      () =>
        liveRangeAsMonths(
          'Year to date',
          true,
          'yearToDate',
          earliestTransaction,
          latestTransaction,
          firstDayOfWeekIdx,
        ),
      onSelectRange,
    ),
    makePreset(
      'last-month',
      'Last month',
      () =>
        liveRangeAsMonths(
          'Last month',
          false,
          'lastMonth',
          earliestTransaction,
          latestTransaction,
          firstDayOfWeekIdx,
        ),
      onSelectRange,
    ),
    makePreset(
      'last-year',
      'Last year',
      () =>
        liveRangeAsMonths(
          'Last year',
          false,
          'lastYear',
          earliestTransaction,
          latestTransaction,
          firstDayOfWeekIdx,
        ),
      onSelectRange,
    ),
    makePreset(
      'prior-year-to-date',
      'Prior year to date',
      () =>
        liveRangeAsMonths(
          'Prior year to date',
          false,
          'priorYearToDate',
          earliestTransaction,
          latestTransaction,
          firstDayOfWeekIdx,
        ),
      onSelectRange,
    ),
    makePreset(
      'current-quarter',
      'Current quarter',
      () => {
        const [start, end, mode] = liveRangeAsMonths(
          'Current quarter',
          false,
          'currentQuarter',
          earliestTransaction,
          latestTransaction,
          firstDayOfWeekIdx,
        );
        const [clampedStart, clampedEnd] = clampMonthRangeToBounds(
          start,
          end,
          earliestMonth,
          latestMonth,
        );
        return [clampedStart, clampedEnd, mode];
      },
      onSelectRange,
    ),
    makePreset(
      'previous-quarter',
      'Previous quarter',
      () =>
        liveRangeAsMonths(
          'Previous quarter',
          false,
          'previousQuarter',
          earliestTransaction,
          latestTransaction,
          firstDayOfWeekIdx,
        ),
      onSelectRange,
    ),
    ...(includeAllTime
      ? [
          makePreset(
            'all-time',
            'All time',
            () => getFullRange(earliestMonth, latestMonth),
            onSelectRange,
          ),
        ]
      : []),
  ];
}
