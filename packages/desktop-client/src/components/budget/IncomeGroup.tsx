// @ts-strict-ignore
import React, { memo } from 'react';

import { theme } from '@actual-app/components/theme';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { Row } from '#components/table';

import { RenderMonths } from './RenderMonths';
import { SidebarGroup } from './SidebarGroup';

import { useBudgetComponents } from '.';

type IncomeGroupProps = {
  group: CategoryGroupEntity;
  // Which of this row's cells is being edited ('name' or a month), if any.
  // Rows get only their own cell so moving the edit re-renders just two rows.
  editingCell: string | null;
  collapsed: boolean;
  onEditName: (id: CategoryGroupEntity['id']) => void;
  onSave: (group: CategoryGroupEntity) => void;
  onSortCategories?: (
    groupId: CategoryGroupEntity['id'],
    direction: 'asc' | 'desc',
  ) => void;
  onToggleCollapse: (id: CategoryGroupEntity['id']) => void;
  onShowNewCategory: (groupId: CategoryGroupEntity['id']) => void;
};

export const IncomeGroup = memo(function IncomeGroup({
  group,
  editingCell,
  collapsed,
  onEditName,
  onSave,
  onSortCategories,
  onToggleCollapse,
  onShowNewCategory,
}: IncomeGroupProps) {
  const { IncomeGroupComponent: MonthComponent } = useBudgetComponents();
  return (
    <Row
      collapsed
      style={{
        fontWeight: 600,
        backgroundColor: theme.budgetHeaderCurrentMonth, //use budget color
      }}
    >
      <SidebarGroup
        group={group}
        collapsed={collapsed}
        editing={editingCell === 'name'}
        onEdit={onEditName}
        onSave={onSave}
        onSortCategories={onSortCategories}
        onToggleCollapse={onToggleCollapse}
        onShowNewCategory={onShowNewCategory}
      />
      <RenderMonths>
        {({ month }) => <MonthComponent month={month} group={group} />}
      </RenderMonths>
    </Row>
  );
});
