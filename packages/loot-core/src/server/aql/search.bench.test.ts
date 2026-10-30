// Opt-in benchmark of the account register's transaction search on a large
// generated budget. Run with:
//   SEARCH_BENCH=1 yarn workspace @actual-app/core vitest --run src/server/aql/search.bench.test.ts
// Set SEARCH_BENCH_EXPORT to a .zip path to also write the budget there, for
// the web app's "Import file" > Actual. Set SEARCH_BENCH_SCALE to multiply the
// number of transactions (4 gives about 200k), and SEARCH_BENCH_NOTES_SHARE
// to the share of transactions with notes (default 0.2).
//
// It times building the register's cache of normalised notes, then runs the
// queries the register runs for a search (a page of rows and the filtered
// total) through better-sqlite3, then replays the same SQL in the browser's
// SQLite (sqlite-wasm), counting the calls into the JS functions.
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
import { getNormalisedString } from '#shared/normalisation';
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
// term that isn't a date or an amount: names and notes are matched in JS
// against the lists and the notes cache the register has loaded
function search(term: string, notes: Map<string, string>, accountId?: string) {
  const normalised = getNormalisedString(term);
  const matchingIds = (items: Array<{ id: string; name: string }>) =>
    items
      .filter(item => getNormalisedString(item.name ?? '').includes(normalised))
      .map(item => item.id);
  const payeeIds = matchingIds(db.getPayees());
  const categoryIds = matchingIds(db.getCategories());
  const accountIds = matchingIds(db.getAccounts());
  const notesIds = [...notes]
    .filter(([, value]) => value.includes(normalised))
    .map(([id]) => id);
  const register = q('transactions').options({ splits: 'grouped' });
  return (accountId ? register.filter({ account: accountId }) : register)
    .filter({
      $or: [
        payeeIds.length > 0 && { payee: { $oneof: payeeIds } },
        categoryIds.length > 0 && { category: { $oneof: categoryIds } },
        accountIds.length > 0 && { account: { $oneof: accountIds } },
        { id: { $oneofbound: notesIds } },
      ].filter(Boolean),
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
      const notes = random.chance(
        Number(process.env.SEARCH_BENCH_NOTES_SHARE ?? 0.2),
      )
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
      transactionsPerMonth: 340 * Number(process.env.SEARCH_BENCH_SCALE ?? 1),
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

    // Capture the SQL and parameters each search runs
    const prepare = handle.prepare.bind(handle);
    type Statement = { sql: string; params: Array<string | number> };
    let captured: Statement[] | null = null;
    // A generic signature a plain function can't satisfy
    handle.prepare = ((sql: string) => {
      const stmt = prepare(sql);
      const all = stmt.all.bind(stmt);
      stmt.all = (...params: Array<string | number>) => {
        captured?.push({ sql, params });
        return all(...params);
      };
      return stmt;
    }) as typeof handle.prepare;

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

    // Each statement's median of 3 in sqlite-wasm
    const statementMs = (statements: Statement[]) =>
      statements.map(({ sql, params }) =>
        Math.round(
          median(
            Array.from({ length: 3 }, () => {
              const start = performance.now();
              webSqlite.runQuery(web, sql, params, true);
              return performance.now() - start;
            }),
          ),
        ),
      );

    const report: Record<string, unknown> = {
      transactions: db.first<{ n: number }>(
        'SELECT COUNT(*) AS n FROM transactions',
      )?.n,
    };

    // The register's notes cache, across all accounts and for one account:
    // the notes of its rows, split children included, normalised
    const notesCaches = new Map<string | undefined, Map<string, string>>();
    for (const accountId of [undefined, 'acct-checking']) {
      const register = q('transactions').options({ splits: 'all' });
      const query = (
        accountId ? register.filter({ account: accountId }) : register
      )
        .filter({ notes: { $ne: null } })
        .select(['id', 'notes']);
      captured = [];
      const rows: Array<{ id: string; notes: string }> = aqlQuery(query).data;
      const statements = captured;
      captured = null;

      const start = performance.now();
      const notes = new Map<string, string>(
        rows.map(row => [row.id, getNormalisedString(row.notes)]),
      );
      const normaliseMs = Math.round(performance.now() - start);
      notesCaches.set(accountId, notes);

      report[`notes cache (${accountId ?? 'all accounts'})`] = {
        rows: rows.length,
        sqliteWasmQueryMs: statementMs(statements)[0],
        normaliseMs,
      };
    }
    // Each term across all accounts, then in one account's register
    const cases = ['grocer', 'memo cafe', 'zzzz-no-match', '#'].flatMap(
      (term): Array<[string, string | undefined]> => [
        [term, undefined],
        [term, 'acct-checking'],
      ],
    );
    for (const [term, accountId] of cases) {
      const notes = notesCaches.get(accountId)!;
      const start = performance.now();
      const query = search(term, notes, accountId);
      // Matching the names and the cached notes
      const matchMs = Math.round(performance.now() - start);
      const run = () => {
        const { data: rows } = aqlQuery(query.limit(150));
        const { data: total } = aqlQuery(query.calculate({ $sum: '$amount' }));
        return { rows: rows.length, total };
      };

      captured = [];
      const result = run();
      const statements = captured;
      captured = null;

      const node = median(
        Array.from({ length: 5 }, () => {
          const start = performance.now();
          run();
          return performance.now() - start;
        }),
      );

      // Count the calls of one run, then time each statement's median of 3
      calls.NORMALISE = calls.UNICODE_LIKE = 0;
      const webRows = statements.map(({ sql, params }) =>
        webSqlite.runQuery(web, sql, params, true),
      );
      const callCounts = { ...calls };
      const webStatementMs = statementMs(statements);
      const webMs = webStatementMs.reduce((a, b) => a + b, 0);

      // Both engines return the same rows
      expect(webRows).toEqual(
        statements.map(({ sql, params }) => prepare(sql).all(...params)),
      );

      report[accountId ? `${term} (${accountId})` : term] = {
        ...result,
        matchMs,
        betterSqlite3Ms: Math.round(node),
        sqliteWasmMs: webMs,
        // Each statement the search ran, in order
        sqliteWasmStatementMs: webStatementMs,
        ...callCounts,
      };
    }
    webSqlite.closeDatabase(web);

    console.error(JSON.stringify(report, null, 2));
  });
});
