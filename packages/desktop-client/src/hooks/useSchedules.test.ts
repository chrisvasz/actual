import { createElement } from 'react';
import type { ReactNode } from 'react';

import { q } from '@actual-app/core/shared/query';
import type { ScheduleEntity } from '@actual-app/core/types/models';
import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient } from '#mocks';
import { liveQuery } from '#queries/liveQuery';
import type { LiveQuery } from '#queries/liveQuery';

import {
  getSchedulesQuery,
  schedulesSnapshotQuery,
  useSchedules,
} from './useSchedules';

vi.mock('#queries/liveQuery', () => ({
  liveQuery: vi.fn(),
}));

vi.mock('./useSyncedPref', () => ({
  useSyncedPref: () => ['7', vi.fn()],
}));

type LiveQueryCall = {
  onData: (data: unknown[], previousData: unknown[]) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
};

describe('useSchedules', () => {
  let calls: LiveQueryCall[];
  let queryClient: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    queryClient = createTestQueryClient();

    // `vi.mocked` keeps the mock bound to the real `liveQuery` signature, so a
    // change to how the hook calls it still fails typecheck.
    vi.mocked(liveQuery).mockImplementation((_query, { onData }) => {
      const handle = {
        onData: onData ?? vi.fn(),
        unsubscribe: vi.fn(),
      };
      calls.push(handle);
      // `LiveQuery` is a class with private state; only the subscription
      // surface used by the hook is faked here.
      return handle as unknown as LiveQuery<unknown>;
    });
  });

  it('does not open any live query when no query is given', () => {
    renderHook(() => useSchedules({}), { wrapper });

    expect(liveQuery).not.toHaveBeenCalled();
  });

  it('unsubscribes the previous status query when schedules refresh', () => {
    renderHook(() => useSchedules({ query: q('schedules').select('*') }), {
      wrapper,
    });

    // The schedules query is opened first; its onData opens the status query.
    expect(calls).toHaveLength(1);
    const schedulesQuery = calls[0];

    schedulesQuery.onData([], []);
    expect(calls).toHaveLength(2);
    const firstStatusQuery = calls[1];
    expect(firstStatusQuery.unsubscribe).not.toHaveBeenCalled();

    // A refresh must tear down the previous status query rather than orphaning
    // it — an orphan stays subscribed to sync events and keeps re-running.
    schedulesQuery.onData([], []);
    expect(firstStatusQuery.unsubscribe).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(3);
  });

  it('returns the same result object when nothing changed', () => {
    const query = q('schedules').select('*');
    const { result, rerender } = renderHook(() => useSchedules({ query }), {
      wrapper,
    });

    const first = result.current;
    rerender();

    // Consumers put this straight into a context value, so a fresh object on
    // every render would re-render every schedule consumer for nothing.
    expect(result.current).toBe(first);
  });

  it('unsubscribes both queries on unmount', () => {
    const { unmount } = renderHook(
      () => useSchedules({ query: q('schedules').select('*') }),
      { wrapper },
    );

    calls[0].onData([], []);
    expect(calls).toHaveLength(2);

    unmount();

    expect(calls[0].unsubscribe).toHaveBeenCalled();
    expect(calls[1].unsubscribe).toHaveBeenCalled();
  });

  it('starts from a cached snapshot of the same query', () => {
    const query = q('schedules').select('*');
    const schedule = { id: 'schedule-1' } as ScheduleEntity;
    queryClient.setQueryData(schedulesSnapshotQuery(query, '7').queryKey, {
      schedules: [schedule],
      statuses: new Map([[schedule.id, 'scheduled' as const]]),
      statusLabels: new Map([[schedule.id, 'scheduled' as const]]),
    });

    const { result } = renderHook(
      () => useSchedules({ query: q('schedules').select('*') }),
      { wrapper },
    );

    // Drawn complete on the first render, and the live query that takes over
    // doesn't flip it back to loading.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.schedules).toEqual([schedule]);
    expect(liveQuery).toHaveBeenCalledTimes(1);
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
