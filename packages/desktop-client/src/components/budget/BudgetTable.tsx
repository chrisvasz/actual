import React, { useState } from 'react';
import type { KeyboardEvent } from 'react';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import type { DropPosition } from '#components/sort';
import { UncategorizedChip } from '#components/UncategorizedChip';
import { useCategories } from '#hooks/useCategories';
import { useLocalPref } from '#hooks/useLocalPref';

import { BudgetCategories } from './BudgetCategories';
import { BudgetSummaries } from './BudgetSummaries';
import { BudgetTotals } from './BudgetTotals';
import { CATEGORY_COLUMN_CLASS } from './categoryColumnStyles';
import { MonthsProvider } from './MonthsContext';
import type { MonthBounds } from './MonthsContext';
import {
  findSortDown,
  findSortUp,
  getScrollbarWidth,
  separateGroups,
} from './util';

type BudgetTableProps = {
  type: string;
  prewarmStartMonth: string;
  startMonth: string;
  numMonths: number;
  monthBounds: MonthBounds;
  onSaveCategory: (category: CategoryEntity) => Promise<void>;
  onDeleteCategory: (id: CategoryEntity['id']) => void;
  onSaveGroup: (group: CategoryGroupEntity) => Promise<void>;
  onDeleteGroup: (id: CategoryGroupEntity['id']) => void;
  onSortCategories?: (
    groupId: CategoryGroupEntity['id'],
    direction: 'asc' | 'desc',
  ) => void;
  onReorderCategory: (params: {
    id: CategoryEntity['id'];
    groupId: CategoryGroupEntity['id'];
    targetId: CategoryEntity['id'] | null;
  }) => void;
  onReorderGroup: (params: {
    id: CategoryGroupEntity['id'];
    targetId: CategoryEntity['id'] | null;
  }) => void;
  onShowActivity: (id: CategoryEntity['id'], month?: string) => void;
  onBudgetAction: (month: string, type: string, args: unknown) => void;
};

