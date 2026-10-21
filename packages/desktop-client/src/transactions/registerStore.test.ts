import type { QueryState } from '@actual-app/core/shared/query';
import type { TransactionEntity } from '@actual-app/core/types/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { changeTables, initLiveReads } from '#mocks/live-reads';

import type * as registerStore from './registerStore';

type Store = typeof registerStore;

// A fake backend's transactions, newest first, none of them split
let rows: TransactionEntity[];
let reads: QueryState[];

function transaction(id: string, date: string, amount = 0) {
  return { id, date, amount, account: 'a' } as TransactionEntity;
}

// The filters the store reads with: a chunk's dates, and a change's ids
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
      const op = cond as { $lt?: string; $oneof?: string[] };
      return op.$lt != null
        ? (value as string) < op.$lt
        : (op.$oneof ?? []).includes(value as string);
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
    transaction('t1', '2024-01-01'),
  ];
  reads = [];
  initLiveReads(runQuery);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('registerStore', () => {
  it('reads every row on first read, and the same snapshot until a change', async () => {
    const store = await loadStore();

    const snapshot = store.getRegisterSnapshot();

    expect(snapshot.groups.map(group => group.parent.id)).toEqual([
      't3',
      't2',
      't1',
    ]);
    expect(store.getRegisterSnapshot()).toBe(snapshot);
  });

  it('tells subscribers once per burst of changes, and re-reads what changed', async () => {
    const store = await loadStore();
    const before = store.getRegisterSnapshot();
    const listener = vi.fn();
    store.subscribeToRegisterRows(listener);

    rows[1] = { ...rows[1], amount: 5 };
    changeTables(['transactions'], { transactions: ['t2'] });
    changeTables(['transactions'], { transactions: ['t2'] });
    changeTables(['notes'], { notes: ['n'] });
    await flushNotifications();

    expect(listener).toHaveBeenCalledTimes(1);
    const after = store.getRegisterSnapshot();
    expect(after).not.toBe(before);
    expect(after.groups[1].parent.amount).toBe(5);
    // Untouched groups are kept
    expect(after.groups[0]).toBe(before.groups[0]);
  });

  it('reads a newly opened budget in the background, a chunk at a time', async () => {
    vi.useFakeTimers();
    // Ten rows a day, newest first
    rows = Array.from({ length: 1200 }, (_, i) => {
      const day = new Date(Date.UTC(2024, 0, 1 + Math.floor(i / 10)));
      return transaction(`t${i}`, day.toISOString().slice(0, 10));
    }).reverse();
    const store = await loadStore();
    store.listenForRegisterRows();

    changeTables('all');
    await vi.runAllTimersAsync();

    const chunks = reads.filter(read => read.limit != null && read.limit > 0);
    expect(chunks.length).toBeGreaterThan(1);
    const readsBefore = reads.length;
    expect(store.getRegisterSnapshot().groups).toHaveLength(1200);
    // Everything was read already
    expect(reads).toHaveLength(readsBefore);
  });

  it('keeps the last rows, with the error, when a read fails', async () => {
    const store = await loadStore();
    const before = store.getRegisterSnapshot();

    initLiveReads(() => {
      throw new Error('broken');
    });
    changeTables(['transactions'], { transactions: ['t2'] });
    const failed = store.getRegisterSnapshot();

    expect(failed.groups).toBe(before.groups);
    expect(failed.error?.message).toBe('broken');
    expect(store.getRegisterSnapshot()).toBe(failed);
  });
});
