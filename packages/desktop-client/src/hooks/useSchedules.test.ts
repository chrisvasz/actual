import { q } from '@actual-app/core/shared/query';
import type { QueryState } from '@actual-app/core/shared/query';
import type {
  ScheduleEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initLiveReads } from '#mocks/live-reads';

import { getSchedulesQuery, useSchedules } from './useSchedules';

vi.mock('./useSyncedPref', () => ({
  useSyncedPref: () => ['7', vi.fn()],
}));

const schedule = {
  id: 'schedule-1',
  next_date: '2017-01-01',
  completed: false,
  _date: { start: '2017-01-01', frequency: 'monthly' },
} as unknown as ScheduleEntity;

describe('useSchedules', () => {
  let schedules: ScheduleEntity[];
  let scheduleTransactions: Partial<TransactionEntity>[];
  let runQuery: ReturnType<typeof vi.fn<(query: QueryState) => never>>;

  beforeEach(() => {
    schedules = [schedule];
    scheduleTransactions = [];
    runQuery = vi.fn(
      (query: QueryState) =>
        (query.table === 'schedules'
          ? { data: schedules, dependencies: ['schedules'] }
          : {
              data: scheduleTransactions,
              dependencies: ['transactions'],
            }) as never,
    );
    initLiveReads(runQuery);
  });

  it('reads nothing when no query is given', () => {
    const { result } = renderHook(() => useSchedules({}));

    expect(runQuery).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.schedules).toEqual([]);
  });

  it('has the schedules and their statuses on the first render', () => {
    scheduleTransactions = [{ schedule: schedule.id, date: '2017-01-01' }];
    const { result } = renderHook(() =>
      useSchedules({ query: q('schedules').select('*') }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.schedules).toEqual([schedule]);
    expect(result.current.statuses.get(schedule.id)).toBe('paid');
  });

  it('returns the same result object when nothing changed', () => {
    const query = q('schedules').select('*');
    const { result, rerender } = renderHook(() => useSchedules({ query }));

    const first = result.current;
    rerender();

    // Consumers put this straight into a context value, so a fresh object on
    // every render would re-render every schedule consumer for nothing.
    expect(result.current).toBe(first);
  });

  it('rejects a query of another table', () => {
    const { result } = renderHook(() =>
      useSchedules({ query: q('transactions').select('*') }),
    );

    expect(result.current.error?.message).toBe(
      'Query must be a schedules query.',
    );
    expect(result.current.isLoading).toBe(false);
    expect(runQuery).not.toHaveBeenCalled();
  });
});

describe('getSchedulesQuery', () => {
  it('loads split schedules for concrete account views', () => {
    const query = getSchedulesQuery('savings');

    expect(query.state.filterExpressions).toContainEqual({
      $or: [
        { _account: 'savings' },
        { '_payee.transfer_acct': 'savings' },
        { _has_splits: true },
      ],
    });
  });
});
