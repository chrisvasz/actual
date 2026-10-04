import { QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { createTestQueryClient } from '#mocks';

import { invalidateReportData, reportDataQueries } from './queries';

describe('invalidateReportData', () => {
  it('does not cache a run that started before the data changed', async () => {
    const queryClient = createTestQueryClient();
    const queryKey = [...reportDataQueries.all(), 'test'];

    let runs = 0;
    const resolvers: Array<(value: string) => void> = [];
    const observer = new QueryObserver<string>(queryClient, {
      queryKey,
      queryFn: () => {
        runs++;
        return new Promise<string>(resolve => resolvers.push(resolve));
      },
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(vi.fn());

    // The first run is still reading when the data changes.
    expect(runs).toBe(1);
    const invalidated = invalidateReportData(queryClient);

    // The change restarts the run; the first one's result is discarded.
    resolvers[0]('before the change');
    await vi.waitFor(() => expect(runs).toBe(2));
    resolvers[1]('after the change');
    await invalidated;

    expect(queryClient.getQueryData(queryKey)).toBe('after the change');
    unsubscribe();
  });

  it('leaves a run nothing is showing stale rather than fresh', async () => {
    const queryClient = createTestQueryClient();
    const queryKey = [...reportDataQueries.all(), 'test'];

    let resolve: ((value: string) => void) | undefined;
    const fetching = queryClient.fetchQuery({
      queryKey,
      queryFn: () => new Promise<string>(r => (resolve = r)),
      staleTime: Infinity,
    });

    await invalidateReportData(queryClient);
    resolve?.('before the change');
    // The cancelled run's own result is discarded.
    await expect(fetching).rejects.toThrow();

    // Nothing is mounted to refetch it, so the next mount must.
    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
  });
});
