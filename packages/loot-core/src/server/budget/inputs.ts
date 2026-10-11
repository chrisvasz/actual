import * as db from '#server/db';

import { setByMonth } from './compute';
import type { BudgetGroup, BudgetRow, ByMonth } from './compute';

// Reads what `computeBudget` needs, other than spending, from the database.

export function monthFromDbMonth(dbMonth: number | string): string {
  const s = String(dbMonth).padStart(6, '0');
  return s.slice(0, 4) + '-' + s.slice(4);
}

// The categories and groups that aren't deleted, in display order.
export function loadBudgetGroups(): BudgetGroup[] {
  const groups = db.runQuery<{ id: string; is_income: number }>(
    `SELECT id, is_income FROM category_groups WHERE tombstone = 0
      ORDER BY is_income, sort_order, id`,
    [],
    true,
  );
  const categories = db.runQuery<{
    id: string;
    is_income: number;
    cat_group: string;
  }>(
    `SELECT id, is_income, cat_group FROM categories WHERE tombstone = 0
      ORDER BY sort_order, id`,
    [],
    true,
  );

  const byGroup = new Map<string, BudgetGroup>(
    groups.map(group => [
      group.id,
      { id: group.id, is_income: group.is_income === 1, categories: [] },
    ]),
  );
  for (const cat of categories) {
    byGroup.get(cat.cat_group)?.categories.push({
      id: cat.id,
      is_income: cat.is_income === 1,
    });
  }
  return [...byGroup.values()];
}

export function budgetRowFromDb(row: {
  amount: number | null;
  carryover: number | null;
}): BudgetRow {
  return { amount: row.amount, carryover: row.carryover === 1 };
}

export function loadBudgetRows(): ByMonth<BudgetRow> {
  const rows = db.runQuery<{
    month: number;
    category: string;
    amount: number | null;
    carryover: number | null;
  }>('SELECT month, category, amount, carryover FROM zero_budgets', [], true);
  const budgets: ByMonth<BudgetRow> = new Map();
  for (const row of rows) {
    if (row.month && row.category) {
      setByMonth(
        budgets,
        monthFromDbMonth(row.month),
        row.category,
        budgetRowFromDb(row),
      );
    }
  }
  return budgets;
}

export function loadBufferedRows(): Map<string, number | null> {
  const rows = db.runQuery<{ id: string; buffered: number | null }>(
    'SELECT id, buffered FROM zero_budget_months',
    [],
    true,
  );
  return new Map(rows.map(row => [row.id, row.buffered]));
}
