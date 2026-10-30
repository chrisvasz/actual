import { createElement } from 'react';

import { q } from '@actual-app/core/shared/query';
import type { QueryState } from '@actual-app/core/shared/query';
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLiveQuery } from '#hooks/useLiveQuery';
import { useLiveRead } from '#hooks/useLiveRead';
import { changeTables, initLiveReads } from '#mocks/live-reads';

import { getLiveQuery, replaceEqualDeep, watchLiveQuery } from './liveStore';

type Row = { id: string; amount: number };

// A fake backend: each table holds rows, and a query reads the rows of its
// table plus the tables listed in `extraDependencies`
let tables: Record<string, Row[]>;
let extraDependencies: Record<string, string[]>;
let runQuery: ReturnType<typeof vi.fn<(query: QueryState) => never>>;

function change(...changed: string[]) {
  changeTables(changed);
}

function flushNotifications() {
  return act(async () => {
    await Promise.resolve();
  });
}

function readsOf(table: string) {
  return runQuery.mock.calls.filter(([query]) => query.table === table).length;
}

beforeEach(() => {
  tables = {
    transactions: [{ id: 't1', amount: 1 }],
    accounts: [{ id: 'a1', amount: 0 }],
  };
  extraDependencies = { transactions: ['payee_mapping'] };

  runQuery = vi.fn((query: QueryState) => {
    const rows = tables[query.table];
    if (!rows) {
      throw new Error(`no table ${query.table}`);
    }
    return {
      // Freshly built rows, like the backend's
      data: rows.map(row => ({ ...row })),
      dependencies: [query.table, ...(extraDependencies[query.table] ?? [])],
    } as never;
  });
  initLiveReads(runQuery);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('liveStore', () => {
  it('reads synchronously on first render', () => {
    const { result } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );

    expect(result.current.data).toEqual([{ id: 't1', amount: 1 }]);
    expect(result.current.error).toBeUndefined();
  });

  it('returns the same snapshot until a table it read changes', async () => {
    const { result } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );
    const first = result.current;

    change('accounts');
    await flushNotifications();
    expect(result.current).toBe(first);
    expect(readsOf('transactions')).toBe(1);

    tables.transactions = [{ id: 't1', amount: 2 }];
    change('transactions');
    await flushNotifications();
    expect(result.current.data).toEqual([{ id: 't1', amount: 2 }]);
  });

  it('refreshes on a change to a table read through a view', async () => {
    const { result } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );

    tables.transactions = [{ id: 't2', amount: 5 }];
    change('payee_mapping');
    await flushNotifications();
    expect(result.current.data).toEqual([{ id: 't2', amount: 5 }]);
  });

  it('marks a result out of date and reads it again only when asked', () => {
    const handle = getLiveQuery(q('transactions').select('*'));
    const unsubscribe = handle.subscribe(vi.fn());
    handle.getSnapshot();
    expect(readsOf('transactions')).toBe(1);

    change('transactions');
    change('transactions');
    expect(readsOf('transactions')).toBe(1);

    handle.getSnapshot();
    handle.getSnapshot();
    expect(readsOf('transactions')).toBe(2);
    unsubscribe();
  });

  it('reads each mounted query once after a burst of 1,000 changes', async () => {
    let renders = 0;
    function Transactions() {
      renders++;
      useLiveQuery<Row>(() => q('transactions').select('*'), []);
      return null;
    }
    function Accounts() {
      useLiveQuery<Row>(() => q('accounts').select('*'), []);
      return null;
    }
    render(
      createElement(
        'div',
        null,
        createElement(Transactions),
        createElement(Transactions),
        createElement(Accounts),
      ),
    );
    const rendersBefore = renders;
    expect(readsOf('transactions')).toBe(1);
    expect(readsOf('accounts')).toBe(1);

    for (let i = 0; i < 1000; i++) {
      tables.transactions = [{ id: 't1', amount: i }];
      change('transactions', 'accounts');
    }
    expect(readsOf('transactions')).toBe(1);

    await flushNotifications();
    // One read per query, shared by both components that show it
    expect(readsOf('transactions')).toBe(2);
    expect(readsOf('accounts')).toBe(2);
    // Each component re-renders once, not once per change
    expect(renders - rendersBefore).toBe(2);
  });

  it('shares one result between equal queries', () => {
    const { result: a } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );
    const { result: b } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );

    expect(a.current.data).toBe(b.current.data);
    expect(readsOf('transactions')).toBe(1);
  });

  it('keeps unchanged rows, and an unchanged result, by reference', async () => {
    tables.transactions = [
      { id: 't1', amount: 1 },
      { id: 't2', amount: 2 },
    ];
    const { result } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );
    const first = result.current;

    change('transactions');
    await flushNotifications();
    expect(result.current).toBe(first);

    tables.transactions = [
      { id: 't1', amount: 1 },
      { id: 't2', amount: 3 },
    ];
    change('transactions');
    await flushNotifications();
    expect(result.current.data?.[0]).toBe(first.data?.[0]);
    expect(result.current.data?.[1]).not.toBe(first.data?.[1]);
  });

  it('freezes results in development', () => {
    const { result } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );

    expect(Object.isFrozen(result.current.data)).toBe(true);
    expect(Object.isFrozen(result.current.data?.[0])).toBe(true);
  });

  it('reports a failed read, keeping the rows it had', async () => {
    const { result } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );

    // The backend throws a plain object, like a rejected `send`
    const fail = () => {
      // oxlint-disable-next-line no-throw-literal -- the backend's error shape
      throw { type: 'ServerError', message: 'boom' };
    };
    runQuery.mockImplementation(fail);
    change('transactions');
    await flushNotifications();
    const failed = result.current;
    expect(failed.error).toEqual({ type: 'ServerError', message: 'boom' });
    expect(failed.data).toEqual([{ id: 't1', amount: 1 }]);

    // Retried only when a table it read changes, and the same failure
    // again keeps the same result
    change('accounts');
    await flushNotifications();
    expect(readsOf('transactions')).toBe(2);
    change('transactions');
    await flushNotifications();
    expect(readsOf('transactions')).toBe(3);
    expect(result.current).toBe(failed);
  });

  it('retries a query that never read on any change', async () => {
    runQuery.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const { result } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );
    expect(result.current.error?.message).toBe('boom');

    change('accounts');
    await flushNotifications();
    expect(result.current.error).toBeUndefined();
    expect(result.current.data).toEqual([{ id: 't1', amount: 1 }]);
  });

  it('records a change between the first read and the first subscription', () => {
    const handle = getLiveQuery<Row[]>(q('transactions').select('*'));
    expect(handle.getSnapshot().data).toEqual([{ id: 't1', amount: 1 }]);

    tables.transactions = [{ id: 't1', amount: 2 }];
    change('transactions');
    const unsubscribe = handle.subscribe(vi.fn());
    expect(handle.getSnapshot().data).toEqual([{ id: 't1', amount: 2 }]);
    unsubscribe();
  });

  it('reads once per batch of changes when a call awaits between them', async () => {
    renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );

    for (let batch = 0; batch < 3; batch++) {
      for (let i = 0; i < 100; i++) {
        change('transactions');
      }
      await flushNotifications();
    }
    expect(readsOf('transactions')).toBe(1 + 3);
  });

  it('throws on a calculate query', () => {
    // React logs the error it rethrows
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    expect(() =>
      renderHook(() =>
        useLiveQuery(
          () => q('transactions').calculate({ $sum: '$amount' }),
          [],
        ),
      ),
    ).toThrow('useLiveQuery reads rows');
  });

  it('reads everything again when a budget opens or closes', async () => {
    const { result } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );

    tables.transactions = [];
    changeTables('all');
    await flushNotifications();
    expect(result.current.data).toEqual([]);
  });

  it('returns no data without a query', () => {
    const { result } = renderHook(() => useLiveQuery<Row>(() => null, []));

    expect(result.current.data).toBeNull();
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('drops a result once nothing shows it', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() =>
      useLiveQuery<Row>(() => q('transactions').select('*'), []),
    );
    // Still cached right after unmounting, for a screen that remounts
    unmount();
    getLiveQuery(q('transactions').select('*')).getSnapshot();
    expect(readsOf('transactions')).toBe(1);

    vi.runAllTimers();
    getLiveQuery(q('transactions').select('*')).getSnapshot();
    expect(readsOf('transactions')).toBe(2);
  });

  it('keeps the result a render read even if it was collected before subscribing', () => {
    vi.useFakeTimers();
    const handle = getLiveQuery<Row[]>(q('transactions').select('*'));
    const read = handle.getSnapshot();
    vi.runAllTimers();

    const unsubscribe = handle.subscribe(vi.fn());
    expect(handle.getSnapshot()).toBe(read);
    expect(readsOf('transactions')).toBe(1);
    unsubscribe();
  });

  it('caches a named read with the tables it declares', async () => {
    let accounts = [{ id: 'a1', name: 'Checking' }];
    const read = vi.fn((name: string) => {
      if (name !== 'accounts-get') {
        throw new Error(`no read ${name}`);
      }
      return {
        data: accounts.map(row => ({ ...row })),
        dependencies: ['accounts'],
      };
    });
    initLiveReads(runQuery, read);

    const first = renderHook(() => useLiveRead('accounts-get'));
    const second = renderHook(() => useLiveRead('accounts-get'));
    expect(first.result.current.data).toEqual(accounts);
    // One read, shared by both
    expect(second.result.current).toBe(first.result.current);
    expect(read).toHaveBeenCalledTimes(1);

    // A table it doesn't read leaves it alone
    change('transactions');
    await flushNotifications();
    expect(read).toHaveBeenCalledTimes(1);

    accounts = [{ id: 'a1', name: 'Savings' }];
    change('accounts');
    await flushNotifications();
    expect(first.result.current.data).toEqual(accounts);
    expect(second.result.current).toBe(first.result.current);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('watches a query outside React', async () => {
    const onResult = vi.fn();
    const stop = watchLiveQuery<Row[]>(q('transactions').select('*'), onResult);
    expect(onResult).toHaveBeenLastCalledWith({
      data: [{ id: 't1', amount: 1 }],
    });

    tables.transactions = [];
    change('transactions');
    await Promise.resolve();
    expect(onResult).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenLastCalledWith({ data: [] });

    stop();
    change('transactions');
    await Promise.resolve();
    expect(onResult).toHaveBeenCalledTimes(2);
  });
});

