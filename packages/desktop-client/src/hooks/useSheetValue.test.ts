import { q } from '@actual-app/core/shared/query';
import type { Query } from '@actual-app/core/shared/query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { changeTables, initLiveReads } from '#mocks/live-reads';

import { useSheetValue } from './useSheetValue';

// A fake backend's cells, by full name
let cells: Map<string, unknown>;
let readCell: ReturnType<
  typeof vi.fn<(sheetName: string, name: string, query?: Query) => unknown>
>;
let releaseCell: ReturnType<
  typeof vi.fn<(sheetName: string, name: string, query: Query) => void>
>;

function readsOf(full: string) {
  return readCell.mock.calls.filter(
    ([sheetName, name]) => `${sheetName}!${name}` === full,
  ).length;
}

// Cells change with no table change, as the budget reports them
function changeCells(...changed: string[]) {
  changeTables([], {}, changed);
}

function flushNotifications() {
  return act(async () => {
    await Promise.resolve();
  });
}

// Typed loosely: the tests' cell names aren't in `Spreadsheets`
function useCell(binding: string | { name: string; query: Query }) {
  return useSheetValue(binding as never);
}

beforeEach(() => {
  cells = new Map<string, unknown>([
    ['budget202601!to-budget', 100],
    ['budget202601!leftover-cat1', 5],
    ['__global!balance', 42],
  ]);
  readCell = vi.fn(
    (sheetName: string, name: string) =>
      cells.get(`${sheetName}!${name}`) ?? null,
  );
  releaseCell = vi.fn();
  initLiveReads(null, null, { read: readCell, release: releaseCell });
});

describe('useSheetValue', () => {
  it('has the value on first render', () => {
    const { result } = renderHook(() => useCell('budget202601!to-budget'));

    expect(result.current).toBe(100);
    expect(readCell).toHaveBeenCalledWith(
      'budget202601',
      'to-budget',
      undefined,
    );
  });

  it('re-reads and re-renders only for a change that names its cell', async () => {
    let toBudgetRenders = 0;
    let leftoverRenders = 0;
    const toBudget = renderHook(() => {
      toBudgetRenders++;
      return useCell('budget202601!to-budget');
    });
    const leftover = renderHook(() => {
      leftoverRenders++;
      return useCell('budget202601!leftover-cat1');
    });

    changeTables(['zero_budgets']);
    changeCells('budget202601!other');
    await flushNotifications();
    expect(toBudgetRenders).toBe(1);
    expect(readsOf('budget202601!to-budget')).toBe(1);

    cells.set('budget202601!to-budget', 90);
    changeCells('budget202601!to-budget');
    await flushNotifications();
    expect(toBudget.result.current).toBe(90);
    expect(toBudgetRenders).toBe(2);
    expect(readsOf('budget202601!to-budget')).toBe(2);
    expect(leftover.result.current).toBe(5);
    expect(leftoverRenders).toBe(1);
    expect(readsOf('budget202601!leftover-cat1')).toBe(1);
  });

  it('reads and renders once for a burst of changes', async () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useCell('budget202601!to-budget');
    });

    for (let i = 1; i <= 100; i++) {
      cells.set('budget202601!to-budget', 100 - i);
      changeCells('budget202601!to-budget');
    }
    await flushNotifications();

    expect(result.current).toBe(0);
    expect(renders).toBe(2);
    expect(readsOf('budget202601!to-budget')).toBe(2);
  });

  it('reads every cell again when a budget opens or closes', async () => {
    const { result } = renderHook(() => useCell('budget202601!to-budget'));

    cells.set('budget202601!to-budget', 7);
    changeTables('all');
    await flushNotifications();
    expect(result.current).toBe(7);
  });

  it('calls onChange for a new value, not the first', async () => {
    const onChange = vi.fn();
    renderHook(() =>
      useSheetValue('budget202601!to-budget' as never, onChange),
    );
    expect(onChange).not.toHaveBeenCalled();

    cells.set('budget202601!to-budget', 80);
    changeCells('budget202601!to-budget');
    await flushNotifications();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      name: 'budget202601!to-budget',
      value: 80,
    });
  });

  it('binds a query cell, and releases it once nothing shows it', () => {
    vi.useFakeTimers();
    try {
      const query = q('transactions').calculate({ $sum: '$amount' });
      const { result, rerender, unmount } = renderHook(() =>
        // A new, equal query each render
        useCell({
          name: 'balance',
          query: q('transactions').calculate({ $sum: '$amount' }),
        }),
      );
      expect(result.current).toBe(42);
      expect(readCell.mock.calls[0][2]?.serialize()).toEqual(query.serialize());

      rerender();
      expect(readsOf('__global!balance')).toBe(1);

      // Kept for a screen that remounts
      unmount();
      expect(releaseCell).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(releaseCell).toHaveBeenCalledTimes(1);
      expect(releaseCell.mock.calls[0][2].serialize()).toEqual(
        query.serialize(),
      );

      // Bound again, and read afresh, by the next screen that shows it
      renderHook(() => useCell({ name: 'balance', query }));
      expect(readsOf('__global!balance')).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never releases a budget value', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderHook(() => useCell('budget202601!to-budget'));
      unmount();
      vi.runAllTimers();
      expect(releaseCell).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
