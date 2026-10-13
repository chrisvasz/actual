// Pins which existing transactions an import matches on a generated budget,
// so changes to the matching queries or their indexes can't change results.
//
// The benchmark is opt-in. Run with:
//   IMPORT_BENCH=1 yarn workspace @actual-app/core vitest --run src/server/accounts/import-matching.test.ts
import { createHash } from 'node:crypto';

import {
  generateBudget,
  seededRandom,
} from '#server/budget/test-helpers/generate-budget';
import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import { loadRules } from '#server/transactions/transaction-rules';
import * as monthUtils from '#shared/months';

import { matchTransactions, reconcileTransactions } from './sync';

beforeEach(async () => {
  await global.emptyDatabase()();
  loadMappings();
  loadRules();
});

const ACCOUNT = 'acct-checking';

// Adds payees and imported ids to the generated budget's checking account,
// then builds `count` rows to import into it: some re-import existing ids
// (including deleted transactions and ids shared by several rows), some are
// near-duplicates of existing transactions by date and amount (with and
// without a matching payee or an imported id), some repeat another imported
// row, and the rest are new.
async function prepareImport({
  years,
  transactionsPerMonth,
  count,
}: {
  years: number;
  transactionsPerMonth: number;
  count: number;
}) {
  await generateBudget({
    seed: 1,
    years,
    transactionsPerMonth,
    groupCount: 8,
    categoriesPerGroup: 7,
  });
  const random = seededRandom(3);

  const payeeNames = Array.from({ length: 30 }, (_, i) => `Payee ${i}`);
  const payeeIds = payeeNames.map(name => db.insertPayee({ name }));

  const existing = db.all<{ id: string; date: number; amount: number }>(
    `SELECT id, date, IFNULL(amount, 0) AS amount FROM transactions
      WHERE acct = ? AND date IS NOT NULL
      ORDER BY id`,
    [ACCOUNT],
  );
  const importedIds: string[] = [];
  db.transaction(() => {
    for (const row of existing) {
      const payee = random.chance(0.6) ? random.pick(payeeIds) : null;
      let importedId: string | null = null;
      if (random.chance(0.3)) {
        // Some ids are shared by two transactions.
        importedId =
          importedIds.length > 0 && random.chance(0.3)
            ? random.pick(importedIds)
            : `fid-${importedIds.length}`;
        importedIds.push(importedId);
      }
      db.run(
        'UPDATE transactions SET description = ?, financial_id = ? WHERE id = ?',
        [payee, importedId, row.id],
      );
    }
  });

  const toDate = (date: number, offset: number) =>
    monthUtils.addDays(db.fromDateRepr(date), offset);

  const rows: Array<{
    date: string;
    amount: number;
    payee_name?: string;
    imported_id?: string;
  }> = [];
  for (let i = 0; i < count; i++) {
    const roll = random.next();
    const base = random.pick(existing);
    if (roll < 0.3) {
      rows.push({
        date: toDate(base.date, random.int(-3, 4)),
        amount: random.int(-20000, 0),
        imported_id: random.pick(importedIds),
      });
    } else if (roll < 0.7) {
      rows.push({
        date: toDate(base.date, random.int(-9, 10)),
        amount: base.amount,
        payee_name: random.chance(0.5) ? random.pick(payeeNames) : undefined,
        imported_id: random.chance(0.5) ? `new-${i}` : undefined,
      });
    } else if (roll < 0.8 && rows.length > 0) {
      rows.push({ ...random.pick(rows), imported_id: `repeat-${i}` });
    } else {
      rows.push({
        date: toDate(base.date, random.int(-30, 30)),
        amount: -random.int(100, 30000),
        payee_name: random.pick(payeeNames),
        imported_id: `new-${i}`,
      });
    }
  }
  return rows;
}

function hashOf(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 16);
}

describe('import matching', () => {
  test('matches the same transactions on a generated budget', async () => {
    const rows = await prepareImport({
      years: 3,
      transactionsPerMonth: 120,
      count: 600,
    });

    const results: Record<string, unknown> = {};
    for (const strictIdChecking of [true, false]) {
      for (const reimportDeleted of [true, false]) {
        const { transactionsStep1, transactionsStep3 } =
          await matchTransactions(ACCOUNT, rows, {
            strictIdChecking,
            reimportDeleted,
          });
        const matches = transactionsStep3.map(step => step.match?.id ?? null);
        const datasets = transactionsStep1.map(
          step => step.fuzzyDataset?.map(row => row.id) ?? null,
        );
        results[`strict=${strictIdChecking},deleted=${reimportDeleted}`] = {
          matched: matches.filter(id => id != null).length,
          matches: hashOf(matches),
          datasets: hashOf(datasets),
        };
      }
    }

    expect(results).toMatchInlineSnapshot(`
      {
        "strict=false,deleted=false": {
          "datasets": "5d714998d07a1a16",
          "matched": 332,
          "matches": "fea63ae0678fcb2b",
        },
        "strict=false,deleted=true": {
          "datasets": "25068d01cc05344b",
          "matched": 324,
          "matches": "2e469ea26b5cc6ab",
        },
        "strict=true,deleted=false": {
          "datasets": "b60402ab383dcd54",
          "matched": 319,
          "matches": "be3b23bd3d326ea0",
        },
        "strict=true,deleted=true": {
          "datasets": "8073efdd087dbe63",
          "matched": 308,
          "matches": "1fe4abf2fe4d6352",
        },
      }
    `);
  });

  test.skipIf(!process.env.IMPORT_BENCH)(
    'benchmark: import 2,000 transactions',
    { timeout: 600_000 },
    async () => {
      const rows = await prepareImport({
        years: 10,
        transactionsPerMonth: 340,
        count: 2000,
      });
      const time = async (fn: () => Promise<unknown>) => {
        const start = performance.now();
        await fn();
        return Math.round(performance.now() - start);
      };
      const report = {
        transactions: db.first<{ n: number }>(
          'SELECT COUNT(*) AS n FROM transactions',
        )?.n,
        preview: await time(() =>
          reconcileTransactions(ACCOUNT, rows, { isPreview: true }),
        ),
        commit: await time(() =>
          reconcileTransactions(ACCOUNT, rows, { isPreview: false }),
        ),
      };
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    },
  );
});
