import React, { memo, useRef, useState } from 'react';
import type { ComponentProps, CSSProperties, MouseEvent } from 'react';

import { Button } from '@actual-app/components/button';
import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { css, cx } from '@emotion/css';

import { useBudgetActions } from '#budget';
import { BalanceWithCarryover } from '#components/budget/BalanceWithCarryover';
import { BudgetedGoalPopover } from '#components/budget/BudgetedGoalPopover';
import { useBudgetFormat } from '#components/budget/BudgetFormatContext';
import { CarryoverIndicator } from '#components/budget/CarryoverIndicator';
import {
  getGoalTargets,
  useBudgetCellInput,
} from '#components/budget/goalProgress';
import type { GoalTarget } from '#components/budget/goalProgress';
import { GoalProgressFill } from '#components/budget/GoalProgressFill';
import {
  makeAmountGrey,
  makeBalanceAmountStyle,
} from '#components/budget/util';
import { CellValue, CellValueText } from '#components/spreadsheet/CellValue';
import { Field, Row, SheetCell } from '#components/table';
import type { SheetCellProps } from '#components/table';
import { useSheetName } from '#hooks/useSheetName';
import { useSheetValue } from '#hooks/useSheetValue';
import type { Binding, SheetFields } from '#spreadsheet';
import { envelopeBudget } from '#spreadsheet/bindings';
import type { CategoryGroupMonthProps, CategoryMonthProps } from '..';

import { BalanceMovementMenu } from './BalanceMovementMenu';
import { IncomeMenu } from './IncomeMenu';

export function useEnvelopeSheetName<
  FieldName extends SheetFields<'envelope-budget'>,
>(binding: Binding<'envelope-budget', FieldName>) {
  return useSheetName(binding);
}

export function useEnvelopeSheetValue<
  FieldName extends SheetFields<'envelope-budget'>,
>(binding: Binding<'envelope-budget', FieldName>) {
  return useSheetValue(binding);
}

export const EnvelopeCellValue = <
  FieldName extends SheetFields<'envelope-budget'>,
>(
  props: ComponentProps<typeof CellValue<'envelope-budget', FieldName>>,
) => {
  return <CellValue {...props} />;
};

const EnvelopeSheetCell = <FieldName extends SheetFields<'envelope-budget'>>(
  props: SheetCellProps<'envelope-budget', FieldName>,
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
        backgroundColor: theme.budgetCurrentMonth,
      }}
    >
      <View style={totalsLabelStyle}>
        <Text style={{ color: theme.tableHeaderText }}>Budgeted</Text>
        <EnvelopeCellValue
          binding={envelopeBudget.totalBudgeted}
          type="financial"
        >
          {props => (
            <CellValueText {...props} value={-props.value} style={cellStyle} />
          )}
        </EnvelopeCellValue>
      </View>
      <View style={totalsLabelStyle}>
        <Text style={{ color: theme.tableHeaderText }}>Spent</Text>
        <EnvelopeCellValue binding={envelopeBudget.totalSpent} type="financial">
          {props => <CellValueText {...props} style={cellStyle} />}
        </EnvelopeCellValue>
      </View>
      <View style={totalsLabelStyle}>
        <Text style={{ color: theme.tableHeaderText }}>Balance</Text>
        <EnvelopeCellValue
          binding={envelopeBudget.totalBalance}
          type="financial"
        >
          {props => <CellValueText {...props} style={cellStyle} />}
        </EnvelopeCellValue>
      </View>
    </View>
  );
});

export function IncomeHeaderMonth() {
  return (
    <Row
      style={{
        color: theme.tableHeaderText,
        alignItems: 'center',
        paddingRight: 10,
        backgroundColor: theme.budgetCurrentMonth,
      }}
    >
      <View style={{ flex: 1, textAlign: 'right' }}>Received</View>
    </Row>
  );
}

// A budget shows several hundred of these, so each is a single element with
// its styles built once.
const amountCellClass = css({
  flex: '1 1 0',
  boxSizing: 'border-box',
  minWidth: 0,
  position: 'relative',
  // Centers the text exactly where the editor's input does
  padding: '0.25px 5px 0',
  textAlign: 'right',
  lineHeight: '30px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  ...styles.smallText,
  ...styles.tnum,
});

