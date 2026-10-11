import { safeNumber } from '#shared/util';

import { number } from './util';

// Everything the budget page shows is derived from a handful of inputs: what
// was spent per category per month, the amounts and carryover flags the user
// set, and the amounts held for next month. `computeBudget` folds over every
// month in one pass, so a change anywhere is handled by computing everything
// again; for a decade of a few dozen categories that takes well under a
// millisecond or two, so nothing tracks what depends on what.

export type BudgetCategory = {
  id: string;
  is_income: boolean;
};

export type BudgetGroup = {
  id: string;
  is_income: boolean;
  categories: BudgetCategory[];
};

export type BudgetRow = {
  amount: number | null;
  carryover: boolean;
};

// Values per category per month: month ('2024-01') to category id to value.
export type ByMonth<T> = Map<string, Map<string, T>>;

export function getByMonth<T>(
  map: ByMonth<T>,
  month: string,
  categoryId: string,
): T | undefined {
  return map.get(month)?.get(categoryId);
}

export function setByMonth<T>(
  map: ByMonth<T>,
  month: string,
  categoryId: string,
  value: T,
) {
  let forMonth = map.get(month);
  if (!forMonth) {
    forMonth = new Map();
    map.set(month, forMonth);
  }
  forMonth.set(categoryId, value);
}

export type BudgetInputs = {
  // Consecutive months, oldest first.
  months: string[];
  // The categories and groups that aren't deleted, in display order.
  groups: BudgetGroup[];
  // What was spent per category per month. Spending is negative; a missing
  // entry is nothing spent.
  spent: ByMonth<number>;
  // `zero_budgets`.
  budgets: ByMonth<BudgetRow>;
  // `zero_budget_months.buffered`, keyed by month, as stored.
  buffered: ReadonlyMap<string, number | null>;
};

export type CategoryValues = {
  budgeted: number;
  spent: number;
  carryover: boolean;
  balance: number;
};

export type IncomeCategoryValues = {
  spent: number;
};

export type GroupValues = {
  spent: number;
  // Only expense groups have these.
  budgeted: number | null;
  balance: number | null;
};

export type MonthSummary = {
  fromLastMonth: number;
  totalIncome: number;
  availableFunds: number;
  lastMonthOverspent: number;
  totalBudgeted: number;
  buffered: number;
  bufferedAuto: number;
  bufferedSelected: number;
  toBudget: number;
  totalSpent: number;
  totalBalance: number;
};

export type MonthValues = {
  month: string;
  summary: MonthSummary;
  categories: Map<string, CategoryValues>;
  incomeCategories: Map<string, IncomeCategoryValues>;
  groups: Map<string, GroupValues>;
};

export type ComputedBudget = {
  months: string[];
  groups: BudgetGroup[];
  values: Map<string, MonthValues>;
};

