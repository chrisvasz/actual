// @ts-strict-ignore
import React, { memo, useRef, useState } from 'react';
import type { ComponentProps, CSSProperties } from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { css } from '@emotion/css';

import { useBudgetActions } from '#budget';
import { BalanceWithCarryover } from '#components/budget/BalanceWithCarryover';
import { BudgetedGoalPopover } from '#components/budget/BudgetedGoalPopover';
import {
  useBudgetCellInput,
  useGoalTargets,
} from '#components/budget/goalProgress';
import { GoalProgressFill } from '#components/budget/GoalProgressFill';
import { ScheduleIndicatorButton } from '#components/budget/ScheduleIndicatorButton';
import { makeAmountGrey } from '#components/budget/util';
import { CellValue, CellValueText } from '#components/spreadsheet/CellValue';
import { Field, SheetCell } from '#components/table';
import type { SheetCellProps } from '#components/table';
import { useCategoryScheduleGoalTemplateIndicator } from '#hooks/useCategoryScheduleGoalTemplateIndicator';
import { useFormat } from '#hooks/useFormat';
import { useSheetValue } from '#hooks/useSheetValue';
import type { Binding, SheetFields } from '#spreadsheet';
import { trackingBudget } from '#spreadsheet/bindings';
import type { CategoryGroupMonthProps, CategoryMonthProps } from '..';

import { BalanceMenu } from './BalanceMenu';

export const useTrackingSheetValue = <
  FieldName extends SheetFields<'tracking-budget'>,
>(
  binding: Binding<'tracking-budget', FieldName>,
) => {
  return useSheetValue(binding);
};

const TrackingCellValue = <FieldName extends SheetFields<'tracking-budget'>>(
  props: ComponentProps<typeof CellValue<'tracking-budget', FieldName>>,
) => {
  return <CellValue {...props} />;
};

const TrackingSheetCell = <FieldName extends SheetFields<'tracking-budget'>>(
  props: SheetCellProps<'tracking-budget', FieldName>,
) => {
  return <SheetCell {...props} />;
};

const headerLabelStyle: CSSProperties = {
  flex: 1,
  padding: '0 5px',
  textAlign: 'right',
};

// Trades 2px of the row's top and bottom padding for space between each
// label and its total, so the header row keeps its height.
const totalsLabelStyle: CSSProperties = {
  ...headerLabelStyle,
  gap: 4,
};

const cellStyle: CSSProperties = {
  color: theme.tableHeaderText,
  fontWeight: 600,
};

export const BudgetTotalsMonth = memo(function BudgetTotalsMonth() {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        marginRight: styles.monthRightPadding,
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      <View style={totalsLabelStyle}>
        <Text style={{ color: theme.tableHeaderText }}>
          <Trans>Budgeted</Trans>
        </Text>
        <TrackingCellValue
          binding={trackingBudget.totalBudgetedExpense}
          type="financial"
        >
          {props => <CellValueText {...props} style={cellStyle} />}
        </TrackingCellValue>
      </View>
      <View style={totalsLabelStyle}>
        <Text style={{ color: theme.tableHeaderText }}>
          <Trans>Spent</Trans>
        </Text>
        <TrackingCellValue binding={trackingBudget.totalSpent} type="financial">
          {props => <CellValueText {...props} style={cellStyle} />}
        </TrackingCellValue>
      </View>
      <View style={totalsLabelStyle}>
        <Text style={{ color: theme.tableHeaderText }}>
          <Trans>Balance</Trans>
        </Text>
        <TrackingCellValue
          binding={trackingBudget.totalLeftover}
          type="financial"
        >
          {props => <CellValueText {...props} style={cellStyle} />}
        </TrackingCellValue>
      </View>
    </View>
  );
});

