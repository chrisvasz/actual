import { number } from '#server/budget/util';
// Test-only. A cell-by-cell transcription of how the old spreadsheet engine
// defined every budget cell (`budget/envelope.ts`, `budget/base.ts` and
// `sheet.loadUserBudgets` before the engine was replaced), evaluated lazily
// straight from the database. It is deliberately naive - one SQL query per
// spending cell, through the same view the engine used - so it can serve as an
// independent oracle for `computeBudget` and the in-memory spending totals.
import * as db from '#server/db';
import * as monthUtils from '#shared/months';
import { safeNumber } from '#shared/util';

type Value = number | boolean | null;

function sumAmounts(...amounts: Value[]) {
  return safeNumber(
    amounts.reduce<number>((total, amount) => total + number(amount), 0),
  );
}

export type ReferenceBudget = {
  months: string[];
  get: (sheetName: string, name: string) => Value;
  // Every cell the engine would have created, by full name.
  names: () => string[];
};

export function createReferenceBudget(months: string[]): ReferenceBudget {
  // `loadUserBudgets`: stored amounts and flags of categories that aren't
  // deleted, and held amounts, as static cells.
  const statics = new Map<string, Value>();
  const budgets = db.runQuery<{
    month: number;
    category: string;
    amount: number | null;
    carryover: number | null;
  }>(
    `SELECT b.month, b.category, b.amount, b.carryover FROM zero_budgets b
       LEFT JOIN categories c ON c.id = b.category
      WHERE c.tombstone = 0`,
    [],
    true,
  );
  for (const row of budgets) {
    if (row.month && row.category) {
      statics.set(`budget${row.month}!budget-${row.category}`, row.amount);
      statics.set(
        `budget${row.month}!carryover-${row.category}`,
        row.carryover === 1,
      );
    }
  }
  const bufferedRows = db.runQuery<{ id: string; buffered: number | null }>(
    'SELECT id, buffered FROM zero_budget_months',
    [],
    true,
  );
  for (const row of bufferedRows) {
    statics.set(`${monthUtils.sheetForMonth(row.id)}!buffered`, row.buffered);
  }

  // `createBudget` reads groups through AQL, which leaves out deleted ones.
  const groups = db
    .runQuery<{ id: string; is_income: number }>(
      `SELECT id, is_income FROM category_groups WHERE tombstone = 0
        ORDER BY is_income, sort_order, id`,
      [],
      true,
    )
    .map(group => ({
      ...group,
      categories: db.runQuery<{ id: string; is_income: number }>(
        `SELECT id, is_income FROM categories
          WHERE tombstone = 0 AND cat_group = ? ORDER BY sort_order, id`,
        [group.id],
        true,
      ),
    }));
  const categories = groups.flatMap(group => group.categories);
  const expenseCategories = categories.filter(cat => !cat.is_income);
  const incomeCategories = categories.filter(cat => cat.is_income);
  const incomeGroup = groups.filter(group => group.is_income)[0];
  const expenseGroups = groups.filter(group => !group.is_income);

  const monthSet = new Set(months);
  const blankSheet = monthUtils.sheetForMonth(monthUtils.prevMonth(months[0]));
  const sheetMonths = new Map(
    months.map(month => [monthUtils.sheetForMonth(month), month]),
  );

  const memo = new Map<string, Value>();

  function staticOr(full: string, fallback: Value): Value {
    return statics.has(full) ? (statics.get(full) ?? null) : fallback;
  }

  function sumAmount(month: string, categoryId: string): number {
    const { start, end } = monthUtils.bounds(month);
    const rows = db.runQuery<{ amount: number | null }>(
      `SELECT SUM(amount) as amount FROM v_transactions_internal_alive t
         LEFT JOIN accounts a ON a.id = t.account
       WHERE t.date >= ${start} AND t.date <= ${end}
         AND category = ? AND a.offbudget = 0`,
      [categoryId],
      true,
    );
    return rows[0]?.amount || 0;
  }

  function evaluate(sheetName: string, name: string): Value {
    const full = `${sheetName}!${name}`;

    if (sheetName === blankSheet && !sheetMonths.has(sheetName)) {
      if (name === 'is-blank') return true;
      if (name === 'to-budget') return 0;
      if (name === 'buffered') return staticOr(full, 0);
      const isCategoryCell = (prefix: string) =>
        name.startsWith(prefix) &&
        categories.some(cat => cat.id === name.slice(prefix.length));
      if (isCategoryCell('carryover-')) return staticOr(full, false);
      if (isCategoryCell('leftover-pos-')) return 0;
      if (isCategoryCell('leftover-')) return 0;
      return staticOr(full, null);
    }

    const month = sheetMonths.get(sheetName);
    if (month == null || !monthSet.has(month)) {
      return staticOr(full, null);
    }

    const prevSheet = monthUtils.sheetForMonth(monthUtils.prevMonth(month));
    const get = (n: string, sheet = sheetName) => cell(sheet, n);

    for (const cat of categories) {
      if (name === `sum-amount-${cat.id}`) {
        return sumAmount(month, cat.id);
      }
    }

    for (const cat of expenseCategories) {
      if (name === `budget-${cat.id}`) {
        // Null amounts were fixed up to 0 when the cell was created.
        return staticOr(full, 0) ?? 0;
      }
      if (name === `carryover-${cat.id}`) {
        return staticOr(full, false);
      }
      if (name === `leftover-${cat.id}`) {
        const prevCarryover = get(`carryover-${cat.id}`, prevSheet);
        return safeNumber(
          number(get(`budget-${cat.id}`)) +
            number(get(`sum-amount-${cat.id}`)) +
            (prevCarryover
              ? number(get(`leftover-${cat.id}`, prevSheet))
              : number(get(`leftover-pos-${cat.id}`, prevSheet))),
        );
      }
      if (name === `leftover-pos-${cat.id}`) {
        const leftover = get(`leftover-${cat.id}`) as number;
        return leftover < 0 ? 0 : leftover;
      }
    }

    for (const group of groups) {
      if (name === `group-sum-amount-${group.id}`) {
        return sumAmounts(
          ...group.categories.map(cat => get(`sum-amount-${cat.id}`)),
        );
      }
      if (!group.is_income) {
        if (name === `group-budget-${group.id}`) {
          return sumAmounts(
            ...group.categories.map(cat => get(`budget-${cat.id}`)),
          );
        }
        if (name === `group-leftover-${group.id}`) {
          return sumAmounts(
            ...group.categories.map(cat => get(`leftover-${cat.id}`)),
          );
        }
      }
    }

    switch (name) {
      case 'buffered':
        // The dynamic cell created over the static one replaced a null with
        // its initial value.
        return staticOr(full, 0) ?? 0;
      case 'from-last-month':
        return safeNumber(
          number(get('to-budget', prevSheet)) +
            number(get('buffered-selected', prevSheet)),
        );
      case 'total-income':
        return get(`group-sum-amount-${incomeGroup.id}`);
      case 'available-funds':
        return safeNumber(
          number(get('total-income')) + number(get('from-last-month')),
        );
      case 'last-month-overspent':
        return safeNumber(
          expenseCategories.reduce((total, cat) => {
            if (get(`carryover-${cat.id}`, prevSheet)) {
              return total;
            }
            return (
              total + Math.min(0, number(get(`leftover-${cat.id}`, prevSheet)))
            );
          }, 0),
        );
      case 'total-budgeted':
        return -sumAmounts(
          ...expenseGroups.map(group => get(`group-budget-${group.id}`)),
        );
      case 'buffered-auto':
        return safeNumber(
          incomeCategories.reduce((total, cat) => {
            if (get(`carryover-${cat.id}`)) {
              return total + (get(`sum-amount-${cat.id}`) as number);
            }
            return total;
          }, 0),
        );
      case 'buffered-selected': {
        const manual = get('buffered');
        return manual !== 0 ? manual : get('buffered-auto');
      }
      case 'to-budget':
        return safeNumber(
          number(get('available-funds')) +
            number(get('last-month-overspent')) +
            number(get('total-budgeted')) -
            number(get('buffered-selected')),
        );
      case 'total-spent':
        return sumAmounts(
          ...expenseGroups.map(group => get(`group-sum-amount-${group.id}`)),
        );
      case 'total-leftover':
        return sumAmounts(
          ...expenseGroups.map(group => get(`group-leftover-${group.id}`)),
        );
      default:
        return staticOr(full, null);
    }
  }

  function cell(sheetName: string, name: string): Value {
    const full = `${sheetName}!${name}`;
    if (!memo.has(full)) {
      memo.set(full, evaluate(sheetName, name));
    }
    return memo.get(full) ?? null;
  }

  function names(): string[] {
    const result = new Set<string>(statics.keys());
    result.add(`${blankSheet}!is-blank`);
    result.add(`${blankSheet}!to-budget`);
    result.add(`${blankSheet}!buffered`);
    for (const cat of categories) {
      result.add(`${blankSheet}!carryover-${cat.id}`);
      result.add(`${blankSheet}!leftover-${cat.id}`);
      result.add(`${blankSheet}!leftover-pos-${cat.id}`);
    }
    for (const month of months) {
      const s = monthUtils.sheetForMonth(month);
      for (const n of [
        'buffered',
        'from-last-month',
        'total-income',
        'available-funds',
        'last-month-overspent',
        'total-budgeted',
        'buffered-auto',
        'buffered-selected',
        'to-budget',
        'total-spent',
        'total-leftover',
      ]) {
        result.add(`${s}!${n}`);
      }
      for (const cat of categories) {
        result.add(`${s}!sum-amount-${cat.id}`);
      }
      for (const cat of expenseCategories) {
        for (const prefix of [
          'budget',
          'carryover',
          'leftover',
          'leftover-pos',
        ]) {
          result.add(`${s}!${prefix}-${cat.id}`);
        }
      }
      for (const group of groups) {
        result.add(`${s}!group-sum-amount-${group.id}`);
        if (!group.is_income) {
          result.add(`${s}!group-budget-${group.id}`);
          result.add(`${s}!group-leftover-${group.id}`);
        }
      }
    }
    return [...result];
  }

  return {
    months,
    get: cell,
    names,
  };
}
