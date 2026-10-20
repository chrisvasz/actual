// @ts-strict-ignore
import React, { useEffect, useEffectEvent, useMemo, useState } from 'react';
import type { ComponentType } from 'react';

import { styles } from '@actual-app/components/styles';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import {
  useBudgetActions,
  useDeleteCategory,
  useDeleteCategoryGroup,
  useMoveCategoryGroup,
  useReorderCategory,
  useSaveCategory,
  useSaveCategoryGroup,
  useSortCategories,
} from '#budget';
import { useCategories } from '#hooks/useCategories';
import { useGlobalPref } from '#hooks/useGlobalPref';
import { useLocalPref } from '#hooks/useLocalPref';
import { SheetNameProvider } from '#hooks/useSheetName';
import { useSpreadsheet } from '#hooks/useSpreadsheet';
import { useStableNavigate } from '#hooks/useStableNavigate';

import { AutoSizingBudgetTable } from './DynamicBudgetTable';
import * as envelopeBudget from './envelope/EnvelopeBudgetComponents';
import { EnvelopeBudgetProvider } from './envelope/EnvelopeBudgetContext';
import { prewarmAllMonths, prewarmMonth } from './util';

export function Budget() {
  const currentMonth = monthUtils.currentMonth();
  const spreadsheet = useSpreadsheet();
  const navigate = useStableNavigate();
  const [summaryCollapsed, setSummaryCollapsedPref] = useLocalPref(
    'budget.summaryCollapsed',
  );
  const [startMonthPref, setStartMonthPref] = useLocalPref('budget.startMonth');
  const startMonth = startMonthPref || currentMonth;
  const [bounds, setBounds] = useState({
    start: startMonth,
    end: startMonth,
  });
  const [maxMonthsPref] = useGlobalPref('maxMonths');
  const maxMonths = maxMonthsPref || 1;
  const [initialized, setInitialized] = useState(false);
  const { grouped: categoryGroups } = useCategories();

  const init = useEffectEvent(() => {
    // Effects re-run each time the kept budget page is shown again, but its
    // cells stay cached while it's hidden, so only the first showing warms them.
    if (initialized) {
      return;
    }

    async function run() {
      const { start, end } = await send('get-budget-bounds');
      setBounds({ start, end });

      await prewarmAllMonths(spreadsheet, { start, end }, startMonth);

      setInitialized(true);
    }

    void run();
  });
  useEffect(() => init(), []);

  const loadBoundBudgets = useEffectEvent(() => {
    void send('get-budget-bounds').then(({ start, end }) => {
      if (bounds.start !== start || bounds.end !== end) {
        setBounds({ start, end });
      }
    });
  });
  useEffect(() => loadBoundBudgets(), []);

  const onMonthSelect = async (month, numDisplayed) => {
    setStartMonthPref(month);

    const warmingMonth = month;

    // We could be smarter about this, but this is a good start. We
    // optimize for the case where users press the left/right button
    // to move between months. This loads the month data all at once
    // and "prewarms" the spreadsheet cache. This uses a simple
    // heuristic that will fail if the user clicks an arbitrary month,
    // but it will just load in some unnecessary data.
    if (month < startMonth) {
      // pre-warm prev month
      await prewarmMonth(spreadsheet, monthUtils.subMonths(month, 1));
    } else if (month > startMonth) {
      // pre-warm next month
      await prewarmMonth(
        spreadsheet,
        monthUtils.addMonths(month, numDisplayed),
      );
    }

    if (warmingMonth === month) {
      setStartMonthPref(month);
    }
  };

  const onToggleCollapse = () => {
    setSummaryCollapsedPref(!summaryCollapsed);
  };

  const onShowActivity = (categoryId, month) => {
    const filterConditions = [
      { field: 'category', op: 'is', value: categoryId, type: 'id' },
      {
        field: 'date',
        op: 'is',
        value: month,
        options: { month: true },
        type: 'date',
      },
    ];
    void navigate('/accounts', {
      state: {
        filterConditions,
        categoryId,
      },
    });
  };

  // Saves settle once the change is applied, so the sidebar can show the
  // new name until then. Failures are reported as a notification.
  const saveCategory = useSaveCategory();
  const onSaveCategory = category => saveCategory({ category });
  const deleteCategory = useDeleteCategory();
  const onDeleteCategory = id => void deleteCategory({ id });
  const reorderCategory = useReorderCategory();
  const onReorderCategory = sortInfo => void reorderCategory(sortInfo);
  const saveCategoryGroup = useSaveCategoryGroup();
  const onSaveCategoryGroup = group => saveCategoryGroup({ group });
  const deleteCategoryGroup = useDeleteCategoryGroup();
  const onDeleteCategoryGroup = id => void deleteCategoryGroup({ id });
  const moveCategoryGroup = useMoveCategoryGroup();
  const onReorderCategoryGroup = ({ id, targetId }) =>
    void moveCategoryGroup({ id, targetId });
  const sortCategories = useSortCategories();
  // Not the result object, which changes on every state transition and
  // would hand the whole budget table new callbacks on every save
  const { mutate: applyBudgetAction } = useBudgetActions();

  const onBudgetAction = (month, type, args) => {
    applyBudgetAction({ month, type, args });
  };

  if (!initialized || !categoryGroups) {
    return null;
  }

  const table = (
    <EnvelopeBudgetProvider
      summaryCollapsed={summaryCollapsed}
      onBudgetAction={onBudgetAction}
      onToggleSummaryCollapse={onToggleCollapse}
    >
      <AutoSizingBudgetTable
        prewarmStartMonth={startMonth}
        startMonth={startMonth}
        monthBounds={bounds}
        maxMonths={maxMonths}
        onMonthSelect={onMonthSelect}
        onDeleteCategory={onDeleteCategory}
        onDeleteGroup={onDeleteCategoryGroup}
        onSaveCategory={onSaveCategory}
        onSaveGroup={onSaveCategoryGroup}
        onBudgetAction={onBudgetAction}
        onShowActivity={onShowActivity}
        onReorderCategory={onReorderCategory}
        onReorderGroup={onReorderCategoryGroup}
        onSortCategories={(groupId, direction) =>
          void sortCategories({ groupId, direction })
        }
      />
    </EnvelopeBudgetProvider>
  );

  return (
    <SheetNameProvider name={monthUtils.sheetForMonth(startMonth)}>
      {/*
        In a previous iteration, the wrapper needs `overflow: hidden` for
        some reason. Without it at certain dimensions the width/height
        that autosizer gives us is slightly wrong, causing scrollbars to
        appear. We might not need it anymore?
      */}
      <View
        style={{
          ...styles.page,
          paddingLeft: 8,
          paddingRight: 8,
          overflow: 'hidden',
        }}
      >
        <View style={{ flex: 1 }}>{table}</View>
      </View>
    </SheetNameProvider>
  );
}

