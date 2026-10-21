import { aqlQuery } from '#server/aql';
import {
  generateBudget,
  seededRandom,
} from '#server/budget/test-helpers/generate-budget';
import * as db from '#server/db';
import { liveReads } from '#server/live-reads';
import { batchUpdateTransactions } from '#server/transactions';
import type { TransactionEntity } from '#types/models';

import { q } from './query';
import type { Query } from './query';
import { compareCodePoints, createRegisterRows } from './register-rows';
import type { RegisterGroup } from './register-rows';

beforeEach(global.emptyDatabase());

function run(query: Query) {
  return aqlQuery(query) as {
    data: unknown;
    dependencies: readonly string[];
  };
}

// What a `splits: grouped` query of every transaction reads
function readGrouped(): RegisterGroup[] {
  const { data } = run(
    q('transactions').options({ splits: 'grouped' }).select('*'),
  );
  return (data as TransactionEntity[]).map(
    ({ subtransactions, ...parent }) => ({
      parent,
      children: subtransactions ?? [],
    }),
  );
}

// The rows, kept current by the changes the backend reports, and how many
// times they were read in full
function watchRows({ maxChangedRows }: { maxChangedRows?: number } = {}) {
  const loads = { count: 0 };
  const rows = createRegisterRows(
    read => {
      const state = read.serialize();
      if (
        state.tableOptions.splits === 'none' &&
        state.filterExpressions.length === 0 &&
        state.limit == null
      ) {
        loads.count++;
      }
      return run(read);
    },
    { maxChangedRows },
  );
  rows.getGroupsByAccount();
  loads.count = 0;
  const stop = liveReads.onChanges(changes => rows.applyChanges(changes));
  onTestFinished(stop);

  return {
    loads,
    expectCurrent() {
      const groups = readGrouped();
      expect(rows.getGroups()).toEqual(groups);
      const byAccount = new Map<string, RegisterGroup[]>();
      for (const group of groups) {
        byAccount.set(group.parent.account, [
          ...(byAccount.get(group.parent.account) ?? []),
          group,
        ]);
      }
      expect(rows.getGroupsByAccount()).toEqual(byAccount);
    },
  };
}

function rowsOf(groups: readonly RegisterGroup[]) {
  return groups.flatMap(group => [group.parent, ...group.children]);
}

async function setUpBudget() {
  await generateBudget({ seed: 4, years: 2, transactionsPerMonth: 50 });
  const random = seededRandom(5);
  const payees = ['p-grocer', 'p-fuel', 'p-cafe', 'p-books'].map(id =>
    db.insertPayee({ id, name: id }),
  );
  for (const account of db.getAccounts()) {
    db.insertPayee({
      id: `p-to-${account.id}`,
      name: '',
      transfer_acct: account.id,
    });
  }
  const ids = db
    .runQuery<{ id: string }>('SELECT id FROM transactions', [], true)
    .map(row => row.id);
  db.transaction(() => {
    for (const id of ids) {
      db.runQuery('UPDATE transactions SET description = ? WHERE id = ?', [
        random.pick(payees),
        id,
      ]);
    }
  });
}

function standalone(account = 'acct-checking') {
  return rowsOf(readGrouped()).find(
    t => t.account === account && !t.is_parent && !t.is_child,
  ) as TransactionEntity;
}

