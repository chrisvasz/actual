// @ts-strict-ignore
import React, { useEffect, useLayoutEffect } from 'react';
import type { ComponentProps } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { FeatureErrorFallback } from '#components/FeatureErrorFallback';
import { AutoSizer } from '#components/util/AutoSizer';
import { useHotkeys } from '#hooks/useHotkeys';

import { useBudgetMonthCount } from './BudgetMonthCountContext';
import { BudgetPageHeader } from './BudgetPageHeader';
import { BudgetTable } from './BudgetTable';
import {
  CATEGORY_COLUMN_ROOT_ATTR,
  setCategoryColumnWidth,
  useCategoryColumnWidth,
} from './categoryColumnStyles';

function getNumPossibleMonths(width: number, categoryWidth: number) {
  const estimatedTableWidth = width - categoryWidth;

  if (estimatedTableWidth < 500) {
    return 1;
  } else if (estimatedTableWidth < 750) {
    return 2;
  } else if (estimatedTableWidth < 1000) {
    return 3;
  } else if (estimatedTableWidth < 1250) {
    return 4;
  } else if (estimatedTableWidth < 1500) {
    return 5;
  }

  return 6;
}

type DynamicBudgetTableProps = {
  width: number;
  height: number;
} & AutoSizingBudgetTableProps;

const DynamicBudgetTable = ({
  type,
  width,
  height,
  prewarmStartMonth,
  startMonth,
  maxMonths = 3,
  monthBounds,
  onMonthSelect,
  onBudgetAction,
  ...props
}: DynamicBudgetTableProps) => {
  const { setDisplayMax } = useBudgetMonthCount();

  const [categoryWidth] = useCategoryColumnWidth();

  const numPossible = getNumPossibleMonths(width, categoryWidth);
  const numMonths = Math.min(numPossible, maxMonths);

  useLayoutEffect(() => {
    setCategoryColumnWidth(categoryWidth);
  }, [categoryWidth]);

  useEffect(() => {
    setDisplayMax(numPossible);
  }, [setDisplayMax, numPossible]);

  function getValidMonth(month) {
    const start = monthBounds.start;
    const end = monthUtils.subMonths(monthBounds.end, numMonths - 1);

    if (month < start) {
      return start;
    } else if (month > end) {
      return end;
    }
    return month;
  }

  function _onMonthSelect(month) {
    onMonthSelect(getValidMonth(month), numMonths);
  }

  useHotkeys(
    'left',
    () => {
      _onMonthSelect(monthUtils.prevMonth(startMonth));
    },
    {
      preventDefault: true,
      scopes: ['app'],
    },
    [_onMonthSelect, startMonth],
  );
  useHotkeys(
    'right',
    () => {
      _onMonthSelect(monthUtils.nextMonth(startMonth));
    },
    {
      preventDefault: true,
      scopes: ['app'],
    },
    [_onMonthSelect, startMonth],
  );
  useHotkeys(
    '0',
    () => {
      _onMonthSelect(
        monthUtils.subMonths(
          monthUtils.currentMonth(),
          type === 'envelope'
            ? Math.floor((numMonths - 1) / 2)
            : numMonths === 2
              ? 1
              : Math.max(numMonths - 2, 0),
        ),
      );
    },
    {
      preventDefault: true,
      scopes: ['app'],
    },
    [_onMonthSelect, startMonth, numMonths],
  );

  return (
    <View
      style={{
        width,
        height,
        alignItems: 'center',
        opacity: width <= 0 || height <= 0 ? 0 : 1,
      }}
    >
      <View
        {...{ [CATEGORY_COLUMN_ROOT_ATTR]: '' }}
        style={{ width: '100%' }}
        // The max width (category column + this) is set in categoryColumnStyles.
        nativeStyle={{ '--budget-months-width': `${500 * numMonths}px` }}
      >
        <ErrorBoundary FallbackComponent={FeatureErrorFallback}>
          <BudgetPageHeader
            startMonth={prewarmStartMonth}
            numMonths={numMonths}
            monthBounds={monthBounds}
            onMonthSelect={_onMonthSelect}
          />
          <BudgetTable
            type={type}
            prewarmStartMonth={prewarmStartMonth}
            startMonth={startMonth}
            numMonths={numMonths}
            monthBounds={monthBounds}
            onBudgetAction={onBudgetAction}
            {...props}
          />
        </ErrorBoundary>
      </View>
    </View>
  );
};

DynamicBudgetTable.displayName = 'DynamicBudgetTable';

type AutoSizingBudgetTableProps = Omit<
  ComponentProps<typeof BudgetTable>,
  'numMonths'
> & {
  maxMonths: number;
  onMonthSelect: (month: string, numMonths: number) => void;
};

export const AutoSizingBudgetTable = (props: AutoSizingBudgetTableProps) => {
  return (
    <AutoSizer
      renderProp={({ width = 0, height = 0 }) => {
        if (width === 0 || height === 0) {
          return null;
        }

        return <DynamicBudgetTable width={width} height={height} {...props} />;
      }}
    />
  );
};

AutoSizingBudgetTable.displayName = 'AutoSizingBudgetTable';
