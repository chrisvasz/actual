import { captureBreadcrumb } from '#platform/exceptions';
import * as fs from '#platform/server/fs';
import { logger } from '#platform/server/log';
import type { CellChange } from '#server/cells/types';
import * as db from '#server/db';
import * as monthUtils from '#shared/months';
import * as Platform from '#shared/platform';

import { diffBudgetCells, getBudgetCell } from './cells';
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
// `computeBudget` derives from them. Applied changes update the inputs, and
// the whole budget is computed again, coalesced to once per tick and done
// straight away whenever a value is read.

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
  // Cells read straight from stored rows, which `diffBudgetCells` can't see
  // change.
  rowCells: Set<string>;
};

type DataMap = Map<string, unknown>;

let state: State | null = null;
let listener: ((changes: CellChange[]) => void) | null = null;
let flushScheduled = false;

const EMPTY: ComputedBudget = { months: [], groups: [], values: new Map() };

// Older versions saved every computed cell to `kvcache` (on desktop, in a
// separate cache.sqlite) and loaded it on open instead of recomputing. Clearing
// `kvcache_key` in the main db is what stops a version that still reads the
// cache from showing values from before this one changed the budget.
async function clearLegacyCache(): Promise<void> {
  db.execQuery('DELETE FROM kvcache; DELETE FROM kvcache_key;');

  // Deleting cache.sqlite only frees disk space, so a failure (another process
  // holding the file, or a parallel load that deleted it first) must not stop
  // the budget from opening.
  const dbPath = db.getDatabasePath();
  if (!Platform.isBrowser && dbPath?.endsWith('db.sqlite')) {
    const cachePath = dbPath.replace(/db\.sqlite$/, 'cache.sqlite');
    try {
      if (await fs.exists(cachePath)) {
        await fs.removeFile(cachePath);
      }
    } catch (e) {
      logger.warn('Could not remove the old spreadsheet cache', e);
    }
  }
}

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
    rowCells: new Set(),
  };
}

export async function loadBudgetState(
  onChange?: (changes: CellChange[]) => void,
): Promise<void> {
  await clearLegacyCache();
  captureBreadcrumb({ message: 'loading budget values', category: 'server' });
  listener = onChange ?? null;
  state = readState([]);
  flush();
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
    const prev = state.computed;
    state = readState(state.months);
    state.computed = prev;
    flush();
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
    markDirty(state);
  }
}

function markDirty(s: State) {
  s.dirty = true;
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(() => {
      flushScheduled = false;
      flush();
    });
  }
}

// Brings the computed budget up to date with every applied change and tells
// the client which cells changed.
export function flush(): void {
  const s = state;
  if (!s || !s.dirty) {
    return;
  }
  s.dirty = false;

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

  const prev = s.computed;
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
    // rather than failing every read.
    logger.error('Could not compute the budget', e);
    s.rowCells.clear();
    return;
  }

  if (listener) {
    const changes = new Map<string, unknown>();
    diffBudgetCells(prev, s.computed, s, (name, value) =>
      changes.set(name, value),
    );
    for (const full of s.rowCells) {
      const idx = full.indexOf('!');
      changes.set(
        full,
        getBudgetCell(s.computed, s, full.slice(0, idx), full.slice(idx + 1)),
      );
    }
    if (changes.size > 0) {
      listener([...changes].map(([name, value]) => ({ name, value })));
    }
  }
  s.rowCells.clear();
}

function rowsOf(data: DataMap, table: string) {
  const rows = data.get(table);
  return rows instanceof Map ? rows : undefined;
}

// Updates the inputs from a batch of changes applied by sync. `oldData` and
// `newData` map table names to the touched rows before and after.
export function applyBudgetChanges(oldData: DataMap, newData: DataMap): void {
  const s = state;
  if (!s) {
    return;
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
      const sheetName = monthUtils.sheetForMonth(month);
      s.rowCells.add(`${sheetName}!budget-${row.category}`);
      s.rowCells.add(`${sheetName}!carryover-${row.category}`);
      changed = true;
    }
  }
  for (const row of rowsOf(newData, 'zero_budget_months')?.values() ?? []) {
    s.buffered.set(row.id, row.buffered);
    s.rowCells.add(`${monthUtils.sheetForMonth(row.id)}!buffered`);
    changed = true;
  }

  if (rowsOf(newData, 'categories') || rowsOf(newData, 'category_groups')) {
    s.reloadGroups = true;
    changed = true;
  }

  if (changed) {
    markDirty(s);
  }
}

export function getBudgetCellValue(sheetName: string, name: string): CellValue {
  if (!state) {
    return null;
  }
  flush();
  return getBudgetCell(state.computed, state, sheetName, name);
}

// The computed budget, up to date.
export function getComputedBudget(): ComputedBudget {
  if (!state) {
    return EMPTY;
  }
  flush();
  return state.computed;
}
