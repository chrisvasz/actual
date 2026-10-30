import { q } from '@actual-app/core/shared/query';
import type { QueryState } from '@actual-app/core/shared/query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { changeTables, initLiveReads } from '#mocks/live-reads';

import { createNotesCache, notesCacheQuery } from './notesCache';

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

describe('notesCacheQuery', () => {
  it("reads the notes of every row the register's query filters to", () => {
    expect(notesCacheQuery(register).serialize()).toMatchObject({
      table: 'transactions',
      // Split children have their own notes
      tableOptions: { splits: 'all' },
      filterExpressions: [{ account: 'acct' }, { notes: { $ne: null } }],
      selectExpressions: ['id', 'notes'],
      orderExpressions: [],
    });
  });
});

describe('createNotesCache', () => {
  it('normalises each note once per query', () => {
    const cache = createNotesCache();
    const read = cache.read(register);
    expect(read).toEqual(
      new Map([
        ['t1', 'strasse'],
        ['p1/c1', 'lodz trip'],
      ]),
    );
    expect(cache.read(register)).toBe(read);
    expect(runQuery).toHaveBeenCalledTimes(1);

    // Another query reads its own notes
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
    expect(cache.read(register)).toEqual(new Map([['t1', 'edited']]));

    changeTables('all');
    expect(runQuery).toHaveBeenCalledTimes(2);
    cache.read(register);
    expect(runQuery).toHaveBeenCalledTimes(3);
    cache.stop();
  });

  it('stops listening for changes once stopped', () => {
    const cache = createNotesCache();
    const read = cache.read(register)!;
    cache.stop();
    changeTables(['transactions']);
    expect(cache.isCurrent(read)).toBe(true);
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
