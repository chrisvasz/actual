import React, { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import type { DropPosition } from '#components/sort';
import { useCategories } from '#hooks/useCategories';
import { useLocalPref } from '#hooks/useLocalPref';
import { useResizeObserver } from '#hooks/useResizeObserver';

import { BudgetCategories } from './BudgetCategories';
import { BudgetSummaries } from './BudgetSummaries';
import { BudgetTotals } from './BudgetTotals';
import {
  BUDGET_CONTENT_CLASS,
  BUDGET_SCROLLER_CLASS,
  CATEGORY_COLUMN_CLASS,
  MONTHS_TRACK_CLASS,
  TABLE_GUTTER,
} from './categoryColumnStyles';
import { MonthsContext } from './MonthsContext';
import type { MonthBounds } from './MonthsContext';
import { TableFrame } from './TableFrame';
import { useMonthScroll } from './useMonthScroll';
import { findSortDown, findSortUp, separateGroups } from './util';

type BudgetTableProps = {
  startMonth: string;
  numMonths: number;
  monthBounds: MonthBounds;
  onMonthSettle: (month: string) => void;
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
    startMonth,
    numMonths,
    monthBounds,
    onMonthSettle,
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

  const { grouped: categoryGroups } = useCategories();
  const [collapsedGroupIds = [], setCollapsedGroupIdsPref] =
    useLocalPref('budget.collapsed');
  const [showHiddenCategories, setShowHiddenCategoriesPef] = useLocalPref(
    'budget.showHiddenCategories',
  );
  const [editing, setEditing] = useState<{ id: string; cell: string } | null>(
    null,
  );

  const {
    scrollerRef,
    stripRef,
    months,
    offscreenMonths,
    firstMonth,
    totalMonths,
  } = useMonthScroll({
    startMonth,
    numMonths,
    monthBounds,
    pinnedMonth: editing && editing.cell !== 'name' ? editing.cell : null,
    onSettle: onMonthSettle,
  });

  // Keep a row scrolled into view (e.g. by moving to it with Enter) clear of
  // the sticky header.
  const headerRef = useResizeObserver<HTMLDivElement>(rect => {
    if (scrollerRef.current) {
      scrollerRef.current.style.scrollPaddingTop = `${rect.height}px`;
      scrollerRef.current.style.setProperty(
        '--budget-header-height',
        `${rect.height}px`,
      );
    }
  });

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
        } else if ('is_income' in next && !next.is_income) {
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
      <MonthsContext.Provider
        value={{ months, offscreenMonths, firstMonth, totalMonths, numMonths }}
      >
        <View
          data-testid="budget-table-scroll-container"
          className={BUDGET_SCROLLER_CLASS}
          innerRef={scrollerRef}
          nativeStyle={
            {
              '--budget-total-months': totalMonths,
              '--budget-shown-months': numMonths,
            } as CSSProperties
          }
          style={{
            flex: 1,
            display: 'block',
            overflowX: 'auto',
            overflowY: 'scroll',
            overflowAnchor: 'none',
            overscrollBehaviorX: 'contain',
            scrollSnapType: 'x mandatory',
            // Styling any part of a scrollbar stops it from overlaying the
            // content, so leave overlay scrollbars alone
            ...(styles.lightScrollbar && {
              '&::-webkit-scrollbar:horizontal': { height: 0 },
              // Keep the scrollbar beside the rows, below the sticky header
              '&::-webkit-scrollbar-track:vertical': {
                marginTop: 'var(--budget-header-height)',
              },
            }),
          }}
        >
          <View
            className={BUDGET_CONTENT_CLASS}
            style={{
              flexShrink: 0,
              // A month can be mounted beyond what can be scrolled to
              overflowX: 'clip',
              paddingLeft: TABLE_GUTTER,
              paddingRight: TABLE_GUTTER,
            }}
            onKeyDown={onKeyDown}
          >
            {/* Where a horizontal scroll can come to rest. As tall as the
                table, so there's always one in view to snap to. */}
            <View
              aria-hidden
              style={{
                position: 'absolute',
                inset: `0 ${TABLE_GUTTER}px`,
                flexDirection: 'row',
                pointerEvents: 'none',
                visibility: 'hidden',
              }}
            >
              <View className={CATEGORY_COLUMN_CLASS} />
              <View
                className={MONTHS_TRACK_CLASS}
                innerRef={stripRef}
                style={{ position: 'relative' }}
              >
                {Array.from({ length: totalMonths }, (_, index) => (
                  <div
                    // Kept as the range moves, so the browser stays snapped
                    // to the same month
                    key={monthUtils.addMonths(firstMonth, index)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${(index / totalMonths) * 100}%`,
                      width: `${100 / totalMonths}%`,
                      scrollSnapAlign: 'start',
                    }}
                  />
                ))}
              </View>
            </View>

            <View
              innerRef={headerRef}
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 102,
                flexShrink: 0,
                backgroundColor: theme.pageBackground,
                marginLeft: -TABLE_GUTTER,
                marginRight: -TABLE_GUTTER,
                paddingLeft: TABLE_GUTTER,
                paddingRight: TABLE_GUTTER,
              }}
            >
              <BudgetSummaries />
              <BudgetTotals
                toggleHiddenCategories={toggleHiddenCategories}
                expandAllCategories={expandAllCategories}
                collapseAllCategories={collapseAllCategories}
              />
            </View>
            <View style={{ marginBottom: 10, flexShrink: 0 }}>
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
              <TableFrame borderRadius="0 0 4px 4px" hasShadow bottom={10} />
            </View>
          </View>
        </View>
      </MonthsContext.Provider>
    </View>
  );
}

BudgetTable.displayName = 'BudgetTable';