export function computeBudget({
  months,
  groups,
  spent: spentByMonth,
  budgets: budgetsByMonth,
  buffered: bufferedByMonth,
}: BudgetInputs): ComputedBudget {
  const values = new Map<string, MonthValues>();
  // The first income group's total is the month's income.
  const incomeGroup = groups.find(group => group.is_income);
  const allCategories = groups.flatMap(group => group.categories);
  const expenseCategories = allCategories.filter(cat => !cat.is_income);
  const incomeCategories = allCategories.filter(cat => cat.is_income);

  // The month before the first one starts empty: nothing left over and
  // nothing to budget.
  let prevCategories = new Map<string, CategoryValues>();
  let prevToBudget = 0;
  let prevBufferedSelected = 0;

  const none = new Map();

  for (const month of months) {
    const monthSpent: Map<string, number> = spentByMonth.get(month) ?? none;
    const monthBudgets: Map<string, BudgetRow> =
      budgetsByMonth.get(month) ?? none;
    const categories = new Map<string, CategoryValues>();
    let lastMonthOverspent = 0;

    for (const cat of expenseCategories) {
      const row = monthBudgets.get(cat.id);
      const budgeted = row ? (row.amount ?? 0) : 0;
      const spent = monthSpent.get(cat.id) ?? 0;
      const prev = prevCategories.get(cat.id);
      const prevBalance = prev ? prev.balance : 0;
      const prevCarryover = prev ? prev.carryover : false;

      // A negative balance only rolls over when the category carries over;
      // otherwise the overspending comes out of next month's "to budget".
      const balance = safeNumber(
        number(budgeted) +
          number(spent) +
          (prevCarryover ? prevBalance : Math.max(prevBalance, 0)),
      );
      categories.set(cat.id, {
        budgeted,
        spent,
        carryover: row ? row.carryover : false,
        balance,
      });

      if (!prevCarryover) {
        lastMonthOverspent += Math.min(0, prevBalance);
      }
    }
    lastMonthOverspent = safeNumber(lastMonthOverspent);

    const incomes = new Map<string, IncomeCategoryValues>();
    let bufferedAuto = 0;
    for (const cat of incomeCategories) {
      const spent = monthSpent.get(cat.id) ?? 0;
      incomes.set(cat.id, { spent });
      // Income in a category that carries over is held for next month
      // automatically.
      if (monthBudgets.get(cat.id)?.carryover) {
        bufferedAuto += spent;
      }
    }
    bufferedAuto = safeNumber(bufferedAuto);

    const groupValues = new Map<string, GroupValues>();
    let totalBudgeted = 0;
    let totalSpent = 0;
    let totalBalance = 0;
    for (const group of groups) {
      let groupSpent = 0;
      let groupBudgeted = 0;
      let groupBalance = 0;
      for (const cat of group.categories) {
        const value = categories.get(cat.id);
        if (value) {
          groupSpent += value.spent;
          groupBudgeted += value.budgeted;
          groupBalance += value.balance;
        } else {
          groupSpent += incomes.get(cat.id)?.spent ?? 0;
        }
      }
      groupSpent = safeNumber(groupSpent);
      if (group.is_income) {
        groupValues.set(group.id, {
          spent: groupSpent,
          budgeted: null,
          balance: null,
        });
      } else {
        groupBudgeted = safeNumber(groupBudgeted);
        groupBalance = safeNumber(groupBalance);
        groupValues.set(group.id, {
          spent: groupSpent,
          budgeted: groupBudgeted,
          balance: groupBalance,
        });
        totalBudgeted += groupBudgeted;
        totalSpent += groupSpent;
        totalBalance += groupBalance;
      }
    }

    const totalIncome = incomeGroup
      ? (groupValues.get(incomeGroup.id)?.spent ?? 0)
      : 0;
    const fromLastMonth = safeNumber(prevToBudget + prevBufferedSelected);
    const availableFunds = safeNumber(totalIncome + fromLastMonth);
    // A month without a stored amount, or with a null one, holds nothing
    // manually.
    const buffered = bufferedByMonth.get(month) ?? 0;
    // A manual hold replaces the automatic one.
    const bufferedSelected = buffered !== 0 ? buffered : bufferedAuto;
    const negatedBudgeted = -safeNumber(totalBudgeted);
    const toBudget = safeNumber(
      availableFunds + lastMonthOverspent + negatedBudgeted - bufferedSelected,
    );

    values.set(month, {
      month,
      summary: {
        fromLastMonth,
        totalIncome,
        availableFunds,
        lastMonthOverspent,
        totalBudgeted: negatedBudgeted,
        buffered,
        bufferedAuto,
        bufferedSelected,
        toBudget,
        totalSpent: safeNumber(totalSpent),
        totalBalance: safeNumber(totalBalance),
      },
      categories,
      incomeCategories: incomes,
      groups: groupValues,
    });

    prevCategories = categories;
    prevToBudget = toBudget;
    prevBufferedSelected = bufferedSelected;
  }

  return { months, groups, values };
}