// The month's right padding lives inside the cell so the goal track can reach
// the cell's right edge
const balanceCellClass = css({
  paddingRight: 5 + styles.monthRightPadding,
});

// An exact third, whatever the cell's padding, so the columns don't move when
// the editor (which has none) takes the budget cell's place. Isolated for the
// goal track, which sits behind the text.
const categoryCellClass = css({
  flex: '0 0 calc(100% / 3)',
  isolation: 'isolate',
});

// The hover outline is inset to sit exactly where the editor's input does
const budgetCellClass = css({
  cursor: 'default',
  ':hover::after': {
    content: '""',
    position: 'absolute',
    inset: 1,
    zIndex: -1,
    borderRadius: 4,
    boxShadow: 'inset 0 0 0 1px ' + theme.pageTextSubdued, //remove mobile color variable
    backgroundColor: theme.budgetCurrentMonth,
  },
});

const spentAmountClass = css({
  cursor: 'pointer',
  ':hover': { textDecoration: 'underline' },
});

const balanceButtonClass = css({
  position: 'relative',
  display: 'block',
  width: '100%',
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  lineHeight: 'inherit',
  textAlign: 'right',
  cursor: 'pointer',
  ':hover': { textDecoration: 'underline' },
});

// The cells of one row in one month. The borders are drawn here rather than
// on each cell.
const monthCellsStyle: CSSProperties = {
  flex: 1,
  flexDirection: 'row',
  borderTopWidth: 1,
  borderBottomWidth: 1,
  borderColor: theme.tableBorder,
};

type GroupAmountProps = {
  name: string;
  binding: Binding<
    'envelope-budget',
    'group-budget' | 'group-sum-amount' | 'group-leftover'
  >;
  className?: string;
};

function GroupAmount({ name, binding, className }: GroupAmountProps) {
  const format = useBudgetFormat();
  const value = useSheetValue(binding);
  return (
    <div
      data-testid={name}
      data-cellname={value}
      className={cx(amountCellClass, className)}
      style={{ fontWeight: 600 }}
    >
      {format(value, 'financial')}
    </div>
  );
}

export const ExpenseGroupMonth = memo(function ExpenseGroupMonth({
  month,
  group,
}: CategoryGroupMonthProps) {
  const { id } = group;

  return (
    <View
      style={{
        ...monthCellsStyle,
        backgroundColor: monthUtils.isCurrentMonth(month)
          ? theme.budgetHeaderCurrentMonth
          : theme.budgetHeaderOtherMonth,
      }}
    >
      <GroupAmount name="budgeted" binding={envelopeBudget.groupBudgeted(id)} />
      <GroupAmount name="spent" binding={envelopeBudget.groupSumAmount(id)} />
      <GroupAmount
        name="balance"
        binding={envelopeBudget.groupBalance(id)}
        className={balanceCellClass}
      />
    </View>
  );
});

type BudgetCellEditorProps = {
  category: CategoryMonthProps['category'];
  month: string;
  editing: boolean;
  target: GoalTarget | null;
  onEdit: CategoryMonthProps['onEdit'];
};

