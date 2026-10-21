import { Timestamp } from '@actual-app/crdt';

import type { BudgetChanges } from '#platform/in-process-channel';
import * as connection from '#platform/server/connection';
import * as db from '#server/db';
import { addSyncListener, applyMessages, setSyncingMode } from '#server/sync';
import { q } from '#shared/query';

import { accountLiveReads } from './accounts/app';
import { setBudget } from './budget/actions';
import {
  extendBudgetMonths,
  loadBudgetState,
  unloadBudgetState,
} from './budget/state';
import { hasQueryCell } from './cells/query-cells';
import { liveReads, notifyCellChanges, notifyChanges } from './live-reads';
// Registers the payees app's named reads
import './payees/app';

beforeEach(global.emptyDatabase());

describe('liveReads', () => {
  it('reads a query synchronously, with the tables it read', () => {
    db.insertAccount({ id: 'acct', name: 'Checking' });

    const result = liveReads.query(
      q('transactions').filter({ 'account.name': 'Checking' }).serialize(),
    );

    expect(result.data).toEqual([]);
    expect(result.dependencies).toEqual(
      expect.arrayContaining(['transactions', 'accounts']),
    );
  });

  it('reads a calculation as a single value', () => {
    const result = liveReads.query(
      q('transactions').calculate({ $sum: '$amount' }).serialize(),
    );

    expect(result.data).toBe(0);
  });

  it('throws the error a failed `send("query")` rejects with', () => {
    const send = vi.spyOn(connection, 'send');

    let error: unknown;
    try {
      liveReads.query(q('no_such_table').select('*').serialize());
    } catch (e) {
      error = e;
    }

    expect(error).toMatchObject({ type: 'ServerError' });
    expect(send).toHaveBeenCalledWith('server-error');
  });

  it('reads nothing, quietly, with no budget open', () => {
    const send = vi.spyOn(connection, 'send');
    db.closeDatabase();

    expect(liveReads.query(q('transactions').select('*').serialize())).toEqual({
      data: [],
      dependencies: [],
    });
    expect(
      liveReads.query(
        q('transactions').calculate({ $sum: '$amount' }).serialize(),
      ),
    ).toEqual({ data: null, dependencies: [] });
    expect(send).not.toHaveBeenCalled();
  });

  it('reports the tables and rows each applied change wrote', () => {
    const changes: BudgetChanges[] = [];
    const stop = liveReads.onChanges(change => changes.push(change));

    db.insertAccount({ id: 'acct', name: 'Checking' });
    db.insertPayee({ id: 'payee', name: 'Shop' });
    db.insertTransaction({
      id: 't1',
      account: 'acct',
      payee: 'payee',
      amount: 100,
      date: '2017-01-01',
    });
    db.updateTransaction({ id: 't1', amount: 200 });
    db.deleteTransaction({ id: 't1' });

    expect(changes).toEqual([
      { tables: ['accounts'], ids: { accounts: ['acct'] }, cells: [] },
      // Along with the rows it writes for it
      {
        tables: ['payees', 'payee_mapping'],
        ids: { payees: ['payee'], payee_mapping: ['payee'] },
        cells: [],
      },
      { tables: ['transactions'], ids: { transactions: ['t1'] }, cells: [] },
      { tables: ['transactions'], ids: { transactions: ['t1'] }, cells: [] },
      // A delete is a tombstone, and reports its row
      { tables: ['transactions'], ids: { transactions: ['t1'] }, cells: [] },
    ]);

    stop();
    db.insertAccount({ id: 'acct2', name: 'Savings' });
    expect(changes).toHaveLength(5);
  });

  it('reports each row once per change, under the table it is in', () => {
    const changes: BudgetChanges[] = [];
    const stop = liveReads.onChanges(change => changes.push(change));
    const timestamp = () => Timestamp.send()!;

    applyMessages([
      {
        dataset: 'accounts',
        row: 'a1',
        column: 'name',
        value: 'A',
        timestamp: timestamp(),
      },
      {
        dataset: 'accounts',
        row: 'a1',
        column: 'offbudget',
        value: 0,
        timestamp: timestamp(),
      },
      {
        dataset: 'accounts',
        row: 'a2',
        column: 'name',
        value: 'B',
        timestamp: timestamp(),
      },
      {
        dataset: 'schedules_next_date',
        row: 'nd1',
        column: 'schedule_id',
        value: 's1',
        timestamp: timestamp(),
      },
    ]);

    expect(changes).toEqual([
      {
        tables: ['accounts', 'schedules'],
        ids: { accounts: ['a1', 'a2'], schedules_next_date: ['nd1'] },
        cells: [],
      },
    ]);
    stop();
  });

  describe('with syncing enabled', () => {
    beforeEach(() => setSyncingMode('enabled'));
    afterEach(() => setSyncingMode('disabled'));

    it("doesn't report deferred or already-applied messages", () => {
      const changes: BudgetChanges[] = [];
      const stop = liveReads.onChanges(change => changes.push(change));
      const amount = {
        dataset: 'transactions',
        row: 't1',
        column: 'amount',
        value: 1234,
        timestamp: Timestamp.send()!,
      };

      applyMessages(
        [
          {
            dataset: 'transactions',
            row: 't2',
            column: 'brand_new_column',
            value: 'hello',
            timestamp: Timestamp.send()!,
          },
          amount,
        ],
        true,
      );
      // The same message again is already applied: nothing is written
      applyMessages([amount], true);

      expect(changes).toEqual([
        { tables: ['transactions'], ids: { transactions: ['t1'] }, cells: [] },
      ]);
      stop();
    });
  });

  it('refreshes schedules on the change that rewrites their rule paths', () => {
    // `schedules_json_paths` is rewritten (outside the synced tables) when
    // a commit writes `rules`, so whatever reads it must also read `rules`
    const { dependencies } = liveReads.query(
      q('schedules').select('*').serialize(),
    );
    expect(dependencies).toEqual(
      expect.arrayContaining(['schedules_json_paths', 'rules']),
    );
  });

  describe('named reads', () => {
    it("reads an app's named read, with the tables it declares", () => {
      db.insertAccount({ id: 'acct', name: 'Checking' });
      db.insertPayee({ id: 'payee', name: 'Shop' });

      const accounts = liveReads.read('accounts-get', undefined);
      expect(accounts).toEqual({
        data: [expect.objectContaining({ id: 'acct', name: 'Checking' })],
        dependencies: ['accounts'],
      });

      const payees = liveReads.read('payees-get', undefined);
      expect(payees.data).toEqual([
        expect.objectContaining({ id: 'payee', name: 'Shop' }),
      ]);
      expect(payees.dependencies).toEqual(['payees', 'accounts']);
    });

    it('builds a new result for each read', () => {
      db.insertAccount({ id: 'acct', name: 'Checking' });

      const first = liveReads.read('accounts-get', undefined);
      const second = liveReads.read('accounts-get', undefined);
      expect(second.data).toEqual(first.data);
      expect(second.data).not.toBe(first.data);
      expect((second.data as unknown[])[0]).not.toBe(
        (first.data as unknown[])[0],
      );
      // Its tables are a copy too
      expect(second.dependencies).not.toBe(
        accountLiveReads['accounts-get'].tables,
      );
    });

    it('reads the empty result, quietly, with no budget open', () => {
      const send = vi.spyOn(connection, 'send');
      db.closeDatabase();

      expect(liveReads.read('payees-get-rule-counts', undefined)).toEqual({
        data: {},
        dependencies: [],
      });
      expect(send).not.toHaveBeenCalled();
    });

    it('throws for a read nobody registered', () => {
      expect(() => liveReads.read('no-such-read', undefined)).toThrow(
        'No live read named "no-such-read"',
      );
    });
  });

  it("doesn't let a failing listener fail the change", () => {
    const seen: BudgetChanges[] = [];
    const stopFailing = liveReads.onChanges(() => {
      throw new Error('UI bug');
    });
    const stop = liveReads.onChanges(change => seen.push(change));

    expect(() => notifyChanges('all')).not.toThrow();
    expect(seen).toEqual(['all']);
    stopFailing();
    stop();
  });
});

