import { tablesRead } from '#mocks/tables-read';
import type { SqlParam } from '#platform/server/sqlite';
import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import { handlers } from '#server/main';
import { insertRule, loadRules } from '#server/transactions/transaction-rules';
import { handlerReads } from '#shared/handler-reads';

// Checks the tables declared in `handlerReads` against the ones each handler's
// SQL actually reads, found from the query plan of every statement it runs.

type RecordedStatement = { sql: string; params: SqlParam[] };
type Preparer = {
  prepare: (sql: string) => Record<string, unknown>;
};

function isPreparer(value: unknown): value is Preparer {
  return (
    value != null &&
    typeof value === 'object' &&
    'prepare' in value &&
    typeof value.prepare === 'function'
  );
}

// Runs `fn` and returns every statement it executed. Wraps the database's
// `prepare`, so it relies on the query cache being empty (a fresh database
// resets it) and on handlers running one at a time.
async function recordStatements(fn: () => Promise<unknown>) {
  const database: unknown = db.getDatabase();
  if (!isPreparer(database)) {
    throw new Error('Expected a database with `prepare`');
  }
  const recorded: RecordedStatement[] = [];
  const prepare = database.prepare;
  database.prepare = function (sql) {
    const statement = prepare.call(this, sql);
    for (const method of ['all', 'get', 'run', 'iterate']) {
      const run = statement[method];
      if (typeof run === 'function') {
        statement[method] = (...params: SqlParam[]) => {
          recorded.push({ sql, params });
          return run.apply(statement, params);
        };
      }
    }
    return statement;
  };
  try {
    await fn();
  } finally {
    database.prepare = prepare;
  }
  return recorded;
}

let payeeId: string;

const calls: Record<
  keyof typeof handlerReads,
  Array<() => Promise<unknown>>
> = {
  'accounts-get': [() => handlers['accounts-get']()],
  'account-groups-get': [() => handlers['account-groups-get']()],
  'get-categories': [
    () => handlers['get-categories'](),
    () => handlers['get-categories']({ hidden: true }),
    () => handlers['get-categories']({ hidden: false }),
  ],
  'payees-get': [() => handlers['payees-get']()],
  'payees-get-orphaned': [() => handlers['payees-get-orphaned']()],
  'payees-get-rule-counts': [() => handlers['payees-get-rule-counts']()],
  'payees-get-rules': [() => handlers['payees-get-rules']({ id: payeeId })],
  'rules-get': [() => handlers['rules-get']()],
  'tags-get': [() => handlers['tags-get']()],
};

// The tables loading the in-memory rules cache reads. The cache keeps itself
// current from sync listeners, which run before the sync event goes out, and
// rewrites the ids in each rule when a mapping table changes.
let rulesCacheReads: Set<string>;

beforeEach(async () => {
  await global.emptyDatabase()();
  rulesCacheReads = new Set();
  const loads = await recordStatements(async () => {
    await loadMappings();
    await loadRules();
  });
  for (const { sql, params } of loads) {
    tablesRead(sql, params).forEach(table => rulesCacheReads.add(table));
  }

  // Something in each table, so no handler skips a query for want of rows
  await db.insertAccount({ id: 'acct', name: 'Checking' });
  payeeId = await db.insertPayee({ name: 'Store' });
  const groupId = await db.insertCategoryGroup({ name: 'Food' });
  await db.insertCategory({ name: 'Groceries', cat_group: groupId });
  await db.insertAccountGroup({ name: 'Everyday' });
  await db.insertTag({ tag: 'trip' });
  await insertRule({
    stage: null,
    conditionsOp: 'and',
    conditions: [{ op: 'is', field: 'payee', value: payeeId }],
    actions: [{ op: 'set', field: 'notes', value: 'groceries' }],
  });
});

// Handlers that read the in-memory rules cache rather than (only) SQL
const readsRulesCache = new Set<keyof typeof handlerReads>([
  'payees-get-rule-counts',
  'payees-get-rules',
  'rules-get',
]);

describe('handlerReads', () => {
  test.each(Object.keys(calls) as Array<keyof typeof calls>)(
    'lists exactly the tables %s reads',
    async name => {
      const read = new Set(readsRulesCache.has(name) ? rulesCacheReads : []);
      for (const call of calls[name]) {
        for (const { sql, params } of await recordStatements(call)) {
          tablesRead(sql, params).forEach(table => read.add(table));
        }
      }
      expect([...handlerReads[name]].sort()).toEqual([...read].sort());
    },
  );
});
