// @ts-strict-ignore
import { captureBreadcrumb } from '#platform/exceptions';
import * as fs from '#platform/server/fs';
import { logger } from '#platform/server/log';
import * as sqlite from '#platform/server/sqlite';
import { sheetForMonth } from '#shared/months';
import * as Platform from '#shared/platform';

import type * as DbModule from './db';
import type {
  DbPreference,
  DbReflectBudget,
  DbZeroBudget,
  DbZeroBudgetMonth,
} from './db';
import { Spreadsheet } from './spreadsheet/spreadsheet';
import { resolveName } from './spreadsheet/util';

let globalSheet: Spreadsheet;
let globalOnChange;

export function get(): Spreadsheet {
  return globalSheet;
}

// Older versions saved every computed cell to `kvcache` (on desktop, in a
// separate cache.sqlite) and loaded it on open instead of recomputing. Clearing
// `kvcache_key` in the main db is what stops a version that still reads the
// cache from showing values from before this one changed the budget.
async function clearLegacyCache(db: typeof DbModule): Promise<void> {
  sqlite.execQuery(
    db.getDatabase(),
    'DELETE FROM kvcache; DELETE FROM kvcache_key;',
  );

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

export async function loadSpreadsheet(
  db: typeof DbModule,
  onSheetChange?,
): Promise<Spreadsheet> {
  await clearLegacyCache(db);

  const sheet = new Spreadsheet();

  captureBreadcrumb({
    message: 'loading spreadsheet',
    category: 'server',
  });

  globalSheet = sheet;
  globalOnChange = onSheetChange;

  if (onSheetChange) {
    sheet.addEventListener('change', onSheetChange);
  }

  await loadUserBudgets(db);

  captureBreadcrumb({
    message: 'loaded spreadsheet',
    category: 'server',
  });

  return sheet;
}

export function unloadSpreadsheet(): void {
  if (globalSheet) {
    // TODO: Should wait for the sheet to finish
    globalSheet.unload();
    globalSheet = null;
  }
}

export async function reloadSpreadsheet(db): Promise<Spreadsheet> {
  if (globalSheet) {
    unloadSpreadsheet();
    return loadSpreadsheet(db, globalOnChange);
  }
}

export async function loadUserBudgets(db: typeof DbModule): Promise<void> {
  const sheet = globalSheet;

  const { value: budgetType = 'envelope' } =
    (await db.first<Pick<DbPreference, 'value'>>(
      'SELECT value from preferences WHERE id = ?',
      ['budgetType'],
    )) ?? {};

  const table = budgetType === 'tracking' ? 'reflect_budgets' : 'zero_budgets';
  const budgets = await db.all<DbReflectBudget | DbZeroBudget>(`
      SELECT * FROM ${table} b
      LEFT JOIN categories c ON c.id = b.category
      WHERE c.tombstone = 0
    `);

  sheet.startTransaction();

  // Load all the budget amounts and carryover values
  for (const budget of budgets) {
    if (budget.month && budget.category) {
      const sheetName = `budget${budget.month}`;
      sheet.set(`${sheetName}!budget-${budget.category}`, budget.amount);
      sheet.set(
        `${sheetName}!carryover-${budget.category}`,
        budget.carryover === 1 ? true : false,
      );
    }
  }

  // For zero-based budgets, load the buffered amounts
  if (budgetType !== 'tracking') {
    const budgetMonths = await db.all<DbZeroBudgetMonth>(
      'SELECT * FROM zero_budget_months',
    );
    for (const budgetMonth of budgetMonths) {
      const sheetName = sheetForMonth(budgetMonth.id);
      sheet.set(`${sheetName}!buffered`, budgetMonth.buffered);
    }
  }

  sheet.endTransaction();
}

export function getCell(sheet: string, name: string) {
  return globalSheet._getNode(resolveName(sheet, name));
}

export function getCellValue(
  sheet: string,
  name: string,
): string | number | boolean {
  return globalSheet.getValue(resolveName(sheet, name));
}

export function startTransaction(): void {
  if (globalSheet) {
    globalSheet.startTransaction();
  }
}

export function endTransaction(): void {
  if (globalSheet) {
    globalSheet.endTransaction();
  }
}

export function waitOnSpreadsheet(): Promise<void> {
  return new Promise(resolve => {
    if (globalSheet) {
      globalSheet.onFinish(resolve);
    } else {
      resolve(undefined);
    }
  });
}
