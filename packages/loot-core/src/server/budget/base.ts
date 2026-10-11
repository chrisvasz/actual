import * as db from '#server/db';
import * as monthUtils from '#shared/months';

import * as budgetActions from './actions';
import { extendBudgetMonths, getBudgetMonths } from './state';

export function getBudgetRange(start: string, end: string) {
  start = monthUtils.getMonth(start);
  end = monthUtils.getMonth(end);

  // The start date should never be after the end date. If that
  // happened, the month range might be a valid range and weird
  // things happen
  if (start > end) {
    start = end;
  }

  // Budgets should exist 3 months before the earliest needed date
  // (either the oldest transaction or the current month if no
  // transactions yet), and a year from the current date. There's no
  // need to ever have budgets outside that range.
  start = monthUtils.subMonths(start, 3);
  end = monthUtils.addMonths(end, 12);

  return { start, end, range: monthUtils.rangeInclusive(start, end) };
}

export function doTransfer(categoryIds: string[], transferId: string): void {
  getBudgetMonths().forEach(month => {
    const totalValue = categoryIds
      .map(id => {
        return budgetActions.getBudget({ month, category: id });
      })
      .reduce((total, value) => total + value, 0);

    const transferValue = budgetActions.getBudget({
      month,
      category: transferId,
    });

    budgetActions.setBudget({
      month,
      category: transferId,
      amount: totalValue + transferValue,
    });
  });
}

export async function createAllBudgets() {
  const earliestTransaction = db.first<db.DbTransaction>(
    'SELECT * FROM transactions WHERE isChild=0 AND date IS NOT NULL ORDER BY date ASC LIMIT 1',
  );
  const earliestDate =
    earliestTransaction && db.fromDateRepr(earliestTransaction.date);
  const currentMonth = monthUtils.currentMonth();

  // Get the range based off of the earliest transaction and the
  // current month. If no transactions currently exist the current
  // month is also used as the starting month
  const { start, end, range } = getBudgetRange(
    earliestDate || currentMonth,
    currentMonth,
  );

  extendBudgetMonths(range);

  return { start, end };
}