describe('createRegisterRows', () => {
  it('reads what a grouped query of every transaction reads', async () => {
    await setUpBudget();

    const groups = createRegisterRows(run).getGroups();

    expect(groups.length).toBeGreaterThan(1000);
    expect(groups).toEqual(readGrouped());
    expect(groups.some(group => group.children.length > 0)).toBe(true);
  });

  it('keeps the rows current through edits, re-reading only what they touched', async () => {
    await setUpBudget();
    const { loads, expectCurrent } = watchRows();

    // An edit, a moved date and a note
    const edited = standalone();
    batchUpdateTransactions({
      updated: [{ id: edited.id, amount: edited.amount + 1, notes: 'n' }],
    });
    expectCurrent();
    batchUpdateTransactions({
      updated: [{ id: edited.id, date: '2001-01-01' }],
    });
    expectCurrent();

    // A new transaction, then deleted
    const { added } = batchUpdateTransactions({
      added: [
        {
          id: 'new-1',
          account: 'acct-checking',
          date: '2030-05-05',
          amount: -500,
          payee: 'p-cafe',
        } as TransactionEntity,
      ],
    });
    expect(added).toHaveLength(1);
    expectCurrent();
    batchUpdateTransactions({ deleted: [{ id: 'new-1' }] });
    expectCurrent();

    // A new split, a child edited, deleted, and the parent deleted
    batchUpdateTransactions({
      added: [
        {
          id: 'split',
          account: 'acct-checking',
          date: '2030-06-01',
          amount: -300,
          is_parent: true,
        } as TransactionEntity,
        {
          id: 'split-a',
          account: 'acct-checking',
          date: '2030-06-01',
          amount: -100,
          is_child: true,
          parent_id: 'split',
        } as TransactionEntity,
        {
          id: 'split-b',
          account: 'acct-checking',
          date: '2030-06-01',
          amount: -200,
          is_child: true,
          parent_id: 'split',
        } as TransactionEntity,
      ],
    });
    expectCurrent();
    batchUpdateTransactions({ updated: [{ id: 'split-a', amount: -150 }] });
    expectCurrent();
    batchUpdateTransactions({ deleted: [{ id: 'split-b' }] });
    expectCurrent();

    // An existing transaction made a child of a new split
    const joining = standalone('acct-savings');
    batchUpdateTransactions({
      added: [
        {
          id: 'split-2',
          account: joining.account,
          date: joining.date,
          amount: joining.amount,
          is_parent: true,
        } as TransactionEntity,
      ],
      updated: [{ id: joining.id, is_child: true, parent_id: 'split-2' }],
    });
    expectCurrent();
    batchUpdateTransactions({ deleted: [{ id: 'split' }] });
    expectCurrent();

    // Moved to an off-budget account, and turned into a transfer
    const moving = standalone();
    batchUpdateTransactions({
      updated: [{ id: moving.id, account: 'acct-invest' }],
    });
    expectCurrent();
    const transferring = standalone();
    batchUpdateTransactions({
      updated: [{ id: transferring.id, payee: 'p-to-acct-savings' }],
    });
    expectCurrent();
    batchUpdateTransactions({
      updated: [{ id: transferring.id, payee: 'p-to-acct-invest' }],
    });
    expectCurrent();

    // A new payee, which no row showed before
    db.insertPayee({ id: 'p-new', name: 'p-new' });
    expectCurrent();

    // Closing an account changes nothing the rows show
    db.updateAccount({ id: 'acct-card', closed: 1 });
    expectCurrent();

    expect(loads.count).toBe(0);
  });

  it('reads everything again when a change can affect rows it did not list', async () => {
    await setUpBudget();
    const { loads, expectCurrent } = watchRows({ maxChangedRows: 1000 });

    // Merging payees remaps what rows show
    db.mergePayees('p-grocer', ['p-fuel']);
    expectCurrent();
    expect(loads.count).toBe(1);

    // Deleting a category moves its rows to another
    db.deleteCategory({ id: 'cat-0-0' }, 'cat-0-1');
    expectCurrent();
    expect(loads.count).toBe(2);

    // Many rows
    const rows = rowsOf(readGrouped()).filter(t => !t.is_parent && !t.is_child);
    expect(rows.length).toBeGreaterThan(1000);
    batchUpdateTransactions({
      updated: rows.slice(0, 1001).map(t => ({ id: t.id, notes: 'bulk' })),
    });
    expectCurrent();
    expect(loads.count).toBe(3);
  });

  it('reads in chunks, keeping what is read current', async () => {
    await setUpBudget();
    const rows = createRegisterRows(run, { chunkSize: 37 });
    const stop = liveReads.onChanges(changes => rows.applyChanges(changes));
    onTestFinished(stop);
    const all = rowsOf(readGrouped()).filter(t => !t.is_parent && !t.is_child);
    const newest = all[0];
    const oldest = all[all.length - 1];

    let chunks = 0;
    while (rows.loadSome()) {
      chunks++;
      if (chunks === 3) {
        // Edits on both sides of what's read, and a row moved across it
        batchUpdateTransactions({
          updated: [
            { id: newest.id, amount: newest.amount + 7 },
            { id: oldest.id, notes: 'old' },
            { id: all[100].id, date: '2001-02-03' },
            {
              id: oldest.id === all[1].id ? all[2].id : all[1].id,
              date: '2040-01-01',
            },
          ],
        });
      }
    }

    expect(chunks).toBeGreaterThan(10);
    expect(rows.getGroups()).toEqual(readGrouped());
  });

  it('reads what is left when the rows are asked for', async () => {
    await setUpBudget();
    const runQuery = vi.fn(run);
    const rows = createRegisterRows(runQuery, { chunkSize: 20 });

    expect(rows.loadSome()).toBe(true);
    const reads = runQuery.mock.calls.length;
    expect(rows.getGroups()).toEqual(readGrouped());
    // One read for the rest: the parents, then their children
    expect(runQuery).toHaveBeenCalledTimes(reads + 2);
    expect(rows.loadSome()).toBe(false);
  });

  it('keeps groups a change did not touch', async () => {
    await setUpBudget();
    const rows = createRegisterRows(run);
    const stop = liveReads.onChanges(changes => rows.applyChanges(changes));
    onTestFinished(stop);
    const before = rows.getGroups();
    const byAccountBefore = rows.getGroupsByAccount();

    const edited = standalone();
    batchUpdateTransactions({
      updated: [{ id: edited.id, amount: edited.amount + 1 }],
    });
    const after = rows.getGroups();
    const byAccountAfter = rows.getGroupsByAccount();

    // Only the edited account's list is new
    for (const [account, list] of byAccountAfter) {
      expect(list === byAccountBefore.get(account)).toBe(
        account !== edited.account,
      );
    }

    expect(after).not.toBe(before);
    const changed = after.filter(group => !before.includes(group));
    expect(changed.map(group => group.parent.id)).toEqual([edited.id]);
    // Nothing changed since
    expect(rows.getGroups()).toBe(after);
  });

  it('ignores changes to tables it does not read', async () => {
    await setUpBudget();
    const runQuery = vi.fn(run);
    const rows = createRegisterRows(runQuery);
    const groups = rows.getGroups();

    expect(
      rows.applyChanges({ tables: ['notes'], ids: { notes: ['x'] } }),
    ).toBe(false);
    const reads = runQuery.mock.calls.length;
    expect(rows.getGroups()).toBe(groups);
    expect(runQuery).toHaveBeenCalledTimes(reads);

    expect(rows.applyChanges('all')).toBe(true);
    expect(rows.getGroups()).toEqual(groups);
    // The tables the rows depend on, which a new budget can change, the
    // parents and their children
    expect(runQuery).toHaveBeenCalledTimes(reads + 3);
  });

  it('throws a failed read until a change reads again', async () => {
    await setUpBudget();
    let isBroken = true;
    const rows = createRegisterRows(query => {
      if (isBroken) {
        throw new Error('broken');
      }
      return run(query);
    });

    expect(() => rows.getGroups()).toThrow('broken');
    isBroken = false;
    expect(() => rows.getGroups()).toThrow('broken');

    rows.applyChanges({ tables: ['notes'], ids: {} });
    expect(rows.getGroups()).toEqual(readGrouped());
  });
});

describe('compareCodePoints', () => {
  it('orders strings by code point, as SQLite does', () => {
    const strings = ['b', 'a', 'B', 'é', '\u{1F600}', '～', 'ab', ''];
    expect([...strings].sort(compareCodePoints)).toEqual([
      '',
      'B',
      'a',
      'ab',
      'b',
      'é',
      '～',
      '\u{1F600}',
    ]);
  });
});
