// Opt-in benchmark of the planner-stats refresh a budget load runs
// (`optimizeDatabase`) on a large generated budget. Run with:
//   OPTIMIZE_BENCH=1 yarn workspace @actual-app/core vitest --run src/server/db/optimize.bench.test.ts
//
// Each case opens a fresh connection, as a cold load does, in both
// better-sqlite3 and the browser's SQLite (sqlite-wasm).
import SQL from 'better-sqlite3';
import type { Database } from 'better-sqlite3';

// The browser's build, which the node test setup doesn't resolve to
import * as webSqlite from '#platform/server/sqlite/index';
import { generateBudget } from '#server/budget/test-helpers/generate-budget';
import * as db from '#server/db';

beforeEach(global.emptyDatabase());

const OPTIMIZE = `
  PRAGMA analysis_limit = 1000;
  PRAGMA optimize = 0x10002;
  PRAGMA analysis_limit = 0;
`;

const PAGE_SIZE = 4096;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function changedPages(before: Uint8Array, after: Uint8Array) {
  let changed = Math.abs(after.length - before.length) / PAGE_SIZE;
  for (let i = 0; i < Math.min(before.length, after.length); i += PAGE_SIZE) {
    for (let j = i; j < i + PAGE_SIZE; j++) {
      if (before[j] !== after[j]) {
        changed++;
        break;
      }
    }
  }
  return changed;
}

describe.skipIf(!process.env.OPTIMIZE_BENCH)('optimize benchmark', () => {
  it('measures the stats refresh on open', { timeout: 600_000 }, async () => {
    await generateBudget({
      seed: 1,
      years: 10,
      transactionsPerMonth: 340,
      groupCount: 8,
      categoriesPerGroup: 7,
    });

    // Tests run on better-sqlite3
    const handle = db.getDatabase() as unknown as Database;

    // No stats at all, as a budget that never ran ANALYZE
    handle.exec('ANALYZE; DROP TABLE sqlite_stat1;');
    const noStats = handle.serialize();
    // Stale stats, like those seen on real budgets: tiny counts left
    // from when the budget was new, and none for transactions
    handle.exec(`
      ANALYZE;
      UPDATE sqlite_stat1 SET stat = '7 1';
      DELETE FROM sqlite_stat1 WHERE tbl = 'transactions';
    `);
    const staleStats = handle.serialize();
    // Up to date stats, as every load after the first sees
    const fresh = new SQL(staleStats);
    fresh.exec(OPTIMIZE);
    const freshStats = fresh.serialize();
    fresh.close();

    await webSqlite.init({
      baseURL: `${__dirname}/../../../../../node_modules/@sqlite.org/sqlite-wasm/dist/`,
    });

    const report: Record<string, unknown> = {
      transactions: db.first<{ n: number }>(
        'SELECT COUNT(*) AS n FROM transactions',
      )?.n,
      sizeMB: +(freshStats.length / 1024 / 1024).toFixed(1),
    };
    const cases = { noStats, staleStats, freshStats };
    for (const [name, bytes] of Object.entries(cases)) {
      const node = median(
        Array.from({ length: 5 }, () => {
          const conn = new SQL(bytes);
          const start = performance.now();
          conn.exec(OPTIMIZE);
          const ms = performance.now() - start;
          conn.close();
          return ms;
        }),
      );

      let pages = 0;
      const web = median(
        await Promise.all(
          Array.from({ length: 5 }, async () => {
            const conn = await webSqlite.openDatabase(bytes);
            const before = await webSqlite.exportDatabase(conn);
            const start = performance.now();
            webSqlite.execQuery(conn, OPTIMIZE);
            const ms = performance.now() - start;
            pages = changedPages(before, await webSqlite.exportDatabase(conn));
            webSqlite.closeDatabase(conn);
            return ms;
          }),
        ),
      );

      report[name] = {
        betterSqlite3Ms: +node.toFixed(1),
        sqliteWasmMs: +web.toFixed(1),
        pagesWritten: pages,
      };
    }

    // For comparison, a full ANALYZE as "Reset sync" runs
    const conn = await webSqlite.openDatabase(noStats);
    const start = performance.now();
    webSqlite.execQuery(conn, 'ANALYZE');
    report.fullAnalyzeSqliteWasmMs = +(performance.now() - start).toFixed(1);
    webSqlite.closeDatabase(conn);

    console.error(JSON.stringify(report, null, 2));
  });
});
