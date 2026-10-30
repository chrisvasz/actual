import { q } from '@actual-app/core/shared/query';
import type { QueryState } from '@actual-app/core/shared/query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { changeTables, initLiveReads } from '#mocks/live-reads';

import { createNotesCache } from './notesCache';

// A fake backend holding each transaction's notes
let notes: Array<{ id: string; notes: string }>;
let runQuery: ReturnType<typeof vi.fn<(query: QueryState) => never>>;

const register = q('transactions')
  .options({ splits: 'grouped' })
  .filter({ account: 'acct' })
  .orderBy({ date: 'desc' })
  .select('*');

beforeEach(() => {
  notes = [
    { id: 't1', notes: 'Straße' },
    { id: 'p1/c1', notes: 'Łódź trip' },
  ];
  runQuery = vi.fn(
    () =>
      ({
        data: notes.map(row => ({ ...row })),
        dependencies: ['transactions', 'accounts'],
      }) as never,
  );
  initLiveReads(runQuery);
});

describe('createNotesCache', () => {
  it("normalises the notes of the register's rows once per query", () => {
    const cache = createNotesCache();
    const read = cache.read(register);
    expect(read).toEqual(
      new Map([
        ['t1', 'strasse'],
        ['p1/c1', 'lodz trip'],
      ]),
    );
    // Every row the register filters to, split children included
    expect(runQuery.mock.calls[0][0]).toMatchObject({
      tableOptions: { splits: 'all' },
      filterExpressions: [{ account: 'acct' }, { notes: { $ne: null } }],
      selectExpressions: ['id', 'notes'],
    });
    expect(cache.read(register)).toBe(read);
    cache.read(register.filter({ cleared: true }));
    expect(runQuery).toHaveBeenCalledTimes(2);
    cache.stop();
  });

  it('reads the notes again after a change to a table they came from', () => {
    const cache = createNotesCache();
    const read = cache.read(register)!;
    changeTables(['payees']);
    expect(cache.isCurrent(read)).toBe(true);

    notes = [{ id: 't1', notes: 'Edited' }];
    changeTables(['transactions'], { transactions: ['t1'] });
    expect(cache.isCurrent(read)).toBe(false);
    const reread = cache.read(register)!;
    expect(reread).toEqual(new Map([['t1', 'edited']]));

    // Not once stopped
    cache.stop();
    changeTables('all');
    expect(cache.isCurrent(reread)).toBe(true);
  });

  it("is null when the notes can't be read", () => {
    runQuery.mockImplementation(() => {
      throw new Error('no budget');
    });
    const cache = createNotesCache();
    expect(cache.read(register)).toBeNull();
    cache.stop();
  });
});