describe('liveReads cells', () => {
  const balance = q('transactions').calculate({ $sum: '$amount' }).serialize();

  async function openBudget() {
    db.insertAccount({ id: 'acct', name: 'Checking' });
    const group = db.insertCategoryGroup({ id: 'group', name: 'Bills' });
    db.insertCategory({ id: 'cat', name: 'Rent', cat_group: group });
    await loadBudgetState(notifyCellChanges);
    extendBudgetMonths(['2017-01', '2017-02']);
  }

  it('reads a budget value', async () => {
    await openBudget();
    setBudget({ category: 'cat', month: '2017-01', amount: 500 });

    expect(liveReads.cell('budget201701', 'budget-cat')).toBe(500);
    expect(liveReads.cell('budget201701', 'leftover-cat')).toBe(500);
  });

  it('binds a query cell on its first read', async () => {
    await openBudget();

    expect(liveReads.cell('__global', 'balance', balance)).toBe(0);
    expect(hasQueryCell('__global!balance')).toBe(true);
    // Read again without its query, by name
    expect(liveReads.cell('__global', 'balance')).toBe(0);
  });

  it('reports the cells each change changed, with its tables', async () => {
    await openBudget();
    liveReads.cell('__global', 'balance', balance);
    liveReads.cell('budget201701', 'budget-cat');
    const changes: BudgetChanges[] = [];
    const stop = liveReads.onChanges(change => changes.push(change));

    db.insertTransaction({
      id: 't1',
      account: 'acct',
      amount: 100,
      date: '2017-01-05',
    });
    setBudget({ category: 'cat', month: '2017-01', amount: 300 });
    stop();

    expect(changes).toHaveLength(2);
    const [transaction, budget] = changes as Array<
      Exclude<BudgetChanges, 'all'>
    >;
    expect(transaction.tables).toEqual(['transactions']);
    expect(transaction.cells).toContain('__global!balance');
    expect(transaction.cells).not.toContain('budget201701!budget-cat');
    expect(liveReads.cell('__global', 'balance')).toBe(100);
    expect(budget.tables).toEqual(['zero_budgets']);
    expect(budget.cells).toEqual(
      expect.arrayContaining([
        'budget201701!budget-cat',
        'budget201701!leftover-cat',
        'budget201701!to-budget',
      ]),
    );
    expect(budget.cells).not.toContain('__global!balance');
  });

  it('reports cells that change without a write', async () => {
    await openBudget();
    const changes: BudgetChanges[] = [];
    const stop = liveReads.onChanges(change => changes.push(change));

    extendBudgetMonths(['2017-03']);
    await Promise.resolve();
    stop();

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ tables: [], ids: {} });
    expect((changes[0] as Exclude<BudgetChanges, 'all'>).cells).toContain(
      'budget201703!budget-cat',
    );
  });

  it('reports the cells a change changed even if a later step fails', async () => {
    await openBudget();
    liveReads.cell('__global', 'balance', balance);
    const changes: BudgetChanges[] = [];
    const stop = liveReads.onChanges(change => changes.push(change));
    const stopFailing = addSyncListener(() => {
      throw new Error('listener bug');
    });

    try {
      expect(() =>
        db.insertTransaction({
          id: 't1',
          account: 'acct',
          amount: 100,
          date: '2017-01-05',
        }),
      ).toThrow('listener bug');
    } finally {
      stopFailing();
      stop();
    }

    expect(changes).toHaveLength(1);
    expect((changes[0] as Exclude<BudgetChanges, 'all'>).cells).toContain(
      '__global!balance',
    );
    expect(liveReads.cell('__global', 'balance')).toBe(100);
  });

  it('keeps the most recently released query cells current', async () => {
    await openBudget();
    liveReads.cell('__global', 'balance', balance);

    // A cell since bound to another query isn't released
    const cleared = q('transactions')
      .filter({ cleared: true })
      .calculate({ $sum: '$amount' })
      .serialize();
    liveReads.cell('__global', 'balance', cleared);
    liveReads.releaseCell('__global', 'balance', balance);
    for (let i = 0; i < 100; i++) {
      liveReads.cell('__global', `other-${i}`, balance);
      liveReads.releaseCell('__global', `other-${i}`, balance);
    }
    expect(hasQueryCell('__global!balance')).toBe(true);

    // Released, it's kept current while 100 cells released after it are
    liveReads.releaseCell('__global', 'balance', cleared);
    db.insertTransaction({
      id: 't1',
      account: 'acct',
      amount: 100,
      date: '2017-01-05',
      cleared: true,
    });
    expect(hasQueryCell('__global!balance')).toBe(true);
    expect(liveReads.cell('__global', 'balance')).toBe(100);
    for (let i = 0; i < 99; i++) {
      liveReads.cell('__global', `more-${i}`, balance);
      liveReads.releaseCell('__global', `more-${i}`, balance);
    }
    expect(hasQueryCell('__global!balance')).toBe(true);
    liveReads.cell('__global', 'last', balance);
    liveReads.releaseCell('__global', 'last', balance);
    expect(hasQueryCell('__global!balance')).toBe(false);
    expect(hasQueryCell('__global!last')).toBe(true);
  });

  it('reads null, binding nothing, with no budget open', () => {
    unloadBudgetState();

    expect(liveReads.cell('__global', 'balance', balance)).toBeNull();
    expect(hasQueryCell('__global!balance')).toBe(false);
  });
});
