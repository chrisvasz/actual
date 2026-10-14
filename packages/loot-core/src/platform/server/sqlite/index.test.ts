// @ts-strict-ignore
import { execQuery, init, openDatabase, runQuery, transaction } from './index';

beforeAll(async () => {
  return init({
    baseURL: `${__dirname}/../../../../../../node_modules/@sqlite.org/sqlite-wasm/dist/`,
  });
});

const initSQL = `
CREATE TABLE numbers (id TEXT PRIMARY KEY, number INTEGER);
CREATE TABLE textstrings (id TEXT PRIMARY KEY, string TEXT);
`;

describe('Web sqlite', () => {
  it('should rollback transactions', async () => {
    const db = await openDatabase();
    execQuery(db, initSQL);

    runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id1', 4)");

    let rows = runQuery(db, 'SELECT * FROM numbers', null, true);
    expect(rows.length).toBe(1);
    // @ts-expect-error Property 'number' does not exist on type 'unknown'
    expect(rows[0].number).toBe(4);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => null);
    expect(() => {
      transaction(db, () => {
        runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id2', 5)");
        runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id3', 6)");
        // Insert an invalid one that will error
        runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id1', 1)");
      });
    }).toThrow(/constraint failed/);
    consoleSpy.mockRestore();

    // Nothing should have changed in the db
    rows = runQuery(db, 'SELECT * FROM numbers', null, true);
    expect(rows.length).toBe(1);
    // @ts-expect-error Property 'number' does not exist on type 'unknown'
    expect(rows[0].number).toBe(4);
  });

  it('should support nested transactions', async () => {
    const db = await openDatabase();
    execQuery(db, initSQL);

    runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id1', 4)");

    let rows = runQuery(db, 'SELECT * FROM numbers', null, true);
    expect(rows.length).toBe(1);
    // @ts-expect-error Property 'number' does not exist on type 'unknown'
    expect(rows[0].number).toBe(4);

    transaction(db, () => {
      runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id2', 5)");
      runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id3', 6)");

      // Only this transaction should fail
      const consoleSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => null);
      expect(() => {
        transaction(db, () => {
          runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id4', 7)");
          // Insert an invalid one that will error
          runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id1', 1)");
        });
      }).toThrow(/constraint failed/);
      consoleSpy.mockRestore();
    });

    // Nothing should have changed in the db
    rows = runQuery(db, 'SELECT * FROM numbers', null, true);
    expect(rows.length).toBe(3);
    // @ts-expect-error Property 'number' does not exist on type 'unknown'
    expect(rows[0].number).toBe(4);
    // @ts-expect-error Property 'number' does not exist on type 'unknown'
    expect(rows[1].number).toBe(5);
    // @ts-expect-error Property 'number' does not exist on type 'unknown'
    expect(rows[2].number).toBe(6);
  });

  it('should support immediate transactions with rollback and nesting', async () => {
    const db = await openDatabase();
    execQuery(db, initSQL);

    transaction(
      db,
      () => {
        runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id1', 1)");
        // Nested transactions become savepoints regardless of the mode
        transaction(
          db,
          () => {
            runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id2', 2)");
          },
          { immediate: true },
        );
      },
      { immediate: true },
    );
    expect(runQuery(db, 'SELECT * FROM numbers', null, true).length).toBe(2);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => null);
    expect(() => {
      transaction(
        db,
        () => {
          runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id3', 3)");
          runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id1', 1)");
        },
        { immediate: true },
      );
    }).toThrow(/constraint failed/);
    consoleSpy.mockRestore();

    expect(runQuery(db, 'SELECT * FROM numbers', null, true).length).toBe(2);
    // The failed transaction must have released the write lock
    runQuery(db, "INSERT INTO numbers (id, number) VALUES ('id4', 4)");
    expect(runQuery(db, 'SELECT * FROM numbers', null, true).length).toBe(3);
  });

  it('should use the crdt index for a batched cell lookup', async () => {
    // Mirrors the query `compareMessages` in server/sync builds for a
    // full chunk. If the planner ever falls back to a table scan on the
    // web build's SQLite, bulk edits get slow again.
    const db = await openDatabase();
    execQuery(
      db,
      `
      CREATE TABLE messages_crdt (
        id INTEGER PRIMARY KEY,
        timestamp TEXT NOT NULL UNIQUE,
        dataset TEXT NOT NULL,
        row TEXT NOT NULL,
        column TEXT NOT NULL,
        value BLOB NOT NULL
      );
      CREATE INDEX messages_crdt_search ON messages_crdt(dataset, row, column, timestamp);
      `,
    );

    const termCount = 100;
    const term = '(dataset = ? AND row = ? AND column = ? AND timestamp >= ?)';
    const sql =
      'SELECT dataset, row, column, timestamp FROM messages_crdt WHERE ' +
      Array(termCount).fill(term).join(' OR ');
    const params = Array.from({ length: termCount }, (_, index) => [
      'transactions',
      `row${index}`,
      'amount',
      '2024-01-01T00:00:00.000Z-0000-0000000000000000',
    ]).flat();

    const plan = runQuery<{ detail: string }>(
      db,
      'EXPLAIN QUERY PLAN ' + sql,
      params,
      true,
    );
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.some(step => step.detail.includes('SCAN'))).toBe(false);
    expect(
      plan.some(step => step.detail.includes('messages_crdt_search')),
    ).toBe(true);

    // And the query itself runs within the parameter limits
    expect(runQuery(db, sql, params, true)).toEqual([]);
  });

  it('should match regex on text fields', async () => {
    const db = await openDatabase();
    execQuery(db, initSQL);

    runQuery(
      db,
      "INSERT INTO textstrings (id, string) VALUES ('id1', 'not empty string')",
    );
    runQuery(db, "INSERT INTO textstrings (id) VALUES ('id2')");

    const rows = runQuery(
      db,
      "SELECT id FROM textstrings where REGEXP('n.', string)",
      null,
      true,
    );
    expect(rows.length).toBe(1);
    // @ts-expect-error Property 'id' does not exist on type 'unknown'
    expect(rows[0].id).toBe('id1');
  });

  it('should treat double-quoted strings as identifiers, not literals', async () => {
    const db = await openDatabase();
    execQuery(db, initSQL);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => null);
    expect(() =>
      runQuery(db, 'SELECT "definitely_not_a_column"', null, true),
    ).toThrow(/no such column/);
    // Schema statements too (SQLITE_DBCONFIG_DQS_DDL)
    expect(() =>
      execQuery(
        db,
        'CREATE TABLE t (a, CHECK (a != "definitely_not_a_column"))',
      ),
    ).toThrow(/no such column/);
    consoleSpy.mockRestore();
  });
});