describe('replaceEqualDeep', () => {
  it('reuses equal parts of the previous value', () => {
    const prev = { a: [{ x: 1 }, { x: 2 }], b: 'b' };
    const next = { a: [{ x: 1 }, { x: 3 }], b: 'b' };
    const shared = replaceEqualDeep(prev, next) as typeof prev;

    expect(shared).not.toBe(prev);
    expect(shared.a[0]).toBe(prev.a[0]);
    expect(shared.a[1]).toEqual({ x: 3 });
    expect(replaceEqualDeep(prev, structuredClone(prev))).toBe(prev);
  });

  it('notices added and removed keys and items', () => {
    expect(replaceEqualDeep({ a: 1 }, { a: 1, b: undefined })).toEqual({
      a: 1,
      b: undefined,
    });
    const prev = [1, 2];
    expect(replaceEqualDeep(prev, [1])).toEqual([1]);
    expect(replaceEqualDeep(prev, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('matches rows by id when one is added or removed', () => {
    const prev = [
      { id: 'a', x: 1 },
      { id: 'b', x: 2 },
      { id: 'c', x: 3 },
    ];

    const removed = replaceEqualDeep(
      prev,
      structuredClone([prev[0], prev[2]]),
    ) as typeof prev;
    expect(removed).toEqual([prev[0], prev[2]]);
    expect(removed[1]).toBe(prev[2]);

    const added = replaceEqualDeep(
      prev,
      structuredClone([{ id: 'z', x: 0 }, ...prev]),
    ) as typeof prev;
    expect(added[0]).toEqual({ id: 'z', x: 0 });
    expect(added.slice(1)).toEqual(prev);
    added.slice(1).forEach((row, i) => expect(row).toBe(prev[i]));

    const reordered = replaceEqualDeep(
      prev,
      structuredClone([...prev].reverse()),
    );
    expect(reordered).not.toBe(prev);
    expect((reordered as typeof prev)[0]).toBe(prev[2]);

    expect(replaceEqualDeep(prev, structuredClone(prev))).toBe(prev);
  });

  it('counts NaN as equal to itself', () => {
    const prev = [{ x: NaN }];
    expect(replaceEqualDeep(prev, [{ x: NaN }])).toBe(prev);
  });
});