export function IncomeHeaderMonth() {
  return (
    <View
      style={{
        flexDirection: 'row',
        marginRight: styles.monthRightPadding,
        paddingBottom: 5,
      }}
    >
      <View style={headerLabelStyle}>
        <Text style={{ color: theme.tableHeaderText }}>
          <Trans>Budgeted</Trans>
        </Text>
      </View>
      <View style={headerLabelStyle}>
        <Text style={{ color: theme.tableHeaderText }}>
          <Trans>Received</Trans>
        </Text>
      </View>
    </View>
  );
}

export const GroupMonth = memo(function GroupMonth({
  month,
  group,
}: CategoryGroupMonthProps) {
  const { id } = group;

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        backgroundColor: monthUtils.isCurrentMonth(month)
          ? theme.budgetHeaderCurrentMonth
          : theme.budgetHeaderOtherMonth,
      }}
    >
      <TrackingSheetCell
        name="budgeted"
        width="flex"
        textAlign="right"
        style={{ fontWeight: 600, ...styles.tnum }}
        valueProps={{
          binding: trackingBudget.groupBudgeted(id),
          type: 'financial',
        }}
      />
      <TrackingSheetCell
        name="spent"
        width="flex"
        textAlign="right"
        style={{ fontWeight: 600, ...styles.tnum }}
        valueProps={{
          binding: trackingBudget.groupSumAmount(id),
          type: 'financial',
        }}
      />
      {!group.is_income && (
        <TrackingSheetCell
          name="balance"
          width="flex"
          textAlign="right"
          style={{
            fontWeight: 600,
            paddingRight: styles.monthRightPadding,
            ...styles.tnum,
          }}
          valueProps={{
            binding: trackingBudget.groupBalance(id),
            type: 'financial',
          }}
        />
      )}
    </View>
  );
});

