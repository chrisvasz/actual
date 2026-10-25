import type { QueryState } from '@actual-app/core/shared/query';
import type { TransactionEntity } from '@actual-app/core/types/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { changeTables, initLiveReads } from '#mocks/live-reads';

import type * as registerStore from './registerStore';

type Store = typeof registerStore;

// A fake backend's transactions, newest first, none of them split
let rows: TransactionEntity[];
let reads: QueryState[];

function transaction(id: string, date: string, account = 'a', amount = 0) {
  return { id, date, amount, account } as TransactionEntity;
}

// The filters the store reads with: a register's account, a change's ids
function matches(
  row: TransactionEntity,
  filter: Record<string, unknown>,
): boolean {
  return Object.entries(filter).every(([field, cond]) => {
    if (field === '$or') {
      return (cond as Array<Record<string, unknown>>).some(f =>
        matches(row, f),
      );
    }
    const value = (row as Record<string, unknown>)[field] ?? null;
    if (cond != null && typeof cond === 'object') {
      return ((cond as { $oneof?: string[] }).$oneof ?? []).includes(
        value as string,
      );
    }
    return value === cond;
  });
}

function runQuery(state: QueryState) {
  reads.push(state);
  const found = rows.filter(row =>
    state.filterExpressions.every(filter =>
      matches(row, filter as Record<string, unknown>),
    ),
  );
  // No row is split: there are only parents (`splits: none`), no children
  const data =
    state.tableOptions.splits === 'inline'
      ? []
      : state.tableOptions.splits === 'none'
        ? found.map(row => ({ ...row }))
        : found.map(row => ({ id: row.id, parent_id: null }));
  return {
    data: state.limit != null ? data.slice(0, state.limit) : data,
    dependencies: ['transactions'],
  } as never;
}

async function loadStore(): Promise<Store> {
  vi.resetModules();
  return import('./registerStore');
}

function flushNotifications() {
  return Promise.resolve();
}

beforeEach(() => {
  rows = [
    transaction('t3', '2024-03-01'),
    transaction('t2', '2024-02-01'),
    transaction('t1', '2024-01-01', 'b'),
  ];
  reads = [];
  initLiveReads(runQuery);
});

afterEach(() => {
  vi.useRealTimers();
});

// Rows read in full: a register's parents, with no change's ids
function fullReads() {
  return reads.filter(
    read =>
      read.tableOptions.splits === 'none' &&
      read.limit == null &&
      !JSON.stringify(read.filterExpressions).includes('$oneof'),
  ).length;
}

describe('registerStore', () => {
  it("reads a register's rows on first read, and the same snapshot until a change", async () => {
    const store = await loadStore();

    const handle = store.getRegisterRows('a');
    const snapshot = handle.getSnapshot();

    expect(snapshot.groups.map(group => group.parent.id)).toEqual(['t3', 't2']);
    expect(handle.getSnapshot()).toBe(snapshot);
    expect(store.getRegisterRows(undefined).getSnapshot().groups).toHaveLength(
      3,
    );
  });

  it('tells subscribers once per burst of changes, and re-reads what changed', async () => {
    const store = await loadStore();
    const handle = store.getRegisterRows(undefined);
    const before = handle.getSnapshot();
    const listener = vi.fn();
    handle.subscribe(listener);

    rows[1] = { ...rows[1], amount: 5 };
    changeTables(['transactions'], { transactions: ['t2'] });
    changeTables(['transactions'], { transactions: ['t2'] });
    changeTables(['notes'], { notes: ['n'] });
    await flushNotifications();

    expect(listener).toHaveBeenCalledTimes(1);
    const after = handle.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.groups[1].parent.amount).toBe(5);
    // Untouched groups are kept, and nothing was read in full again
    expect(after.groups[0]).toBe(before.groups[0]);
    expect(fullReads()).toBe(1);
  });

  it('drops the rows once nothing shows the register', async () => {
    vi.useFakeTimers();
    const store = await loadStore();
    const handle = store.getRegisterRows('a');
    const stop = handle.subscribe(vi.fn());
    handle.getSnapshot();

    // Kept while shown
    await vi.runAllTimersAsync();
    expect(store.getRegisterRows('a')).toBe(handle);

    stop();
    await vi.runAllTimersAsync();
    const reopened = store.getRegisterRows('a');
    expect(reopened).not.toBe(handle);
    reopened.getSnapshot();
    expect(fullReads()).toBe(2);
  });

  it('keeps the last rows, with the error, when a read fails', async () => {
    const store = await loadStore();
    const handle = store.getRegisterRows(undefined);
    const before = handle.getSnapshot();

    initLiveReads(() => {
      throw new Error('broken');
    });
    changeTables(['transactions'], { transactions: ['t2'] });
    const failed = handle.getSnapshot();

    expect(failed.groups).toBe(before.groups);
    expect(failed.error?.message).toBe('broken');
    expect(handle.getSnapshot()).toBe(failed);
  });
});
