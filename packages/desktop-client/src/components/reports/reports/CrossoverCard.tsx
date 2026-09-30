import React, { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  AccountEntity,
  CrossoverWidget,
} from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { CrossoverGraph } from '#components/reports/graphs/CrossoverGraph';
import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { ReportCard } from '#components/reports/ReportCard';
import { ReportCardName } from '#components/reports/ReportCardName';
import { calculateTimeRange } from '#components/reports/reportRanges';
import { defaultTimeFrame } from '#components/reports/reports/Crossover';
import { createCrossoverSpreadsheet } from '#components/reports/spreadsheets/crossover-spreadsheet';
import type { CrossoverData } from '#components/reports/spreadsheets/crossover-spreadsheet';
import { useReportQuery } from '#components/reports/useReport';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { reportDataQueries } from '#reports';

type CrossoverCardProps = {
  widgetId: string;
  isEditing?: boolean;
  accounts: AccountEntity[];
  meta?: CrossoverWidget['meta'];
  onMetaChange: (newMeta: CrossoverWidget['meta']) => void;
};

export function CrossoverCard({
  widgetId,
  isEditing,
  accounts,
  meta = {},
  onMetaChange,
}: CrossoverCardProps) {
  const { t } = useTranslation();
  const {
    data: categories = { grouped: [], list: [] },
    isSuccess: isCategoriesLoaded,
  } = useCategories();
  const { isNarrowWidth } = useResponsive();

  const [nameMenuOpen, setNameMenuOpen] = useState(false);

  const { data: earliestTransactionDate } = useQuery(
    reportDataQueries.earliestTransactionDate(),
  );
  const [start, end] =
    earliestTransactionDate === undefined
      ? ['', '']
      : getCardRange(meta?.timeFrame, earliestTransactionDate);

  const format = useFormat();

  const showHiddenCategories = meta?.showHiddenCategories ?? false;

  // Memoize these to prevent unnecessary re-renders
  const expenseCategoryIds = useMemo(() => {
    const storedIds = meta?.expenseCategoryIds;
    const base =
      storedIds !== undefined
        ? categories.list.filter(c => storedIds.includes(c.id))
        : categories.list.filter(c => !c.is_income);
    return base.filter(c => showHiddenCategories || !c.hidden).map(c => c.id);
  }, [meta?.expenseCategoryIds, categories.list, showHiddenCategories]);

  const incomeAccountIds = useMemo(
    () => meta?.incomeAccountIds ?? accounts.map(a => a.id),
    [meta?.incomeAccountIds, accounts],
  );

  const swr = meta?.safeWithdrawalRate ?? 0.04;
  const estimatedReturn = meta?.estimatedReturn ?? null;
  const expectedContribution = meta?.expectedContribution ?? null;
  const projectionType: 'hampel' | 'median' | 'mean' =
    meta?.projectionType ?? 'hampel';
  const expenseAdjustmentFactor = meta?.expenseAdjustmentFactor ?? 1.0;

  const data = useReportQuery<CrossoverData>(
    () =>
      createCrossoverSpreadsheet({
        start,
        end,
        expenseCategoryIds,
        incomeAccountIds,
        safeWithdrawalRate: swr,
        estimatedReturn,
        expectedContribution,
        projectionType,
        expenseAdjustmentFactor,
      }),
    [
      start,
      end,
      expenseCategoryIds,
      incomeAccountIds,
      swr,
      estimatedReturn,
      expectedContribution,
      projectionType,
      expenseAdjustmentFactor,
    ],
    {
      name: 'crossover',
      enabled: earliestTransactionDate !== undefined && isCategoriesLoaded,
    },
  );

  // Get years to retire from spreadsheet data
  const yearsToRetire = data?.yearsToRetire ?? null;

  return (
    <ReportCard
      widgetId={widgetId}
      isEditing={isEditing}
      disableClick={nameMenuOpen}
      to={`/reports/crossover/${widgetId}`}
      onRename={() => setNameMenuOpen(true)}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', padding: 20 }}>
          <View style={{ flex: 1 }}>
            <ReportCardName
              name={meta?.name || t('Crossover Point')}
              isEditing={nameMenuOpen}
              onChange={newName => {
                onMetaChange({
                  ...meta,
                  name: newName,
                });
                setNameMenuOpen(false);
              }}
              onClose={() => setNameMenuOpen(false)}
            />
            {/* Date range is now fixed and not configurable */}
          </View>
          {data && (
            <View style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <Block
                style={{
                  ...styles.mediumText,
                  fontWeight: 500,
                  marginBottom: 5,
                }}
              >
                {yearsToRetire != null
                  ? t('{{years}} years', {
                      years: format(yearsToRetire, 'number'),
                    })
                  : t('N/A')}
              </Block>
              <Block
                style={{
                  fontSize: 12,
                  color: theme.pageTextSubdued,
                }}
              >
                <Trans>Years to Retire</Trans>
              </Block>
            </View>
          )}
        </View>

        {data ? (
          <CrossoverGraph
            graphData={data.graphData}
            compact
            showTooltip={!isEditing && !isNarrowWidth}
            style={{ height: 'auto', flex: 1 }}
          />
        ) : (
          <LoadingIndicator />
        )}
      </View>
    </ReportCard>
  );
}

// The months the card covers: the saved time frame, clamped to the months
// from the first transaction through last month.
function getCardRange(
  timeFrame: NonNullable<CrossoverWidget['meta']>['timeFrame'],
  earliestTransactionDate: string | null,
): [string, string] {
  const currentMonth = monthUtils.currentMonth();
  const previousMonth = monthUtils.subMonths(currentMonth, 1);

  const earliestDate =
    earliestTransactionDate ?? monthUtils.firstDayOfMonth(previousMonth);
  const latestDate = monthUtils.lastDayOfMonth(previousMonth);

  // Newest first, like Crossover.tsx
  const allMonths = monthUtils
    .rangeInclusive(earliestDate, latestDate)
    .reverse();

  // Use calculateTimeRange to get initial values based on timeFrame mode
  const [initialStart, initialEnd, mode] = calculateTimeRange(
    timeFrame,
    defaultTimeFrame,
    previousMonth,
  );

  const earliestMonth = allMonths[allMonths.length - 1];
  const latestMonth = allMonths[0];
  let start = initialStart;
  let end = initialEnd;

  const clampMonth = (m: string) => {
    if (monthUtils.isBefore(m, earliestMonth)) return earliestMonth;
    if (monthUtils.isAfter(m, latestMonth)) return latestMonth;
    return m;
  };

  // Apply mode-specific logic similar to Crossover.tsx
  if (mode === 'sliding-window') {
    // Shift both start and end back one month for sliding-window
    start = clampMonth(monthUtils.subMonths(start, 1));
    end = clampMonth(monthUtils.subMonths(end, 1));
  } else if (mode === 'full') {
    start = earliestMonth;
    end = latestMonth;
  } else {
    // static mode
    start = clampMonth(start);
    end = clampMonth(end);
  }

  // Ensure end doesn't go before start
  if (monthUtils.isBefore(end, start)) {
    end = start;
  }

  return [start, end];
}
