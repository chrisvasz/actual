import * as monthUtils from '#shared/months';

import { getByMonth } from './compute';
import type { BudgetInputs, ComputedBudget, MonthValues } from './compute';

// The client reads budget values by name, one "cell" per value, e.g.
// `budget202401!leftover-<category id>`. These map a computed budget to those
// names.

export type CellValue = number | boolean | null;

type Rows = Pick<BudgetInputs, 'budgets' | 'buffered'>;

const SUMMARY_CELLS = {
  'from-last-month': 'fromLastMonth',
  'total-income': 'totalIncome',
  'available-funds': 'availableFunds',
  'last-month-overspent': 'lastMonthOverspent',
  'total-budgeted': 'totalBudgeted',
  buffered: 'buffered',
  'buffered-auto': 'bufferedAuto',
  'buffered-selected': 'bufferedSelected',
  'to-budget': 'toBudget',
  'total-spent': 'totalSpent',
  'total-leftover': 'totalBalance',
} as const satisfies Record<string, keyof MonthValues['summary']>;

const SUMMARY_NAMES = Object.keys(SUMMARY_CELLS) as Array<
  keyof typeof SUMMARY_CELLS
>;

function monthFromSheetName(sheetName: string): string | null {
  // `budget202401`
  if (sheetName.length !== 12 || !sheetName.startsWith('budget')) {
    return null;
  }
  return sheetName.slice(6, 10) + '-' + sheetName.slice(10);
}

// The month before the first computed one, which reads as an empty month.
function blankMonth(computed: ComputedBudget): string | null {
  return computed.months.length > 0
    ? monthUtils.prevMonth(computed.months[0])
    : null;
}

function rowCell(rows: Rows, month: string, name: string): CellValue {
  if (name === 'buffered') {
    return rows.buffered.has(month) ? (rows.buffered.get(month) ?? null) : null;
  }
  if (name.startsWith('budget-')) {
    const row = getByMonth(rows.budgets, month, name.slice(7));
    return row ? row.amount : null;
  }
  if (name.startsWith('carryover-')) {
    const row = getByMonth(rows.budgets, month, name.slice(10));
    return row ? row.carryover : null;
  }
  return null;
}

export function getBudgetCell(
  computed: ComputedBudget,
  rows: Rows,
  sheetName: string,
  name: string,
): CellValue {
  const month = monthFromSheetName(sheetName);
  if (month == null) {
    return null;
  }

  const values = computed.values.get(month);
  if (!values) {
    if (month === blankMonth(computed)) {
      return getBlankCell(rows, month, name);
    }
    return rowCell(rows, month, name);
  }

  if (name in SUMMARY_CELLS) {
    return values.summary[SUMMARY_CELLS[name as keyof typeof SUMMARY_CELLS]];
  }

  if (name.startsWith('group-')) {
    let group;
    if (name.startsWith('group-sum-amount-')) {
      group = values.groups.get(name.slice(17));
      return group ? group.spent : null;
    }
    if (name.startsWith('group-budget-')) {
      group = values.groups.get(name.slice(13));
      return group ? group.budgeted : null;
    }
    if (name.startsWith('group-leftover-')) {
      group = values.groups.get(name.slice(15));
      return group ? group.balance : null;
    }
    return null;
  }

  if (name.startsWith('sum-amount-')) {
    const id = name.slice(11);
    const cat = values.categories.get(id) ?? values.incomeCategories.get(id);
    return cat ? cat.spent : null;
  }
  if (name.startsWith('leftover-pos-')) {
    const cat = values.categories.get(name.slice(13));
    return cat ? (cat.balance < 0 ? 0 : cat.balance) : null;
  }
  if (name.startsWith('leftover-')) {
    const cat = values.categories.get(name.slice(9));
    return cat ? cat.balance : null;
  }
  if (name.startsWith('budget-')) {
    const cat = values.categories.get(name.slice(7));
    return cat ? cat.budgeted : rowCell(rows, month, name);
  }
  if (name.startsWith('carryover-')) {
    const cat = values.categories.get(name.slice(10));
    return cat ? cat.carryover : rowCell(rows, month, name);
  }
  return null;
}

function getBlankCell(rows: Rows, month: string, name: string): CellValue {
  switch (name) {
    case 'is-blank':
      return true;
    case 'to-budget':
      return 0;
    case 'buffered':
      return rows.buffered.has(month) ? (rows.buffered.get(month) ?? null) : 0;
    default:
  }
  if (name.startsWith('leftover-')) {
    return 0;
  }
  if (name.startsWith('carryover-')) {
    return rowCell(rows, month, name) ?? false;
  }
  return rowCell(rows, month, name);
}

// Every computed cell of a month, in no particular order.
export function forEachMonthCell(
  values: MonthValues,
  rows: Rows,
  callback: (name: string, value: CellValue) => void,
) {
  for (const name of SUMMARY_NAMES) {
    callback(name, values.summary[SUMMARY_CELLS[name]]);
  }
  for (const [id, group] of values.groups) {
    callback('group-sum-amount-' + id, group.spent);
    if (group.budgeted != null) {
      callback('group-budget-' + id, group.budgeted);
      callback('group-leftover-' + id, group.balance);
    }
  }
  for (const [id, cat] of values.categories) {
    callback('budget-' + id, cat.budgeted);
    callback('sum-amount-' + id, cat.spent);
    callback('carryover-' + id, cat.carryover);
    callback('leftover-' + id, cat.balance);
    callback('leftover-pos-' + id, cat.balance < 0 ? 0 : cat.balance);
  }
  for (const [id, cat] of values.incomeCategories) {
    callback('sum-amount-' + id, cat.spent);
    const row = getByMonth(rows.budgets, values.month, id);
    if (row) {
      callback('budget-' + id, row.amount);
      callback('carryover-' + id, row.carryover);
    }
  }
}

