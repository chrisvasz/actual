import type { SqlParam } from '#platform/server/sqlite';
import * as db from '#server/db';

/**
 * The tables SQLite's plan for `sql` opens, directly or through an index.
 * Views are expanded in the plan, so this lists the tables they read too.
 */
export function tablesRead(sql: string, params: SqlParam[] = []): string[] {
  const plan = db.runQuery<{ opcode: string; p2: number; p3: number }>(
    'EXPLAIN ' + sql,
    params,
    true,
  );
  // P2 is the b-tree's root page and P3 the database, where 0 is `main`
  const rootPages = plan
    .filter(op => op.opcode === 'OpenRead' && op.p3 === 0)
    .map(op => op.p2);
  if (rootPages.length === 0) {
    return [];
  }
  return db
    .runQuery<{ tbl_name: string }>(
      `SELECT DISTINCT tbl_name FROM sqlite_master
       WHERE rootpage IN (${rootPages.join(', ')})`,
      [],
      true,
    )
    .map(row => row.tbl_name);
}