export function BudgetTable(props: BudgetTableProps) {
  const {
    type,
    prewarmStartMonth,
    startMonth,
    numMonths,
    monthBounds,
    onSaveCategory,
    onDeleteCategory,
    onSaveGroup,
    onDeleteGroup,
    onSortCategories,
    onReorderCategory,
    onReorderGroup,
    onShowActivity,
    onBudgetAction,
  } = props;

  // Not destructured with a default: the React Compiler can't compile
  // object-pattern defaults, and this component relies on its memoization.
  const { data: categoryData } = useCategories();
  const categoryGroups = categoryData?.grouped ?? [];
  const [collapsedGroupIds = [], setCollapsedGroupIdsPref] =
    useLocalPref('budget.collapsed');
  const [showHiddenCategories, setShowHiddenCategoriesPef] = useLocalPref(
    'budget.showHiddenCategories',
  );
  const [editing, setEditing] = useState<{ id: string; cell: string } | null>(
    null,
  );

  const onEditMonth = (id: string, month: string) => {
    setEditing(id ? { id, cell: month } : null);
  };

  const onEditName = (id: string) => {
    setEditing(id ? { id, cell: 'name' } : null);
  };

  const _onReorderCategory = (
    id: string,
    dropPos: DropPosition | null,
    targetId: string,
  ) => {
    const isGroup = !!categoryGroups.find(g => g.id === targetId);

    if (isGroup) {
      const { targetId: groupId } = findSortUp(
        categoryGroups,
        dropPos,
        targetId,
      );
      const group = categoryGroups.find(g => g.id === groupId);

      if (group) {
        const categories = group.categories ?? [];
        onReorderCategory({
          id,
          groupId: group.id,
          targetId:
            categories.length === 0 || dropPos === 'top'
              ? null
              : categories[0].id,
        });
      }
    } else {
      const group = categoryGroups.find(({ categories }) =>
        categories?.some(cat => cat.id === targetId),
      );

      if (group) {
        onReorderCategory({
          id,
          groupId: group.id,
          ...findSortDown(group.categories || [], dropPos, targetId),
        });
      }
    }
  };

  const _onReorderGroup = (
    id: string,
    dropPos: DropPosition | null,
    targetId: string,
  ) => {
    const [expenseGroups] = separateGroups(categoryGroups); // exclude Income group from sortable groups to fix off-by-one error
    onReorderGroup({
      id,
      ...findSortDown(expenseGroups, dropPos, targetId),
    });
  };

  const moveVertically = (dir: 1 | -1) => {
    const flattened = categoryGroups.reduce(
      (all, group) => {
        if (collapsedGroupIds.includes(group.id)) {
          return all.concat({ id: group.id, isGroup: true });
        }
        return all.concat([
          { id: group.id, isGroup: true },
          ...(group?.categories || []),
        ]);
      },
      [] as Array<
        { id: CategoryGroupEntity['id']; isGroup: boolean } | CategoryEntity
      >,
    );

    if (editing) {
      const idx = flattened.findIndex(item => item.id === editing.id);
      let nextIdx = idx + dir;

      while (nextIdx >= 0 && nextIdx < flattened.length) {
        const next = flattened[nextIdx];

        if ('isGroup' in next && next.isGroup) {
          nextIdx += dir;
          continue;
        } else if (
          type === 'tracking' ||
          ('is_income' in next && !next.is_income)
        ) {
          onEditMonth(next.id, editing.cell);
          return;
        } else {
          break;
        }
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!editing) {
      return null;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      moveVertically(e.shiftKey ? -1 : 1);
    }
  };

  const onCollapse = (collapsedIds: string[]) => {
    setCollapsedGroupIdsPref(collapsedIds);
  };

  const onToggleHiddenCategories = () => {
    setShowHiddenCategoriesPef(!showHiddenCategories);
  };

  const toggleHiddenCategories = () => {
    onToggleHiddenCategories();
  };

  const expandAllCategories = () => {
    onCollapse([]);
  };

  const collapseAllCategories = () => {
    onCollapse(categoryGroups.map(g => g.id));
  };

  return (
    <View
      data-testid="budget-table"
      style={{
        flex: 1,
        ...(styles.lightScrollbar && {
          '& ::-webkit-scrollbar': {
            backgroundColor: 'transparent',
          },
          '& ::-webkit-scrollbar-thumb:vertical': {
            backgroundColor: theme.pageTextSubdued,
            // changed from tableHeaderBackground. pageTextSubdued is always visible on pageBackground
          },
        }),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          overflow: 'hidden',
          flexShrink: 0,
          // This is necessary to align with the table because the
          // table has this padding to allow the shadow to show
          paddingLeft: 5,
          paddingRight: 5 + getScrollbarWidth(),
        }}
      >
        <View
          className={CATEGORY_COLUMN_CLASS}
          style={{
            justifyContent: 'flex-end',
            alignItems: 'flex-start',
            paddingBottom: 8,
          }}
        >
          <UncategorizedChip />
        </View>
        <MonthsProvider
          startMonth={prewarmStartMonth}
          numMonths={numMonths}
          monthBounds={monthBounds}
          type={type}
        >
          <BudgetSummaries />
        </MonthsProvider>
      </View>

      <MonthsProvider
        startMonth={startMonth}
        numMonths={numMonths}
        monthBounds={monthBounds}
        type={type}
      >
        <BudgetTotals
          toggleHiddenCategories={toggleHiddenCategories}
          expandAllCategories={expandAllCategories}
          collapseAllCategories={collapseAllCategories}
        />
        <View
          data-testid="budget-table-scroll-container"
          style={{
            overflowY: 'scroll',
            overflowAnchor: 'none',
            flex: 1,
            paddingLeft: 5,
            paddingRight: 5,
          }}
        >
          <View
            style={{
              flexShrink: 0,
            }}
            onKeyDown={onKeyDown}
          >
            <BudgetCategories
              categoryGroups={categoryGroups}
              editingCell={editing}
              onEditMonth={onEditMonth}
              onEditName={onEditName}
              onSaveCategory={onSaveCategory}
              onSaveGroup={onSaveGroup}
              onDeleteCategory={onDeleteCategory}
              onDeleteGroup={onDeleteGroup}
              onReorderCategory={_onReorderCategory}
              onReorderGroup={_onReorderGroup}
              onBudgetAction={onBudgetAction}
              onShowActivity={onShowActivity}
              onSortCategories={onSortCategories}
            />
          </View>
        </View>
      </MonthsProvider>
    </View>
  );
}

BudgetTable.displayName = 'BudgetTable';