export type BudgetSummaryProps = {
  month: string;
};

export type CategoryMonthProps = {
  month: string;
  category: CategoryEntity;
  editing: boolean;
  isLast?: boolean;
  onEdit: (id: CategoryEntity['id'] | null, month?: string) => void;
  onBudgetAction: (month: string, action: string, arg: unknown) => void;
  onShowActivity: (id: CategoryEntity['id'], month: string) => void;
};

export type CategoryGroupMonthProps = {
  month: string;
  group: CategoryGroupEntity;
};

export type BudgetComponents = {
  SummaryComponent: ComponentType<BudgetSummaryProps>;
  ExpenseCategoryComponent: ComponentType<CategoryMonthProps>;
  ExpenseGroupComponent: ComponentType<CategoryGroupMonthProps>;
  IncomeCategoryComponent: ComponentType<CategoryMonthProps>;
  IncomeGroupComponent: ComponentType<CategoryGroupMonthProps>;
  BudgetTotalsComponent: ComponentType;
  IncomeHeaderComponent: ComponentType;
};

export function useBudgetComponents(): BudgetComponents {
  return useMemo(
    () => ({
      SummaryComponent: envelopeBudget.BudgetSummary,
      ExpenseCategoryComponent: envelopeBudget.ExpenseCategoryMonth,
      ExpenseGroupComponent: envelopeBudget.ExpenseGroupMonth,
      IncomeCategoryComponent: envelopeBudget.IncomeCategoryMonth,
      IncomeGroupComponent: envelopeBudget.IncomeGroupMonth,
      BudgetTotalsComponent: envelopeBudget.BudgetTotalsMonth,
      IncomeHeaderComponent: envelopeBudget.IncomeHeaderMonth,
    }),
    [],
  );
}