export const CategoryMonth = memo(function CategoryMonth({
  month,
  category,
  editing,
  onEdit,
  onBudgetAction,
  onShowActivity,
}: CategoryMonthProps) {
  const format = useFormat();
  // The amount cell uses the mutation directly (rather than onBudgetAction)
  // so it gets the save's promise and can drop the amount it's showing if
  // the save fails.
  const { mutateAsync: applyBudgetAction } = useBudgetActions();

  const [balanceMenuOpen, setBalanceMenuOpen] = useState(false);
  const triggerBalanceMenuRef = useRef(null);

  const goalTargets = useGoalTargets({
    category,
    month,
    balance: trackingBudget.catBalance(category.id),
    budgeted: trackingBudget.catBudgeted(category.id),
  });

  const budgetCellRef = useRef<HTMLDivElement>(null);
  const budgetInput = useBudgetCellInput({
    editing,
    target: goalTargets.budgeted,
    month,
    budgeted: trackingBudget.catBudgeted(category.id),
    format,
  });

  const onMenuAction = (...args: Parameters<typeof onBudgetAction>) => {
    onBudgetAction(...args);
    setBalanceMenuOpen(false);
  };

  const { schedule, scheduleStatus, isScheduleRecurring, description } =
    useCategoryScheduleGoalTemplateIndicator({
      category,
      month,
    });

  const showScheduleIndicator = schedule && scheduleStatus;

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        backgroundColor: monthUtils.isCurrentMonth(month)
          ? theme.budgetCurrentMonth
          : theme.budgetOtherMonth,
      }}
    >
      <View
        ref={budgetCellRef}
        style={{
          position: 'relative',
          flex: 1,
          flexDirection: 'row',
        }}
      >
        <GoalProgressFill target={goalTargets.budgeted} column="budgeted" />
        <TrackingSheetCell
          name="budget"
          exposed={editing}
          focused={editing}
          width="flex"
          onExpose={() => onEdit(category.id, month)}
          style={{
            position: 'relative',
            ...(editing && { zIndex: 100 }),
            ...styles.tnum,
          }}
          textAlign="right"
          valueStyle={{
            cursor: 'default',
            margin: 1,
            padding: '0 4px',
            borderRadius: 4,
            ':hover': {
              boxShadow: 'inset 0 0 0 1px ' + theme.pageTextSubdued,
              backgroundColor: theme.budgetCurrentMonth,
            },
          }}
          valueProps={{
            binding: trackingBudget.catBudgeted(category.id),
            type: 'financial',
            getValueStyle: makeAmountGrey,
            formatExpr: budgetInput.formatExpr,
            unformatExpr: format.fromEdit,
          }}
          inputProps={{
            onBlur: () => {
              onEdit(null);
            },
            ...budgetInput.inputProps,
            style: {
              backgroundColor: theme.budgetCurrentMonth,
            },
          }}
          onSave={(parsedIntegerAmount: number | null) =>
            applyBudgetAction({
              month,
              type: 'budget-amount',
              args: {
                category: category.id,
                amount: parsedIntegerAmount ?? 0,
              },
            })
          }
        />
        <BudgetedGoalPopover
          triggerRef={budgetCellRef}
          isOpen={editing}
          target={goalTargets.budgeted}
          draft={budgetInput.draft}
        />
      </View>
      <Field name="spent" width="flex" style={{ textAlign: 'right' }}>
        <View
          data-testid="category-month-spent"
          onClick={() => onShowActivity(category.id, month)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: showScheduleIndicator
              ? 'space-between'
              : 'flex-end',
            gap: 2,
          }}
        >
          {showScheduleIndicator && (
            <ScheduleIndicatorButton
              schedule={schedule}
              scheduleStatus={scheduleStatus}
              isScheduleRecurring={isScheduleRecurring}
              description={description}
            />
          )}
          <TrackingCellValue
            binding={trackingBudget.catSumAmount(category.id)}
            type="financial"
          >
            {props => (
              <CellValueText
                {...props}
                className={css({
                  cursor: 'pointer',
                  ':hover': {
                    textDecoration: 'underline',
                  },
                  ...makeAmountGrey(props.value),
                })}
              />
            )}
          </TrackingCellValue>
        </View>
      </Field>

      {!category.is_income && (
        <Field
          name="balance"
          width="flex"
          style={{ position: 'relative', textAlign: 'right' }}
          // The month's right padding lives inside the cell so the goal track
          // can reach the cell's right edge
          contentStyle={{ paddingRight: 5 + styles.monthRightPadding }}
        >
          <GoalProgressFill target={goalTargets.balance} column="balance" />
          <Button
            variant="bare"
            ref={triggerBalanceMenuRef}
            onPress={() => !category.is_income && setBalanceMenuOpen(true)}
            style={{
              position: 'relative',
              justifyContent: 'flex-end',
              background: 'transparent',
              width: '100%',
              padding: 0,
            }}
          >
            <BalanceWithCarryover
              isDisabled={category.is_income}
              carryover={trackingBudget.catCarryover(category.id)}
              balance={trackingBudget.catBalance(category.id)}
              goal={trackingBudget.catGoal(category.id)}
              budgeted={trackingBudget.catBudgeted(category.id)}
              longGoal={trackingBudget.catLongGoal(category.id)}
            />
          </Button>

          <Popover
            triggerRef={triggerBalanceMenuRef}
            isOpen={balanceMenuOpen}
            onOpenChange={() => setBalanceMenuOpen(false)}
            placement="bottom end"
          >
            <BalanceMenu
              categoryId={category.id}
              goalTarget={goalTargets.balance}
              onCarryover={carryover => {
                onMenuAction(month, 'carryover', {
                  category: category.id,
                  flag: carryover,
                });
              }}
            />
          </Popover>
        </Field>
      )}
    </View>
  );
});

export { BudgetSummary } from './budgetsummary/BudgetSummary';

export const ExpenseGroupMonth = GroupMonth;
export const ExpenseCategoryMonth = CategoryMonth;

export const IncomeGroupMonth = GroupMonth;
export const IncomeCategoryMonth = CategoryMonth;
