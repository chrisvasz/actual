import { Timestamp } from '@actual-app/crdt';

import type { BudgetChanges } from '#platform/in-process-channel';
import * as connection from '#platform/server/connection';
import * as db from '#server/db';
import { applyMessages, setSyncingMode } from '#server/sync';
import { q } from '#shared/query';

import { liveReads, notifyChanges } from './live-reads';

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
      { tables: ['accounts'], ids: { accounts: ['acct'] } },
      // Along with the rows it writes for it
      {
        tables: ['payees', 'payee_mapping'],
        ids: { payees: ['payee'], payee_mapping: ['payee'] },
      },
      { tables: ['transactions'], ids: { transactions: ['t1'] } },
      { tables: ['transactions'], ids: { transactions: ['t1'] } },
      // A delete is a tombstone, and reports its row
      { tables: ['transactions'], ids: { transactions: ['t1'] } },
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
        { tables: ['transactions'], ids: { transactions: ['t1'] } },
      ]);
      stop();
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
