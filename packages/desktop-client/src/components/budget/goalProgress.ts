import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import * as monthUtils from '@actual-app/core/shared/months';
import type {
  CategoryEntity,
  CategoryGoalType,
} from '@actual-app/core/types/models';
import type { Locale } from 'date-fns';

import type { useFormat } from '#hooks/useFormat';
import { useSheetValue } from '#hooks/useSheetValue';
import type { Binding } from '#spreadsheet';

type Format = ReturnType<typeof useFormat>;

/** What a cell's progress bar measures: the cell's value against a goal. */
export type GoalTarget = { value: number; goal: number };

type GoalTargets = {
  budgeted: GoalTarget | null;
  balance: GoalTarget | null;
};

export function getGoalType(category: CategoryEntity): CategoryGoalType {
  return category.goal_type ?? 'balance';
}

/**
 * The share of the goal the value covers: 0 when nothing is, >1 when exceeded.
 * A goal of zero (nothing left to budget toward a target) is already met.
 */
export function getGoalProgress({ value, goal }: GoalTarget) {
  return goal > 0 ? Math.max(value / goal, 0) : 1;
}

/**
 * How much to budget in `month` to reach a balance goal by `targetMonth`,
 * spreading what's left evenly over the remaining months (the target month
 * included). Measured from the balance before this month's budget, so the
 * amount holds steady while the user budgets, but rises if they spend from the
 * category. Null once the target month has passed.
 */
export function getRequiredBudget({
  goal,
  balance,
  budgeted,
  month,
  targetMonth,
}: {
  goal: number;
  balance: number;
  budgeted: number;
  month: string;
  targetMonth: string;
}): number | null {
  const monthsLeft =
    monthUtils.differenceInCalendarMonths(targetMonth, month) + 1;
  if (monthsLeft < 1) {
    return null;
  }
  const remaining = goal - (balance - budgeted);
  // Each month rounds to the cent, and the next month's amount picks up the
  // difference, so the target month comes out exact.
  return Math.max(Math.round(remaining / monthsLeft), 0);
}

/** The goal each of a category's month cells measures against, if any. */
export function useGoalTargets({
  category,
  month,
  balance,
  budgeted,
}: {
  category: CategoryEntity;
  month: string;
  balance: Binding<'envelope-budget' | 'tracking-budget', 'leftover'>;
  budgeted: Binding<'envelope-budget' | 'tracking-budget', 'budget'>;
}): GoalTargets {
  const balanceValue = useSheetValue(balance) ?? 0;
  const budgetedValue = useSheetValue(budgeted) ?? 0;
  const goal = category.goal_amount;

  if (goal == null || goal <= 0) {
    return { budgeted: null, balance: null };
  }

  if (getGoalType(category) === 'budgeted') {
    return { budgeted: { value: budgetedValue, goal }, balance: null };
  }

  const targetMonth = category.goal_target_month;
  const required = targetMonth
    ? getRequiredBudget({
        goal,
        balance: balanceValue,
        budgeted: budgetedValue,
        month,
        targetMonth,
      })
    : null;

  // Nothing left to budget means the goal was met in an earlier month, so the
  // budget cell has nothing to measure against
  return {
    budgeted:
      required == null || required === 0
        ? null
        : { value: budgetedValue, goal: required },
    balance: { value: balanceValue, goal },
  };
}

/** A goal amount with the currency symbol, dropping cents when it's whole. */
export function formatGoalAmount(format: Format, amount: number) {
  const isWhole = amount % 10 ** format.currency.decimalPlaces === 0;
  return (
    (format.currency.symbol || '$') +
    format(amount, isWhole ? 'financial-no-decimals' : 'financial')
  );
}

/**
 * The target month as it reads after "by": just the month name when it's
 * within the next 11 months, otherwise with a short year ("Jan '30").
 */
export function formatTargetMonth(targetMonth: string, locale?: Locale) {
  const monthsAway = monthUtils.differenceInCalendarMonths(
    targetMonth,
    monthUtils.currentMonth(),
  );
  return monthUtils.format(
    targetMonth,
    monthsAway >= 0 && monthsAway <= 11 ? 'MMM' : "MMM ''yy",
    locale,
  );
}

/**
 * Input behavior for a budget cell. A zero budget starts as an empty input
 * with a "0.00" hint. With a goal, the hint is the goal amount instead
 * ("← 500.00"), and the left arrow fills it in whenever the input is empty.
 * Without one, it offers the previous month's budget the same way. Also
 * tracks what's typed so the goal popup can update live.
 */
export function useBudgetCellInput({
  editing,
  target,
  month,
  budgeted,
  format,
}: {
  editing: boolean;
  target: GoalTarget | null;
  month: string;
  budgeted: Binding<'envelope-budget' | 'tracking-budget', 'budget'>;
  format: Format;
}) {
  // The same cell in the previous month's sheet. Before the budget's first
  // month there's no such sheet, and the value stays null.
  const budgetedName = typeof budgeted === 'string' ? budgeted : budgeted.name;
  const previousBudgeted = useSheetValue(
    `${monthUtils.sheetForMonth(monthUtils.prevMonth(month))}!${budgetedName}` as typeof budgeted,
  );

  const [draft, setDraft] = useState<string | null>(null);
  // Start fresh each time editing starts or stops so a stale draft never shows
  const [wasEditing, setWasEditing] = useState(editing);
  if (wasEditing !== editing) {
    setWasEditing(editing);
    setDraft(null);
  }

  const goalSuggestion = target && target.goal > 0 ? target.goal : null;
  const previousSuggestion =
    previousBudgeted != null && previousBudgeted > 0 ? previousBudgeted : null;
  const suggestion = goalSuggestion ?? previousSuggestion;

  return {
    draft,
    // A zero budget always starts empty, so there's nothing to clear first
    formatExpr: (value: number) => (value === 0 ? '' : format.forEdit(value)),
    inputProps: {
      placeholder:
        suggestion != null
          ? `← ${format.forEdit(suggestion)}`
          : format.forEdit(0),
      onInput: (e: FormEvent<HTMLInputElement>) =>
        setDraft(e.currentTarget.value),
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (
          suggestion != null &&
          e.key === 'ArrowLeft' &&
          e.currentTarget.value === ''
        ) {
          e.preventDefault();
          fillInput(e.currentTarget, format.forEdit(suggestion));
        } else if (e.key === 'Escape') {
          // Escape puts back the saved amount, so drop what was typed
          setDraft(null);
        }
      },
    },
  };
}

/**
 * Sets an input's value as if the user typed it. The cell input keeps its own
 * state, so it only learns of the change through a real input event.
 */
function fillInput(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
