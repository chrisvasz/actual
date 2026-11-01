import { captureBreadcrumb } from '#platform/exceptions';
import { logger } from '#platform/server/log';
import * as monthUtils from '#shared/months';

import { getBudgetCell } from './cells';
import type { CellValue } from './cells';
import { computeBudget, setByMonth } from './compute';
import type {
  BudgetGroup,
  BudgetRow,
  ByMonth,
  ComputedBudget,
} from './compute';
import {
  budgetRowFromDb,
  loadBudgetGroups,
  loadBudgetRows,
  loadBufferedRows,
  monthFromDbMonth,
} from './inputs';
import { getSpendingChanges, loadSpending, refreshSpending } from './spending';
import type { Spending } from './spending';

// The open budget's values, kept in memory: what was spent per category per
// month, the stored amounts, carryover flags and holds, and everything
// `computeBudget` derives from them. Applied changes update the inputs and
// mark the budget out of date; it's computed again, in full, the next time a
// value is read. Which values changed isn't worked out: a change that can
// change any of them is reported as a budget change, and the client reads
// the values it shows again.

type State = {
  // Consecutive months the budget covers, oldest first. Empty until the
  // range is first set.
  months: string[];
  groups: BudgetGroup[];
  spending: Spending;
  budgets: ByMonth<BudgetRow>;
  buffered: Map<string, number | null>;
  computed: ComputedBudget;

  // What applied changes left to do.
  dirty: boolean;
  reloadSpending: boolean;
  reloadGroups: boolean;
  spendingPairs: Map<string, [string, string]>;
};

type DataMap = Map<string, unknown>;

let state: State | null = null;
let listener: (() => void) | null = null;

const EMPTY: ComputedBudget = { months: [], groups: [], values: new Map() };

function readState(months: string[]): State {
  return {
    months,
    groups: loadBudgetGroups(),
    spending: loadSpending(),
    budgets: loadBudgetRows(),
    buffered: loadBufferedRows(),
    computed: EMPTY,
    dirty: true,
    reloadSpending: false,
    reloadGroups: false,
    spendingPairs: new Map(),
  };
}

// `onChange` is called when budget values may have changed, except by the
// changes `applyMessages` applies with `applyBudgetChanges`, which reports
// them itself.
export async function loadBudgetState(onChange?: () => void): Promise<void> {
  captureBreadcrumb({ message: 'loading budget values', category: 'server' });
  listener = onChange ?? null;
  state = readState([]);
  computeIfDirty();
}

export function unloadBudgetState(): void {
  state = null;
  listener = null;
}

export function isBudgetStateLoaded(): boolean {
  return state != null;
}

// Reads everything from the database again, e.g. after it was written to
// without going through sync.
export function reloadBudgetState(): void {
  if (state) {
    const old = state;
    state = readState(old.months);
    state.computed = old.computed;
    listener?.();
  }
}

export function getBudgetMonths(): string[] {
  return state ? state.months : [];
}

// Makes the budget cover `months` as well as what it already covers.
export function extendBudgetMonths(months: string[]): void {
  if (!state || months.length === 0) {
    return;
  }
  let first = state.months[0] ?? months[0];
  let last = state.months[state.months.length - 1] ?? months[0];
  for (const month of months) {
    if (month < first) first = month;
    if (month > last) last = month;
  }
  if (
    first !== state.months[0] ||
    last !== state.months[state.months.length - 1]
  ) {
    state.months = monthUtils.rangeInclusive(first, last);
    state.dirty = true;
    listener?.();
  }
}

// Brings the computed budget up to date with every applied change.
function computeIfDirty(): void {
  const s = state;
  if (!s || !s.dirty) {
    return;
  }

  // A read that fails leaves the budget out of date, so the next read
  // tries again rather than computing from inputs it missed
  if (s.reloadSpending) {
    s.spending = loadSpending();
  } else if (s.spendingPairs.size > 0) {
    refreshSpending(s.spending, s.spendingPairs.values());
  }
  s.reloadSpending = false;
  s.spendingPairs.clear();
  if (s.reloadGroups) {
    s.groups = loadBudgetGroups();
    s.reloadGroups = false;
  }
  s.dirty = false;

  try {
    s.computed = computeBudget({
      months: s.months,
      groups: s.groups,
      spent: s.spending,
      budgets: s.budgets,
      buffered: s.buffered,
    });
  } catch (e) {
    // An amount too large to add up safely: keep showing the last values
    // rather than failing every read. The next change computes them again.
    logger.error('Could not compute the budget', e);
  }
}

function rowsOf(data: DataMap, table: string) {
  const rows = data.get(table);
  return rows instanceof Map ? rows : undefined;
}

// Updates the inputs from a batch of changes applied by sync. `oldData` and
// `newData` map table names to the touched rows before and after. Returns
// whether budget values may have changed, for the caller to report.
export function applyBudgetChanges(
  oldData: DataMap,
  newData: DataMap,
): boolean {
  const s = state;
  if (!s) {
    return false;
  }
  let changed = false;

  const spendingChanges = getSpendingChanges(oldData, newData);
  if (spendingChanges.reloadAll) {
    s.reloadSpending = true;
    changed = true;
  }
  for (const [month, categoryId] of spendingChanges.pairs) {
    s.spendingPairs.set(month + '|' + categoryId, [month, categoryId]);
    changed = true;
  }

  for (const row of rowsOf(newData, 'zero_budgets')?.values() ?? []) {
    if (row.month && row.category) {
      const month = monthFromDbMonth(row.month);
      setByMonth(s.budgets, month, row.category, budgetRowFromDb(row));
      changed = true;
    }
  }
  for (const row of rowsOf(newData, 'zero_budget_months')?.values() ?? []) {
    s.buffered.set(row.id, row.buffered);
    changed = true;
  }

  if (rowsOf(newData, 'categories') || rowsOf(newData, 'category_groups')) {
    s.reloadGroups = true;
    changed = true;
  }

  if (changed) {
    s.dirty = true;
  }
  return changed;
}

export function getBudgetCellValue(sheetName: string, name: string): CellValue {
  if (!state) {
    return null;
  }
  computeIfDirty();
  return getBudgetCell(state.computed, state, sheetName, name);
}

// The computed budget, up to date.
export function getComputedBudget(): ComputedBudget {
  if (!state) {
    return EMPTY;
  }
  computeIfDirty();
  return state.computed;
}
