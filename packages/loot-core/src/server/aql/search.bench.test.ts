// Opt-in benchmark of the account register's transaction search on a large
// generated budget. Run with:
//   SEARCH_BENCH=1 yarn workspace @actual-app/core vitest --run src/server/aql/search.bench.test.ts
// Set SEARCH_BENCH_EXPORT to a .zip path to also write the budget there, for
// the web app's "Import file" > Actual.
//
// It runs the queries the register runs for a search (a page of rows and the
// filtered total) through better-sqlite3, then replays the same SQL in the
// browser's SQLite (sqlite-wasm), counting the calls into the JS functions.
import { writeFileSync } from 'node:fs';

import type { Database } from 'better-sqlite3';
import { zipSync } from 'fflate';

// The browser's build, which the node test setup doesn't resolve to
import * as webSqlite from '#platform/server/sqlite/index';
import { normalise } from '#platform/server/sqlite/normalise';
import { unicodeLike } from '#platform/server/sqlite/unicodeLike';
import {
  generateBudget,
  seededRandom,
} from '#server/budget/test-helpers/generate-budget';
import * as db from '#server/db';
import { q } from '#shared/query';

import { aqlQuery } from '.';

beforeEach(global.emptyDatabase());

const PAYEE_WORDS = [
  'Grocer',
  'Café',
  'Müller',
  'Łódź Market',
  'Fuel',
  'Bäckerei',
  'Hardware',
  'Pharmacy',
  'Crème',
  'Books',
];
const NOTE_WORDS = ['memo', 'cafe', 'Café', 'refund', 'gift', 'rent', 'GROCER'];

// The register's search filter (`transactionsSearch` in desktop-client) for a
// term that isn't a date or an amount
function search(term: string) {
  const pattern = `%${term.replace(/[\\%?]/g, '\\$&')}%`;
  return q('transactions')
    .options({ splits: 'grouped' })
    .filter({
      $or: {
        'payee.name': { $like: pattern },
        'payee.transfer_acct.name': { $like: pattern },
        notes: { $like: pattern },
        'category.name': { $like: pattern },
        'account.name': { $like: pattern },
        $or: [],
      },
    })
    .select('*');
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function seedPayeesAndNotes() {
  const random = seededRandom(3);
  const payeeIds: string[] = [];
  for (let i = 0; i < 200; i++) {
    payeeIds.push(db.insertPayee({ name: `${random.pick(PAYEE_WORDS)} ${i}` }));
  }
  const ids = db
    .runQuery<{ id: string }>('SELECT id FROM transactions', [], true)
    .map(row => row.id);
  db.transaction(() => {
    for (const id of ids) {
      const notes = random.chance(0.2)
        ? `${random.pick(NOTE_WORDS)} ${random.pick(NOTE_WORDS)}`
        : null;
      db.runQuery(
        'UPDATE transactions SET description = ?, notes = ? WHERE id = ?',
        [random.pick(payeeIds), notes, id],
      );
    }
  });
}

describe.skipIf(!process.env.SEARCH_BENCH)('search benchmark', () => {
  it('measures a register search', { timeout: 600_000 }, async () => {
    await generateBudget({
      seed: 1,
      years: 10,
      transactionsPerMonth: 340,
      groupCount: 8,
      categoriesPerGroup: 7,
    });
    seedPayeesAndNotes();

    // Tests run on better-sqlite3
    const handle = db.getDatabase() as unknown as Database;
    if (process.env.SEARCH_BENCH_EXPORT) {
      const meta = { id: 'search-bench', budgetName: 'Search bench' };
      writeFileSync(
        process.env.SEARCH_BENCH_EXPORT,
        zipSync(
          {
            'db.sqlite': handle.serialize(),
            'metadata.json': new TextEncoder().encode(JSON.stringify(meta)),
          },
          // Tests mock the clock
          { mtime: new Date(2020, 0, 1) },
        ),
      );
    }

    // Capture the SQL each search runs
    const prepare = handle.prepare.bind(handle);
    let captured: string[] | null = null;
    handle.prepare = (sql: string) => {
      captured?.push(sql);
      return prepare(sql);
    };

    await webSqlite.init({
      baseURL: `${__dirname}/../../../../../node_modules/@sqlite.org/sqlite-wasm/dist/`,
    });
    const web = await webSqlite.openDatabase(handle.serialize());
    // Count the calls, replacing the functions `openDatabase` registered
    const calls = { NORMALISE: 0, UNICODE_LIKE: 0 };
    web.createFunction(
      'NORMALISE',
      (_ctx, value) => {
        calls.NORMALISE++;
        return normalise(value as string | null);
      },
      { arity: 1, deterministic: true },
    );
    web.createFunction(
      'UNICODE_LIKE',
      (_ctx, pattern, value) => {
        calls.UNICODE_LIKE++;
        return unicodeLike(pattern as string | null, value as string | null);
      },
      { arity: 2, deterministic: true },
    );

    const report: Record<string, unknown> = {
      transactions: db.first<{ n: number }>(
        'SELECT COUNT(*) AS n FROM transactions',
      )?.n,
    };
    for (const term of ['grocer', 'memo cafe', 'zzzz-no-match']) {
      const query = search(term);
      const run = () => {
        const { data: rows } = aqlQuery(query.limit(150));
        const { data: total } = aqlQuery(query.calculate({ $sum: '$amount' }));
        return { rows: rows.length, total };
      };

      captured = [];
      const result = run();
      const sqls = captured;
      captured = null;

      const node = median(
        Array.from({ length: 5 }, () => {
          const start = performance.now();
          run();
          return performance.now() - start;
        }),
      );

      calls.NORMALISE = calls.UNICODE_LIKE = 0;
      const start = performance.now();
      const webRows = sqls.map(sql => webSqlite.runQuery(web, sql, [], true));
      const webMs = performance.now() - start;

      // Both engines return the same rows
      expect(webRows).toEqual(sqls.map(sql => prepare(sql).all()));

      report[term] = {
        ...result,
        betterSqlite3Ms: Math.round(node),
        sqliteWasmMs: Math.round(webMs),
        ...calls,
      };
    }
    webSqlite.closeDatabase(web);

    console.error(JSON.stringify(report, null, 2));
  });
});
