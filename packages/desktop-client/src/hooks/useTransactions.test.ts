import { q } from '@actual-app/core/shared/query';
import type { QueryState } from '@actual-app/core/shared/query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { changeTables, initLiveReads } from '#mocks/live-reads';

import { useTransactions } from './useTransactions';

type Row = { id: string; amount: number };

let rows: Row[];
let limits: Array<number | null>;

beforeEach(() => {
  rows = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, amount: 1 }));
  limits = [];
  initLiveReads((query: QueryState) => {
    limits.push(query.limit);
    return {
      data: rows.slice(0, query.limit ?? undefined),
      dependencies: ['transactions'],
    };
  });
});

function ids(transactions: ReadonlyArray<{ id: string }>) {
  return transactions.map(t => t.id);
}

describe('useTransactions', () => {
  it('reads the first page on the first render', () => {
    const query = q('transactions').select('*');
    const { result } = renderHook(() =>
      useTransactions({ query, options: { pageSize: 4 } }),
    );

    expect(ids(result.current.transactions)).toEqual(['t0', 't1', 't2', 't3']);
    expect(result.current.hasNextPage).toBe(true);
  });

  it('reads every loaded row in one query when loading more', () => {
    const query = q('transactions').select('*');
    const { result } = renderHook(() =>
      useTransactions({ query, options: { pageSize: 4 } }),
    );

    act(() => result.current.fetchNextPage());
    expect(result.current.transactions).toHaveLength(8);
    expect(result.current.hasNextPage).toBe(true);

    act(() => result.current.fetchNextPage());
    expect(result.current.transactions).toHaveLength(10);
    expect(result.current.hasNextPage).toBe(false);
    expect(limits).toEqual([4, 8, 12]);
  });

  it('starts over from one page when the query changes', () => {
    const first = q('transactions').select('*');
    const { result, rerender } = renderHook(
      ({ query }) => useTransactions({ query, options: { pageSize: 4 } }),
      { initialProps: { query: first } },
    );
    act(() => result.current.fetchNextPage());
    expect(result.current.transactions).toHaveLength(8);

    rerender({ query: q('transactions').select(['id', 'amount']) });
    expect(result.current.transactions).toHaveLength(4);
  });

  it('reads the rows again when the transactions change', async () => {
    const query = q('transactions').select('*');
    const { result } = renderHook(() =>
      useTransactions({ query, options: { pageSize: 4 } }),
    );

    rows = [{ id: 'new', amount: 5 }, ...rows];
    changeTables(['transactions']);
    await act(async () => {
      await Promise.resolve();
    });

    expect(ids(result.current.transactions)).toEqual(['new', 't0', 't1', 't2']);
  });

  it('calculates running balances from the loaded rows', () => {
    const query = q('transactions').select('*');
    const { result } = renderHook(() =>
      useTransactions({
        query,
        options: { pageSize: 3, calculateRunningBalances: true },
      }),
    );

    expect(Object.fromEntries(result.current.runningBalances)).toEqual({
      t0: 3,
      t1: 2,
      t2: 1,
    });
  });

  it('keeps the last rows when a read fails', async () => {
    const query = q('transactions').select('*');
    const { result } = renderHook(() =>
      useTransactions({ query, options: { pageSize: 4 } }),
    );

    initLiveReads(() => {
      throw new Error('read failed');
    });
    changeTables(['transactions']);
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.transactions).toHaveLength(4);
    expect(result.current.error?.message).toBe('read failed');
  });

  it('recalculates running balances when they are turned on', () => {
    const query = q('transactions').select('*');
    const { result, rerender } = renderHook(
      ({ calculateRunningBalances }) =>
        useTransactions({
          query,
          options: { pageSize: 3, calculateRunningBalances },
        }),
      { initialProps: { calculateRunningBalances: false } },
    );
    expect(result.current.runningBalances.size).toBe(0);

    rerender({ calculateRunningBalances: true });
    expect(result.current.runningBalances.get('t0')).toBe(3);
  });

  it('reads nothing without a query', () => {
    const { result } = renderHook(() => useTransactions({}));

    expect(result.current.transactions).toEqual([]);
    expect(result.current.hasNextPage).toBe(false);
    expect(limits).toEqual([]);
  });
});