describe('Web sqlite rows', () => {
  const valuesSQL = `
    SELECT * FROM (VALUES
      (NULL, NULL, NULL, NULL),
      (0, 0.0, '', x''),
      (1, -1.5, 'plain', x'00'),
      (-1, 1712345678901.5, 'Café Müller Łódź 🍕', x'00ff10'),
      (2147483647, 1.0 / 3, char(1, 9, 10, 13, 27, 127), CAST(printf('%.*c', 1000, 'x') AS BLOB)),
      (2147483648, -0.0, 'ünïcödé ✓', x'deadbeef'),
      (-2147483649, 1e308, '日本語', zeroblob(3)),
      (9007199254740991, 5e-324, '  spaces  ', x'ff'),
      (-9007199254740991, 9007199254740993.0, 'a''b"c', x'0102'),
      (9007199254740992, 1, 2.5, 3),
      (-9007199254740993, 'text', 7, NULL),
      (9223372036854775807, x'41', 'x', 1.25),
      (-9223372036854775808, 2, NULL, 'blob?')
    )`;

  function readWithOO1(db, sql: string) {
    const stmt = db.prepare(sql);
    const rows = [];
    try {
      while (stmt.step()) {
        rows.push(stmt.get({}));
      }
    } finally {
      stmt.finalize();
    }
    return rows;
  }

  it('returns the same values as stmt.get({}) for every column type', async () => {
    const db = await openDatabase();
    const expected = readWithOO1(db, valuesSQL);
    const rows = runQuery<Record<string, unknown>>(db, valuesSQL, null, true);

    expect(rows).toHaveLength(13);
    expect(rows).toEqual(expected);
    rows.forEach((row, i) => {
      for (const [key, value] of Object.entries(row)) {
        const other = expected[i][key];
        expect(typeof value).toBe(typeof other);
        expect(Object.is(value, other) || value instanceof Uint8Array).toBe(
          true,
        );
      }
    });
    expect(rows[5].column1).toBe(2147483648);
    expect(rows[7].column1).toBe(Number.MAX_SAFE_INTEGER);
    expect(rows[9].column1).toBe(9007199254740992n);
    expect(rows[11].column1).toBe(9223372036854775807n);
    expect(rows[3].column2).toBe(1712345678901.5);
    expect(rows[4].column2).toBe(1 / 3);
    expect(rows[3].column3).toBe('Café Müller Łódź 🍕');
    expect(rows[1].column3).toBe('');
    expect(rows[3].column4).toEqual(new Uint8Array([0, 255, 16]));
    db.close();
  });

  it('copies blobs out of the wasm heap', async () => {
    const db = await openDatabase();
    const [row] = runQuery<{ b: Uint8Array }>(
      db,
      "SELECT x'010203' AS b",
      null,
      true,
    );
    expect(row.b.buffer.byteLength).toBe(3);
    db.close();
  });

  it('reads table rows, keeping column names and later duplicates', async () => {
    const db = await openDatabase();
    execQuery(db, initSQL);
    runQuery(db, "INSERT INTO textstrings (id, string) VALUES ('a', 'x')");
    runQuery(db, "INSERT INTO textstrings (id, string) VALUES ('b', NULL)");
    const sql = 'SELECT id, string, id AS string FROM textstrings ORDER BY id';
    expect(runQuery(db, sql, null, true)).toEqual(readWithOO1(db, sql));

    const stmt = db.prepare('SELECT * FROM textstrings WHERE id = ?');
    expect(runQuery(db, stmt, ['a'], true)).toEqual([{ id: 'a', string: 'x' }]);
    expect(runQuery(db, stmt, ['b'], true)).toEqual([
      { id: 'b', string: null },
    ]);
    stmt.finalize();
    db.close();
  });

  it('reads the columns a prepared statement has after a schema change', async () => {
    const db = await openDatabase();
    execQuery(db, 'CREATE TABLE t (a, b); INSERT INTO t VALUES (1, 2)');
    const stmt = db.prepare('SELECT * FROM t');
    execQuery(db, 'ALTER TABLE t ADD COLUMN c DEFAULT 3');
    expect(runQuery(db, stmt, [], true)).toEqual([{ a: 1, b: 2, c: 3 }]);
    stmt.finalize();
    db.close();
  });

  it('keeps text after an embedded NUL, as better-sqlite3 does', async () => {
    const db = await openDatabase();
    const [row] = runQuery(db, "SELECT 'a' || char(0) || 'b' AS s", null, true);
    expect(row).toEqual({ s: 'a\0b' });
    db.close();
  });

  it('throws errors raised while stepping', async () => {
    const db = await openDatabase();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => null);
    expect(() =>
      runQuery(db, "SELECT json('not json') AS j", null, true),
    ).toThrow(/malformed JSON/);
    consoleSpy.mockRestore();
    db.close();
  });
});
