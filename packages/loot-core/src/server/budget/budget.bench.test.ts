// Opt-in benchmark of building and updating the budget on a large generated
// budget. Run with:
//   BUDGET_BENCH=1 yarn workspace @actual-app/core vitest --run src/server/budget/budget.bench.test.ts
import * as db from '#server/db';

import { createAllBudgets } from './base';
import { computeBudget } from './compute';
import { loadBudgetGroups, loadBudgetRows, loadBufferedRows } from './inputs';
import { loadSpending, querySpent } from './spending';
import { flush, getBudgetMonths, loadBudgetState } from './state';
import { generateBudget, seededRandom } from './test-helpers/generate-budget';

beforeEach(global.emptyDatabase());

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function time<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const result = fn();
  return [result, performance.now() - start];
}

async function timeAsync(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

describe.skipIf(!process.env.BUDGET_BENCH)('budget benchmark', () => {
  it('measures load and single edits', { timeout: 600_000 }, async () => {
    await generateBudget({
      seed: 1,
      years: 10,
      transactionsPerMonth: 340,
      groupCount: 8,
      categoriesPerGroup: 7,
    });
    const counts = db.first<Record<string, number>>(`
      SELECT (SELECT COUNT(*) FROM transactions) AS transactions,
             (SELECT COUNT(*) FROM categories WHERE tombstone = 0) AS categories,
             (SELECT COUNT(*) FROM accounts) AS accounts`);
    const report: Record<string, unknown> = { ...counts };

    const random = seededRandom(2);
    const ids = db
      .runQuery<{ id: string }>(
        `SELECT id FROM transactions
          WHERE tombstone = 0 AND isParent = 0 AND isChild = 0
            AND category IS NOT NULL AND date IS NOT NULL`,
        [],
        true,
      )
      .map(row => row.id);
    const edits = 25;
    const pickEdits = () =>
      Array.from({ length: edits }, () => random.pick(ids));

    // Opening the budget: everything `load-budget` does for budget values.
    report.load = await timeAsync(async () => {
      await loadBudgetState();
      await createAllBudgets();
      flush();
    });
    const months = getBudgetMonths();
    report.months = months.length;
    report.spendingQuery = time(loadSpending)[1];
    const inputs = {
      months,
      groups: loadBudgetGroups(),
      spent: loadSpending(),
      budgets: loadBudgetRows(),
      buffered: loadBufferedRows(),
    };
    report.computeBudgetMedian = median(
      Array.from({ length: 30 }, () => time(() => computeBudget(inputs))[1]),
    );
    report.perPairQueryMedian = median(
      Array.from(
        { length: 30 },
        () => time(() => querySpent(months[60], 'cat-1-1'))[1],
      ),
    );

    // A single edit: the write, the applied change, and computing the budget
    // again.
    const editTimes: number[] = [];
    for (const id of pickEdits()) {
      editTimes.push(
        time(() => {
          db.updateTransaction({ id, amount: -random.int(100, 9000) });
          flush();
        })[1],
      );
    }
    report.editMedian = median(editTimes);

    report.spendingQueryPlan = db
      .runQuery<{ detail: string }>(
        `EXPLAIN QUERY PLAN SELECT cm.transferId, t.date / 100, SUM(IFNULL(t.amount, 0))
           FROM transactions t
           JOIN accounts a ON a.id = t.acct AND a.offbudget = 0
           JOIN category_mapping cm ON cm.id = t.category
           LEFT JOIN transactions p ON t.isChild = 1 AND p.id = t.parent_id
          WHERE IFNULL(t.tombstone, 0) = 0 AND t.isParent IS NOT 1
            AND t.date IS NOT NULL
            AND (t.isChild = 0 OR (t.parent_id IS NOT NULL AND p.tombstone = 0))
          GROUP BY 1, 2`,
        [],
        true,
      )
      .map(row => row.detail);

    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  });
});
