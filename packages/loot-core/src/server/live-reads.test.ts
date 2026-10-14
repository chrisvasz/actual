import * as connection from '#platform/server/connection';
import * as db from '#server/db';
import { q } from '#shared/query';

import { liveReads, notifyTablesChanged } from './live-reads';
import type { ChangedTables } from './live-reads';

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

  it('reports the tables each applied change wrote', () => {
    const changes: ChangedTables[] = [];
    const stop = liveReads.onTablesChanged(tables => changes.push(tables));

    db.insertAccount({ id: 'acct', name: 'Checking' });
    expect(changes).toEqual([['accounts']]);

    stop();
    db.insertAccount({ id: 'acct2', name: 'Savings' });
    expect(changes).toHaveLength(1);
  });

  it("doesn't let a failing listener fail the change", () => {
    const seen: ChangedTables[] = [];
    const stopFailing = liveReads.onTablesChanged(() => {
      throw new Error('UI bug');
    });
    const stop = liveReads.onTablesChanged(tables => seen.push(tables));

    expect(() => notifyTablesChanged('all')).not.toThrow();
    expect(seen).toEqual(['all']);
    stopFailing();
    stop();
  });
});
