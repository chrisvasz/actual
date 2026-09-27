// @ts-strict-ignore
import React, { memo } from 'react';
import type { ComponentProps } from 'react';

import type { CategoryEntity } from '@actual-app/core/types/models';

import { DropHighlight, useDraggable, useDroppable } from '#components/sort';
import type { OnDragChangeCallback, OnDropCallback } from '#components/sort';
import { Row } from '#components/table';
import { useDragRef } from '#hooks/useDragRef';

import { RenderMonths } from './RenderMonths';
import { SidebarCategory } from './SidebarCategory';

import { useBudgetComponents } from '.';

type IncomeCategoryProps = {
  cat: CategoryEntity;
  isLast?: boolean;
  // Which of this row's cells is being edited ('name' or a month), if any.
  // Rows get only their own cell so moving the edit re-renders just two rows.
  editingCell: string | null;
  canDrag: boolean;
  onEditName: ComponentProps<typeof SidebarCategory>['onEditName'];
  onEditMonth?: (id: CategoryEntity['id'], month: string) => void;
  onSave: ComponentProps<typeof SidebarCategory>['onSave'];
  onDelete: ComponentProps<typeof SidebarCategory>['onDelete'];
  onDragChange: OnDragChangeCallback<CategoryEntity>;
  onBudgetAction: (month: string, action: string, arg: unknown) => void;
  onReorder: OnDropCallback;
  onShowActivity: (id: CategoryEntity['id'], month: string) => void;
};

export const IncomeCategory = memo(function IncomeCategory({
  cat,
  isLast,
  editingCell,
  canDrag,
  onEditName,
  onEditMonth,
  onSave,
  onDelete,
  onDragChange,
  onBudgetAction,
  onReorder,
  onShowActivity,
}: IncomeCategoryProps) {
  const { dragRef } = useDraggable({
    type: 'income-category',
    onDragChange,
    item: cat,
    canDrag,
  });
  const handleDragRef = useDragRef(dragRef);

  const { dropRef, dropPos } = useDroppable({
    types: 'income-category',
    id: cat.id,
    onDrop: onReorder,
  });

  const { IncomeCategoryComponent: MonthComponent } = useBudgetComponents();

  return (
    <Row
      innerRef={dropRef}
      collapsed
      style={{
        opacity: cat.hidden ? 0.5 : undefined,
      }}
    >
      <DropHighlight pos={dropPos} offset={{ top: 1 }} />

      <SidebarCategory
        innerRef={handleDragRef}
        category={cat}
        isLast={isLast}
        editing={editingCell === 'name'}
        onEditName={onEditName}
        onSave={onSave}
        onDelete={onDelete}
      />
      <RenderMonths>
        {({ month }) => (
          <MonthComponent
            month={month}
            editing={editingCell === month}
            category={cat}
            isLast={isLast}
            onEdit={onEditMonth}
            onBudgetAction={onBudgetAction}
            onShowActivity={onShowActivity}
          />
        )}
      </RenderMonths>
    </Row>
  );
});