// Replaces the plain budget cell from the first time it's edited.
function BudgetCellEditor({
  category,
  month,
  editing,
  target,
  onEdit,
}: BudgetCellEditorProps) {
  const format = useBudgetFormat();
  // The amount cell applies the action directly (rather than through
  // onBudgetAction) so it gets the save's promise and can drop the amount
  // it's showing if the save fails.
  const applyBudgetAction = useBudgetActions();
  const budgetCellRef = useRef<HTMLDivElement>(null);
  const budgetInput = useBudgetCellInput({
    editing,
    target,
    month,
    budgeted: envelopeBudget.catBudgeted(category.id),
    format,
  });

  return (
    <View
      ref={budgetCellRef}
      style={{
        position: 'relative',
        isolation: 'isolate',
        flex: '0 0 calc(100% / 3)',
        flexDirection: 'row',
      }}
    >
      <GoalProgressFill target={target} />
      <EnvelopeSheetCell
        name="budget"
        exposed={editing}
        focused={editing}
        width="flex"
        onExpose={() => onEdit(category.id, month)}
        style={{
          position: 'relative',
          borderTopWidth: 0,
          borderBottomWidth: 0,
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
            boxShadow: 'inset 0 0 0 1px ' + theme.pageTextSubdued, //remove mobile color variable
            backgroundColor: theme.budgetCurrentMonth,
          },
        }}
        valueProps={{
          binding: envelopeBudget.catBudgeted(category.id),
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
        target={target}
        draft={budgetInput.draft}
      />
    </View>
  );
}

export const ExpenseCategoryMonth = memo(function ExpenseCategoryMonth({
  month,
  category,
  editing,
  onEdit,
  onBudgetAction,
  onShowActivity,
}: CategoryMonthProps) {
  const format = useBudgetFormat();

  const { fullSheetName: balanceName } = useEnvelopeSheetName(
    envelopeBudget.catBalance(category.id),
  );
  const { fullSheetName: spentName } = useEnvelopeSheetName(
    envelopeBudget.catSumAmount(category.id),
  );
  const budgeted = useEnvelopeSheetValue(
    envelopeBudget.catBudgeted(category.id),
  );
  const spent = useEnvelopeSheetValue(envelopeBudget.catSumAmount(category.id));
  const balance = useEnvelopeSheetValue(envelopeBudget.catBalance(category.id));
  const carryover = useEnvelopeSheetValue(
    envelopeBudget.catCarryover(category.id),
  );

  const goalTargets = getGoalTargets({
    category,
    month,
    balance: balance ?? 0,
    budgeted: budgeted ?? 0,
  });

  const [hasEdited, setHasEdited] = useState(false);
  if (editing && !hasEdited) {
    setHasEdited(true);
  }
  const mouseCoords = useRef<[number, number] | null>(null);

  const balanceMenuTriggerRef = useRef(null);
  const [balanceMenuOpen, setBalanceMenuOpen] = useState(false);
  const [balancePosition, setBalancePosition] = useState({
    crossOffset: 0,
    offset: 0,
  });

  return (
    <View
      style={{
        ...monthCellsStyle,
        backgroundColor: monthUtils.isCurrentMonth(month)
          ? theme.budgetCurrentMonth
          : theme.budgetOtherMonth,
      }}
    >
      {editing || hasEdited ? (
        <BudgetCellEditor
          category={category}
          month={month}
          editing={editing}
          target={goalTargets.budgeted}
          onEdit={onEdit}
        />
      ) : (
        <div
          data-testid="budget"
          data-cellname={budgeted}
          className={cx(amountCellClass, categoryCellClass, budgetCellClass)}
          style={makeAmountGrey(budgeted)}
          // Only a direct click edits, not dragging to select something
          onMouseDown={e => {
            mouseCoords.current = [e.clientX, e.clientY];
          }}
          onClick={e => {
            const coords = mouseCoords.current;
            if (
              coords &&
              Math.abs(e.clientX - coords[0]) < 5 &&
              Math.abs(e.clientY - coords[1]) < 5
            ) {
              onEdit(category.id, month);
            }
          }}
        >
          <GoalProgressFill target={goalTargets.budgeted} />
          {format(budgeted, 'financial')}
        </div>
      )}
      <div
        data-testid="spent"
        className={cx(amountCellClass, categoryCellClass)}
      >
        <span
          data-testid="category-month-spent"
          data-cellname={spentName}
          className={spentAmountClass}
          style={makeAmountGrey(spent)}
          onClick={() => onShowActivity(category.id, month)}
        >
          {format(spent, 'financial')}
        </span>
      </div>
      <div
        ref={balanceMenuTriggerRef}
        data-testid="balance"
        className={cx(amountCellClass, categoryCellClass, balanceCellClass)}
      >
        <GoalProgressFill target={goalTargets.balance} />
        <button
          type="button"
          data-testid={balanceName}
          data-cellname={balanceName}
          className={balanceButtonClass}
          style={makeBalanceAmountStyle(balance ?? 0)}
          onClick={() => {
            setBalancePosition({ crossOffset: -6, offset: -4 });
            setBalanceMenuOpen(true);
          }}
          onContextMenu={e => {
            e.preventDefault();
            // Offset from the menu's own corner, as it's aligned to the right
            const rect = e.currentTarget.getBoundingClientRect();
            setBalancePosition({
              crossOffset: e.clientX - rect.right + 200 - 8,
              offset: e.clientY - rect.bottom - 8,
            });
            setBalanceMenuOpen(true);
          }}
        >
          {format(balance, 'financial')}
          {carryover && (
            <CarryoverIndicator
              label="Overspending rolls over to next month"
              style={makeBalanceAmountStyle(balance ?? 0)}
            />
          )}
        </button>

        {balanceMenuOpen && (
          <Popover
            triggerRef={balanceMenuTriggerRef}
            placement="bottom end"
            isOpen
            onOpenChange={() => setBalanceMenuOpen(false)}
            style={{
              margin: 1,
              minWidth: 190,
            }}
            isNonModal
            {...balancePosition}
          >
            <BalanceMovementMenu
              categoryId={category.id}
              goalTarget={goalTargets.balance}
              month={month}
              onBudgetAction={onBudgetAction}
              onClose={() => setBalanceMenuOpen(false)}
            />
          </Popover>
        )}
      </div>
    </View>
  );
});

type IncomeGroupMonthProps = {
  month: string;
};
export function IncomeGroupMonth({ month }: IncomeGroupMonthProps) {
  return (
    <View style={{ flex: 1 }}>
      <EnvelopeSheetCell
        name="received"
        width="flex"
        textAlign="right"
        style={{
          fontWeight: 600,
          paddingRight: styles.monthRightPadding,
          ...styles.tnum,
          backgroundColor: monthUtils.isCurrentMonth(month)
            ? theme.budgetHeaderCurrentMonth
            : theme.budgetHeaderOtherMonth,
        }}
        valueProps={{
          binding: envelopeBudget.groupIncomeReceived,
          type: 'financial',
        }}
      />
    </View>
  );
}

export function IncomeCategoryMonth({
  category,
  isLast,
  month,
  onShowActivity,
  onBudgetAction,
}: CategoryMonthProps) {
  const incomeMenuTriggerRef = useRef(null);
  const [incomeMenuOpen, setIncomeMenuOpen] = useState(false);
  const [incomePosition, setIncomePosition] = useState({
    crossOffset: 0,
    offset: 0,
  });
  const resetIncomePosition = (crossOffset = 0, offset = 0) =>
    setIncomePosition({ crossOffset, offset });

  const handleIncomeContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setIncomePosition({
      crossOffset: e.clientX - rect.left,
      offset: e.clientY - rect.bottom,
    });
    setIncomeMenuOpen(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <Field
        name="received"
        width="flex"
        truncate={false}
        ref={incomeMenuTriggerRef}
        style={{
          textAlign: 'right',
          ...(isLast && { borderBottomWidth: 0 }),
          backgroundColor: monthUtils.isCurrentMonth(month)
            ? theme.budgetCurrentMonth
            : theme.budgetOtherMonth,
        }}
      >
        <View
          name="received"
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            position: 'relative',
          }}
        >
          <Button
            variant="bare"
            onPress={() => {
              resetIncomePosition(-6, -4);
              setIncomeMenuOpen(true);
            }}
            onContextMenu={e => {
              handleIncomeContextMenu(e);
              // We need to calculate differently from the hook due to being aligned to the right
              const rect = e.currentTarget.getBoundingClientRect();
              resetIncomePosition(
                e.clientX - rect.right + 200 - 8,
                e.clientY - rect.bottom - 8,
              );
            }}
            style={{
              background: 'transparent',
              padding: 0,
              paddingRight: styles.monthRightPadding,
            }}
          >
            <BalanceWithCarryover
              carryover={envelopeBudget.catCarryover(category.id)}
              balance={envelopeBudget.catSumAmount(category.id)}
              carryoverLabel="Income is held for next month"
            />
          </Button>
          <Popover
            triggerRef={incomeMenuTriggerRef}
            placement="bottom end"
            isOpen={incomeMenuOpen}
            onOpenChange={() => setIncomeMenuOpen(false)}
            style={{ margin: 1 }}
            isNonModal
            {...incomePosition}
          >
            <IncomeMenu
              categoryId={category.id}
              month={month}
              onBudgetAction={onBudgetAction}
              onShowActivity={onShowActivity}
              onClose={() => setIncomeMenuOpen(false)}
            />
          </Popover>
        </View>
      </Field>
    </View>
  );
}

export { BudgetSummary } from './budgetsummary/BudgetSummary';