// Every cell the client can read from a computed budget, by full name.
export function forEachBudgetCell(
  computed: ComputedBudget,
  rows: Rows,
  callback: (name: string, value: CellValue) => void,
) {
  const blank = blankMonth(computed);
  if (blank) {
    const sheetName = monthUtils.sheetForMonth(blank);
    callback(sheetName + '!is-blank', true);
    callback(sheetName + '!to-budget', 0);
    callback(sheetName + '!buffered', getBlankCell(rows, blank, 'buffered'));
    for (const group of computed.groups) {
      for (const cat of group.categories) {
        callback(
          sheetName + '!carryover-' + cat.id,
          getBlankCell(rows, blank, 'carryover-' + cat.id),
        );
        callback(sheetName + '!leftover-' + cat.id, 0);
        callback(sheetName + '!leftover-pos-' + cat.id, 0);
      }
    }
  }

  for (const values of computed.values.values()) {
    const prefix = monthUtils.sheetForMonth(values.month) + '!';
    forEachMonthCell(values, rows, (name, value) =>
      callback(prefix + name, value),
    );
  }
}

function sameMonths(a: string[], b: string[]) {
  return (
    a.length === b.length &&
    (a.length === 0 || (a[0] === b[0] && a[a.length - 1] === b[b.length - 1]))
  );
}

// The cells whose values differ between two computed budgets, so only those
// are sent to the client. Values are compared per month and per category, so
// an edit doesn't re-render every cell of the budget.
export function diffBudgetCells(
  prev: ComputedBudget,
  next: ComputedBudget,
  rows: Rows,
  callback: (name: string, value: CellValue) => void,
) {
  if (!sameMonths(prev.months, next.months)) {
    // The budget grew: compare every cell either budget has.
    const seen = new Set<string>();
    const compare = (full: string) => {
      if (seen.has(full)) {
        return;
      }
      seen.add(full);
      const idx = full.indexOf('!');
      const sheetName = full.slice(0, idx);
      const name = full.slice(idx + 1);
      const value = getBudgetCell(next, rows, sheetName, name);
      if (!Object.is(getBudgetCell(prev, rows, sheetName, name), value)) {
        callback(full, value);
      }
    };
    forEachBudgetCell(next, rows, compare);
    forEachBudgetCell(prev, rows, compare);
    return;
  }

  for (const month of next.months) {
    const before = prev.values.get(month);
    const after = next.values.get(month);
    if (!before || !after) {
      continue;
    }
    const prefix = monthUtils.sheetForMonth(month) + '!';
    const emit = (name: string, a: CellValue, b: CellValue) => {
      if (!Object.is(a, b)) {
        callback(prefix + name, b);
      }
    };
    // A cell that went away reads as whatever is left for it, if anything.
    const emitGone = (name: string) =>
      callback(
        prefix + name,
        getBudgetCell(next, rows, prefix.slice(0, -1), name),
      );

    for (const name of SUMMARY_NAMES) {
      const key = SUMMARY_CELLS[name];
      emit(name, before.summary[key], after.summary[key]);
    }

    for (const [id, group] of after.groups) {
      const old = before.groups.get(id);
      emit('group-sum-amount-' + id, old?.spent ?? null, group.spent);
      if (group.budgeted != null || old?.budgeted != null) {
        emit('group-budget-' + id, old?.budgeted ?? null, group.budgeted);
        emit('group-leftover-' + id, old?.balance ?? null, group.balance);
      }
    }
    for (const id of before.groups.keys()) {
      if (!after.groups.has(id)) {
        emitGone('group-sum-amount-' + id);
        emitGone('group-budget-' + id);
        emitGone('group-leftover-' + id);
      }
    }

    for (const [id, cat] of after.categories) {
      const old = before.categories.get(id);
      emit('budget-' + id, old?.budgeted ?? null, cat.budgeted);
      emit(
        'sum-amount-' + id,
        old?.spent ?? before.incomeCategories.get(id)?.spent ?? null,
        cat.spent,
      );
      emit('carryover-' + id, old?.carryover ?? null, cat.carryover);
      emit('leftover-' + id, old?.balance ?? null, cat.balance);
      emit(
        'leftover-pos-' + id,
        old ? (old.balance < 0 ? 0 : old.balance) : null,
        cat.balance < 0 ? 0 : cat.balance,
      );
    }
    for (const [id, cat] of after.incomeCategories) {
      const old = before.incomeCategories.get(id) ?? before.categories.get(id);
      emit('sum-amount-' + id, old?.spent ?? null, cat.spent);
    }
    for (const id of before.categories.keys()) {
      if (!after.categories.has(id)) {
        for (const name of [
          'budget-',
          'carryover-',
          'leftover-',
          'leftover-pos-',
        ]) {
          emitGone(name + id);
        }
        if (!after.incomeCategories.has(id)) {
          emitGone('sum-amount-' + id);
        }
      }
    }
    for (const id of before.incomeCategories.keys()) {
      if (!after.incomeCategories.has(id) && !after.categories.has(id)) {
        emitGone('sum-amount-' + id);
      }
    }
  }
}
