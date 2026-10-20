// @ts-strict-ignore
import { styles } from '@actual-app/components/styles';
import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import {
  currencyToAmount,
  integerToCurrency,
} from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import type { DropPosition } from '#components/sort';

// Default width of the budget table's category column. The user can drag it
// between the min and max below; see categoryColumnStyles.ts.
export const CATEGORY_COLUMN_WIDTH = 200;
export const MIN_CATEGORY_COLUMN_WIDTH = 150;
export const MAX_CATEGORY_COLUMN_WIDTH = 500;

export function clampCategoryColumnWidth(width: number) {
  return Math.round(
    Math.min(
      MAX_CATEGORY_COLUMN_WIDTH,
      Math.max(MIN_CATEGORY_COLUMN_WIDTH, width),
    ),
  );
}

export function addToBeBudgetedGroup(groups: CategoryGroupEntity[]) {
  return [
    {
      id: 'to-budget',
      name: 'To Budget',
      categories: [
        {
          id: 'to-budget',
          name: 'To Budget',
          group: 'to-budget',
        },
      ],
    } as CategoryGroupEntity,
    ...groups,
  ];
}

export function removeCategoriesFromGroups(
  categoryGroups: CategoryGroupEntity[],
  ...categoryIds: CategoryEntity['id'][]
) {
  if (categoryIds.length === 0) return categoryGroups;

  const categoryIdsSet = new Set(categoryIds);

  return categoryGroups
    .map(group => ({
      ...group,
      categories:
        group.categories?.filter(cat => !categoryIdsSet.has(cat.id)) ?? [],
    }))
    .filter(group => group.categories?.length);
}

export function separateGroups(categoryGroups: CategoryGroupEntity[]) {
  return [
    categoryGroups.filter(g => !g.is_income),
    categoryGroups.find(g => g.is_income),
  ] as const;
}

export function makeAmountGrey(value: number | string | null): CSSProperties {
  return value === 0 || value === '0' || value === '' || value == null
    ? { color: theme.budgetNumberZero }
    : null;
}

export function makeBalanceAmountStyle(value: number) {
  // Converts an integer currency value to a normalized decimal amount.
  // First converts the integer to currency format, then to a decimal amount.
  // Uses integerToCurrency to display the value correctly according to user prefs.
  const currencyValue = currencyToAmount(
    integerToCurrency(typeof value === 'number' ? value : 0),
  );

  if (currencyValue < 0) {
    return { color: theme.budgetNumberNegative };
  }

  const greyed = makeAmountGrey(currencyValue);
  if (greyed) {
    return greyed;
  }
  return { color: theme.budgetNumberPositive };
}

export function makeAmountFullStyle(
  value: number,
  colors?: {
    positiveColor?: string;
    negativeColor?: string;
    zeroColor?: string;
  },
) {
  const positiveColorToUse =
    colors?.positiveColor || theme.budgetNumberPositive;
  const negativeColorToUse =
    colors?.negativeColor || theme.budgetNumberNegative;
  const zeroColorToUse = colors?.zeroColor || theme.budgetNumberZero;
  return {
    color:
      value < 0
        ? negativeColorToUse
        : value === 0
          ? zeroColorToUse
          : positiveColorToUse,
  };
}

export function findSortDown<T extends { id: string }>(
  arr: T[],
  pos: DropPosition | null,
  targetId: string,
) {
  if (pos === 'top') {
    return { targetId };
  } else {
    const idx = arr.findIndex(item => item.id === targetId);

    if (idx === -1) {
      throw new Error('findSort: item not found: ' + targetId);
    }

    const newIdx = idx + 1;
    if (newIdx < arr.length) {
      return { targetId: arr[newIdx].id };
    } else {
      // Move to the end
      return { targetId: null };
    }
  }
}

export function findSortUp<T extends { id: string }>(
  arr: T[],
  pos: DropPosition | null,
  targetId: string,
) {
  if (pos === 'bottom') {
    return { targetId };
  } else {
    const idx = arr.findIndex(item => item.id === targetId);

    if (idx === -1) {
      throw new Error('findSort: item not found: ' + targetId);
    }

    const newIdx = idx - 1;
    if (newIdx >= 0) {
      return { targetId: arr[newIdx].id };
    } else {
      // Move to the beginning
      return { targetId: null };
    }
  }
}

export function getScrollbarWidth() {
  return Math.max(styles.scrollbarWidth - 2, 0);
}
